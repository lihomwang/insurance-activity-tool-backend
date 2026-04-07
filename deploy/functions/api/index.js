// functions/api/index.js
// 统一 API 处理器 - 为 H5 应用提供 RESTful API

const db = require('../../services/db')
const stats = require('../../services/stats')
const ranking = require('../../services/ranking')
const feishu = require('../../services/feishu')

/**
 * 提交活动量
 */
async function submitActivity(data) {
  const { userId, date, items } = data

  // 维度映射
  const dimensionMap = {
    new_leads: 'new_leads',
    referrals: 'referral',
    invitations: 'invitation',
    sales_meetings: 'sales_meeting',
    recruit_meetings: 'recruit_meeting',
    business_plans: 'business_plan',
    deals: 'deal',
    eop_guests: 'eop_guest',
    cc_assessments: 'cc_assessment',
    trainings: 'training'
  }

  // 计算各维度数量和总分
  const activityData = {
    new_leads: 0,
    referral: 0,
    invitation: 0,
    sales_meeting: 0,
    recruit_meeting: 0,
    business_plan: 0,
    deal: 0,
    eop_guest: 0,
    cc_assessment: 0,
    training: 0
  }

  const scoreMap = {
    new_leads: 1,
    referrals: 3,
    invitations: 1,
    sales_meetings: 10,
    recruit_meetings: 10,
    business_plans: 1,
    deals: 10,
    eop_guests: 5,
    cc_assessments: 5,
    trainings: 10
  }

  let totalScore = 0

  items.forEach(item => {
    const dbKey = dimensionMap[item.dimensionId] || item.dimensionId
    if (activityData[dbKey] !== undefined) {
      activityData[dbKey] = item.count
      totalScore += item.count * (scoreMap[item.dimensionId] || 0)
    }
  })

  // 检查是否已锁定
  const hour = new Date().getHours()
  const isLocked = hour >= 21

  // 保存数据
  const activity = await db.upsert('activities', {
    user_id: userId,
    activity_date: date,
    ...activityData,
    total_score: totalScore,
    is_locked: isLocked ? 1 : 0,
    is_submitted: 1,
    submitted_at: new Date().toISOString()
  }, 'user_id, activity_date')

  return { success: true, data: activity }
}

/**
 * 获取用户活动
 */
async function getUserActivities(userId, date) {
  const today = date || new Date().toISOString().split('T')[0]

  const activity = await db.findOne('activities', {
    user_id: userId,
    activity_date: today
  })

  if (!activity) {
    return []
  }

  // 转换为 H5 应用需要的格式
  const dimensionMap = [
    { id: 'new_leads', dbKey: 'new_leads', icon: '💼', name: '销售面谈' },
    { id: 'presentations', dbKey: 'business_plan', icon: '🎯', name: '方案演示' },
    { id: 'closings', dbKey: 'deal', icon: '🎉', name: '成交' },
    { id: 'referrals', dbKey: 'referral', icon: '🤝', name: '转介绍' },
    { id: 'followups', dbKey: 'invitation', icon: '📞', name: '追踪服务' },
    { id: 'trainings', dbKey: 'training', icon: '📚', name: '学习培训' }
  ]

  return dimensionMap
    .filter(dim => activity[dim.dbKey] > 0)
    .map(dim => ({
      id: dim.id,
      icon: dim.icon,
      name: dim.name,
      count: activity[dim.dbKey],
      score: activity[dim.dbKey] * (dim.id === 'closings' ? 10 : dim.id === 'new_leads' ? 1 : 10)
    }))
}

/**
 * 获取锁定状态
 */
function getLockStatus() {
  const hour = new Date().getHours()
  return { locked: hour >= 21 }
}

/**
 * 云函数入口
 */
exports.handler = async (event, context) => {
  const { httpMethod, path, body, query, headers } = event

  // 设置 CORS
  const corsHeaders = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  }

  // 处理 OPTIONS 请求
  if (httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' }
  }

  try {
    let result

    // 健康检查
    if (path === '/health' && httpMethod === 'GET') {
      result = { status: 'ok' }
    }
    // 获取用户信息
    else if (path === '/api/user/info' && httpMethod === 'GET') {
      const userId = query.userId
      const user = userId ? await db.findOne('users', { user_id: userId }) : null
      result = user || { id: 'default', name: '皮叔', avatar: '🦸' }
    }
    // 获取周统计
    else if (path === '/api/stats/week' && httpMethod === 'GET') {
      result = await stats.getWeekStats(query.userId)
    }
    // 获取团队统计
    else if (path === '/api/stats/team' && httpMethod === 'GET') {
      result = await stats.getTeamStats()
    }
    // 获取维度统计
    else if (path === '/api/stats/dimensions' && httpMethod === 'GET') {
      result = await stats.getDimensionStats()
    }
    // 获取排行榜
    else if (path === '/api/ranking' && httpMethod === 'GET') {
      result = await ranking.getRanking(parseInt(query.limit || 10))
    }
    // 获取活动记录
    else if (path === '/api/activities' && httpMethod === 'GET') {
      result = await getUserActivities(query.userId, query.date)
    }
    // 检查锁定状态
    else if (path === '/api/activity/lock-status' && httpMethod === 'GET') {
      result = getLockStatus()
    }
    // 提交活动量
    else if (path === '/api/activity/submit' && httpMethod === 'POST') {
      result = await submitActivity(body)
    }
    else {
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({ success: false, message: 'Not Found' })
      }
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ success: true, data: result })
    }

  } catch (error) {
    console.error('[API] Error:', error)
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ success: false, message: error.message })
    }
  }
}
