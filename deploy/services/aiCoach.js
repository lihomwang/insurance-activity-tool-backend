// services/aiCoach.js
// AI 教练对话引擎 - 引导式单问题对话版本

const config = require('../config');
const db = require('./db');
const feishu = require('./feishu');
const safetyFilter = require('./safetyFilter');

// AI 教练系统提示词
const SYSTEM_PROMPT = `你是一位专业的保险销售 AI 教练，擅长销售心理学和教练式对话。

你的职责:
1. 根据成员当日活动量数据，进行个性化沟通
2. 使用引导式提问，帮助成员反思和成长
3. 给予专业建议和鼓励

知识库:
- 销售心理学：《影响力》《销售心理战》
- 销售大师：乔·吉拉德、原一平的销售法则
- 保险销售专业知识
- 教练式对话技巧

对话规则:
1. **每次只问 1 个问题** - 不要一次性问多个问题
2. 以肯定和鼓励为主
3. 给到可执行的具体建议
4. 只聊销售、工作、客户相关话题
5. 如果成员提到抑郁、焦虑、自杀等，在回复中标记
6. 根据用户的回答动态调整下一个问题

语气风格:
- 温暖、专业、像朋友一样
- 适当使用 emoji 表达情感
- 避免说教，多用引导式提问`;

/**
 * 根据活动量数据生成个性化开场白和第一个问题
 * 每次只返回 1 个问题，开启对话
 */
async function generateQuestions(userData) {
  // 配置选项：选择 AI  provider
  // 'openclaw' - 通过飞书机器人调用 OpenClaw (使用 Coding Plan)
  // 'dashscope' - 直接调用阿里百炼 API (备用方案)
  const aiProvider = process.env.AI_PROVIDER || 'dashscope';

  if (aiProvider === 'openclaw') {
    return await feishu.generateQuestionsViaOpenClaw(userData);
  } else {
    return await feishu.generateQuestionsWithDashScope(userData, 'first');
  }
}

/**
 * 根据用户回复生成下一个问题 (引导式对话)
 */
async function generateNextQuestion(conversationHistory, userReply, userData) {
  const aiProvider = process.env.AI_PROVIDER || 'dashscope';

  if (aiProvider === 'openclaw') {
    // TODO: 实现 OpenClaw 的多轮对话
    return await feishu.generateNextQuestionViaOpenClaw(conversationHistory, userReply, userData);
  } else {
    return await feishu.generateNextQuestionWithDashScope(conversationHistory, userReply, userData);
  }
}

/**
 * 处理用户回复，生成后续对话
 */
async function processUserReply(conversationHistory, userReply) {
  // 安全检查
  const safetyResult = safetyFilter.analyzeMessage(userReply);

  const response = await feishu.generateQuestionsWithDashScope({
    name: 'User',
    totalScore: 0,
    dimensions: {}
  });

  return {
    reply: response.questions.join('\n'),
    hasRisk: safetyResult.hasRisk,
    riskLevel: safetyResult.riskLevel,
    risks: safetyResult.risks
  };
}

/**
 * 开始 AI 教练对话 (定时任务调用)
 * 每次只发送 1 个问题，开启引导式对话
 */
async function startAICoachConversations() {
  console.log('[AI Coach] Starting daily conversations...');

  // 获取今日已提交活动量的所有用户
  const today = new Date().toISOString().split('T')[0];
  const activities = await db.findAll('activities', {
    activity_date: today,
    is_submitted: true
  }, {
    orderBy: 'user_id'
  });

  console.log(`[AI Coach] Found ${activities.length} users to contact`);

  for (const activity of activities) {
    try {
      // 获取用户信息
      const user = await db.findOne('users', { id: activity.user_id });
      if (!user) {
        console.warn(`[AI Coach] User not found: ${activity.user_id}`);
        continue;
      }

      // 检查是否已有进行中的对话
      const existingConversation = await db.findOne('ai_conversations', {
        user_id: user.id,
        conversation_date: today,
        status: 'pending'
      });

      if (existingConversation) {
        console.log(`[AI Coach] Skipping ${user.name} - conversation already exists`);
        continue;
      }

      // 生成个性化问题（只返回 1 个问题）
      const aiResult = await generateQuestions({
        name: user.name,
        totalScore: activity.total_score,
        dimensions: {
          new_leads: activity.new_leads,
          referral: activity.referral,
          invitation: activity.invitation,
          sales_meeting: activity.sales_meeting,
          recruit_meeting: activity.recruit_meeting,
          business_plan: activity.business_plan,
          deal: activity.deal,
          eop_guest: activity.eop_guest,
          cc_assessment: activity.cc_assessment,
          training: activity.training
        }
      });

      // 发送飞书私信（只发送 1 个问题）
      const card = feishu.createCoachCard(aiResult.questions, aiResult.summary);
      await feishu.sendInteractiveCard(user.feishu_user_id || user.union_id, card);

      // 保存对话记录
      await db.insert('ai_conversations', {
        user_id: user.id,
        conversation_date: today,
        messages: JSON.stringify([
          { role: 'assistant', content: aiResult.questions.join('\n') },
        ]),
        question_count: 1, // 只问 1 个问题
        summary: aiResult.summary,
        status: 'pending',
        feishu_chat_id: user.feishu_user_id || user.union_id
      });

      console.log(`[AI Coach] Message sent to ${user.name}`);

      // 避免频率限制，每条消息间隔 2 秒
      await new Promise(resolve => setTimeout(resolve, 2000));

    } catch (error) {
      console.error(`[AI Coach] Error for user ${activity.user_id}:`, error.message);
    }
  }

  console.log('[AI Coach] Daily conversations completed');
}

module.exports = {
  generateQuestions,
  processUserReply,
  startAICoachConversations
};
