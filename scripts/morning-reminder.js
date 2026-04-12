// scripts/morning-reminder.js
// 每日早上提醒 - 在群里发送活动量填报链接
// 每周五早 9 点数据清零

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import db from '../services/db.js';
import axios from 'axios';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 加载 .env.local 文件
dotenv.config({ path: join(__dirname, '../.env.local') });

// H5 应用配置（用于发送群消息）
const H5_APP_ID = process.env.H5_APP_ID || 'cli_a95a6b370af8dcc8';
const H5_APP_SECRET = process.env.H5_APP_SECRET || 'v2XoWID99STcoN1l1ijQtTk0ryEdjizF';

/**
 * 获取 H5 应用的 access token
 */
async function getH5AppToken() {
  const response = await axios.post(
    'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal',
    { app_id: H5_APP_ID, app_secret: H5_APP_SECRET }
  );
  return response.data.tenant_access_token;
}

/**
 * 发送群消息（使用 H5 应用身份）
 */
async function sendGroupMessage(chatId, text) {
  const token = await getH5AppToken();

  const response = await axios.post(
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

  return response.data.data;
}

/**
 * 每天早上 9:00 在群里发送填报提醒
 */
async function sendMorningReminder() {
  try {
    console.log('[Morning Reminder] 开始发送早报提醒...');

    // 获取所有群聊（从配置或数据库读取）
    const groupChatIds = process.env.FEISHU_GROUP_CHAT_IDS
      ? process.env.FEISHU_GROUP_CHAT_IDS.split(',')
      : [];

    if (groupChatIds.length === 0) {
      console.log('[Morning Reminder] 未配置群聊 ID，跳过');
      return { success: true, message: 'No group chat IDs configured' };
    }

    const today = new Date().toISOString().split('T')[0];
    const dateObj = new Date(today);
    const weekDays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    const dateText = `${dateObj.getMonth() + 1}月${dateObj.getDate()}日 ${weekDays[dateObj.getDay()]}`;

    // 填报链接
    const reportUrl = process.env.REPORT_URL || 'https://money888-e3c.pages.dev/';

    // 早安文案
    const morningMessages = [
      `早啊，各位！☀️\n${dateText}，新的一天开始啦！\n\n别忘了填报今天的活动量哦～\n👉 ${reportUrl}\n\n今晚 21:00 截止，千老师会找你复盘的 💪`,

      `各位精英早上好！🌟\n${dateText}，今天也要加油哦！\n\n活动量填报入口：${reportUrl}\n⏰ 截止时间：今晚 21:00\n\n千老师在等你分享今天的战绩呢！`,

      `早安，乐高骑士团的战士们！⚔️\n${dateText}，战斗开始啦！\n\n记得填报活动量：${reportUrl}\n今晚 21:00 千老师会找你聊聊今天的表现～\n\n冲鸭！🔥`,

      `早！☀️ ${dateText}\n今天的目标是什么？\n\n别忘了：活动量填报 → ${reportUrl}\n截止时间：21:00\n\n千老师相信你今天会很棒！💪`,

      `各位早！🌈\n${dateText}，阳光正好！\n\n活动量记得填：${reportUrl}\n今晚 21:00，千老师等你分享收获～\n\n今天也要全力以赴哦！✨`,

      `早安打工人！💪\n${dateText}，又是搞钱的一天！\n\n活动量填报：${reportUrl}\n⏰ 21:00 截止\n\n千老师：填报的人今天都会开单！🎯`,

      `早啊各位！🌟 ${dateText}\n今天也要努力哦～\n\n活动量别忘了填：${reportUrl}\n今晚 21:00 千老师会找你复盘\n\n加油，我看好你！🔥`
    ];

    const message = morningMessages[Math.floor(Math.random() * morningMessages.length)];

    // 发送给每个群
    let sentCount = 0;
    for (const chatId of groupChatIds) {
      try {
        await sendGroupMessage(chatId, message);
        sentCount++;
        console.log(`[Morning Reminder] 已发送到群：${chatId}`);
        // 避免频率限制
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error) {
        console.error(`[Morning Reminder] 发送失败 ${chatId}:`, error.message);
      }
    }

    console.log(`[Morning Reminder] 完成，已发送 ${sentCount}/${groupChatIds.length} 个群`);
    return { success: true, sent: sentCount, total: groupChatIds.length };

  } catch (error) {
    console.error('[Morning Reminder] Error:', error.message);
    throw error;
  }
}

/**
 * 每周五早 9:00 数据清零
 */
async function resetWeeklyData() {
  try {
    console.log('[Weekly Reset] 开始清零本周数据...');

    const today = new Date();
    const dayOfWeek = today.getDay();

    // 只有周五执行
    if (dayOfWeek !== 5) {
      console.log('[Weekly Reset] 今天不是周五，跳过');
      return { success: true, message: 'Not Friday, skipped' };
    }

    // 获取所有活动记录
    const activities = await db.findAll('activities', {});

    let resetCount = 0;
    for (const activity of activities) {
      try {
        // 将该用户的 activity_date 更新为今天（周五），所有计数清零
        await db.upsert('activities', {
          user_id: activity.user_id,
          activity_date: new Date().toISOString().split('T')[0],
          new_leads: 0,
          referral: 0,
          invitation: 0,
          sales_meeting: 0,
          recruit_meeting: 0,
          business_plan: 0,
          deal: 0,
          eop_guest: 0,
          cc_assessment: 0,
          training: 0,
          total_score: 0,
          is_locked: 0,
          is_submitted: 0
        }, 'user_id, activity_date');
        resetCount++;
      } catch (error) {
        console.error(`[Weekly Reset] 重置用户 ${activity.user_id} 失败:`, error.message);
      }
    }

    console.log(`[Weekly Reset] 完成，已重置 ${resetCount} 条记录`);
    return { success: true, resetCount };

  } catch (error) {
    console.error('[Weekly Reset] Error:', error.message);
    throw error;
  }
}

// CLI 入口
const args = process.argv.slice(2);
if (args.includes('--reset-weekly')) {
  resetWeeklyData()
    .then(result => {
      console.log('Weekly reset completed:', result);
      process.exit(0);
    })
    .catch(error => {
      console.error('Weekly reset failed:', error);
      process.exit(1);
    });
} else {
  sendMorningReminder()
    .then(result => {
      console.log('Morning reminder completed:', result);
      process.exit(0);
    })
    .catch(error => {
      console.error('Morning reminder failed:', error);
      process.exit(1);
    });
}

export { sendMorningReminder, resetWeeklyData };
