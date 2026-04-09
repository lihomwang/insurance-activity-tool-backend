// functions/api-server/index.js
// 飞书云函数版本的 API 服务器

const db = require('../../services/db');
const auth = require('../../services/auth');

// 临时 session 存储（生产环境应该用 Redis 或数据库）
const sessions = new Map();

/**
 * 云函数入口
 */
exports.handler = async (event, context) => {
  const { httpMethod, path, body, query, headers } = event;

  // CORS 配置
  const corsHeaders = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  };

  // 处理 OPTIONS 请求
  if (httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

  try {
    let result;

    // ==================== 认证接口 ====================

    // 飞书登录
    if (path === '/api/auth/feishu' && httpMethod === 'POST') {
      const { code, appId } = body;

      if (!code) {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ success: false, message: '缺少授权码' })
        };
      }

      const loginResult = await auth.feishuLogin(code);

      // 保存 session
      sessions.set(loginResult.token, {
        user: loginResult.user,
        expiresAt: Date.now() + (loginResult.expires_in || 7200) * 1000
      });

      result = {
        success: true,
        user: loginResult.user,
        token: loginResult.token
      };
    }

    // ==================== 需要认证的接口 ====================
    else {
      // 验证 token
      const token = headers?.authorization?.replace('Bearer ', '');
      if (!token || !sessions.has(token)) {
        return {
          statusCode: 401,
          headers: corsHeaders,
          body: JSON.stringify({ success: false, message: '请先登录' })
        };
      }

      const session = sessions.get(token);
      if (session.expiresAt < Date.now()) {
        sessions.delete(token);
        return {
          statusCode: 401,
          headers: corsHeaders,
          body: JSON.stringify({ success: false, message: '登录已过期' })
        };
      }

      const user = session.user;

      // 获取用户信息
      if (path === '/api/user/info' && httpMethod === 'GET') {
        result = user;
      }

      // 获取周统计
      else if (path === '/api/user/week-stats' && httpMethod === 'GET') {
        const weekStats = await getUserWeekStats(user.id);
        result = weekStats;
      }

      // 获取今日活动
      else if (path === '/api/activities/today' && httpMethod === 'GET') {
        const date = query?.date || new Date().toISOString().split('T')[0];
        const activities = await getUserActivities(user.id, date);
        result = activities;
      }

      // 提交活动量
      else if (path === '/api/activities/submit' && httpMethod === 'POST') {
        const submitResult = await submitActivity(user, body);
        result = submitResult;
      }

      // 获取团队统计
      else if (path === '/api/team/stats' && httpMethod === 'GET') {
        result = await getTeamStats();
      }

      // 获取维度统计
      else if (path === '/api/team/dimensions' && httpMethod === 'GET') {
        result = await getDimensionStats();
      }

      // 获取排行榜
      else if (path === '/api/team/ranking' && httpMethod === 'GET') {
        result = await getRanking();
      }

      // 健康检查
      else if (path === '/health' && httpMethod === 'GET') {
        result = { status: 'ok', timestamp: new Date().toISOString() };
      }

      // 404
      else {
        return {
          statusCode: 404,
          headers: corsHeaders,
          body: JSON.stringify({ success: false, message: 'Not Found' })
        };
      }
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ success: true, data: result })
    };

  } catch (error) {
    console.error('[API] Error:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ success: false, message: error.message })
    };
  }
};

// ==================== 辅助函数 ====================

async function getUserWeekStats(userId) {
  const now = new Date();
  const dayOfWeek = now.getDay();
  let daysUntilFriday = (5 - dayOfWeek + 7) % 7;
  if (!(dayOfWeek === 4 || dayOfWeek === 5)) {
    daysUntilFriday = daysUntilFriday - 7;
  }

  const friday = new Date(now);
  friday.setDate(friday.getDate() + daysUntilFriday);
  const weekStart = friday.toISOString().split('T')[0];

  const activities = await db.findAll('activities', {
    user_id: userId,
    activity_date: { $gte: weekStart }
  });

  const weekScore = activities
    .filter(a => a.is_submitted)
    .reduce((sum, a) => sum + (a.total_score || 0), 0);

  const activityCount = activities.filter(a => a.is_submitted).length;

  return { weekScore, activityCount };
}

async function getUserActivities(userId, date) {
  const activity = await db.findOne('activities', {
    user_id: userId,
    activity_date: date
  });

  if (!activity || !activity.is_submitted) {
    return [];
  }

  const dimensions = {
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
  };

  return dimensions;
}

