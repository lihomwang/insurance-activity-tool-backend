#!/usr/bin/env node
// scripts/run-ai-coach.js
// AI 教练定时任务脚本 - 在 Mac mini 上运行

require('dotenv').config({ path: __dirname + '/../.env' });

const axios = require('axios');

// 飞书配置
const FEISHU_APP_ID = process.env.FEISHU_APP_ID;
const FEISHU_APP_SECRET = process.env.FEISHU_APP_SECRET;
const FEISHU_API_BASE = 'https://open.feishu.cn';

// AI 配置
const AI_PROVIDER = process.env.AI_PROVIDER || 'dashscope';
const DASHSCOPE_API_KEY = process.env.DASHSCOPE_API_KEY;

// 数据库配置（使用飞书多维表格或本地数据库）
const DATA_SOURCE = process.env.DATA_SOURCE || 'feishu'; // 'feishu' 或 'local'

/**
 * 获取飞书 Tenant Access Token
 */
let tenantAccessToken = null;
let tokenExpiresAt = 0;

async function getTenantAccessToken() {
  if (tenantAccessToken && Date.now() < tokenExpiresAt) {
    return tenantAccessToken;
  }

  const response = await axios.post(
    `${FEISHU_API_BASE}/open-apis/auth/v3/tenant_access_token/internal`,
    {
      app_id: FEISHU_APP_ID,
      app_secret: FEISHU_APP_SECRET
    }
  );

  if (response.data.code !== 0) {
    throw new Error(`获取 Token 失败：${response.data.msg}`);
  }

  tenantAccessToken = response.data.tenant_access_token;
  tokenExpiresAt = Date.now() + (response.data.expire - 300) * 1000;

  console.log('[Feishu] Token refreshed');
  return tenantAccessToken;
}

/**
 * 获取今日已提交活动量的用户列表
 */
async function getTodayActivities() {
  const today = new Date().toISOString().split('T')[0];
  const todayTimestamp = new Date(today).getTime();

  // TODO: 从你的数据源获取今日活动量
  // 这里提供两种方案：

  // 方案 1: 从飞书多维表格获取
  if (DATA_SOURCE === 'feishu') {
    return await getActivitiesFromFeishu(todayTimestamp);
  }

  // 方案 2: 从本地 JSON 文件获取（测试用）
  return getActivitiesFromLocalFile(today);
}

/**
 * 从飞书多维表格获取活动量
 * 支持 Wiki 格式和独立表格格式
 */
async function getActivitiesFromFeishu(todayTimestamp) {
  const token = await getTenantAccessToken();

  const APP_TOKEN = process.env.FEISHU_BITABLE_APP_TOKEN;
  const TABLE_ID = process.env.FEISHU_BITABLE_TABLE_ID || 'tblDefault';

  if (!APP_TOKEN) {
    console.warn('[Warning] 未配置多维表格，使用模拟数据');
    return getActivitiesFromLocalFile('today');
  }

  try {
    // 飞书多维表格 API 查询
    const response = await axios.get(
      `${FEISHU_API_BASE}/open-apis/bitable/v1/apps/${APP_TOKEN}/tables/${TABLE_ID}/records`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!response.data || !response.data.data) {
      throw new Error('API 返回数据格式不正确');
    }

    console.log(`[Feishu] 获取多维表格数据成功：${response.data.data.items?.length || 0} 条记录`);

    const items = response.data.data.items || [];

    // 获取今天的日期戳（毫秒）
    const today = new Date().toISOString().split('T')[0];
    const todayTimestamp = new Date(today).getTime();

    // 过滤出今天的数据
    const todayItems = items.filter(item => {
      const recordDate = item.fields.activity_date;
      if (!recordDate) return false;
      // 飞书返回的时间戳是毫秒
      const recordDateObj = new Date(recordDate);
      const recordDateStr = recordDateObj.toISOString().split('T')[0];
      return recordDateStr === today;
    });

    console.log(`[Feishu] 今日数据：${todayItems.length} 条`);

    // 映射数据，并通过手机号获取用户 ID
    const activities = await Promise.all(todayItems.map(async item => {
      let userId = item.fields.user_id;

      // 如果没有 user_id，尝试从手机号获取
      if (!userId && item.fields.mobile) {
        userId = await getUserIdByMobile(item.fields.mobile);
      }

      return {
        user_id: userId,
        user_name: item.fields.user_name,
        mobile: item.fields.mobile,
        total_score: parseInt(item.fields.total_score) || 0,
        dimensions: {
          new_leads: parseInt(item.fields.new_leads) || 0,
          referral: parseInt(item.fields.referral) || 0,
          invitation: parseInt(item.fields.invitation) || 0,
          sales_meeting: parseInt(item.fields.sales_meeting) || 0,
          recruit_meeting: parseInt(item.fields.recruit_meeting) || 0,
          business_plan: parseInt(item.fields.business_plan) || 0,
          deal: parseInt(item.fields.deal) || 0,
          eop_guest: parseInt(item.fields.eop_guest) || 0,
          cc_assessment: parseInt(item.fields.cc_assessment) || 0,
          training: parseInt(item.fields.training) || 0
        }
      };
    }));

    // 过滤掉没有用户 ID 的记录
    const validActivities = activities.filter(a => a.user_id);
    console.log(`[Feishu] 有效记录：${validActivities.length} 条`);
    return validActivities;
  } catch (error) {
    console.error('[Error] 获取多维表格数据失败:', error.message);

    // 404 可能是权限问题或 token 不对
    if (error.response?.status === 404) {
      console.log('[Info] 可能是 Wiki 格式的多维表格，需要检查权限配置');
      console.log('[Info] 请在飞书开放平台添加权限：Base 应用、Bitable:应用');
    }

    // 返回模拟数据用于测试
    console.log('[Info] 使用模拟数据继续测试');
    return getActivitiesFromLocalFile(today);
  }
}

