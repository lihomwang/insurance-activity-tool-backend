// servers/api-server.js
// H5 应用 API 服务器 - 提供 RESTful API（多租户版本）

import express from 'express';
import { feishuLogin } from '../services/auth.js';
import db from '../services/db.js';
import tenantService from '../services/tenant.js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import jwt from 'jsonwebtoken';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 加载环境变量
dotenv.config({ path: join(__dirname, '../.env.local'), override: true });

const app = express();
const PORT = process.env.PORT || 3000;

// 默认租户 ID（从环境变量获取，支持多租户后每个租户有自己的 ID）
const DEFAULT_TENANT_ID = process.env.DEFAULT_TENANT_ID || '00000000-0000-0000-0000-000000000001';

// JWT 密钥（生产环境应该用环境变量）
const JWT_SECRET = process.env.JWT_SECRET || 'insurance-activity-tool-secret-key-2026';

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

// 租户中间件（在所有需要认证的 API 之前使用）
app.use(tenantService.tenantMiddleware);

/**
 * JWT Token 中间件
 */
function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    return res.status(401).json({ success: false, message: '请先登录' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ success: false, message: '登录已过期' });
  }
}

// ==================== 认证接口 ====================

/**
 * 飞书登录回调
 * POST /api/auth/feishu
 * Body: { code: string, appId: string, tenantId?: string }
 */
