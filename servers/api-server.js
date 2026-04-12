// servers/api-server.js
// H5 应用 API 服务器 — 使用飞书多维表格存储

import express from 'express';
import { feishuLogin } from '../services/auth.js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import jwt from 'jsonwebtoken';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 加载环境变量
dotenv.config({ path: join(__dirname, '../.env.local'), override: true });

// 动态导入 bitable（CommonJS 模块）
const bitable = (await import('../services/bitable.js')).default;
import scheduler from '../services/scheduler.js';
import aiCoach from '../services/aiCoach-bitable.js';

const app = express();
const PORT = process.env.PORT || 3000;

// JWT 密钥
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
 * 飞书登录
 * POST /api/auth/feishu
 * Body: { code: string, appId: string }
 */
app.post('/api/auth/feishu', async (req, res) => {
  try {
    const { code, appId } = req.body;

    if (!code) {
      return res.status(400).json({ success: false, message: '缺少授权码' });
    }

    // 调用飞书登录（已返回 JWT token）
    const result = await feishuLogin(code);

    res.json({
      success: true,
      user: result.user,
      token: result.token
    });
  } catch (error) {
    console.error('[API] 飞书登录失败:', error.message);
    if (error.message.includes('secret')) {
      return res.status(401).json({ success: false, message: 'app secret invalid' });
    }
    res.status(500).json({ success: false, message: error.message });
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

    // 计算本周五到下周四的日期范围
    const now = new Date();
    const dayOfWeek = now.getDay();
    let daysUntilFriday = (5 - dayOfWeek + 7) % 7;
    if (!(dayOfWeek === 4 || dayOfWeek === 5)) {
      daysUntilFriday = daysUntilFriday - 7;
    }

    const friday = new Date(now);
    friday.setDate(friday.getDate() + daysUntilFriday);
    const weekStart = friday.toISOString().split('T')[0];

    // 从 Bitable 获取用户周统计
    const weekStats = await bitable.getUserWeekStats(user);

    res.json({
      success: true,
      weekScore: weekStats.weekScore,
      activityCount: weekStats.activityCount
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

    const activity = await bitable.getUserActivities(user, date);

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

    // 写入飞书多维表格
    const activity = await bitable.upsertActivity({
      user_name: user.name,
      user_id: user.id,
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
app.get('/api/team/stats', authMiddleware, async (req, res) => {
  try {
    const stats = await bitable.getTeamStats();
    res.json({
      success: true,
      data: stats
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
app.get('/api/team/dimensions', authMiddleware, async (req, res) => {
  try {
    const dimensions = await bitable.getDimensionStats();
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
app.get('/api/team/ranking', authMiddleware, async (req, res) => {
  try {
    const ranking = await bitable.getRanking();
    res.json({ success: true, data: ranking });
  } catch (error) {
    console.error('[API] 获取排行榜失败:', error);
    res.json({ success: true, data: [] });
  }
});

// ==================== 定时任务手动触发 ====================

/**
 * 手动触发定时任务（用于测试）
 * POST /api/scheduler/run
 * Body: { task: 'morning_reminder' | 'weekly_report' | 'reset_weekly' | 'ai_coach', targetUser: '用户名' }
 */
app.post('/api/scheduler/run', async (req, res) => {
  const { task, targetUser } = req.body || {};
  try {
    let result;
    switch (task) {
      case 'morning_reminder':
        await scheduler.sendMorningReminder();
        result = { success: true, message: '早报提醒已发送' };
        break;
      case 'weekly_report':
        result = await scheduler.generateWeeklyReport();
        break;
      case 'reset_weekly':
        result = await scheduler.resetWeeklyData();
        break;
      case 'ai_coach':
        result = await aiCoach.startAICoachConversations(targetUser ? { targetUser } : {});
        break;
      default:
        return res.status(400).json({ success: false, message: '未知任务: ' + task });
    }
    res.json(result);
  } catch (error) {
    console.error('[Scheduler] 手动触发失败:', error);
    res.status(500).json({ success: false, message: error.message });
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
  console.log('🚀 H5 应用 API 服务器 (Bitable)');
  console.log('='.repeat(60));
  console.log(`📡 监听端口：${PORT}`);
  console.log(`🔗 本地地址：http://localhost:${PORT}`);
  console.log('');
  console.log('可用接口:');
  console.log('  POST /api/auth/feishu      - 飞书登录');
  console.log('  GET  /api/user/info        - 用户信息');
  console.log('  GET  /api/user/week-stats  - 周统计');
  console.log('  GET  /api/activities/today - 今日活动');
  console.log('  POST /api/activities/submit - 提交活动');
  console.log('  GET  /api/team/stats       - 团队统计');
  console.log('  GET  /api/team/dimensions  - 维度统计');
  console.log('  GET  /api/team/ranking     - 排行榜');
  console.log('='.repeat(60));

  // 启动定时任务
  scheduler.startScheduler();
});