/**
 * 根据手机号获取飞书用户 ID
 */
async function getUserIdByMobile(mobile) {
  try {
    const token = await getTenantAccessToken();

    // 调用飞书通讯录 API 通过手机号获取用户 ID
    const response = await axios.post(
      `${FEISHU_API_BASE}/open-apis/contact/v3/users/batch_get_id`,
      {
        mobiles: [mobile]
      },
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        params: {
          user_ids_type: 'union_id'
        }
      }
    );

    if (response.data.code === 0 && response.data.data?.user_list?.length > 0) {
      const userId = response.data.data.user_list[0].user_id;
      console.log(`[Feishu] 手机号 ${mobile} -> 用户 ID: ${userId}`);
      return userId;
    }
    console.log(`[Feishu] 手机号 ${mobile} 未找到用户`);
    return null;
  } catch (error) {
    console.error(`[Feishu] 获取用户 ID 失败 (${mobile}):`, error.message);
    return null;
  }
}

/**
 * 从本地文件获取模拟数据（测试用）
 */
function getActivitiesFromLocalFile(today) {
  // TODO: 实际部署时，这里应该从数据库读取
  // 现在返回模拟数据用于测试
  return [
    {
      user_id: 'ou_123456',
      user_name: '皮叔',
      total_score: 85,
      dimensions: {
        new_leads: 3,
        referral: 2,
        invitation: 3,
        sales_meeting: 2,
        deal: 1
      }
    },
    {
      user_id: 'ou_789012',
      user_name: '小明',
      total_score: 0,
      dimensions: {}
    }
  ];
}

/**
 * 生成 AI 教练问题
 */
async function generateAIQuestions(userData) {
  const { user_name, total_score, dimensions } = userData;

  if (AI_PROVIDER === 'openclaw') {
    // TODO: 调用 OpenClaw（通过发送消息到机器人，然后监听回复）
    // 由于需要异步处理，这里先使用 dashscope 作为默认
    console.log('[AI] 使用 OpenClaw（暂时回退到 dashscope）');
  }

  // 使用阿里百炼 API
  return await generateWithDashScope(userData);
}

/**
 * 调用阿里百炼 Qwen API 生成问题
 */