async function submitActivity(user, data) {
  const dimensionScores = {
    new_leads: 1, referral: 3, invitation: 1, sales_meeting: 10,
    recruit_meeting: 10, business_plan: 1, deal: 10, eop_guest: 5,
    cc_assessment: 5, training: 10
  };

  const totalScore = Object.entries(data).reduce((sum, [key, value]) => {
    if (dimensionScores[key] && typeof value === 'number') {
      return sum + dimensionScores[key] * value;
    }
    return sum;
  }, 0);

  const activity = await db.upsert('activities', {
    user_id: user.id,
    activity_date: data.activity_date,
    new_leads: data.new_leads || 0,
    referral: data.referral || 0,
    invitation: data.invitation || 0,
    sales_meeting: data.sales_meeting || 0,
    recruit_meeting: data.recruit_meeting || 0,
    business_plan: data.business_plan || 0,
    deal: data.deal || 0,
    eop_guest: data.eop_guest || 0,
    cc_assessment: data.cc_assessment || 0,
    training: data.training || 0,
    total_score: totalScore,
    is_submitted: data.is_submitted || 1,
    is_locked: 0,
    submitted_at: new Date().toISOString()
  }, 'user_id, activity_date');

  return { totalScore, ...activity };
}

async function getTeamStats() {
  const now = new Date();
  const dayOfWeek = now.getDay();
  let daysUntilFriday = (5 - dayOfWeek + 7) % 7;
  if (!(dayOfWeek === 4 || dayOfWeek === 5)) {
    daysUntilFriday = daysUntilFriday - 7;
  }

  const friday = new Date(now);
  friday.setDate(friday.getDate() + daysUntilFriday);
  const weekStart = friday.toISOString().split('T')[0];

  const users = await db.findAll('users', {});
  const activities = await db.findAll('activities', {
    activity_date: { $gte: weekStart },
    is_submitted: 1
  });

  const userScores = {};
  activities.forEach(a => {
    if (!userScores[a.user_id]) userScores[a.user_id] = 0;
    userScores[a.user_id] += a.total_score || 0;
  });

  const totalMembers = users.length;
  const submittedCount = Object.keys(userScores).length;
  const totalScore = Object.values(userScores).reduce((sum, score) => sum + score, 0);
  const avgScore = submittedCount > 0 ? Math.round(totalScore / submittedCount) : 0;

  let starName = '-';
  let maxScore = 0;
  for (const [userId, score] of Object.entries(userScores)) {
    if (score > maxScore) {
      const user = users.find(u => u.id === userId);
      if (user) {
        maxScore = score;
        starName = user.name;
      }
    }
  }

  return { totalMembers, avgScore, totalScore, starName };
}

async function getDimensionStats() {
  const activities = await db.findAll('activities', { is_submitted: 1 });

  const dimensions = {
    new_leads: { count: 0, score: 0 },
    referral: { count: 0, score: 0 },
    invitation: { count: 0, score: 0 },
    sales_meeting: { count: 0, score: 0 },
    recruit_meeting: { count: 0, score: 0 },
    business_plan: { count: 0, score: 0 },
    deal: { count: 0, score: 0 },
    eop_guest: { count: 0, score: 0 },
    cc_assessment: { count: 0, score: 0 },
    training: { count: 0, score: 0 }
  };

  const dimensionScores = {
    new_leads: 1, referral: 3, invitation: 1, sales_meeting: 10,
    recruit_meeting: 10, business_plan: 1, deal: 10, eop_guest: 5,
    cc_assessment: 5, training: 10
  };

  activities.forEach(a => {
    Object.keys(dimensions).forEach(key => {
      const count = a[key] || 0;
      dimensions[key].count += count;
      dimensions[key].score += count * (dimensionScores[key] || 0);
    });
  });

  return dimensions;
}

async function getRanking() {
  const users = await db.findAll('users', {});
  const activities = await db.findAll('activities', { is_submitted: 1 });

  const userScores = {};
  activities.forEach(a => {
    if (!userScores[a.user_id]) userScores[a.user_id] = 0;
    userScores[a.user_id] += a.total_score || 0;
  });

  const ranking = Object.entries(userScores)
    .map(([userId, score]) => {
      const user = users.find(u => u.id === userId);
      return {
        id: userId,
        name: user?.name || '未知',
        avatar: user?.avatar || '😊',
        score
      };
    })
    .sort((a, b) => b.score - a.score)
    .map((item, index) => ({ ...item, rank: index + 1 }));

  return ranking;
}
