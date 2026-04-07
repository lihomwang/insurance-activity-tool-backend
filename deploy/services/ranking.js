// services/ranking.js
// 排行榜服务

const db = require('./db')

/**
 * 获取排行榜
 * @param {number} limit - 返回数量限制
 */
async function getRanking(limit = 10) {
  // 获取本周所有用户的活动
  const now = new Date()
  const currentDay = now.getDay() || 7
  const monday = new Date(now)
  monday.setDate(now.getDate() - (currentDay - 1))
  monday.setHours(0, 0, 0, 0)

  // 获取所有用户
  const users = await db.findAll('users', {})

  // 获取本周活动
  const activities = await db.findAll(
    'activities',
    {},
    {
      where: 'activity_date >= ?',
      params: [monday.toISOString().split('T')[0]]
    }
  )

  // 计算每个用户的总分
  const userScores = {}
  users.forEach(user => {
    userScores[user.user_id] = {
      userId: user.user_id,
      name: user.name || user.user_id,
      avatar: user.avatar || '👤',
      score: 0
    }
  })

  // 累加活动分数
  activities.forEach(a => {
    if (userScores[a.user_id]) {
      userScores[a.user_id].score += (a.total_score || 0)
    }
  })

  // 转换为数组并排序
  const ranking = Object.values(userScores)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)

  // 添加排名
  ranking.forEach((item, index) => {
    item.rank = index + 1
  })

  return ranking
}

/**
 * 获取用户排名
 * @param {string} userId - 用户 ID
 */
async function getUserRank(userId) {
  const ranking = await getRanking(100)
  const user = ranking.find(item => item.userId === userId)
  return user || { userId, name: '未知', score: 0, rank: -1 }
}

module.exports = {
  getRanking,
  getUserRank
}
