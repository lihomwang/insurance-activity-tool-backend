import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '.env.local'), override: true });

// 动态导入 bitable，确保 dotenv 已加载
const bitable = (await import('./services/bitable.js')).default;

// Test 1: find record
console.log('\n=== Test 1: 查找 皮叔 2026-04-07 ===');
const record = await bitable.findRecord({ user_name: '皮叔', activity_date: '2026-04-07' });
console.log('找到:', record ? record.record_id + ' score=' + record.total_score : '未找到');

// Test 2: upsert
console.log('\n=== Test 2: 写入测试记录 ===');
const result = await bitable.upsertActivity({
  user_name: '测试用户',
  user_id: 'test_001',
  activity_date: '2026-04-11',
  new_leads: 5,
  sales_meeting: 1,
  deal: 1,
  total_score: 15,
  is_submitted: 1
});
console.log('写入成功, record_id:', result.record_id);

// Test 3: read back
console.log('\n=== Test 3: 回读 ===');
const readBack = await bitable.findRecord({ user_name: '测试用户', activity_date: '2026-04-11' });
console.log('回读:', readBack ? '成功' : '失败');
if (readBack) {
  console.log('  user_name:', readBack.user_name);
  console.log('  new_leads:', readBack.new_leads);
  console.log('  total_score:', readBack.total_score);
}

// Test 4: team stats
console.log('\n=== Test 4: 团队统计 ===');
const stats = await bitable.getTeamStats();
console.log(JSON.stringify(stats));

// Test 5: ranking
console.log('\n=== Test 5: 排行榜 ===');
const ranking = await bitable.getRanking();
console.log(JSON.stringify(ranking));

// Cleanup
if (readBack) {
  await bitable.updateRecord(readBack.record_id, {
    fields: { is_submitted: '否' }
  });
  console.log('\n已清理测试记录');
}

console.log('\n✅ 全部测试通过');
