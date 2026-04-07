// functions/api/index.js
// 飞书云函数 - H5 应用 API

const client = new Lark.Client({
  appId: process.env.FEISHU_APP_ID,
  appSecret: process.env.FEISHU_APP_SECRET
});

// H5 应用配置
const H5_APP_ID = process.env.H5_APP_ID || 'cli_a95a6b370af8dcc8';
const H5_APP_SECRET = process.env.H5_APP_SECRET || 'v2XoWID99STcoN1l1ijQtTk0ryEdjizF';

// 多维表格配置
const BITABLE_APP_TOKEN = process.env.FEISHU_BITABLE_APP_TOKEN || 'LR0RbtG9PavAcyswZMvcETWbnEh';
const USERS_TABLE_ID = 'tbl1blvjmScTokEi'; // 用户表
const ACTIVITIES_TABLE_ID = process.env.ACTIVITIES_TABLE_ID || 'tbl_activities'; // 活动量表

// Session 存储（简单内存实现，生产环境建议用外部存储）
const sessions = new Map();

/**
 * 飞书登录
 */
async function feishuLogin(code) {
  // 1. 获取 access_token
  const tokenResp = await client.request({
    method: 'POST',
    url: '/open-apis/authen/v1/oidc/access_token',
    data: { grant_type: 'authorization_code', code }
  });

  if (tokenResp.code !== 0) {
    throw new Error(tokenResp.msg || '获取 token 失败');
  }

  const tokenData = tokenResp.data;
  const accessToken = tokenResp.data.access_token;

  // 2. 获取用户信息
  const userResp = await client.request({
    method: 'GET',
    url: '/open-apis/authen/v1/user_info',
    headers: { 'Authorization': 'Bearer ' + accessToken }
  });

  if (userResp.code !== 0) {
    throw new Error(userResp.msg || '获取用户信息失败');
  }

  const feishuUser = userResp.data;

  // 3. 获取或创建用户（从多维表格）
  let user = await getUserByUnionId(feishuUser.union_id);
  if (!user) {
    user = await createUser(feishuUser);
  }

  // 4. 生成 session token
  const sessionToken = 'session_' + Date.now() + '_' + user.id;
  sessions.set(sessionToken, {
    user,
    expiresAt: Date.now() + (tokenData.expires_in || 7200) * 1000
  });

  return { user, token: sessionToken, expires_in: tokenData.expires_in };
}

/**
 * 云函数入口
 */
exports.handler = async (event, context) => {
  const { httpMethod, path, body, query, headers } = event;

  const corsHeaders = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  };

  if (httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

  try {
    let result;

    // POST /api/auth/feishu - 飞书登录
    if (path === '/api/auth/feishu' && httpMethod === 'POST') {
      const { code } = body || {};
      if (!code) {
        return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ success: false, message: '缺少授权码' }) };
      }
      const loginResult = await feishuLogin(code);
      result = { success: true, ...loginResult };
    }
    else {
      // 需要认证的接口
      const token = headers?.authorization?.replace('Bearer ', '');
      const session = token ? sessions.get(token) : null;

      if (!session || session.expiresAt < Date.now()) {
        return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ success: false, message: '请先登录' }) };
      }

      const user = session.user;

      // GET /api/user/info
      if (path === '/api/user/info') {
        result = user;
      }
      // GET /api/user/week-stats
      else if (path === '/api/user/week-stats') {
        result = await getUserWeekStats(user.id);
      }
      // GET /api/activities/today
      else if (path === '/api/activities/today') {
        const date = query?.date || new Date().toISOString().split('T')[0];
        result = await getUserActivities(user.id, date);
      }
      // POST /api/activities/submit
      else if (path === '/api/activities/submit' && httpMethod === 'POST') {
        result = await submitActivity(user, body || {});
      }
      // GET /api/team/stats
      else if (path === '/api/team/stats') {
        result = await getTeamStats();
      }
      // GET /api/team/dimensions
      else if (path === '/api/team/dimensions') {
        result = await getDimensionStats();
      }
      // GET /api/team/ranking
      else if (path === '/api/team/ranking') {
        result = await getRanking();
      }
      else {
        return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ success: false, message: 'Not Found' }) };
      }
    }

    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ success: true, data: result }) };

  } catch (error) {
    console.error('[API] Error:', error);
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ success: false, message: error.message }) };
  }
};

// ==================== 多维表格操作 ====================

/**
 * 通过 union_id 获取用户
 */
async function getUserByUnionId(unionId) {
  try {
    const resp = await client.request({
      method: 'GET',
      url: `/open-apis/bitable/v1/apps/${BITABLE_APP_TOKEN}/tables/${USERS_TABLE_ID}/records`,
      params: { filter: JSON.stringify({ condition: { field_name: 'feishu_union_id', operator: 'equals', value: unionId } }) }
    });

    if (resp.code === 0 && resp.data.items.length > 0) {
      const record = resp.data.items[0];
      return {
        id: record.fields.id || record.record_id,
        name: record.fields.name,
        avatar: record.fields.avatar,
        feishu_user_id: record.fields.feishu_union_id,
        feishu_union_id: record.fields.feishu_union_id
      };
    }
  } catch (e) {
    console.error('获取用户失败:', e.message);
  }
  return null;
}

/**
 * 创建用户
 */
async function createUser(feishuUser) {
  const userId = 'user_' + feishuUser.union_id.slice(-8);

  await client.request({
    method: 'POST',
    url: `/open-apis/bitable/v1/apps/${BITABLE_APP_TOKEN}/tables/${USERS_TABLE_ID}/records`,
    data: {
      fields: {
        id: userId,
        name: feishuUser.name,
        avatar: feishuUser.avatar_url || '😊',
        feishu_union_id: feishuUser.union_id,
        feishu_open_id: feishuUser.open_id
      }
    }
  });

  return {
    id: userId,
    name: feishuUser.name,
    avatar: feishuUser.avatar_url || '😊',
    feishu_user_id: feishuUser.union_id,
    feishu_union_id: feishuUser.union_id
  };
}

/**
 * 获取用户周统计
 */
async function getUserWeekStats(userId) {
  const now = new Date();
  const dayOfWeek = now.getDay();
  let daysUntilFriday = (5 - dayOfWeek + 7) % 7;
  if (!(dayOfWeek === 4 || dayOfWeek === 5)) daysUntilFriday -= 7;
  const friday = new Date(now);
  friday.setDate(friday.getDate() + daysUntilFriday);
  const weekStart = friday.toISOString().split('T')[0];

  // TODO: 从多维表格获取活动量数据
  return { weekScore: 0, activityCount: 0 };
}

/**
 * 获取用户当日活动
 */
async function getUserActivities(userId, date) {
  // TODO: 从多维表格获取
  return {};
}

/**
 * 提交活动量
 */
async function submitActivity(user, data) {
  // TODO: 提交到多维表格
  return { success: true, totalScore: 0 };
}

/**
 * 获取团队统计
 */
async function getTeamStats() {
  // TODO: 从多维表格获取
  return { totalMembers: 0, avgScore: 0, totalScore: 0, starName: '-' };
}

/**
 * 获取维度统计
 */
async function getDimensionStats() {
  // TODO: 从多维表格获取
  return {};
}

/**
 * 获取排行榜
 */
async function getRanking() {
  // TODO: 从多维表格获取
  return [];
}
