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

// 阿里百炼 Claude API 配置
const DASHSCOPE_API_KEY = process.env.DASHSCOPE_API_KEY || 'sk-sp-87417cc737b44634b3883fb845effbd7';
const CLAUDE_MODEL = 'claude-sonnet-4-20250514';

// 千老师 AI 人设
const AI_SYSTEM_PROMPT = `你是"千老师"，一位资深的保险销售导师。

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
3. 鼓励和督促用户完成活动量填报`;

// 加载数据库和 AI 教练模块
const db = (await import('../services/db.js')).default;
const aiCoach = await import('../services/aiCoach.js');
const feishu = (await import('../services/feishu.js')).default;

/**
 * 调用 Claude API（通过阿里百炼）
 */
async function callClaude(systemPrompt, userPrompt) {
  try {
    const response = await axios.post(
      'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
      {
        model: CLAUDE_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.7,
        max_tokens: 300
      },
      {
        headers: {
          'Authorization': `Bearer ${DASHSCOPE_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );
    return response.data.choices[0].message.content;
  } catch (error) {
    console.error('[AI] 调用 Claude 失败:', error.message);
    return null;
  }
}

/**
 * 生成群聊 AI 回复（使用 Claude API）
 */
async function generateAIGroupReply(message, user, activity) {
  const msg = message.toLowerCase().trim();
  let contextPrompt = '';

  if (msg.includes('多少人') || msg.includes('提交') || msg.includes('统计')) {
    const activities = await db.findAll('activities', {
      activity_date: new Date().toISOString().split('T')[0],
      is_submitted: 1
    });
    const submittedCount = activities.length;
    contextPrompt = `用户在群里询问今天有多少人提交了活动量数据。今天已有 ${submittedCount} 人提交。请用温暖专业的语气回复，1-2 句话即可。`;
  } else if (msg.includes('排行') || msg.includes('排名') || msg.includes('第一')) {
    contextPrompt = `用户在群里询问排行榜。请回复查看排行榜的方式，鼓励大家争优创先。1-2 句话即可。`;
  } else if (msg.includes('填报') || msg.includes('入口') || msg.includes('时间') || msg.includes('截止')) {
    contextPrompt = `用户在群里询问填报入口或时间。请提供填报入口链接 (https://happylife888.netlify.app/) 和时间 (每天 9:00-24:00)，温和提醒。1-2 句话即可。`;
  } else if (msg.includes('数据') || msg.includes('我的')) {
    contextPrompt = `用户想查看自己的数据。请告诉用户访问 https://happylife888.netlify.app/ 登录查看，语气温暖鼓励。1-2 句话即可。`;
  } else if (msg.includes('早') || msg.includes('好') || msg.includes('hi') || msg.includes('hello') || msg.includes('在吗')) {
    contextPrompt = `用户在群里打招呼。请温暖回应，简洁友好。1-2 句话即可。`;
  } else if (msg.includes('谢') || msg.includes('thanks')) {
    contextPrompt = `用户表示感谢。请礼貌回应，简洁温暖。1 句话即可。`;
  } else if (msg.includes('累') || msg.includes('辛苦') || msg.includes('困') || msg.includes('忙')) {
    contextPrompt = `用户说累或辛苦。请共情回应，给予关心。1-2 句话即可。`;
  } else if (msg.includes('开单') || msg.includes('成交') || msg.includes('开心')) {
    contextPrompt = `用户有好消息（开单/成交）。请真诚祝贺并简单肯定。1-2 句话即可。`;
  } else {
    contextPrompt = `用户在群里说："${message}" 请以保险销售导师"千老师"的身份回复。语气温暖、专业、简洁，像微信聊天。1-2 句话即可。`;
  }

  const userPrompt = `${contextPrompt}

当前用户：${user.name || '伙伴'}
用户今天是否已提交数据：${activity ? '是' : '否'}

请直接回复用户，简洁温暖。`;

  const reply = await callClaude(AI_SYSTEM_PROMPT, userPrompt);
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

        // 私信场景：AI 教练对话
        // 获取当日活动量数据
        const today = new Date().toISOString().split('T')[0];
        const activity = await db.findOne('activities', {
          user_id: user.id,
          activity_date: today,
          is_submitted: true
        });

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

// 存储最近的回复记录，避免重复
const recentReplies = new Map();

/**
 * 生成群聊回复（千老师在群里被@时的回复）
 * 高情商、风趣幽默、能给情绪价值
 */
function generateGroupReply(message, userName) {
  const msg = message.toLowerCase().trim();

  // 检查是否重复消息（10 秒内不回复相同内容）
  const replyKey = `${userName}:${msg}`;
  const now = Date.now();
  if (recentReplies.has(replyKey)) {
    const lastTime = recentReplies.get(replyKey);
    if (now - lastTime < 10000) {
      return null; // 不回复
    }
  }
  recentReplies.set(replyKey, now);

  // 清理过期的记录
  for (const [key, time] of recentReplies.entries()) {
    if (now - time > 60000) {
      recentReplies.delete(key);
    }
  }

  // 问候场景
  if (msg.includes('早') || msg.includes('good morning')) {
    const replies = [
      `早啊 ${userName}！☀️ 今天也要记得填报活动量哦～`,
      `早！☀️ 千老师已经在等你的活动量了～`,
      `${userName} 早啊！今天准备搞多少钱？💰`,
      `好啊～ 今天也要加油哦！💪`
    ];
    return replies[Math.floor(Math.random() * replies.length)];
  }

  if (msg.includes('好') || msg.includes('hi') || msg.includes('hello') || msg.includes('在吗')) {
    const replies = [
      `在呢～ 说吧，什么事？😊`,
      `千老师已上线，请讲～`,
      `嗯？怎么了${userName}？`,
      `在的，有什么可以帮你的？`
    ];
    return replies[Math.floor(Math.random() * replies.length)];
  }

  // 填报相关
  if (msg.includes('填') || msg.includes('报') || msg.includes('活动量') || msg.includes('数据') || msg.includes('链接')) {
    return `填报入口在这 👉 https://happylife888.netlify.app/
截止时间今晚 21:00，千老师会找你复盘的哦～ 💪`;
  }

  // 感谢
  if (msg.includes('谢') || msg.includes('thanks') || msg.includes('thank you')) {
    const replies = [
      `不客气～ 有问题随时找我！😊`,
      `小意思～ 千老师一直在～`,
      `客气啥～ 都是自己人！`,
      `应该的～ 有事说话！`
    ];
    return replies[Math.floor(Math.random() * replies.length)];
  }

  // 累/辛苦
  if (msg.includes('累') || msg.includes('辛苦') || msg.includes('困') || msg.includes('忙')) {
    const replies = [
      `累就对了，舒服是留给死人的。不过说真的，歇会儿再战！`,
      `辛苦啦～ 千老师给你点个赞！👍 休息一下吧`,
      `忙是好事，说明你有在努力。但也别忘了照顾自己～`,
      `抱抱～ 🫂 今天已经很棒了，休息一下吧`
    ];
    return replies[Math.floor(Math.random() * replies.length)];
  }

  // 被拒绝/沮丧
  if (msg.includes('拒绝') || msg.includes('失败') || msg.includes('郁闷') || msg.includes('烦')) {
    const replies = [
      `害，被拒绝是常态，成交才是意外。来，说说，这次啥情况？`,
      `每个销冠都是从被拒绝开始的。你离销冠又近了一步！`,
      `没事，千老师当年被拒绝得比你还惨。现在不也带出上千个徒弟了？`,
      `允许自己郁闷一会儿，然后继续干。销售就是这样，起起落落的～`
    ];
    return replies[Math.floor(Math.random() * replies.length)];
  }

  // 开单/好消息
  if (msg.includes('开单') || msg.includes('成交') || msg.includes('签') || msg.includes('高兴') || msg.includes('开心')) {
    const replies = [
      `可以啊！我就知道你有戏！说说，咋成的？🎉`,
      `牛逼！🔥 这单必须得庆祝一下！`,
      `太好了！千老师为你骄傲！说说过程呗～`,
      `开单大吉！🎉 今天得加鸡腿！`
    ];
    return replies[Math.floor(Math.random() * replies.length)];
  }

  // 天气/周末/放假
  if (msg.includes('天气') || msg.includes('周末') || msg.includes('放假') || msg.includes('休息')) {
    const replies = [
      `天气好就出去走走，活动量回来再填～`,
      `周末好好休息，陪陪家人，周一再战！`,
      `放假就好好玩，工作的事周一再说～`,
      `休息是为了走更远的路，放松去吧～`
    ];
    return replies[Math.floor(Math.random() * replies.length)];
  }

  // 默认回复 - 高情商接话
  const defaults = [
    `嗯嗯，千老师听到了～ 还有啥想说的？`,
    `收到～ 有事随时找我！`,
    `好的好的～ 我在这儿呢～`,
    `OK～ 说吧， next？`
  ];
  return defaults[Math.floor(Math.random() * defaults.length)];
}
