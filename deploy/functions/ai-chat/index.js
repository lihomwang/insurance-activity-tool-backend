// functions/ai-chat/index.js
// AI 对话 API - 飞书云函数入口 (机器人回调)

const db = require('../../services/db');
const aiCoach = require('../../services/aiCoach');
const safetyFilter = require('../../services/safetyFilter');
const feishu = require('../../services/feishu');

/**
 * 处理用户回复 AI 教练的消息
 */
async function processUserMessage(userId, message, conversationId) {
  // 安全检查
  const safetyResult = safetyFilter.analyzeMessage(message);

  // 获取对话历史
  const conversation = await db.findOne('ai_conversations', { id: conversationId });

  if (!conversation) {
    // 新对话，创建记录
    const newConversation = await db.insert('ai_conversations', {
      user_id: userId,
      conversation_date: new Date().toISOString().split('T')[0],
      messages: JSON.stringify([
        { role: 'user', content: message }
      ]),
      status: 'pending'
    });
    conversationId = newConversation.id;
  }

  // 构建对话历史
  const existingMessages = JSON.parse(conversation.messages || '[]');
  const messages = [
    { role: 'system', content: aiCoach.SYSTEM_PROMPT },
    ...existingMessages,
    { role: 'user', content: message }
  ];

  // 调用 AI 生成回复
  const reply = await aiCoach.processUserReply(messages, message);

  // 更新对话记录
  const updatedMessages = [
    ...existingMessages,
    { role: 'user', content: message },
    { role: 'assistant', content: reply.reply }
  ];

  await db.update('ai_conversations', { id: conversationId }, {
    messages: JSON.stringify(updatedMessages),
    question_count: updatedMessages.filter(m => m.role === 'assistant').length,
    has_risk_content: safetyResult.hasRisk,
    risk_level: safetyResult.riskLevel,
    risk_keywords: safetyResult.risks.map(r => r.keyword),
    status: safetyResult.hasRisk ? 'flagged' : 'completed',
    completed_at: new Date()
  });

  // 如果有风险，创建预警并通知管理员
  if (safetyResult.shouldAlert) {
    const user = await db.findOne('users', { id: userId });
    const alertData = safetyFilter.createRiskAlert(
      user,
      { id: conversationId, lastMessage: message },
      safetyResult
    );

    await db.insert('risk_alerts', alertData);

    // 发送预警通知给管理员
    for (const adminId of feishu.config.admin.userIds) {
      const card = feishu.createRiskAlertCard(user, {
        riskLevel: safetyResult.riskLevel,
        alertType: safetyResult.risks[0].type,
        triggerContent: message.substring(0, 100)
      });
      await feishu.sendInteractiveCard(adminId, card);
    }
  }

  return {
    reply: reply.reply,
    hasRisk: safetyResult.hasRisk,
    riskLevel: safetyResult.riskLevel
  };
}

// 云函数入口 (飞书机器人回调)
exports.handler = async (event, context) => {
  try {
    const { action, userId, message, conversationId } = JSON.parse(event.body || '{}');

    if (action === 'receive_message') {
      const result = await processUserMessage(userId, message, conversationId);

      // 返回回复给飞书机器人
      return {
        statusCode: 200,
        body: JSON.stringify({
          msg_type: 'text',
          content: { text: result.reply }
        })
      };
    }

    throw new Error(`Unknown action: ${action}`);
  } catch (error) {
    console.error('[AI Chat] Error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};
