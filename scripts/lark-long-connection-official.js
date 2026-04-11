// scripts/lark-long-connection-official.js
// 飞书长连接客户端 - 使用官方 SDK @larksuiteoapi/node-sdk
// 配合 AI 教练使用（群聊使用 Claude API）

import * as Lark from '@larksuiteoapi/node-sdk';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createRequire } from 'module';
import axios from 'axios';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const require = createRequire(import.meta.url);

// 加载环境变量（强制覆盖现有环境变量）
config({ path: join(__dirname, '../.env.local'), override: true });

// 配置
const FEISHU_APP_ID = process.env.FEISHU_APP_ID || 'cli_a95a59999e78dcc0';
const FEISHU_APP_SECRET = process.env.FEISHU_APP_SECRET || 'oGkCG8FHYRxW3hNjVU3oceYgE3hYMkmE';

// 本地 AI Reply 服务地址
const AI_REPLY_SERVICE_URL = 'http://localhost:3456';

// 加载数据库和 AI 教练模块
const db = (await import('../services/db.js')).default;
const aiCoach = await import('../services/aiCoach.js');
const feishu = (await import('../services/feishu.js')).default;

/**
 * 调用本地 AI Reply 服务（通过 Claude Code CLI）
 */
async function callLocalAIReply(message, userName, isSubmitted, todaySubmittedCount) {
  try {
    console.log('[AI] 调用本地 AI Reply 服务...');
    const response = await axios.post(
      `${AI_REPLY_SERVICE_URL}/api/generate-reply`,
      {
        message,
        user_name: userName,
        is_submitted: isSubmitted,
        today_submitted_count: todaySubmittedCount
      },
      {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 35000 // 35 秒超时
      }
    );
    const reply = response.data.reply;
    console.log('[AI] Claude 回复:', reply);
    return reply;
  } catch (error) {
    console.error('[AI] 调用本地 AI Reply 服务失败:', error.message);
    return null;
  }
}

/**
 * 生成群聊 AI 回复（通过本地 AI Reply 服务调用 Claude Code）
 */
async function generateAIGroupReply(message, user, activity) {
  const today = new Date().toISOString().split('T')[0];

  // 获取今天提交人数
  let todaySubmittedCount = 0;
  try {
    const activities = await db.findAll('activities', {
      activity_date: today,
      is_submitted: 1
    });
    todaySubmittedCount = activities.length;
  } catch (e) {
    console.error('[AI] 获取提交人数失败:', e.message);
  }

  // 调用本地 AI Reply 服务
  const reply = await callLocalAIReply(
    message,
    user.name || '伙伴',
    !!activity,
    todaySubmittedCount
  );

  return reply;
}

/**
 * 生成群聊规则回复（AI 失败时的备用）
 */
function generateGroupRuleReply(message, userName) {
  const msg = message.toLowerCase().trim();

  // 填报相关
  if (msg.includes('填') || msg.includes('报') || msg.includes('活动量') || msg.includes('链接')) {
    return `填报入口在这 👉 https://happylife888.netlify.app/
截止时间今晚 21:00，千老师会找你复盘的哦～ 💪`;
  }

  // 默认回复
  return `你好呀～ 有什么可以帮你的？可以问我关于活动量填报、团队数据等问题，或者访问 https://happylife888.netlify.app/ 查看详细数据～`;
}

console.log('');
console.log('='.repeat(60));
console.log('🚀 飞书长连接客户端 - AI 教练');
console.log('='.repeat(60));
console.log('');
console.log(`App ID: ${FEISHU_APP_ID}`);
console.log('');

// 创建客户端配置
const baseConfig = {
  appId: FEISHU_APP_ID,
  appSecret: FEISHU_APP_SECRET
};

// 创建 WS 客户端
const wsClient = new Lark.WSClient({
  ...baseConfig,
  loggerLevel: Lark.LoggerLevel.info
});

// 创建 API 客户端（用于回复消息）
const client = new Lark.Client(baseConfig);

