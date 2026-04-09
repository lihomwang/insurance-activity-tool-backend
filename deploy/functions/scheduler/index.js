// functions/scheduler/index.js
// 定时任务 - 飞书云函数入口

const db = require('../../services/db');
const aiCoach = require('../../services/aiCoach');
const feishu = require('../../services/feishu');
const config = require('../../config');

/**
 * 锁定当日数据 (每天 21:00 执行)
 */
async function lockDailyActivities() {
  try {
    const today = new Date().toISOString().split('T')[0];

    const result = await db.update(
      'activities',
      { activity_date: today },
      { is_locked: true }
    );

    console.log(`[Scheduler] Locked ${result?.rowCount || 0} activity records for ${today}`);
    return { success: true, locked: result?.rowCount || 0 };
  } catch (error) {
    console.error('[Scheduler] Lock error:', error);
    throw error;
  }
}

/**
 * 触发 AI 教练对话 (每天 21:05 执行)
 */
async function triggerAICoach() {
  try {
    await aiCoach.startAICoachConversations();
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

    // 获取当日数据
    const activities = await db.findAll('activities', { activity_date: today });
    const conversations = await db.findAll('ai_conversations', { conversation_date: today });

    // 计算统计数据
    const submittedActivities = activities.filter(a => a.is_submitted);
    const totalMembers = activities.length;
    const submittedCount = submittedActivities.length;
    const avgScore = submittedCount > 0
      ? (submittedActivities.reduce((sum, a) => sum + a.total_score, 0) / submittedCount).toFixed(1)
      : 0;
    const maxScore = Math.max(...submittedActivities.map(a => a.total_score), 0);
    const minScore = Math.min(...submittedActivities.map(a => a.total_score), 0);

    // 获取风险预警
    const riskAlerts = await db.findAll('risk_alerts', {}, {
      orderBy: 'created_at DESC',
      limit: 100
    });
    const todayAlerts = riskAlerts.filter(a =>
      new Date(a.created_at).toISOString().split('T')[0] === today
    );
    const highRiskCount = todayAlerts.filter(a => a.risk_level === 'high' || a.risk_level === 'critical').length;

    // 表现优秀者
    const topPerformers = submittedActivities
      .sort((a, b) => b.total_score - a.total_score)
      .slice(0, 3)
      .map(a => ({ user_id: a.user_id, score: a.total_score }));

    // 保存分析结果
    await db.insert('daily_analytics', {
      analytics_date: today,
      total_members: totalMembers,
      submitted_count: submittedCount,
      avg_score: avgScore,
      max_score: maxScore,
      min_score: minScore,
      dimension_stats: JSON.stringify({}), // 可以详细计算各维度
      ai_conversation_count: conversations.length,
      avg_question_count: conversations.length > 0
        ? (conversations.reduce((sum, c) => sum + c.question_count, 0) / conversations.length).toFixed(1)
        : 0,
      avg_mood_score: 0, // 需要情绪分析
      risk_alert_count: todayAlerts.length,
      high_risk_count: highRiskCount,
      top_performers: JSON.stringify(topPerformers),
      common_issues: JSON.stringify([])
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
 */
async function generateWeeklyReport() {
  try {
    // 计算本周周期 (周五到周四)
    const today = new Date();
    const dayOfWeek = today.getDay();

    // 找到本周五 (如果今天是周四或周五，就是今天/明天；否则是上个周五)
    let daysUntilFriday = (5 - dayOfWeek + 7) % 7;
    if (dayOfWeek === 4 || dayOfWeek === 5) {
      // 周四或周五，本周五就是今天或明天
    } else {
      // 其他日子，找上个周五
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

    // TODO: 实现完整的周报生成逻辑
    // 1. 获取 7 天的活动量数据
    // 2. 获取 7 天的 AI 对话
    // 3. AI 分析三大优秀和三大问题
    // 4. 发送给管理员

    return { success: true, weekStart, weekEnd };
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
      case 'ai_coach':
        result = await triggerAICoach();
        break;
      case 'daily_analytics':
        result = await generateDailyAnalytics();
        break;
      case 'weekly_report':
        result = await generateWeeklyReport();
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
