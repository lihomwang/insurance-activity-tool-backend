// services/feishu.js
// 飞书 API 集成模块

const axios = require('axios');
const config = require('../config');

let tenantAccessToken = null;
let tokenExpiresAt = 0;

/**
 * 获取租户 Access Token
 */
async function getTenantAccessToken() {
  // 检查缓存
  if (tenantAccessToken && Date.now() < tokenExpiresAt) {
    return tenantAccessToken;
  }

  const response = await axios.post(
    `${config.feishu.apiBase}/open-apis/auth/v3/tenant_access_token/internal`,
    {
      app_id: config.feishu.appId,
      app_secret: config.feishu.appSecret
    }
  );

  if (response.data.code !== 0) {
    throw new Error(`获取 Token 失败：${response.data.msg}`);
  }

  tenantAccessToken = response.data.tenant_access_token;
  // 提前 5 分钟过期
  tokenExpiresAt = Date.now() + (response.data.expire - 300) * 1000;

  console.log('[Feishu] Token refreshed');
  return tenantAccessToken;
}

/**
 * 获取用户信息
 */
async function getUserInfo(userId) {
  const token = await getTenantAccessToken();

  const response = await axios.get(
    `${config.feishu.apiBase}/open-apis/contact/v3/users/${userId}`,
    {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      params: {
        user_id_type: 'union_id',
        optional_fields: '["avatar_avatar", "email", "mobile", "name"]'
      }
    }
  );

  return response.data.data;
}

/**
 * 发送私信文本消息
 */
