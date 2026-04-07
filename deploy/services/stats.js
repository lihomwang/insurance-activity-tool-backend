// services/stats.js
// 统计服务

const db = require('./db')

/**
 * 获取周统计
 * @param {string} userId - 用户 ID
 */
async function getWeekStats(userId) {
  // 获取本周一的日期
  const now = new Date()
  const currentDay = now.getDay() || 7
  const monday = new Date(now)
  monday.setDate(now.getDate() - (currentDay - 1))
  monday.setHours(0, 0, 0, 0)

  // 查询本周活动
  const activities = await db.findAll(
    'activities',
    { user_id: userId },
    {
      where: 'activity_date >= ?',
      params: [monday.toISOString().split('T')[0]],
      orderBy: 'activity_date ASC'
    }
  )

  // 计算总分和活动次数
  const weekScore = activities.reduce((sum, a) => sum + (a.total_score || 0), 0)
  const activityCount = activities.filter(a => a.is_submitted).length

  return {
    weekScore,
    activityCount,
    activities
  }
}

/**
 * 获取团队统计
 */
async function getTeamStats() {
  // 获取所有用户
  const users = await db.findAll('users', {})

  // 获取本周所有活动
  const now = new Date()
  const currentDay = now.getDay() || 7
  const monday = new Date(now)
  monday.setDate(now.getDate() - (currentDay - 1))
  monday.setHours(0, 0, 0, 0)

  const activities = await db.findAll(
    'activities',
    {},
    {
      where: 'activity_date >= ?',
      params: [monday.toISOString().split('T')[0]]
    }
  )

  // 计算团队统计
  const totalMembers = users.length
  const totalScore = activities.reduce((sum, a) => sum + (a.total_score || 0), 0)
  const avgScore = totalMembers > 0 ? Math.round(totalScore / totalMembers) : 0

  // 找出本周之星（分数最高的人）
  const userScores = {}
  activities.forEach(a => {
    if (!userScores[a.user_id]) userScores[a.user_id] = 0
    userScores[a.user_id] += (a.total_score || 0)
  })

  let starUserId = null
  let maxScore = 0
  Object.entries(userScores).forEach(([uid, score]) => {
    if (score > maxScore) {
      maxScore = score
      starUserId = uid
    }
  })

  // 获取之星的用户信息
  let starName = '皮叔'
  if (starUserId) {
    const starUser = await db.findOne('users', { user_id: starUserId })
    if (starUser) starName = starUser.name || starUser.user_id
  }

  return {
    totalMembers,
    avgScore,
    totalScore,
    starName
  }
}

/**
 * 获取维度统计
 */
async function getDimensionStats() {
  // 获取本周所有活动
  const now = new Date()
  const currentDay = now.getDay() || 7
  const monday = new Date(now)
  monday.setDate(now.getDate() - (currentDay - 1))
  monday.setHours(0, 0, 0, 0)

  const activities = await db.findAll(
    'activities',
    {},
    {
      where: 'activity_date >= ?',
      params: [monday.toISOString().split('T')[0]]
    }
  )

  // 维度映射（数据库字段 -> 显示名称）
  const dimensionMap = {
    new_leads: 'new_leads',
    referral: 'referrals',
    invitation: 'invitations',
    sales_meeting: 'sales_meetings',
    recruit_meeting: 'recruit_meetings',
    business_plan: 'business_plans',
    deal: 'deals',
    eop_guest: 'eop_guests',
    cc_assessment: 'cc_assessments',
    training: 'trainings'
  }

  // 统计各维度
  const stats = {}
  Object.keys(dimensionMap).forEach(key => {
    stats[dimensionMap[key]] = { count: 0, score: 0 }
  })

  activities.forEach(a => {
    Object.keys(dimensionMap).forEach(dbKey => {
      const count = a[dbKey] || 0
      const displayKey = dimensionMap[dbKey]
      if (stats[displayKey]) {
        stats[displayKey].count += count
        // 根据维度计算分数
        const scoreMap = {
          new_leads: 1,
          referral: 3,
          invitation: 1,
          sales_meeting: 10,
          recruit_meeting: 10,
          business_plan: 1,
          deal: 10,
          eop_guest: 5,
          cc_assessment: 5,
          training: 10
        }
        stats[displayKey].score += count * (scoreMap[dbKey] || 0)
      }
    })
  })

  return stats
}

module.exports = {
  getWeekStats,
  getTeamStats,
  getDimensionStats
}
