// functions/receive-message/index.js
// 飞书云函数 - 接收用户回复消息并触发 AI 教练对话

const db = require('../../services/db');
const aiCoach = require('../../services/aiCoach');
const feishu = require('../../services/feishu');

/**
 * 验证飞书签名
 */
function verifySignature(timestamp, nonce, signature, encryptKey) {
  if (!encryptKey) return true; // 没有加密密钥时跳过验证

  const arr = [timestamp, nonce, encryptKey];
  arr.sort();
  const sha = require('crypto').createHash('sha1');
  sha.update(arr.join(''));
  const calcSignature = sha.digest('hex');
  return signature === calcSignature;
}

/**
 * 解密飞书消息内容
 */
function decryptMessage(encrypt, encryptKey) {
  if (!encryptKey) return JSON.parse(Buffer.from(encrypt, 'base64').toString());

  const crypto = require('crypto');
  const decipher = crypto.createDecipheriv(
    'aes-128-cbc',
    Buffer.from(encryptKey, 'base64'),
    Buffer.from(encryptKey, 'base64')
  );
  decipher.setAutoPadding(false);
  let decrypted = decipher.update(encrypt, 'base64', 'utf8');
  decrypted += decipher.final('utf8');

  // 去掉 PKCS7 填充
  const pad = decrypted.charCodeAt(decrypted.length - 1);
  decrypted = decrypted.substring(0, decrypted.length - pad);

  return JSON.parse(decrypted);
}

/**
 * 处理用户回复 AI 教练的消息
 */
async function handleUserReply(event) {
  const { message, sender } = event;

  if (!message || !sender) {
    console.log('[Receive Message] Invalid event, skipping');
    return { success: true };
  }

  const messageId = message.message_id;
  const chatId = message.chat_id;
  const messageType = message.message_type;
  const messageContent = message.content;

  // 解析消息内容
  let textContent = '';
  if (messageType === 'text') {
    const content = typeof messageContent === 'string' ? JSON.parse(messageContent) : messageContent;
    textContent = content.text || '';
  }

  if (!textContent.trim()) {
    console.log('[Receive Message] Empty message, skipping');
    return { success: true };
  }

  // 获取发送者 ID
  const senderId = sender.sender_id?.user_id || sender.sender_id?.open_id || sender.sender_id?.union_id;
  if (!senderId) {
    console.log('[Receive Message] No sender ID, skipping');
    return { success: true };
  }

  console.log(`[Receive Message] User ${senderId} sent: ${textContent}`);

  // 查询用户
  const user = await db.findOne('users', { feishu_user_id: senderId });
  if (!user) {
    console.log(`[Receive Message] User not found: ${senderId}`);
    // 回复提示
    await feishu.sendTextMessage(
      chatId,
      '您好！我还没绑定您的账号。请先在活动量管理工具中完成绑定。',
      chatId
    );
    return { success: true };
  }

  // 查找进行中的 AI 对话
  const today = new Date().toISOString().split('T')[0];
  const conversation = await db.findOne('ai_conversations', {
    user_id: user.id,
    conversation_date: today,
    status: 'pending'
  });

  if (!conversation) {
    console.log(`[Receive Message] No active conversation for user ${user.id}`);
    // 不是 AI 教练对话时间，不处理
    return { success: true };
  }

  // 获取对话历史
  const messages = JSON.parse(conversation.messages || '[]');

  // 检查是否已达到最大问题数（最多 3 个问题）
  const questionCount = conversation.question_count || 0;
  if (questionCount >= 3) {
    // 对话已结束，回复感谢
    await feishu.sendInteractiveCard(chatId, {
      config: { wide_screen_mode: true },
      header: { template: 'green', title: { tag: 'plain_text', content: '🤖 AI 教练' } },
      elements: [
        {
          tag: 'markdown',
          content: '今天的对话就到这里！\\n\\n感谢您的分享，相信这次对话对您有帮助。\\n\\n明天继续努力，AI 教练会再次与您交流！'
        },
        { tag: 'hr' },
        {
          tag: 'markdown',
          content: '💪 **加油，期待明天的进步！**'
        }
      ]
    });

    // 更新对话状态为已完成
    await db.update('ai_conversations', { id: conversation.id }, {
      status: 'completed',
      completed_at: new Date()
    });

    return { success: true };
  }

  // 将用户回复添加到对话历史
  messages.push({ role: 'user', content: textContent });

  // 生成下一个问题
  const userData = {
    name: user.name,
    totalScore: 0, // 后续问题不需要活动量数据
    dimensions: {}
  };

  try {
    const aiResult = await aiCoach.generateNextQuestion(messages, textContent, userData);

    // 发送下一个问题
    const card = {
      config: { wide_screen_mode: true },
      header: { template: 'blue', title: { tag: 'plain_text', content: '🤖 AI 教练' } },
      elements: [
        {
          tag: 'markdown',
          content: aiResult.questions[0] || '您说得很好，请继续分享！'
        },
        { tag: 'hr' },
        {
          tag: 'markdown',
          content: '💡 ' + (aiResult.summary || '继续思考，你会收获更多！')
        }
      ]
    };

    await feishu.sendInteractiveCard(chatId, card);

    // 更新对话记录
    messages.push({ role: 'assistant', content: aiResult.questions[0] });
    await db.update('ai_conversations', { id: conversation.id }, {
      messages: JSON.stringify(messages),
      question_count: questionCount + 1
    });

    console.log(`[Receive Message] Sent follow-up question to ${user.name}`);

  } catch (error) {
    console.error('[Receive Message] Error generating response:', error.message);
    // AI 失败时回复默认消息
    await feishu.sendTextMessage(chatId, '感谢您的分享！AI 教练正在思考中，请稍后再试。');
  }

  return { success: true };
}

// 云函数入口
exports.handler = async (event, context) => {
  try {
    const body = JSON.parse(event.body || '{}');
    const { challenge, token, type, header, event: eventData } = body;

    console.log('[Receive Message] Event type:', type);
    console.log('[Receive Message] Event:', JSON.stringify(body, null, 2));

    // 1. 验证挑战（初次配置时需要）
    if (type === 'url_verification') {
      // TODO: 验证 token 是否匹配
      return {
        statusCode: 200,
        body: JSON.stringify({ challenge })
      };
    }

    // 2. 处理事件回调
    if (type === 'event_callback') {
      // 验证签名
      const signature = header?.signature;
      const timestamp = header?.timestamp;
      const nonce = header?.nonce;

      // 如果有加密密钥，需要解密
      if (body.encrypt) {
        const encryptKey = process.env.FEISHU_ENCRYPT_KEY;
        if (!verifySignature(timestamp, nonce, signature, encryptKey)) {
          console.log('[Receive Message] Signature verification failed');
          return {
            statusCode: 401,
            body: JSON.stringify({ error: 'Invalid signature' })
          };
        }

        const decrypted = decryptMessage(body.encrypt, encryptKey);
        Object.assign(eventData, decrypted);
      }

      // 处理接收消息事件
      if (header?.event_type === 'im.message.receive_v1') {
        return handleUserReply(eventData);
      }
    }

    // 其他事件类型，返回成功
    return {
      statusCode: 200,
      body: JSON.stringify({ success: true })
    };

  } catch (error) {
    console.error('[Receive Message] Error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};