async function sendTextMessage(userId, text) {
  const token = await getTenantAccessToken();

  const response = await axios.post(
    `${config.feishu.apiBase}/open-apis/im/v1/messages`,
    {
      receive_id: userId,
      msg_type: 'text',
      content: JSON.stringify({ text })
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

  return response.data.data;
}

/**
 * 发送交互式卡片消息
 */
async function sendInteractiveCard(userId, cardContent) {
  const token = await getTenantAccessToken();

  const response = await axios.post(
    `${config.feishu.apiBase}/open-apis/im/v1/messages`,
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

  return response.data.data;
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
 * 创建风险预警通知卡片 (发送给管理员)
 */
function createRiskAlertCard(userData, riskData) {
  return {
    config: {
      wide_screen_mode: true
    },
    header: {
      template: 'red',
      title: {
        tag: 'plain_text',
        content: '⚠️ 风险预警'
      }
    },
    elements: [
      {
        tag: 'markdown',
        content: `**👤 成员**: ${userData.name}
**⚡ 风险等级**: ${riskData.riskLevel === 'high' ? '🔴 高' : '🟡 中'}
**🏷️ 类型**: ${riskData.alertType}
**📝 触发内容**: ${riskData.triggerContent}`
      },
      {
        tag: 'hr'
      },
      {
        tag: 'action',
        actions: [
          {
            tag: 'button',
            text: {
              tag: 'plain_text',
              content: '立即处理'
            },
            url: 'https://your-admin-panel.com/alerts',
            type: 'default',
            value: {}
          }
        ]
      }
    ]
  };
}

/**
 * 发送给机器人消息（用于 AI 教练请求）
 * @param {string} chatId - 机器人的 chat_id
 * @param {string} text - 消息内容
 */
async function sendToBotMessage(chatId, text) {
  const token = await getTenantAccessToken();

  const response = await axios.post(
    `${config.feishu.apiBase}/open-apis/im/v1/messages`,
    {
      chat_id: chatId,
      msg_type: 'text',
      content: JSON.stringify({ text })
    },
    {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      params: {
        receive_id_type: 'chat_id'
      }
    }
  );

  console.log('[Feishu] Message sent to bot:', chatId);
  return response.data;
}

/**
 * AI 教练生成问题（通过 OpenClaw 机器人）
 * 说明：此函数发送请求给 OpenClaw，但需要等待回调或轮询获取结果
 * 目前返回默认回复，待实现完整的异步响应流程
 */
async function generateQuestionsViaOpenClaw(userData) {
  const { name, totalScore, dimensions, userId } = userData;

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
    .map(([key, count]) => `${dimensionNames[key]}: ${count}`)
    .join(', ');

  // 构建指令消息 - OpenClaw 需要识别这个格式
  const instruction = `[AI 教练请求]
用户：${name}
用户 ID: ${userId}
总分：${totalScore}
活动量：${details || '今日暂无数据'}

请根据以上数据生成保险销售 AI 教练的个性化问题（1-5 个）和一句话总结鼓励。
返回格式：JSON {"questions": ["问题 1", "问题 2"], "summary": "总结"}`;

  try {
    // 发送消息给 OpenClaw 机器人
    // 注意：需要一个专门的 chat 来接收 OpenClaw 的回复
    const botChatId = process.env.FEISHU_OPENCLAW_CHAT_ID || process.env.FEISHU_OPENCLAW_BOT_ID;
    await sendToBotMessage(botChatId, instruction);
    console.log('[Feishu] AI 教练请求已发送给 OpenClaw');

    // TODO: 等待 OpenClaw 回复需要通过以下方式之一：
    // 1. Webhook 回调 - OpenClaw 回复时调用后端 API
    // 2. 轮询消息 - 定期读取机器人消息获取回复
    // 暂时返回默认回复
    return {
      questions: ['今天工作进展如何？', '有什么收获可以分享吗？'],
      summary: '继续努力，每天都有进步！'
    };
  } catch (error) {
    console.error('发送 AI 教练请求失败:', error.message);
    throw error;
  }
}

/**
 * AI 教练生成问题（使用阿里百炼 Qwen - 备用方案）
 * @param {Object} userData - 用户数据
 * @param {string} conversationStage - 对话阶段：'first' (第一个问题) 或 'followup' (后续问题)
 * @param {Array} conversationHistory - 对话历史（用于后续问题）
 */
async function generateQuestionsWithDashScope(userData, conversationStage = 'first', conversationHistory = []) {
  const axios = require('axios');
  const { name, totalScore, dimensions } = userData;

  // 构建 prompt
  let prompt = `你是一位专业的保险销售 AI 教练。成员"${name}"今天的活动量数据如下：
- 总分：${totalScore}分
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

  // 如果是第一个问题，生成开场白
  if (conversationStage === 'first') {
    // 特殊情况 - 根据具体场景生成引导式提问
    if (totalScore === 0) {
      prompt += `\n\n⚠️ 该成员今天没有提交任何数据！
请生成**1 个**关心的问句，表达关切并询问原因。
参考方向：
- 是不是忘记了填报？
- 还是今天确实没有活动量？
语气要温暖、关心，像朋友一样问候，不要质问或责备。`;
    } else {
      // 有邀约但没有面谈 - 安慰式询问
      if (dimensions.invitation > 0 && dimensions.sales_meeting === 0) {
        prompt += `\n\n⚠️ 该成员今天有邀约 (${dimensions.invitation}人) 但销售面谈到 0 人。
请生成**1 个**安慰式的引导提问。
参考方向：
- 是被拒绝了还是改天了？
- 邀约后客户没来吗？
语气要安慰、理解，不要让对方感到压力。`;
      }
      // 有准客户但没成交 - 鼓励继续跟进
      if (dimensions.new_leads > 0 && dimensions.deal === 0) {
        prompt += '\n\n该成员今天有新增准客户，可以鼓励继续跟进转化。请生成**1 个**问题。';
      }
      // 有成交 - 重点肯定
      if (dimensions.deal > 0) {
        prompt += `\n\n🎉 该成员今天有成交 (${dimensions.deal}单)，要重点肯定和庆祝！
请生成**1 个**询问成功经验的问题。`;
      }
      // 有面谈但没成交 - 鼓励
      if (dimensions.sales_meeting > 0 && dimensions.deal === 0) {
        prompt += '\n\n该成员今天有面谈但还没成交，要鼓励继续跟进。请生成**1 个**问题询问面谈收获。';
      }
      // 高分表现 - 表扬
      if (totalScore >= 50) {
        prompt += '\n\n该成员今天表现非常优秀，要给予大力表扬！请生成**1 个**问题。';
      }
    }

    prompt += '\n\n请返回 JSON 格式：{"question": "一个问题", "summary": "一句温暖的总结鼓励"}';
  } else {
    // 后续问题 - 根据对话历史生成
    prompt += '\n\n对话历史：\n' + conversationHistory.map(m => `${m.role}: ${m.content}`).join('\n');
    prompt += '\n\n用户最新回复：' + conversationHistory[conversationHistory.length - 1]?.content || '';
    prompt += '\n\n请根据用户的回复，生成**1 个**下一个引导性问题。只返回 JSON 格式：{"question": "下一个问题"}';
  }

  try {
    // 调用阿里百炼 API
    const response = await axios.post(
      'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
      {
        model: 'qwen-plus',
        messages: [
          {
            role: 'system',
            content: '你是一位专业的保险销售 AI 教练，擅长销售心理学和教练式对话。请根据用户提供的活动量数据，生成**单个**个性化的问题。请始终返回 JSON 格式。记住：每次只问 1 个问题，不要一次问多个问题。'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 500
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.DASHSCOPE_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const content = response.data.choices[0].message.content;
    // 尝试解析 JSON
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const result = JSON.parse(jsonMatch[0]);
        // 确保返回格式统一
        if (result.question) {
          return {
            questions: [result.question], // 转为数组兼容旧代码
            summary: result.summary || ''
          };
        }
      }
    } catch (e) {
      console.log('解析 AI 响应失败，使用默认回复');
    }

    // 解析失败时使用默认回复
    return {
      questions: ['今天工作进展如何？'],
      summary: '继续努力，每天都有进步！'
    };
  } catch (error) {
    console.error('调用 AI 失败:', error.message);
    throw error;
  }
}

module.exports = {
  getTenantAccessToken,
  getUserInfo,
  sendTextMessage,
  sendInteractiveCard,
  sendToBotMessage,
  createCoachCard,
  createRiskAlertCard,
  generateQuestionsViaOpenClaw,  // 通过飞书机器人调用 OpenClaw
  generateQuestionsWithDashScope // 备用方案：直接调用百炼 API
};
