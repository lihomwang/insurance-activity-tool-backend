// scripts/trigger-ai-coach.js
// 手动触发千老师 AI 教练私信

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import db from '../services/db.js';
import { startAICoachConversations } from '../services/aiCoach.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 加载环境变量
dotenv.config({ path: join(__dirname, '../.env.local'), override: true });

async function main() {
  console.log('===  千老师 AI 教练 - 私信触发测试 ===\n');

  const today = new Date().toISOString().split('T')[0];
  console.log(`📅 今天日期：${today}`);

  // 检查今日已提交活动量的用户
  const activities = await db.findAll('activities', {
    activity_date: today,
    is_submitted: 1
  });

  console.log(`\n📊 今日已提交活动量的用户：${activities.length} 人`);

  if (activities.length === 0) {
    console.log('\n⚠️  今日还没有用户提交活动量');
    console.log('提示：请先在 H5 页面提交活动量测试数据');

    // 创建一个测试数据
    console.log('\n📝 创建测试活动量数据...');
    const testUser = await db.findOne('users', {});
    if (testUser) {
      await db.insert('activities', {
        user_id: testUser.id,
        activity_date: today,
        new_leads: 2,
        referral: 1,
        invitation: 3,
        sales_meeting: 2,
        recruit_meeting: 1,
        business_plan: 1,
        deal: 1,
        eop_guest: 0,
        cc_assessment: 1,
        training: 0,
        total_score: 58,
        is_submitted: 1,
        submitted_at: new Date()
      });
      console.log(`✅ 已为用户 "${testUser.name}" 创建测试数据`);
    } else {
      console.log('❌ 没有找到任何用户，请先登录 H5 创建用户');
      return;
    }
  }

  console.log('\n🚀 开始触发 AI 教练私信...\n');

  try {
    await startAICoachConversations();
    console.log('\n✅ AI 教练私信触发完成！');
    console.log('\n💡 请查看飞书私信，千老师应该已经发送了第一条消息~');
  } catch (error) {
    console.error('\n❌ 触发失败:', error.message);
    console.error(error.stack);
  }
}

main().catch(console.error);
