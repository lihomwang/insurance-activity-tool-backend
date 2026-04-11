// functions/activity/index.js
// 活动量 API — 使用飞书多维表格存储

const bitable = require('../../services/bitable');

/**
 * 提交活动量
 * POST /api/activities/submit
 * body: { user_name, mobile?, activity_date?, new_leads, referral, ..., total_score?, is_submitted }
 */
async function submitActivity(body) {
  const today = new Date().toISOString().split('T')[0];
  const activityDate = body.activity_date || today;

  // 计算总分
  const dimensions = {
    new_leads: body.new_leads || 0,
    referral: body.referral || 0,
    invitation: body.invitation || 0,
    sales_meeting: body.sales_meeting || 0,
    recruit_meeting: body.recruit_meeting || 0,
    business_plan: body.business_plan || 0,
    deal: body.deal || 0,
    eop_guest: body.eop_guest || 0,
    cc_assessment: body.cc_assessment || 0,
    training: body.training || 0
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

  console.log('[Activity] Submitting to Bitable:', {
    user_name: body.user_name,
    activity_date: activityDate,
    dimensions,
    totalScore
  });

  // Upsert 到飞书多维表格
  const result = await bitable.upsertActivity({
    user_name: body.user_name,
    mobile: body.mobile || null,
    activity_date: activityDate,
    ...dimensions,
    total_score: totalScore,
    is_submitted: 1
  });

  return {
    success: true,
    message: '提交成功',
    totalScore,
    record_id: result.record_id
  };
}

/**
 * 获取今日活动量
 * GET /api/activities/today?date=xxx&user_name=xxx
 */
async function getTodayActivity(userName, date) {
  const today = date || new Date().toISOString().split('T')[0];
  const activity = await bitable.getUserActivities(userName, today);

  return {
    success: true,
    data: activity || {}
  };
}

// 云函数入口 (HTTP 路由方式)
exports.handler = async (event, context) => {
  const { httpMethod, path, body, query } = event;

  try {
    let result;

    if (httpMethod === 'POST' && path === '/api/activities/submit') {
      result = await submitActivity(body || {});
    } else if (httpMethod === 'GET' && path === '/api/activities/today') {
      if (!body?.user_name && !query?.user_name) {
        throw new Error('缺少 user_name 参数');
      }
      result = await getTodayActivity(body?.user_name || query?.user_name, query?.date);
    } else {
      // 兼容旧的 action 格式
      const parsedBody = typeof body === 'string' ? JSON.parse(body || '{}') : (body || {});
      const { action, userId, data } = parsedBody;

      switch (action) {
        case 'submit':
          result = await submitActivity({ ...data, user_name: data.user_name || userId });
          break;
        case 'today':
          result = await getTodayActivity(userId, query?.date);
          break;
        default:
          throw new Error(`Unknown action: ${action}`);
      }
    }

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify(result)
    };
  } catch (error) {
    console.error('[Activity] Error:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ success: false, message: error.message })
    };
  }
};
