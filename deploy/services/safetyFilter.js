// services/safetyFilter.js
// 安全过滤和风险检测模块

// 风险关键词库
const RISK_KEYWORDS = {
  // 抑郁倾向
  depression: [
    '抑郁', '沮丧', '情绪低落', '没意思', '活着没意义', '好累',
    '提不起劲', '开心不起来', '绝望', '无用', '自责', '内疚'
  ],
  // 焦虑倾向
  anxiety: [
    '焦虑', '紧张', '害怕', '心慌', '失眠', '睡不着',
    '担心', '恐惧', '压力大', '喘不过气', '烦躁'
  ],
  // 自杀倾向
  suicide: [
    '自杀', '不想活了', '死了算了', '结束生命', '轻生',
    '跳楼', '安眠药', '再见了', '最后', '解脱'
  ],
  // 暴力倾向
  violence: [
    '打人', '报复', '伤害', '杀人', '弄死', '揍',
    '暴力', '威胁', '恐吓', '同归于尽'
  ]
};

// 敏感话题（需要引导回工作话题）
const OFF_TOPIC_KEYWORDS = [
  '政治', '色情', '赌博', '毒品', '炒股', '基金', '兼职'
];

/**
 * 分析消息内容
 */
function analyzeMessage(message) {
  const lowerMessage = message.toLowerCase();
  const risks = [];
  let riskLevel = 'low';

  // 检查风险关键词
  for (const [type, keywords] of Object.entries(RISK_KEYWORDS)) {
    for (const keyword of keywords) {
      if (lowerMessage.includes(keyword.toLowerCase())) {
        risks.push({ type, keyword });
        // 设置风险等级
        if (type === 'suicide') {
          riskLevel = 'critical';
        } else if (type === 'violence' && riskLevel !== 'critical') {
          riskLevel = 'high';
        } else if (riskLevel === 'low') {
          riskLevel = 'medium';
        }
      }
    }
  }

  // 检查敏感话题
  const offTopics = [];
  for (const keyword of OFF_TOPIC_KEYWORDS) {
    if (lowerMessage.includes(keyword.toLowerCase())) {
      offTopics.push(keyword);
    }
  }

  return {
    hasRisk: risks.length > 0,
    riskLevel,
    risks,
    offTopics,
    shouldAlert: riskLevel === 'high' || riskLevel === 'critical',
    isOffTopic: offTopics.length > 0
  };
}

/**
 * 生成风险预警内容
 */
function createRiskAlert(userData, conversationData, analysis) {
  const primaryRisk = analysis.risks[0];

  return {
    user_id: userData.id,
    conversation_id: conversationData.id,
    alert_type: primaryRisk.type,
    risk_level: analysis.riskLevel,
    trigger_content: conversationData.lastMessage?.substring(0, 200),
    ai_analysis: `用户在对话中提到了"${primaryRisk.keyword}"等相关内容，可能${getRiskDescription(primaryRisk.type)}`,
    status: 'unread'
  };
}

/**
 * 获取风险类型描述
 */
function getRiskDescription(type) {
  const descriptions = {
    depression: '存在抑郁情绪，需要关注心理状态',
    anxiety: '存在焦虑情绪，可能需要心理疏导',
    suicide: '存在自杀风险，需要立即干预！',
    violence: '存在暴力倾向，需要立即关注！'
  };
  return descriptions[type] || '存在潜在风险';
}

/**
 * 生成引导回复 (当话题偏离时)
 */
function generateOffTopicReply() {
  const replies = [
    '我理解你想聊这些，不过我们还是聚焦在今天的销售工作上吧～ 今天有什么收获或者困惑吗？',
    '这个话题也挺有意思的！不过作为你的 AI 教练，我更关心你今天的客户跟进情况 😊',
    '咱们先聊聊工作相关的事～ 其他话题有空再聊！今天的面谈/邀约进展如何？'
  ];
  return replies[Math.floor(Math.random() * replies.length)];
}

module.exports = {
  analyzeMessage,
  createRiskAlert,
  getRiskDescription,
  generateOffTopicReply,
  RISK_KEYWORDS,
  OFF_TOPIC_KEYWORDS
};