// 启动长连接
wsClient.start({
  // 处理「接收消息」事件
  eventDispatcher: new Lark.EventDispatcher({}).register({
    'im.message.receive_v1': async (data) => {
      const {
        message: { chat_id, message_id, content, message_type, chat_type, mentions },
        sender: { sender_id }
      } = data;

      // 解析消息内容
      let textContent = '';
      if (message_type === 'text') {
        const parsed = typeof content === 'string' ? JSON.parse(content) : content;
        textContent = parsed.text || '';
      }

      if (!textContent.trim()) return;

      const userId = sender_id?.union_id || sender_id?.user_id;
      if (!userId) return;

      // 判断是否是群聊 @ 机器人
      const isGroupChat = chat_type === 'group';

      // 检查是否被@ (通过 mentions 字段或者文本匹配)
      let isMentioned = false;
      if (mentions && mentions.length > 0) {
        // 如果有 mentions 字段，检查是否有机器人
        isMentioned = mentions.some(m => m.mention_type === 'all' || m.open_id || m.union_id || m.user_id);
      }
      // 同时检查文本中的@
      if (!isMentioned) {
        isMentioned = textContent.includes('@千老师') || textContent.includes('@AI 教练') || textContent.includes('@_user_1');
      }

      console.log('');
      console.log('='.repeat(60));
      console.log(`[Message] 收到消息`);
      console.log(`  类型：${isGroupChat ? '群聊' : '私信'}`);
      console.log(`  chat_id: ${chat_id}`);
      console.log(`  用户：${userId}`);
      console.log(`  内容：${textContent}`);
      console.log(`  被@：${isMentioned}`);
      console.log('='.repeat(60));

      // 查找用户
      try {
        const user = await db.findOne('users', { feishu_user_id: userId });
        if (!user) {
          console.log('[Coach] 用户未找到，跳过');
          return;
        }

        // 获取当日活动量数据（群聊和私信都需要）
        const today = new Date().toISOString().split('T')[0];
        const activity = await db.findOne('activities', {
          user_id: user.id,
          activity_date: today,
          is_submitted: 1
        });

        // 群聊场景：只有在被@时才回复
        if (isGroupChat) {
          if (!isMentioned) {
            console.log('[Coach] 群聊消息，但没有@千老师，跳过');
            return;
          }

          console.log('[Coach] 群聊场景，在群里回复...');

          // 使用 AI 生成回复（调用 Claude API）
          const aiReply = await generateAIGroupReply(textContent, user, activity);
          const reply = aiReply || generateGroupRuleReply(textContent, user.name);

          if (!reply) {
            console.log('[Coach] 无回复内容，跳过');
            return;
          }
          await feishu.sendGroupTextMessage(chat_id, reply);
          console.log('[Coach] 已回复到群里:', reply);
          return;
        }

        // 查找进行中的对话
        let conversation = await db.findOne('ai_conversations', {
          user_id: user.id,
          conversation_date: today,
          status: 'pending'
        });

        // 如果没有进行中的对话，创建一个新的对话
        if (!conversation) {
          console.log('[Coach] 没有进行中的对话，创建新对话...');

          // 生成第一条消息（使用活动量数据）
          const firstMsg = await aiCoach.generateFirstMessage(
            { name: user.name },
            activity || { total_score: 0, is_submitted: 0 }
          );

          // 发送私信
          await feishu.sendTextMessage(userId, firstMsg.message);

          // 保存对话记录
          await db.insert('ai_conversations', {
            user_id: user.id,
            conversation_date: today,
            messages: JSON.stringify([
              { role: 'user', content: textContent },
              { role: 'assistant', content: firstMsg.message }
            ]),
            question_count: 1,
            summary: '',
            status: 'pending',
            feishu_chat_id: userId
          });

          console.log(`[Coach] 已回复 ${user.name}`);
          return;
        }

        console.log(`[Coach] 处理 ${user.name} 的回复...`);

        // 处理用户回复（传递活动量数据用于结束复盘）
        const result = await aiCoach.handleUserReply(userId, textContent, conversation, activity);

        if (result.ended) {
          console.log(`[Coach] ${user.name} 的对话已结束`);
        } else {
          console.log(`[Coach] 已回复 ${user.name}`);
        }

      } catch (error) {
        console.error('[Coach] 处理错误:', error.message);
      }
    }
  })
});

console.log('[Info] 正在连接飞书...');
console.log('[Info] 如看到 "connected to wss://" 表示连接成功');
console.log('');

