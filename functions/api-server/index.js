// functions/api-server/index.js
// 飞书云函数版本的 API 服务器 — 使用 Bitable 存储

const bitable = require('../../services/bitable');
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
        const weekStats = await bitable.getUserWeekStats(user.name);
        result = weekStats;
      }

      // 获取今日活动
      else if (path === '/api/activities/today' && httpMethod === 'GET') {
        const date = query?.date || new Date().toISOString().split('T')[0];
        const activity = await bitable.getUserActivities(user.name, date);
        result = activity || {};
      }

      // 提交活动量
      else if (path === '/api/activities/submit' && httpMethod === 'POST') {
        const submitResult = await submitActivity(user, body);
        result = submitResult;
      }

      // 获取团队统计
      else if (path === '/api/team/stats' && httpMethod === 'GET') {
        result = await bitable.getTeamStats();
      }

      // 获取维度统计
      else if (path === '/api/team/dimensions' && httpMethod === 'GET') {
        result = await bitable.getDimensionStats();
      }

      // 获取排行榜
      else if (path === '/api/team/ranking' && httpMethod === 'GET') {
        result = await bitable.getRanking();
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

/**
 * 提交活动量（从 api-server 入口调用）
 */
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

  const activity = await bitable.upsertActivity({
    user_name: user.name,
    mobile: user.mobile || null,
    activity_date: data.activity_date || new Date().toISOString().split('T')[0],
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
    is_submitted: data.is_submitted || 1
  });

  return { success: true, totalScore, ...activity };
}
