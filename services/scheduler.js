/**
 * 定时任务调度器
 * 集成到 api-server.js 中运行
 */

// bitable.js 会加载 .env.local，必须先导入
import bitable from './bitable.js';
import aiCoach from './aiCoach-bitable.js';
import cron from 'node-cron';
import axios from 'axios';

// 群聊配置
const GROUP_CHAT_IDS = process.env.FEISHU_GROUP_CHAT_IDS
  ? process.env.FEISHU_GROUP_CHAT_IDS.split(',')
  : [];

// 管理员 open_id 配置（飞书用户 open_id，格式: ou_xxxxx）
const ADMIN_OPEN_IDS = process.env.ADMIN_OPEN_IDS
  ? process.env.ADMIN_OPEN_IDS.split(',').map(id => id.trim()).filter(Boolean)
  : [];

const H5_APP_ID = process.env.H5_APP_ID;
const H5_APP_SECRET = process.env.H5_APP_SECRET;
const FEISHU_APP_ID = process.env.FEISHU_APP_ID;
const FEISHU_APP_SECRET = process.env.FEISHU_APP_SECRET;

// 填报链接
const REPORT_URL = process.env.REPORT_URL || 'https://happylife888.netlify.app/';

/**
 * 获取 H5 应用的 tenant_access_token
 */
async function getH5Token() {
  const resp = await axios.post(
    'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal',
    { app_id: H5_APP_ID, app_secret: H5_APP_SECRET }
  );
  if (resp.data.code !== 0) throw new Error('获取 H5 token 失败: ' + resp.data.msg);
  return resp.data.tenant_access_token;
}

/**
 * 获取长连接应用的 tenant_access_token
 */
async function getWriteToken() {
  const resp = await axios.post(
    'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal',
    { app_id: FEISHU_APP_ID, app_secret: FEISHU_APP_SECRET }
  );
  if (resp.data.code !== 0) throw new Error('获取写 token 失败: ' + resp.data.msg);
  return resp.data.tenant_access_token;
}

/**
 * 发送群消息
 */
async function sendGroupMessage(chatId, text) {
  const token = await getH5Token();
  const resp = await axios.post(
    'https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=chat_id',
    {
      receive_id: chatId,
      msg_type: 'text',
      content: JSON.stringify({ text })
    },
    {
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json'
      }
    }
  );
  return resp.data.data;
}

/**
 * 发送私信给管理员
 * @param {string} openId - 管理员的 open_id (格式: ou_xxxxx)
 */
async function sendPrivateMessage(openId, text) {
  const token = await getWriteToken();
  const resp = await axios.post(
    'https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=open_id',
    {
      receive_id: openId,
      msg_type: 'text',
      content: JSON.stringify({ text })
    },
    {
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json'
      }
    }
  );
  return resp.data.data;
}

/**
 * 每天 9:00 群里发填报提醒
 */
async function sendMorningReminder() {
  if (GROUP_CHAT_IDS.length === 0) {
    console.log('[Scheduler] 未配置群聊 ID，跳过早提醒');
    return;
  }

  const today = new Date();
  const weekDays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  const dateText = `${today.getMonth() + 1}月${today.getDate()}日 ${weekDays[today.getDay()]}`;

  const messages = [
    `早啊，各位！☀️\n${dateText}，新的一天开始啦！\n\n别忘了填报今天的活动量哦～\n👉 ${REPORT_URL}\n\n今晚 21:00 截止 💪`,
    `各位精英早上好！🌟\n${dateText}，今天也要加油哦！\n\n活动量填报入口：${REPORT_URL}\n⏰ 截止时间：今晚 21:00`,
    `早！☀️ ${dateText}\n今天的目标是什么？\n\n别忘了：活动量填报 → ${REPORT_URL}\n截止时间：21:00`,
  ];

  const message = messages[Math.floor(Math.random() * messages.length)];

  let sentCount = 0;
  for (const chatId of GROUP_CHAT_IDS) {
    try {
      await sendGroupMessage(chatId, message);
      sentCount++;
      console.log(`[Scheduler] 早报提醒已发送到群：${chatId}`);
      await new Promise(r => setTimeout(r, 500));
    } catch (err) {
      console.error(`[Scheduler] 早报提醒发送失败 ${chatId}:`, err.message);
    }
  }

  console.log(`[Scheduler] 早报提醒完成，已发送 ${sentCount}/${GROUP_CHAT_IDS.length} 个群`);
}

/**
 * 每周四 22:00 生成周报
 * 统计上周五到这周四的数据
 */
