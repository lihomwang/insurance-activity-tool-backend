// servers/api-server.js
// H5 应用 API 服务器 - 提供 RESTful API

import express from 'express';
import { feishuLogin } from '../services/auth.js';
import db from '../services/db.js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 加载环境变量
dotenv.config({ path: join(__dirname, '../.env.local'), override: true });

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// CORS 配置
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// 临时 session 存储（生产环境应该用 Redis）
const sessions = new Map();

/**
 * 验证 token 中间件
 */
function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    return res.status(401).json({ success: false, message: '请先登录' });
  }

  const session = sessions.get(token);
  if (!session || session.expiresAt < Date.now()) {
    sessions.delete(token);
    return res.status(401).json({ success: false, message: '登录已过期' });
  }

  req.user = session.user;
  next();
}

// ==================== 认证接口 ====================

/**
 * 飞书登录回调
 * POST /api/auth/feishu
 * Body: { code: string, appId: string }
 */
app.post('/api/auth/feishu', async (req, res) => {
  try {
    const { code, appId } = req.body;

    if (!code) {
      return res.status(400).json({ success: false, message: '缺少授权码' });
    }

    // 调用飞书登录
    const result = await feishuLogin(code);

    // 保存 session
    const sessionToken = result.token;
    sessions.set(sessionToken, {
      user: result.user,
      expiresAt: Date.now() + (result.expires_in || 7200) * 1000 // 默认 2 小时
    });

    console.log('[API] 用户登录成功:', result.user.name);

    res.json({
      success: true,
      user: result.user,
      token: sessionToken
    });
  } catch (error) {
    console.error('[API] 飞书登录失败:', error);
    res.status(500).json({
      success: false,
      message: error.message || '登录失败'
    });
  }
});

// ==================== 用户接口 ====================

/**
 * 获取用户信息
 * GET /api/user/info
 */
