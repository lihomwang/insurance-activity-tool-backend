// scripts/lark-long-connection-official.js
// 飞书长连接客户端 - 使用官方 SDK @larksuiteoapi/node-sdk
// AI 教练私信 + 群聊智能回复（全部基于 Bitable）

import * as Lark from '@larksuiteoapi/node-sdk';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import axios from 'axios';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 加载环境变量（强制覆盖现有环境变量）
config({ path: join(__dirname, '../.env.local'), override: true });

// 配置
const FEISHU_APP_ID = process.env.FEISHU_APP_ID || 'cli_a95a59999e78dcc0';
const FEISHU_APP_SECRET = process.env.FEISHU_APP_SECRET || 'oGkCG8FHYRxW3hNjVU3oceYgE3hYMkmE';

// 填报链接
const REPORT_URL = process.env.REPORT_URL || 'https://happylife888.netlify.app/';

// 加载 Bitable 和 AI 教练模块（Bitable 版本）
const bitable = (await import('../services/bitable.js')).default;
const aiCoach = (await import('../services/aiCoach-bitable.js')).default;

/**
 * 获取 tenant_access_token（用于发送消息）
 */
async function getTenantToken() {
  const resp = await axios.post(
    'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal',
    { app_id: FEISHU_APP_ID, app_secret: FEISHU_APP_SECRET }
  );
  if (resp.data.code !== 0) throw new Error('获取 token 失败: ' + resp.data.msg);
  return resp.data.tenant_access_token;
}

/**
 * 发送私信
 */
async function sendPrivateMessage(openId, text) {
  const token = await getTenantToken();
  const resp = await axios.post(
    'https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=open_id',
    {
      receive_id: openId,
      msg_type: 'text',
      content: JSON.stringify({ text })
    },
    {
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json'
      }
    }
  );
  return resp.data.data;
}

/**
 * 发送群消息
 */
async function sendGroupMessage(chatId, text) {
  const token = await getTenantToken();
  const resp = await axios.post(
    'https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=chat_id',
    {
      receive_id: chatId,
      msg_type: 'text',
      content: JSON.stringify({ text })
    },
    {
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json'
      }
    }
  );
  return resp.data.data;
}

/**
 * 通过 DashScope 生成群聊 AI 回复
 */