app.post('/api/auth/feishu', async (req, res) => {
  try {
    const { code, appId, tenantId } = req.body;

    if (!code) {
      return res.status(400).json({ success: false, message: '缺少授权码' });
    }

    // 使用传入的 tenantId 或默认租户 ID
    const tenant = tenantId || DEFAULT_TENANT_ID;

    // 调用飞书登录（传入 tenant_id）
    const result = await feishuLogin(code, tenant);

    // 生成 JWT token（有效期 7 天）
    const token = jwt.sign(
      {
        id: result.user.id,
        tenant_id: result.user.tenant_id,
        name: result.user.name,
        avatar: result.user.avatar,
        feishu_user_id: result.user.feishu_user_id
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    console.log('[API] 用户登录成功:', result.user.name, 'Tenant:', tenant);

    res.json({
      success: true,
      user: result.user,
      token: token
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
 * 统计周期：每周五到下周四
 */
app.get('/api/user/week-stats', authMiddleware, async (req, res) => {
  try {
    const user = req.user;
    const tenantId = req.tenantId || DEFAULT_TENANT_ID;

    // 计算本周五到下周四的日期范围
    const now = new Date();
    const dayOfWeek = now.getDay();

    // 计算到本周五的天数差值
    // 周日 (0), 周一 (1), 周二 (2), 周三 (3), 周四 (4), 周五 (5), 周六 (6)
    let daysUntilFriday = (5 - dayOfWeek + 7) % 7;
    if (dayOfWeek === 5 || dayOfWeek === 6) {
      // 周五或周六，用本周五（已经过去）
      daysUntilFriday = daysUntilFriday - 7;
    } else if (dayOfWeek === 0) {
      // 周日，上周五
      daysUntilFriday = -2;
    }
    // 周一到周四，用本周五

    const friday = new Date(now);
    friday.setDate(friday.getDate() + daysUntilFriday);
    friday.setHours(0, 0, 0, 0);

    // 下周四 = 周五 + 6 天
    const thursdayNext = new Date(friday);
    thursdayNext.setDate(thursdayNext.getDate() + 6);
    thursdayNext.setHours(23, 59, 59, 999);

    const weekStart = friday.toISOString().split('T')[0];
    const weekEnd = thursdayNext.toISOString().split('T')[0];

    console.log('[API] week-stats:', {
      user: user.name,
      tenantId,
      weekStart,
      weekEnd,
      dayOfWeek
    });

    // 获取用户本周所有活动量（周五到周四）
    const activities = await db.findAll('activities', {
      tenant_id: tenantId,
      user_id: user.id
    });

    // 过滤日期范围内的数据
    const weekActivities = activities.filter(a => {
      return a.activity_date >= weekStart &&
             a.activity_date <= weekEnd &&
             a.is_submitted;
    });

    console.log('[API] 查询结果:', {
      totalActivities: activities.length,
      weekActivities: weekActivities.length
    });

    const weekScore = weekActivities.reduce((sum, a) => sum + (a.total_score || 0), 0);
    const activityCount = weekActivities.length;

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
    const tenantId = req.tenantId || DEFAULT_TENANT_ID;
    const date = req.query.date || new Date().toISOString().split('T')[0];

    console.log('[API] activities/today:', {
      user: user.name,
      tenantId,
      date
    });

    const activity = await db.findOne('activities', {
      tenant_id: tenantId,
      user_id: user.id,
      activity_date: date
    });

    console.log('[API] 查询结果:', activity);

    if (!activity || !activity.is_submitted) {
      return res.json({ success: true, data: {} });
    }

    // 返回所有有值的维度
    const dimensions = {};
    if (activity.new_leads > 0) dimensions.new_leads = activity.new_leads;
    if (activity.referral > 0) dimensions.referral = activity.referral;
    if (activity.invitation > 0) dimensions.invitation = activity.invitation;
    if (activity.sales_meeting > 0) dimensions.sales_meeting = activity.sales_meeting;
    if (activity.recruit_meeting > 0) dimensions.recruit_meeting = activity.recruit_meeting;
    if (activity.business_plan > 0) dimensions.business_plan = activity.business_plan;
    if (activity.deal > 0) dimensions.deal = activity.deal;
    if (activity.eop_guest > 0) dimensions.eop_guest = activity.eop_guest;
    if (activity.cc_assessment > 0) dimensions.cc_assessment = activity.cc_assessment;
    if (activity.training > 0) dimensions.training = activity.training;

    res.json({ success: true, data: dimensions });
  } catch (error) {
    console.error('[API] 获取活动数据失败:', error);
    res.json({ success: true, data: {} });
  }
});

/**
 * 提交活动量
 * POST /api/activities/submit
 */
app.post('/api/activities/submit', authMiddleware, async (req, res) => {
  try {
    const user = req.user;
    const tenantId = req.tenantId || DEFAULT_TENANT_ID;
    const data = req.body;

    console.log('[API] 提交活动量:', { user: user.name, tenantId, ...data });

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

    // 保存或更新数据（需要包含 tenant_id 在冲突列中）
    const activity = await db.upsert('activities', {
      tenant_id: tenantId,
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
    }, ['tenant_id', 'user_id', 'activity_date']);

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
 * 统计周期：每周五到下周四
 */
app.get('/api/team/stats', authMiddleware, async (req, res) => {
  try {
    const tenantId = req.tenantId || DEFAULT_TENANT_ID;

    console.log('[API] team/stats:', { tenantId });

    // 计算本周五到下周四的日期范围
    const now = new Date();
    const dayOfWeek = now.getDay();

    let daysUntilFriday = (5 - dayOfWeek + 7) % 7;
    if (dayOfWeek === 5 || dayOfWeek === 6) {
      daysUntilFriday = daysUntilFriday - 7;
    } else if (dayOfWeek === 0) {
      daysUntilFriday = -2;
    }

    const friday = new Date(now);
    friday.setDate(friday.getDate() + daysUntilFriday);
    friday.setHours(0, 0, 0, 0);

    const thursdayNext = new Date(friday);
    thursdayNext.setDate(thursdayNext.getDate() + 6);
    thursdayNext.setHours(23, 59, 59, 999);

    const weekStart = friday.toISOString().split('T')[0];
    const weekEnd = thursdayNext.toISOString().split('T')[0];

    console.log('[API] weekStart:', weekStart, 'weekEnd:', weekEnd);

    // 获取当前租户的用户
    const users = await db.findAll('users', { tenant_id: tenantId });

    // 获取所有活动（不限制日期，前端过滤）
    const activities = await db.findAll('activities', {
      tenant_id: tenantId,
      is_submitted: 1
    });

    // 过滤周期内的数据
    const weekActivities = activities.filter(a => {
      return a.activity_date >= weekStart && a.activity_date <= weekEnd;
    });

    console.log('[API] 查询结果:', {
      usersCount: users.length,
      totalActivities: activities.length,
      weekActivities: weekActivities.length
    });

    // 计算用户分数
    const userScores = {};
    weekActivities.forEach(a => {
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
 * 统计周期：每周五到下周四
 */
app.get('/api/team/dimensions', authMiddleware, async (req, res) => {
  try {
    const tenantId = req.tenantId || DEFAULT_TENANT_ID;

    // 计算本周五到下周四的日期范围
    const now = new Date();
    const dayOfWeek = now.getDay();

    let daysUntilFriday = (5 - dayOfWeek + 7) % 7;
    if (dayOfWeek === 5 || dayOfWeek === 6) {
      daysUntilFriday = daysUntilFriday - 7;
    } else if (dayOfWeek === 0) {
      daysUntilFriday = -2;
    }

    const friday = new Date(now);
    friday.setDate(friday.getDate() + daysUntilFriday);
    friday.setHours(0, 0, 0, 0);

    const thursdayNext = new Date(friday);
    thursdayNext.setDate(thursdayNext.getDate() + 6);
    thursdayNext.setHours(23, 59, 59, 999);

    const weekStart = friday.toISOString().split('T')[0];
    const weekEnd = thursdayNext.toISOString().split('T')[0];

    // 获取当前租户的所有已提交活动
    const activities = await db.findAll('activities', {
      tenant_id: tenantId,
      is_submitted: 1
    });

    // 过滤周期内的数据
    const weekActivities = activities.filter(a => {
      return a.activity_date >= weekStart && a.activity_date <= weekEnd;
    });

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

    weekActivities.forEach(a => {
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
 * 统计周期：每周五到下周四
 */
app.get('/api/team/ranking', authMiddleware, async (req, res) => {
  try {
    const tenantId = req.tenantId || DEFAULT_TENANT_ID;

    console.log('[API] team/ranking:', { tenantId });

    // 计算本周五到下周四的日期范围
    const now = new Date();
    const dayOfWeek = now.getDay();

    let daysUntilFriday = (5 - dayOfWeek + 7) % 7;
    if (dayOfWeek === 5 || dayOfWeek === 6) {
      daysUntilFriday = daysUntilFriday - 7;
    } else if (dayOfWeek === 0) {
      daysUntilFriday = -2;
    }

    const friday = new Date(now);
    friday.setDate(friday.getDate() + daysUntilFriday);
    friday.setHours(0, 0, 0, 0);

    const thursdayNext = new Date(friday);
    thursdayNext.setDate(thursdayNext.getDate() + 6);
    thursdayNext.setHours(23, 59, 59, 999);

    const weekStart = friday.toISOString().split('T')[0];
    const weekEnd = thursdayNext.toISOString().split('T')[0];

    // 仅获取当前租户的用户和活动
    const users = await db.findAll('users', { tenant_id: tenantId });
    const activities = await db.findAll('activities', {
      tenant_id: tenantId,
      is_submitted: 1
    });

    // 过滤周期内的数据
    const weekActivities = activities.filter(a => {
      return a.activity_date >= weekStart && a.activity_date <= weekEnd;
    });

    console.log('[API] 查询结果:', {
      usersCount: users.length,
      totalActivities: activities.length,
      weekActivities: weekActivities.length
    });

    // 按用户汇总分数
    const userScores = {};
    weekActivities.forEach(a => {
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