async function generateWithDashScope(userData) {
  const { user_name, total_score, dimensions } = userData;

  // 构建 prompt
  let prompt = `你是一位专业的保险销售 AI 教练。成员"${user_name}"今天的活动量数据如下：
- 总分：${total_score}分
`;

  const dimensionNames = {
    new_leads: '新增准客户',
    referral: '转介绍',
    invitation: '邀约',
    sales_meeting: '销售面谈',
    recruit_meeting: '增员面谈',
    business_plan: '事业项目书',
    deal: '成交',
    eop_guest: '嘉宾参加 EOP',
    cc_assessment: 'CC 测评',
    training: '送训'
  };

  const details = Object.entries(dimensions)
    .filter(([_, count]) => count > 0)
    .map(([key, count]) => `- ${dimensionNames[key]}: ${count}`)
    .join('\n');

  prompt += details || '- 今日暂无数据';

  // 特殊情况处理
  if (total_score === 0) {
    prompt += `\n\n⚠️ 该成员今天没有提交任何数据！
请生成 1-2 个关心的问句，表达关切并询问原因。
参考方向：
- 是不是忘记了填报？
- 还是今天确实没有活动量？
- 是不是遇到了什么困难？
语气要温暖、关心，像朋友一样问候，不要质问或责备。`;
  } else {
    if (dimensions.invitation > 0 && dimensions.sales_meeting === 0) {
      prompt += `\n\n⚠️ 该成员今天有邀约 (${dimensions.invitation}人) 但销售面谈到 0 人。
请生成安慰式的引导提问，比如：
- 是被拒绝了还是改期了？
- 邀约后客户没来吗？
- 有没有遇到什么问题需要帮助？
语气要安慰、理解，不要让对方感到压力。`;
    }
    if (dimensions.deal > 0) {
      prompt += `\n\n🎉 该成员今天有成交 (${dimensions.deal}单)，要重点肯定和庆祝！
询问成功经验，比如：
- 成交的关键是什么？
- 可以分享一些心得吗？
- 这个经验能否复制到其他客户？`;
    }
    if (dimensions.sales_meeting > 0 && dimensions.deal === 0) {
      prompt += '\n\n该成员今天有面谈但还没成交，要鼓励继续跟进，询问面谈收获和下一步计划。';
    }
    if (total_score >= 50) {
      prompt += '\n\n该成员今天表现非常优秀，要给予大力表扬！';
    }
    prompt += '\n\n请生成 1-5 个个性化问题（根据表现好坏调整数量），每个问题要简短、有针对性，以引导式提问为主。最后给一句温暖的总结鼓励。';
  }

  prompt += '\n\n请返回 JSON 格式：{"questions": ["问题 1", "问题 2"], "summary": "总结鼓励"}';

  try {
    const response = await axios.post(
      'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
      {
        model: 'qwen-plus',
        messages: [
          {
            role: 'system',
            content: '你是一位专业的保险销售 AI 教练，擅长销售心理学和教练式对话。请根据用户提供的活动量数据，生成个性化的问题和总结。请始终返回 JSON 格式。'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 1000
      },
      {
        headers: {
          'Authorization': `Bearer ${DASHSCOPE_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const content = response.data.choices[0].message.content;

    // 尝试解析 JSON
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      console.log('[AI] 解析 AI 响应失败，使用默认回复');
    }

    // 解析失败时使用默认回复
    return {
      questions: ['今天工作进展如何？', '有什么收获可以分享吗？'],
      summary: '继续努力，每天都有进步！'
    };
  } catch (error) {
    console.error('[AI] 调用 AI 失败:', error.message);
    throw error;
  }
}

/**
 * 创建 AI 教练消息卡片
 */
function createCoachCard(questions, summary) {
  return {
    config: {
      wide_screen_mode: true
    },
    header: {
      template: 'blue',
      title: {
        tag: 'plain_text',
        content: '🤖 AI 教练'
      }
    },
    elements: [
      {
        tag: 'markdown',
        content: questions.map((q, i) => `**${i + 1}.** ${q}`).join('\n\n')
      },
      {
        tag: 'hr'
      },
      {
        tag: 'markdown',
        content: `💡 **今日总结**: ${summary}`
      }
    ]
  };
}

/**
 * 发送飞书卡片消息给用户
 */
async function sendCoachMessage(userId, cardContent) {
  const token = await getTenantAccessToken();

  try {
    const response = await axios.post(
      `${FEISHU_API_BASE}/open-apis/im/v1/messages`,
      {
        receive_id: userId,
        msg_type: 'interactive',
        content: JSON.stringify(cardContent)
      },
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        params: {
          receive_id_type: 'union_id'
        }
      }
    );

    console.log(`[Feishu] 消息已发送给用户：${userId}`);
    return response.data.data;
  } catch (error) {
    console.error(`[Feishu] 发送消息失败：${error.message}`);
    throw error;
  }
}

/**
 * 主函数：开始 AI 教练对话
 */
async function startAICoach() {
  console.log('='.repeat(50));
  console.log('[AI Coach] 开始执行每日 AI 教练任务');
  console.log('='.repeat(50));

  try {
    // 获取今日活动量
    const activities = await getTodayActivities();
    console.log(`[AI Coach] 找到 ${activities.length} 位用户需要联系`);

    for (const activity of activities) {
      try {
        console.log(`[AI Coach] 正在处理：${activity.user_name} (${activity.user_id})`);

        // 生成 AI 问题
        const aiResult = await generateAIQuestions({
          user_name: activity.user_name,
          total_score: activity.total_score,
          dimensions: activity.dimensions
        });

        console.log(`[AI Coach] AI 生成结果：${aiResult.questions.length} 个问题`);

        // 发送飞书消息
        const card = createCoachCard(aiResult.questions, aiResult.summary);
        await sendCoachMessage(activity.user_id, card);

        console.log(`[AI Coach] ✅ ${activity.user_name} 已完成`);

        // 避免频率限制，每条消息间隔 1 秒
        await new Promise(resolve => setTimeout(resolve, 1000));

      } catch (error) {
        console.error(`[AI Coach] ❌ ${activity.user_name} 失败：${error.message}`);
      }
    }

    console.log('='.repeat(50));
    console.log('[AI Coach] 每日 AI 教练任务完成');
    console.log('='.repeat(50));

  } catch (error) {
    console.error('[AI Coach] 任务执行失败:', error.message);
    process.exit(1);
  }
}

// 运行主函数
startAICoach();
