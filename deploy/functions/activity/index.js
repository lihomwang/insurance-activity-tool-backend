// functions/activity/index.js
// 活动量 API - 飞书云函数入口

const db = require('../../services/db');
const feishu = require('../../services/feishu');

/**
 * 提交活动量
 * POST /api/activity/submit
 */
async function submitActivity(userId, data) {
  const today = new Date().toISOString().split('T')[0];

  // 计算总分
  const dimensions = {
    new_leads: data.new_leads || 0,
    referral: data.referral || 0,
    invitation: data.invitation || 0,
    sales_meeting: data.sales_meeting || 0,
    recruit_meeting: data.recruit_meeting || 0,
    business_plan: data.business_plan || 0,
    deal: data.deal || 0,
    eop_guest: data.eop_guest || 0,
    cc_assessment: data.cc_assessment || 0,
    training: data.training || 0
  };

  const totalScore =
    dimensions.new_leads * 1 +
    dimensions.referral * 3 +
    dimensions.invitation * 1 +
    dimensions.sales_meeting * 10 +
    dimensions.recruit_meeting * 10 +
    dimensions.business_plan * 1 +
    dimensions.deal * 10 +
    dimensions.eop_guest * 5 +
    dimensions.cc_assessment * 5 +
    dimensions.training * 10;

  // 检查是否已锁定 (21:00 后)
  const now = new Date();
  const hour = now.getHours();
  const isLocked = hour >= 21;

  console.log('[Activity] Submitting:', {
    userId,
    activity_date: today,
    dimensions,
    totalScore,
    submitted_at: new Date().toISOString()
  });

  //  Upsert 活动量数据
  const activity = await db.upsert('activities', {
    user_id: userId,
    activity_date: today,
    ...dimensions,
    total_score: totalScore,
    is_locked: isLocked ? 1 : 0,
    is_submitted: 1,
    submitted_at: new Date().toISOString()
  }, 'user_id, activity_date');

  return {
    success: true,
    activity: {
      ...activity,
      isLocked
    }
  };
}

/**
 * 获取今日活动量
 * GET /api/activity/today
 */
async function getTodayActivity(userId) {
  const today = new Date().toISOString().split('T')[0];

  const activity = await db.findOne('activities', {
    user_id: userId,
    activity_date: today
  });

  return {
    success: true,
    activity: activity || null
  };
}

/**
 * 获取活动量历史
 * GET /api/activity/history?days=7
 */
async function getActivityHistory(userId, days = 7) {
  const activities = await db.findAll(
    'activities',
    { user_id },
    {
      orderBy: 'activity_date DESC',
      limit: days
    }
  );

  return {
    success: true,
    activities
  };
}

/**
 * 检查是否已锁定
 * GET /api/activity/lock-status
 */
async function getLockStatus() {
  const now = new Date();
  const hour = now.getHours();
  const isLocked = hour >= 21;

  return {
    success: true,
    isLocked,
    lockHour: 21,
    currentHour: hour
  };
}

// 云函数入口
exports.handler = async (event, context) => {
  try {
    const { action, userId, data } = JSON.parse(event.body || '{}');
    const query = event.query || {};

    // 获取用户 ID (从飞书上下文或参数)
    const uid = userId || context.userId || query.userId;
    if (!uid && action !== 'lock_status') {
      throw new Error('Missing user ID');
    }

    let result;
    switch (action) {
      case 'submit':
        result = await submitActivity(uid, data);
        break;
      case 'today':
        result = await getTodayActivity(uid);
        break;
      case 'history':
        result = await getActivityHistory(uid, parseInt(query.days || 7));
        break;
      case 'lock_status':
        result = await getLockStatus();
        break;
      default:
        throw new Error(`Unknown action: ${action}`);
    }

    return {
      statusCode: 200,
      body: JSON.stringify(result)
    };
  } catch (error) {
    console.error('[Activity] Error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};