app.get('/api/user/info', authMiddleware, async (req, res) => {
  try {
    res.json({
      success: true,
      data: req.user
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * 获取用户本周统计
 * GET /api/user/week-stats
 */
app.get('/api/user/week-stats', authMiddleware, async (req, res) => {
  try {
    const user = req.user;

    // 计算本周五到本周四的日期范围
    const now = new Date();
    const dayOfWeek = now.getDay();
    let daysUntilFriday = (5 - dayOfWeek + 7) % 7;
    if (dayOfWeek === 4 || dayOfWeek === 5) {
      // 周四或周五，用本周五
    } else {
      daysUntilFriday = daysUntilFriday - 7;
    }

    const friday = new Date(now);
    friday.setDate(friday.getDate() + daysUntilFriday);
    friday.setHours(0, 0, 0, 0);

    const weekStart = friday.toISOString().split('T')[0];

    // 获取用户本周活动量
    const activities = await db.findAll('activities', {
      user_id: user.id,
      activity_date: { $gte: weekStart }
    });

    const weekScore = activities
      .filter(a => a.is_submitted)
      .reduce((sum, a) => sum + (a.total_score || 0), 0);

    const activityCount = activities.filter(a => a.is_submitted).length;

    res.json({
      success: true,
      weekScore,
      activityCount
    });
  } catch (error) {
    console.error('[API] 获取周统计失败:', error);
    res.json({ success: true, weekScore: 0, activityCount: 0 });
  }
});

/**
 * 获取用户今日活动
 * GET /api/activities/today?date=YYYY-MM-DD
 */
app.get('/api/activities/today', authMiddleware, async (req, res) => {
  try {
    const user = req.user;
    const date = req.query.date || new Date().toISOString().split('T')[0];

    const activity = await db.findOne('activities', {
      user_id: user.id,
      activity_date: date
    });

    if (!activity || !activity.is_submitted) {
      return res.json({ success: true, data: [] });
    }

    // 返回所有有值的维度
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

    res.json({ success: true, data: dimensions });
  } catch (error) {
    console.error('[API] 获取活动数据失败:', error);
    res.json({ success: true, data: [] });
  }
});

/**
 * 提交活动量
 * POST /api/activities/submit
 */
app.post('/api/activities/submit', authMiddleware, async (req, res) => {
  try {
    const user = req.user;
    const data = req.body;

    console.log('[API] 提交活动量:', { user: user.name, ...data });

    // 计算总分
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

    // 保存或更新数据
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

    res.json({
      success: true,
      message: '提交成功',
      data: { totalScore, ...activity }
    });
  } catch (error) {
    console.error('[API] 提交活动量失败:', error);
    res.status(500).json({
      success: false,
      message: error.message || '提交失败'
    });
  }
});

// ==================== 团队接口 ====================

/**
 * 获取团队统计
 * GET /api/team/stats
 */
app.get('/api/team/stats', async (req, res) => {
  try {
    // 获取本周日期范围
    const now = new Date();
    const dayOfWeek = now.getDay();
    let daysUntilFriday = (5 - dayOfWeek + 7) % 7;
    if (!(dayOfWeek === 4 || dayOfWeek === 5)) {
      daysUntilFriday = daysUntilFriday - 7;
    }

    const friday = new Date(now);
    friday.setDate(friday.getDate() + daysUntilFriday);
    const weekStart = friday.toISOString().split('T')[0];

    // 获取团队统计数据
    const users = await db.findAll('users', {});
    const activities = await db.findAll('activities', {
      activity_date: { $gte: weekStart },
      is_submitted: 1
    });

    // 计算用户分数
    const userScores = {};
    activities.forEach(a => {
      if (!userScores[a.user_id]) {
        userScores[a.user_id] = 0;
      }
      userScores[a.user_id] += a.total_score || 0;
    });

    const totalMembers = users.length;
    const submittedCount = Object.keys(userScores).length;
    const totalScore = Object.values(userScores).reduce((sum, score) => sum + score, 0);
    const avgScore = submittedCount > 0 ? Math.round(totalScore / submittedCount) : 0;

    // 找出最高分用户
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

    res.json({
      success: true,
      data: { totalMembers, avgScore, totalScore, starName }
    });
  } catch (error) {
    console.error('[API] 获取团队统计失败:', error);
    res.json({
      success: true,
      data: { totalMembers: 0, avgScore: 0, totalScore: 0, starName: '-' }
    });
  }
});

/**
 * 获取维度统计
 * GET /api/team/dimensions
 */
app.get('/api/team/dimensions', async (req, res) => {
  try {
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

    res.json({ success: true, data: dimensions });
  } catch (error) {
    console.error('[API] 获取维度统计失败:', error);
    res.json({ success: true, data: {} });
  }
});

/**
 * 获取排行榜
 * GET /api/team/ranking
 */
app.get('/api/team/ranking', async (req, res) => {
  try {
    const users = await db.findAll('users', {});
    const activities = await db.findAll('activities', { is_submitted: 1 });

    // 按用户汇总分数
    const userScores = {};
    activities.forEach(a => {
      if (!userScores[a.user_id]) {
        userScores[a.user_id] = 0;
      }
      userScores[a.user_id] += a.total_score || 0;
    });

    // 生成排行榜
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

    res.json({ success: true, data: ranking });
  } catch (error) {
    console.error('[API] 获取排行榜失败:', error);
    res.json({ success: true, data: [] });
  }
});

// ==================== 健康检查 ====================

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ==================== 启动服务器 ====================

app.listen(PORT, () => {
  console.log('');
  console.log('='.repeat(60));
  console.log('🚀 H5 应用 API 服务器已启动');
  console.log('='.repeat(60));
  console.log(`📡 监听端口：${PORT}`);
  console.log(`🔗 本地地址：http://localhost:${PORT}`);
  console.log('');
  console.log('可用接口:');
  console.log('  POST /api/auth/feishu    - 飞书登录');
  console.log('  GET  /api/user/info      - 用户信息');
  console.log('  GET  /api/user/week-stats - 周统计');
  console.log('  GET  /api/activities/today - 今日活动');
  console.log('  POST /api/activities/submit - 提交活动');
  console.log('  GET  /api/team/stats     - 团队统计');
  console.log('  GET  /api/team/dimensions - 维度统计');
  console.log('  GET  /api/team/ranking   - 排行榜');
  console.log('='.repeat(60));
});
