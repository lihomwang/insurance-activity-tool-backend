// functions/receive-message/index.js
// 飞书云函数 - 接收用户回复消息并触发 AI 教练对话

const db = require('../../services/db');
const aiCoach = require('../../services/aiCoach');
const feishu = require('../../services/feishu');

// 千老师完整人设
const SYSTEM_PROMPT_FULL = `你是"千老师"，一位资深的保险销售导师。

【你的人设】
- 你有 20 年保险销售经验，带过上千个徒弟
- 你专业、温暖、真诚，说话简洁有力
- 你共情能力强，能理解销售的压力和困难
- 你善于发现对方的优点，真诚地肯定

【你的说话风格】
- 像发微信一样说话，口语化、自然
- 每次只说 1-2 句话，最多不超过 3 句
- 不要使用 emoji，保持专业形象
- 不要贫嘴，不要过度调侃
- 不要用书面语、AI 腔调

【你的工作】
你是一个保险活动量管理工具的助手，帮助用户：
1. 查询活动量数据（提交人数、排行榜、个人数据等）
2. 解答填报相关问题（时间、入口等）
3. 鼓励和督促用户完成活动量填报

【回答规则】
- 用户问数据 → 先回答数据，然后鼓励
- 用户问时间/入口 → 直接告知，语气温和
- 用户闲聊 → 温暖回应，可以引导到工作话题
- 不要重复说同一件事
- 不要说"作为 AI"这类话`;

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
  const chatType = message.chat_type || 'group'; // 'group' or 'p2p'

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

  // ==================== 群消息处理 ====================
  if (chatType === 'group') {
    // 检查是否有人@机器人
    const mentionKeys = message.mention_info?.mention_keys || [];
    const isMentionBot = mentionKeys.some(key => key === 'all' || key.includes('bot') || key.includes('robot'));

    if (!isMentionBot) {
      // 群里普通消息，不回复
      return { success: true };
    }

    // 被@了，用 AI 回复用户（通过阿里百炼调用 Claude Code）
    const user = await db.findOne('users', { feishu_union_id: senderId });
    if (!user) {
      await feishu.sendTextMessage(chatId, '@' + (sender.name || '您') + ' 我还不认识你呢～请先在活动量 H5 中完成绑定，我才能为你服务哦！');
      return { success: true };
    }

    // 查询今日是否已提交数据
    const today = new Date().toISOString().split('T')[0];
    const activity = await db.findOne('activities', {
      user_id: user.id,
      activity_date: today,
      is_submitted: 1
    });

    // 用 AI 生成回复（通过阿里百炼调用 Claude Code）
    const lowerText = textContent.toLowerCase();
    let contextPrompt = '';

    if (lowerText.includes('多少人') || lowerText.includes('提交') || lowerText.includes('统计')) {
      const activities = await db.findAll('activities', {
        activity_date: today,
        is_submitted: 1
      });
      const submittedCount = activities.length;
      contextPrompt = `用户在群里询问今天有多少人提交了活动量数据。今天已有 ${submittedCount} 人提交。
请用温暖专业的语气回复，鼓励大家继续坚持。回复要简洁，1-2 句话即可。`;
    } else if (lowerText.includes('排行') || lowerText.includes('排名') || lowerText.includes('第一')) {
      contextPrompt = `用户在群里询问排行榜。
请回复查看排行榜的方式，鼓励大家争优创先。回复要简洁温暖，1-2 句话即可。`;
    } else if (lowerText.includes('填报') || lowerText.includes('提交') || lowerText.includes('入口')) {
      contextPrompt = `用户在群里询问填报入口或时间。
请提供填报入口链接和时间，温和提醒大家记得填报。回复简洁，1-2 句话即可。`;
    } else if (lowerText.includes('数据') || lowerText.includes('我的')) {
      contextPrompt = `用户想查看自己的数据。
请告诉用户如何查看个人数据，语气温暖鼓励。1-2 句话即可。`;
    } else {
      contextPrompt = `用户在群里问了一个问题："${textContent}"
请以保险销售导师"千老师"的身份回复。语气温暖、专业、简洁，像微信聊天。1-2 句话即可。`;
    }

    const userPrompt = `${contextPrompt}

当前用户：${user.name || '伙伴'}
用户今天是否已提交数据：${activity ? '是' : '否'}

请直接回复用户的问题，简洁温暖，1-2 句话即可。不要说"作为 AI"这类话。`;

    try {
      const axios = require('axios');

      // 通过阿里百炼调用 Claude Code（使用用户的 Coding Plan API Key）
      const response = await axios.post(
        'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
        {
          model: 'claude-sonnet-4-20250514',
          messages: [
            {
              role: 'system',
              content: SYSTEM_PROMPT_FULL
            },
            {
              role: 'user',
              content: userPrompt
            }
          ],
          temperature: 0.7,
          max_tokens: 300
        },
        {
          headers: {
            'Authorization': `Bearer ${process.env.DASHSCOPE_API_KEY}`,
            'Content-Type': 'application/json'
          }
        }
      );

      console.log('[AI] Claude 回复:', response.data.choices[0].message.content);

      const aiReply = response.data.choices[0].message.content.trim();

      // 如果是数据查询类问题，补充链接
      if (lowerText.includes('排行') || lowerText.includes('填报') || lowerText.includes('数据')) {
        await feishu.sendTextMessage(chatId, aiReply + '\n\n访问：https://money888-e3c.pages.dev/');
      } else {
        await feishu.sendTextMessage(chatId, aiReply);
      }
    } catch (error) {
      console.error('[AI Group Reply] Error:', error.message);
      console.error('[AI] Response:', error.response?.data);
      // AI 失败时用备用回复
      let fallback = '';
      if (lowerText.includes('多少人') || lowerText.includes('提交') || lowerText.includes('统计')) {
        fallback = '今天已有不少伙伴提交了活动量数据，为大家的坚持点赞！还没提交的伙伴记得在 24:00 前完成填报哦～';
      } else if (lowerText.includes('排行')) {
        fallback = '回复【排行】查看团队排行榜！或者访问 https://money888-e3c.pages.dev/ 查看详细数据～';
      } else if (lowerText.includes('填报')) {
        fallback = '填报入口：https://money888-e3c.pages.dev/\n填报时间：每天 9:00 - 24:00';
      } else {
        fallback = '你好呀！有任何问题都可以问我，或者访问 https://money888-e3c.pages.dev/ 查看数据～';
      }
      await feishu.sendTextMessage(chatId, fallback);
    }

    return { success: true };
  }

  // ==================== 私信处理（AI 教练对话）=====================
  // 查询用户（同时检查 feishu_user_id 和 feishu_union_id）
  const user = await db.findOne('users', { feishu_union_id: senderId });
  if (!user) {
    // 尝试用 feishu_user_id 再查一次
    const user2 = await db.findOne('users', { feishu_user_id: senderId });
    if (!user2) {
      console.log(`[Receive Message] User not found: ${senderId}`);
      await feishu.sendTextMessage(
        chatId,
        '您好！我还没绑定您的账号。请先在活动量管理工具中完成绑定。'
      );
      return { success: true };
    }
    user = user2;
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

  // 检查是否已达到最大问题数（最多 10 个引导式提问）
  const questionCount = conversation.question_count || 0;
  if (questionCount >= 10) {
    // 对话已结束，回复感谢（私信发送）
    await feishu.sendTextMessage(senderId, '今天的对话就到这里！感谢你的分享，相信这次对话对你有帮助。明天继续努力，千老师会再次与你交流！加油！');

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
    const aiResult = await aiCoach.generateNextMessage(messages, textContent);

    // 发送下一个问题（私信发送，不在群里回复）
    await feishu.sendTextMessage(senderId, aiResult.message);

    // 更新对话记录
    messages.push({ role: 'assistant', content: aiResult.questions[0] });
    await db.update('ai_conversations', { id: conversation.id }, {
      messages: JSON.stringify(messages),
      question_count: questionCount + 1
    });

    console.log(`[Receive Message] Sent follow-up question to ${user.name}`);

  } catch (error) {
    console.error('[Receive Message] Error generating response:', error.message);
    // AI 失败时回复默认消息（私信）
    await feishu.sendTextMessage(senderId, 'AI 教练正在思考中，请稍后再试。');
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