async function generateGroupAIReply(message, userName, activity) {
  const systemPrompt = `你是"千老师"，一位有 20 年保险销售经验的团队导师。
你在群里回答成员的问题。
说话简洁、温暖、专业，像发微信。
不要使用 emoji。`;

  let dataContext = '';
  if (activity) {
    dataContext = `\n\n该成员今天的活动量：总分${activity.total_score || 0}分，新增${activity.new_leads || 0}，转介绍${activity.referral || 0}，邀约${activity.invitation || 0}，销售面谈${activity.sales_meeting || 0}，成交${activity.deal || 0}。`;
  }

  const userPrompt = `成员${userName}在群里问："${message}"${dataContext}

请用 1-2 句话回答，简洁实用。如果问到填报链接，请回复：${REPORT_URL}`;

  try {
    const resp = await axios.post(
      'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
      {
        model: process.env.DASHSCOPE_MODEL || 'qwen-plus',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.5,
        max_tokens: 200
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.DASHSCOPE_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );
    return resp.data.choices[0].message.content.trim();
  } catch (error) {
    console.error('[AI] 群聊 AI 生成失败:', error.message);
    return null;
  }
}

/**
 * 群聊规则回复（AI 失败时的备用）
 */
function generateGroupRuleReply(message) {
  const msg = message.toLowerCase().trim();

  // 填报相关
  if (msg.includes('填') || msg.includes('报') || msg.includes('活动量') || msg.includes('链接') || msg.includes('入口')) {
    return `填报入口在这 👉 ${REPORT_URL}\n截止时间今晚 21:00，千老师会找你复盘的哦～ 💪`;
  }

  // 默认回复
  return `你好呀～ 有什么可以帮你的？活动量填报入口：${REPORT_URL}`;
}

/**
 * 通过 open_id 查找用户（从 Bitable 记录中）
 */
async function findUserByOpenId(openId) {
  // 从 USER_OPEN_ID_MAP 反查用户名
  if (process.env.USER_OPEN_ID_MAP) {
    const pairs = process.env.USER_OPEN_ID_MAP.split(',');
    for (const pair of pairs) {
      const [name, id] = pair.split(':').map(s => s.trim());
      if (id === openId) return { name, open_id: id };
    }
  }
  return null;
}

console.log('');
console.log('='.repeat(60));
console.log('🚀 飞书长连接客户端 - AI 教练（Bitable 版本）');
console.log('='.repeat(60));
console.log('');
console.log(`App ID: ${FEISHU_APP_ID}`);
console.log(`填报链接: ${REPORT_URL}`);
console.log('');

// 创建 WS 客户端
const wsClient = new Lark.WSClient({
  appId: FEISHU_APP_ID,
  appSecret: FEISHU_APP_SECRET,
  loggerLevel: Lark.LoggerLevel.info
});

// 创建 API 客户端
const client = new Lark.Client({
  appId: FEISHU_APP_ID,
  appSecret: FEISHU_APP_SECRET
});

// 启动长连接
wsClient.start({
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

      // 使用 open_id 作为用户标识
      const openId = sender_id?.open_id;
      if (!openId) return;

      // 判断是否是群聊
      const isGroupChat = chat_type === 'group';

      // 检查是否被@
      let isMentioned = false;
      if (mentions && mentions.length > 0) {
        isMentioned = mentions.some(m => m.mention_type === 'all' || m.open_id || m.union_id || m.user_id);
      }
      if (!isMentioned) {
        isMentioned = textContent.includes('@千老师') || textContent.includes('@AI 教练') || textContent.includes('@_user_1');
      }

      console.log('');
      console.log('='.repeat(60));
      console.log(`[Message] 收到消息`);
      console.log(`  类型：${isGroupChat ? '群聊' : '私信'}`);
      console.log(`  chat_id: ${chat_id}`);
      console.log(`  open_id: ${openId}`);
      console.log(`  内容：${textContent}`);
      console.log(`  被@：${isMentioned}`);
      console.log('='.repeat(60));

      try {
        // ====== 群聊场景 ======
        if (isGroupChat) {
          if (!isMentioned) {
            console.log('[Coach] 群聊消息，但没有@千老师，跳过');
            return;
          }

          console.log('[Coach] 群聊被@，生成回复...');

          // 查找用户信息
          const user = await findUserByOpenId(openId);
          const userName = user?.name || '伙伴';

          // 获取今天该用户的活动量数据
          const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' });
          const activity = await bitable.findRecord({ user_name: userName, activity_date: today });

          // 先用 AI 生成回复
          const aiReply = await generateGroupAIReply(textContent, userName, activity);
          const reply = aiReply || generateGroupRuleReply(textContent);

          if (!reply) {
            console.log('[Coach] 无回复内容，跳过');
            return;
          }

          await sendGroupMessage(chat_id, reply);
          console.log('[Coach] 群聊回复成功:', reply.substring(0, 50));
          return;
        }

        // ====== 私信场景（AI 教练对话） ======
        console.log('[Coach] 私信场景，处理 AI 教练对话...');

        const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' });

        // 查找用户（从 USER_OPEN_ID_MAP）
        const user = await findUserByOpenId(openId);
        if (!user) {
          console.log('[Coach] 用户未在 USER_OPEN_ID_MAP 中配置，跳过');
          return;
        }

        // 从 Bitable 获取今天的记录
        const record = await bitable.findRecord({ user_name: user.name, activity_date: today });

        // 获取对话状态（存储在 Bitable 的 user_id 字段中）
        let convState = null;
        if (record) {
          const convData = record.user_id; // user_id 字段临时存储 JSON
          if (convData) {
            try {
              convState = typeof convData === 'string' ? JSON.parse(convData) : convData;
            } catch {
              convState = null;
            }
          }
        }

        // 检查是否有进行中的对话
        if (!convState || convState.status !== 'pending') {
          console.log('[Coach] 没有进行中的对话，忽略用户消息');
          return;
        }

        console.log(`[Coach] 继续 ${user.name} 的对话，当前轮次: ${convState.question_count || 0}`);

        // 将用户回复加入历史
        const history = convState.history || [];
        history.push({ role: 'user', content: textContent });

        // 判断是否应该结束对话（最多 5 轮）
        const questionCount = convState.question_count || 0;
        if (questionCount >= 5) {
          // 结束对话，生成复盘消息
          console.log('[Coach] 对话达到 5 轮，生成结束语...');
          const endingMsg = await aiCoach.generateEndingMessage(
            user.name,
            convState.activity_data || {},
            history
          );

          await sendPrivateMessage(openId, endingMsg);
          console.log('[Coach] 结束语已发送:', endingMsg.substring(0, 50));

          // 更新状态为已完成
          history.push({ role: 'assistant', content: endingMsg });
          if (record) {
            await bitable.updateRecord(record.record_id, {
              fields: { user_id: JSON.stringify({
                status: 'completed',
                question_count: questionCount,
                history,
                activity_data: convState.activity_data
              })}
            });
          }
          return;
        }

        // 生成下一个回复
        console.log('[Coach] 生成下一个回复...');
        const nextMsg = await aiCoach.generateNextMessage(history, textContent);

        // 发送回复
        await sendPrivateMessage(openId, nextMsg);
        console.log('[Coach] 回复已发送给', user.name, ':', nextMsg.substring(0, 50));

        // 更新对话状态
        history.push({ role: 'assistant', content: nextMsg });
        if (record) {
          await bitable.updateRecord(record.record_id, {
            fields: { user_id: JSON.stringify({
              status: 'pending',
              question_count: questionCount + 1,
              history,
              activity_data: convState.activity_data
            })}
          });
        }

        console.log(`[Coach] ${user.name} 对话更新完成，轮次: ${questionCount + 1}`);

      } catch (error) {
        console.error('[Coach] 处理错误:', error.message);
        console.error(error.stack);
      }
    }
  })
});

console.log('[Info] 正在连接飞书...');
console.log('[Info] 如看到 "connected to wss://" 表示连接成功');
console.log('');