async function generateWeeklyReport() {
  console.log('[Scheduler] 开始生成周报...');

  try {
    const today = new Date();
    const dayOfWeek = today.getDay();

    // 计算本周五到下周四的日期范围
    let daysUntilFriday = (5 - dayOfWeek + 7) % 7;
    if (!(dayOfWeek === 4 || dayOfWeek === 5)) {
      daysUntilFriday = daysUntilFriday - 7;
    }
    const friday = new Date(today);
    friday.setDate(friday.getDate() + daysUntilFriday);
    const thursdayNext = new Date(friday);
    thursdayNext.setDate(thursdayNext.getDate() + 6);

    const weekStart = friday.toISOString().split('T')[0];
    const weekEnd = thursdayNext.toISOString().split('T')[0];

    console.log(`[Scheduler] 周报周期: ${weekStart} ~ ${weekEnd}`);

    const stats = await bitable.getTeamStats();
    const dimensions = await bitable.getDimensionStats();
    const ranking = await bitable.getRanking();

    // 维度中文名
    const dimNames = {
      new_leads: '新增准客户', referral: '转介绍', invitation: '邀约',
      sales_meeting: '销售面谈', recruit_meeting: '增员面谈',
      business_plan: '事业计划', deal: '成交', eop_guest: 'EOP 嘉宾',
      cc_assessment: 'CC 测评', training: '送训'
    };

    let dimText = '';
    for (const [key, val] of Object.entries(dimensions)) {
      if (val.count > 0) {
        dimText += `${dimNames[key] || key}: ${val.count} 次 (${val.score}分)\n`;
      }
    }

    const top3 = ranking.slice(0, 3).map(item =>
      `${item.rank}. ${item.name} (${item.score}分)`
    ).join('\n');

    const reportText = `📊 本周活动量报告 (${weekStart.slice(5)} ~ ${weekEnd.slice(5)})

🏆 排行前三：
${top3}

📈 团队统计：
• 参与人数：${stats.totalMembers} 人
• 人均得分：${stats.avgScore} 分
• 总分：${stats.totalScore} 分
• 本周之星：${stats.starName}

📋 各维度汇总：
${dimText}
👉 详细报表：${REPORT_URL}

感谢大家的坚持和努力！周末好好休息，下周继续加油！💪`;

    // 发送给管理员
    if (ADMIN_OPEN_IDS.length === 0) {
      console.log('[Scheduler] 未配置管理员 open_id，周报仅打印');
      console.log(reportText);
      return { success: true, report: reportText };
    }

    let sentCount = 0;
    for (const openId of ADMIN_OPEN_IDS) {
      try {
        await sendPrivateMessage(openId, reportText);
        sentCount++;
        console.log(`[Scheduler] 周报已发送给管理员：${openId}`);
        await new Promise(r => setTimeout(r, 1000));
      } catch (err) {
        console.error(`[Scheduler] 周报发送失败 ${openId}:`, err.message);
      }
    }

    console.log(`[Scheduler] 周报完成，已发送 ${sentCount}/${ADMIN_OPEN_IDS.length} 个管理员`);
    return { success: true, sent: sentCount };

  } catch (err) {
    console.error('[Scheduler] 周报生成失败:', err.message);
    throw err;
  }
}

/**
 * 每周五 9:00 数据清零（重置本周周期）
 * 将上周所有记录的 is_submitted 标记为否，进入新周期
 */
async function resetWeeklyData() {
  console.log('[Scheduler] 开始清零本周数据...');

  const today = new Date();
  const dayOfWeek = today.getDay();

  if (dayOfWeek !== 5) {
    console.log(`[Scheduler] 今天不是周五（周${dayOfWeek}），跳过清零`);
    return { success: true, message: 'Not Friday, skipped' };
  }

  try {
    const records = await bitable.getAllRecords();
    let resetCount = 0;

    // 更新所有已提交的记录为未提交
    for (const record of records) {
      if (record.is_submitted && record.record_id) {
        try {
          await bitable.updateRecord(record.record_id, {
            fields: { is_submitted: '否' }
          });
          resetCount++;
        } catch (err) {
          console.error(`[Scheduler] 重置记录 ${record.record_id} 失败:`, err.message);
        }
      }
    }

    console.log(`[Scheduler] 清零完成，已重置 ${resetCount} 条记录`);
    return { success: true, resetCount };
  } catch (err) {
    console.error('[Scheduler] 清零失败:', err.message);
    throw err;
  }
}

/**
 * 启动所有定时任务
 */
function startScheduler() {
  console.log('\n[Scheduler] 启动定时任务...');

  // 每天 9:00 早报提醒
  cron.schedule('0 9 * * *', () => {
    console.log('[Scheduler] 触发：早报提醒');
    sendMorningReminder().catch(err =>
      console.error('[Scheduler] 早报提醒失败:', err)
    );
  }, { timezone: 'Asia/Shanghai' });
  console.log('  ✅ 每天 09:00 - 早报提醒');

  // 每天 21:05 AI 教练复盘
  cron.schedule('5 21 * * *', () => {
    console.log('[Scheduler] 触发：AI 教练复盘');
    aiCoach.startAICoachConversations().catch(err =>
      console.error('[Scheduler] AI 教练失败:', err)
    );
  }, { timezone: 'Asia/Shanghai' });
  console.log('  ✅ 每天 21:05 - AI 教练复盘');

  // 每周四 22:00 周报
  cron.schedule('0 22 * * 4', () => {
    console.log('[Scheduler] 触发：周报生成');
    generateWeeklyReport().catch(err =>
      console.error('[Scheduler] 周报生成失败:', err)
    );
  }, { timezone: 'Asia/Shanghai' });
  console.log('  ✅ 每周四 22:00 - 周报生成');

  // 每周五 9:00 数据清零
  cron.schedule('0 9 * * 5', () => {
    console.log('[Scheduler] 触发：数据清零');
    resetWeeklyData().catch(err =>
      console.error('[Scheduler] 数据清零失败:', err)
    );
  }, { timezone: 'Asia/Shanghai' });
  console.log('  ✅ 每周五 09:00 - 数据清零');

  console.log('[Scheduler] 所有定时任务已启动\n');
}

export default {
  startScheduler,
  sendMorningReminder,
  generateWeeklyReport,
  resetWeeklyData
};
