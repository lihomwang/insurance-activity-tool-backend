// functions/scheduler/index.js
// 定时任务 - 飞书云函数入口

const db = require('../../services/db');
const aiCoach = require('../../services/aiCoach');
const feishu = require('../../services/feishu');
const config = require('../../config');
const { sendMorningReminder, resetWeeklyData } = require('../../scripts/morning-reminder.js');

/**
 * 锁定当日数据 (每天 21:00 执行)
 */
async function lockDailyActivities() {
  try {
    const today = new Date().toISOString().split('T')[0];
    const result = await db.update('activities', { activity_date: today }, { is_locked: true });
    console.log(`[Scheduler] Locked ${result?.rowCount || 0} activity records for ${today}`);
    return { success: true, locked: result?.rowCount || 0 };
  } catch (error) {
    console.error('[Scheduler] Lock error:', error);
    throw error;
  }
}

/**
 * 触发 AI 教练对话 (每天 21:05 和 24:05 执行)
 * 第一批 21:05：千老师私信复盘（针对 21:00 前提交的数据）
 * 第二批 24:05：千老师私信复盘（针对 21:00-24:00 提交的数据）
 * 每人最多 10 轮引导式提问
 */
async function triggerAICoach(batch = 'first') {
  try {
    await aiCoach.startAICoachConversations(batch);
    return { success: true };
  } catch (error) {
    console.error('[Scheduler] AI Coach error:', error);
    throw error;
  }
}

/**
 * 生成每日分析 (每天 23:00 执行)
 */
async function generateDailyAnalytics() {
  try {
    const today = new Date().toISOString().split('T')[0];
    const activities = await db.findAll('activities', { activity_date: today });
    const conversations = await db.findAll('ai_conversations', { conversation_date: today });

    const submittedActivities = activities.filter(a => a.is_submitted);
    const submittedCount = submittedActivities.length;
    const avgScore = submittedCount > 0
      ? (submittedActivities.reduce((sum, a) => sum + a.total_score, 0) / submittedCount).toFixed(1)
      : 0;

    await db.insert('daily_analytics', {
      analytics_date: today,
      submitted_count: submittedCount,
      avg_score: avgScore,
      ai_conversation_count: conversations.length,
      created_at: new Date()
    });

    console.log(`[Scheduler] Daily analytics generated for ${today}`);
    return { success: true };
  } catch (error) {
    console.error('[Scheduler] Analytics error:', error);
    throw error;
  }
}

/**
 * 生成周报 (每周四 22:00 执行)
 * 统计周五到周四的数据，发送给管理员
 */
async function generateWeeklyReport() {
  try {
    const today = new Date();
    const dayOfWeek = today.getDay();

    // 计算本周五到下周四是报告周期
    let daysUntilFriday = (5 - dayOfWeek + 7) % 7;
    if (dayOfWeek === 4 || dayOfWeek === 5) {
      // 周四或周五，用本周五
    } else {
      daysUntilFriday = daysUntilFriday - 7;
    }

    const friday = new Date(today);
    friday.setDate(friday.getDate() + daysUntilFriday);
    friday.setHours(0, 0, 0, 0);

    const thursdayNext = new Date(friday);
    thursdayNext.setDate(thursdayNext.getDate() + 6);

    const weekStart = friday.toISOString().split('T')[0];
    const weekEnd = thursdayNext.toISOString().split('T')[0];

    console.log(`[Scheduler] Generating weekly report from ${weekStart} to ${weekEnd}`);

    // 获取周期内的活动量数据
    const activities = await db.findAll('activities', {});
    const weekActivities = activities.filter(a => {
      return a.activity_date >= weekStart && a.activity_date <= weekEnd && a.is_submitted;
    });

    // 按用户汇总分数
    const userScores = {};
    weekActivities.forEach(a => {
      if (!userScores[a.user_id]) {
        userScores[a.user_id] = { user_id: a.user_id, totalScore: 0, days: 0 };
      }
      userScores[a.user_id].totalScore += a.total_score || 0;
      userScores[a.user_id].days += 1;
    });

    // 排行
    const ranking = Object.values(userScores)
      .sort((a, b) => b.totalScore - a.totalScore)
      .map((item, index) => ({ rank: index + 1, ...item }));

    // 获取用户信息
    const users = await db.findAll('users', {});
    const userMap = {};
    users.forEach(u => { userMap[u.id] = u.name; });

    // 生成报告文案
    const top3 = ranking.slice(0, 3).map(item => {
      const name = userMap[item.user_id] || '未知';
      return `${item.rank}. ${name} (${item.totalScore}分)`;
    }).join('\n');

    const reportText = `📊 本周报分报告 (${weekStart.slice(5)} ~ ${weekEnd.slice(5)})

🏆 排行前三：
${top3}

📈 总填报人次：${weekActivities.length}
⭐ 参与人数：${ranking.length}

详细报表请登录：
https://money888-e3c.pages.dev/

感谢大家的坚持和努力！
周末好好休息，下周继续加油！💪`;

    // 发送给管理员
    const adminUserIds = config.admin?.userIds || [];
    for (const userId of adminUserIds) {
      try {
        await feishu.sendTextMessage(userId, reportText);
        console.log(`[Weekly Report] 已发送给管理员：${userId}`);
      } catch (error) {
        console.error(`[Weekly Report] 发送失败 ${userId}:`, error.message);
      }
    }

    return { success: true, weekStart, weekEnd, ranking };
  } catch (error) {
    console.error('[Scheduler] Weekly report error:', error);
    throw error;
  }
}

// 云函数入口
exports.handler = async (event, context) => {
  const { task } = JSON.parse(event.body || '{}');

  try {
    let result;
    switch (task) {
      case 'lock':
        result = await lockDailyActivities();
        break;
      case 'ai_coach':  // 千老师私信复盘 (21:05) - 第一批
        result = await triggerAICoach('first');
        break;
      case 'ai_coach_second':  // 千老师私信复盘 (24:05) - 第二批
        result = await triggerAICoach('second');
        break;
      case 'daily_analytics':
        result = await generateDailyAnalytics();
        break;
      case 'weekly_report':  // 周四晚 22:00 生成周报
        result = await generateWeeklyReport();
        break;
      case 'morning_reminder':  // 早 9 点群里发提醒
        result = await sendMorningReminder();
        break;
      case 'reset_weekly':  // 周五早 9 点数据清零
        result = await resetWeeklyData();
        break;
      default:
        throw new Error(`Unknown task: ${task}`);
    }

    return {
      statusCode: 200,
      body: JSON.stringify(result)
    };
  } catch (error) {
    console.error('[Scheduler] Error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};
