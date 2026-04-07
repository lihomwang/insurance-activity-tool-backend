// functions/admin/index.js
// 管理员 API - 飞书云函数入口

const db = require('../../services/db');

/**
 * 获取每日分析汇总
 * GET /api/admin/daily?date=2026-04-04
 */
async function getDailyAnalytics(date) {
  const targetDate = date || new Date().toISOString().split('T')[0];

  const analytics = await db.findOne('daily_analytics', {
    analytics_date: targetDate
  });

  if (!analytics) {
    return {
      success: false,
      error: 'No analytics data for this date'
    };
  }

  return {
    success: true,
    data: analytics
  };
}

/**
 * 获取 AI 对话列表
 * GET /api/admin/conversations?date=2026-04-04&status=all
 */
async function getConversations(date, status = 'all') {
  const targetDate = date || new Date().toISOString().split('T')[0];
  const where = { conversation_date: targetDate };

  if (status !== 'all') {
    where.status = status;
  }

  const conversations = await db.findAll('ai_conversations', where, {
    orderBy: 'created_at DESC',
    limit: 100
  });

  // 获取用户信息
  const userIds = conversations.map(c => c.user_id);
  const users = await db.findAll('users', { id: userIds });
  const userMap = Object.fromEntries(users.map(u => [u.id, u]));

  const result = conversations.map(c => ({
    ...c,
    userName: userMap[c.user_id]?.name || 'Unknown',
    userAvatar: userMap[c.user_id]?.avatar || ''
  }));

  return {
    success: true,
    conversations: result
  };
}

/**
 * 获取对话详情
 * GET /api/admin/conversations/:id
 */
async function getConversationDetail(conversationId) {
  const conversation = await db.findOne('ai_conversations', { id: conversationId });

  if (!conversation) {
    return {
      success: false,
      error: 'Conversation not found'
    };
  }

  // 获取用户信息
  const user = await db.findOne('users', { id: conversation.user_id });

  // 获取当日活动量
  const activity = await db.findOne('activities', {
    user_id: conversation.user_id,
    activity_date: conversation.conversation_date
  });

  return {
    success: true,
    data: {
      ...conversation,
      userName: user?.name,
      userAvatar: user?.avatar,
      department: user?.department,
      activityData: activity
    }
  };
}

/**
 * 获取风险预警列表
 * GET /api/admin/alerts?status=unread&days=7
 */
async function getRiskAlerts(status = 'unread', days = 7) {
  const where = {};
  if (status !== 'all') {
    where.status = status;
  }

  const alerts = await db.findAll('risk_alerts', where, {
    orderBy: 'created_at DESC',
    limit: 100
  });

  // 获取用户信息
  const userIds = alerts.map(a => a.user_id);
  const users = await db.findAll('users', { id: userIds });
  const userMap = Object.fromEntries(users.map(u => [u.id, u]));

  const result = alerts.map(a => ({
    ...a,
    userName: userMap[a.user_id]?.name || 'Unknown',
    userAvatar: userMap[a.user_id]?.avatar || ''
  }));

  return {
    success: true,
    alerts: result
  };
}

/**
 * 处理风险预警
 * POST /api/admin/alerts/:id/handle
 */
async function handleAlert(alertId, adminId, notes) {
  await db.update('risk_alerts', { id: alertId }, {
    status: 'resolved',
    handled_by: adminId,
    handled_at: new Date(),
    handler_notes: notes
  });

  return {
    success: true,
    message: 'Alert handled successfully'
  };
}

/**
 * 获取团队概览
 * GET /api/admin/team-overview
 */
async function getTeamOverview() {
  const today = new Date().toISOString().split('T')[0];

  // 获取今日数据
  const activities = await db.findAll('activities', { activity_date: today });
  const submittedCount = activities.filter(a => a.is_submitted).length;

  // 获取 AI 对话数据
  const conversations = await db.findAll('ai_conversations', { conversation_date: today });

  // 获取风险预警
  const alerts = await db.findAll('risk_alerts', { status: 'unread' });

  // 获取本周趋势 (最近 7 天)
  const weekAnalytics = await db.findAll('daily_analytics', {}, {
    orderBy: 'analytics_date DESC',
    limit: 7
  });

  return {
    success: true,
    data: {
      today: {
        date: today,
        totalMembers: activities.length,
        submittedCount,
        submissionRate: activities.length > 0
          ? ((submittedCount / activities.length) * 100).toFixed(1)
          : 0,
        avgScore: submittedCount > 0
          ? (activities.reduce((sum, a) => sum + a.total_score, 0) / submittedCount).toFixed(1)
          : 0
      },
      aiCoach: {
        conversationCount: conversations.length,
        pendingCount: conversations.filter(c => c.status === 'pending').length
      },
      riskAlerts: {
        unreadCount: alerts.length,
        highRiskCount: alerts.filter(a => a.risk_level === 'high' || a.risk_level === 'critical').length
      },
      weekTrend: weekAnalytics.map(a => ({
        date: a.analytics_date,
        submittedCount: a.submitted_count,
        avgScore: a.avg_score
      }))
    }
  };
}

