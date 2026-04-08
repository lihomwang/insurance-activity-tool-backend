// scripts/test-ai-coach.js
// 测试 AI 教练私信功能

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import db from '../services/db.js';
import * as aiCoach from '../services/aiCoach.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 加载环境变量
dotenv.config({ path: join(__dirname, '../.env.local'), override: true });

async function main() {
  console.log('===  千老师 AI 教练 - 私信测试 ===\n');

  const today = new Date().toISOString().split('T')[0];
  console.log(`📅 今天日期：${today}`);

  // 获取所有用户
  const users = await db.findAll('users', {});
  console.log(`📊 系统用户数：${users.length}`);

  if (users.length === 0) {
    console.log('❌ 没有找到用户');
    return;
  }

  // 为每个用户创建测试活动量数据
  for (const user of users) {
    if (!user.feishu_user_id && !user.union_id) {
      console.log(`⏭️  跳过 "${user.name}" - 没有飞书 ID`);
      continue;
    }

    console.log(`\n👤 用户：${user.name}`);

    // 创建测试活动量
    const testData = {
      user_id: user.id,
      activity_date: today,
      new_leads: Math.floor(Math.random() * 3),
      referral: Math.floor(Math.random() * 2),
      invitation: Math.floor(Math.random() * 5),
      sales_meeting: Math.floor(Math.random() * 3),
      recruit_meeting: Math.floor(Math.random() * 2),
      business_plan: Math.floor(Math.random() * 2),
      deal: Math.floor(Math.random() * 2),
      eop_guest: Math.floor(Math.random() * 2),
      cc_assessment: Math.floor(Math.random() * 2),
      training: Math.floor(Math.random() * 2),
      is_submitted: 1,
      submitted_at: new Date()
    };
    testData.total_score =
      testData.new_leads * 1 +
      testData.referral * 3 +
      testData.invitation * 1 +
      testData.sales_meeting * 10 +
      testData.recruit_meeting * 10 +
      testData.business_plan * 1 +
      testData.deal * 10 +
      testData.eop_guest * 5 +
      testData.cc_assessment * 5 +
      testData.training * 10;

    console.log(`   总分：${testData.total_score}`);

    try {
      // 先删除可能存在的旧数据
      await db.query(`DELETE FROM activities WHERE user_id = ? AND activity_date = ?`, [user.id, today]);

      // 插入新数据
      await db.insert('activities', testData);
      console.log(`   ✅ 活动量数据已创建`);

      // 删除可能存在的旧对话
      await db.query(`DELETE FROM ai_conversations WHERE user_id = ? AND conversation_date = ?`, [user.id, today]);

      // 触发 AI 教练
      console.log(`   🚀 触发 AI 教练...`);

      const aiResult = await aiCoach.generateFirstMessage({
        name: user.name,
        totalScore: testData.total_score,
        dimensions: {
          new_leads: testData.new_leads,
          referral: testData.referral,
          invitation: testData.invitation,
          sales_meeting: testData.sales_meeting,
          recruit_meeting: testData.recruit_meeting,
          business_plan: testData.business_plan,
          deal: testData.deal,
          eop_guest: testData.eop_guest,
          cc_assessment: testData.cc_assessment,
          training: testData.training
        }
      });

      console.log(`   📩 AI 消息：${aiResult.message}`);

      // 发送私信
      const userId = user.feishu_user_id || user.union_id;
      if (userId) {
        await aiCoach.startAICoachConversations();
        console.log(`   ✅ 私信已发送到飞书`);
      } else {
        console.log(`   ⚠️  无法发送 - 没有飞书 ID`);
      }

    } catch (error) {
      console.error(`   ❌ 错误：${error.message}`);
    }

    // 避免频率限制
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  console.log('\n=== 🎉 测试完成 ===\n');
  console.log('💡 请查看飞书私信，千老师应该已经发送了消息~');
}

main().catch(console.error);