/**
 * 获取团队报表数据（含各维度分布和成员排名）
 * GET /api/admin/team-report
 */
async function getTeamReport() {
  const today = new Date().toISOString().split('T')[0];

  // 获取本周数据（最近 7 天）
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 6);
  const startDateString = startDate.toISOString().split('T')[0];

  // 使用原生 SQL 查询范围
  const activitiesResult = db.query(
    'SELECT * FROM activities WHERE activity_date >= ? AND is_submitted = 1',
    [startDateString]
  );
  const activities = activitiesResult.rows || [];

  // 获取所有用户
  const usersResult = db.query('SELECT * FROM users');
  const users = usersResult.rows || [];
  const userMap = Object.fromEntries(users.map(u => [u.id, u]));

  // 计算各维度分布
  const dimensions = {
    new_leads: { name: '新增准客户', icon: '📝', color: '#F97316', count: 0 },
    referral: { name: '转介绍', icon: '🌟', color: '#EC4899', count: 0 },
    invitation: { name: '邀约', icon: '📅', color: '#3B82F6', count: 0 },
    sales_meeting: { name: '销售面谈', icon: '💼', color: '#10B981', count: 0 },
    recruit_meeting: { name: '增员面谈', icon: '👥', color: '#8B5CF6', count: 0 },
    business_plan: { name: '事业项目书', icon: '📄', color: '#F59E0B', count: 0 },
    deal: { name: '成交', icon: '🎉', color: '#EF4444', count: 0 },
    eop_guest: { name: '嘉宾参加 EOP', icon: '🎪', color: '#6366F1', count: 0 },
    cc_assessment: { name: 'CC 测评', icon: '📊', color: '#14B8A6', count: 0 },
    training: { name: '送训', icon: '📚', color: '#06B6D4', count: 0 }
  };

  // 统计各维度总数和成员分数
  const memberScores = {};
  let maxCount = 0;

  activities.forEach(a => {
    if (!a.is_submitted) return;

    // 统计维度
    Object.keys(dimensions).forEach(key => {
      dimensions[key].count += a[key] || 0;
    });

    // 统计成员分数
    if (!memberScores[a.user_id]) {
      memberScores[a.user_id] = {
        id: a.user_id,
        name: userMap[a.user_id]?.name || '未知',
        avatar: userMap[a.user_id]?.avatar || '',
        department: userMap[a.user_id]?.department || '',
        score: 0
      };
    }
    memberScores[a.user_id].score += a.total_score || 0;

    // 更新最大值用于计算百分比
    Object.keys(dimensions).forEach(key => {
      if (dimensions[key].count > maxCount) maxCount = dimensions[key].count;
    });
  });

  // 计算百分比和总分
  const activityDistribution = Object.values(dimensions).map(d => ({
    ...d,
    percent: maxCount > 0 ? Math.round((d.count / maxCount) * 100) : 0
  }));

  // 成员排名
  const topMembers = Object.values(memberScores)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
    .map((m, i) => ({ ...m, rank: i + 1 }));

  // 团队总分
  const teamTotalScore = Object.values(memberScores).reduce((sum, m) => sum + m.score, 0);

  // 本周天数
  const submittedDates = [...new Set(activities.filter(a => a.is_submitted).map(a => a.activity_date))];

  return {
    success: true,
    data: {
      teamTotalScore,
      avgScore: Object.keys(memberScores).length > 0 ? Math.round(teamTotalScore / Object.keys(memberScores).length) : 0,
      weekDays: submittedDates.length,
      activityDistribution,
      topMembers,
      weeklyTrend: [] // TODO: 需要按天统计
    }
  };
}

// 云函数入口
exports.handler = async (event, context) => {
  try {
    const { action, adminId, data } = JSON.parse(event.body || '{}');
    const query = event.query || {};

    let result;
    switch (action) {
      case 'daily':
        result = await getDailyAnalytics(query.date);
        break;
      case 'conversations':
        result = await getConversations(query.date, query.status);
        break;
      case 'conversation_detail':
        result = await getConversationDetail(parseInt(query.id));
        break;
      case 'alerts':
        result = await getRiskAlerts(query.status, parseInt(query.days || 7));
        break;
      case 'handle_alert':
        result = await handleAlert(parseInt(query.id), adminId, data?.notes);
        break;
      case 'team_overview':
        result = await getTeamOverview();
        break;
      case 'team_report':
        result = await getTeamReport();
        break;
      default:
        throw new Error(`Unknown action: ${action}`);
    }

    return {
      statusCode: 200,
      body: JSON.stringify(result)
    };
  } catch (error) {
    console.error('[Admin] Error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};
