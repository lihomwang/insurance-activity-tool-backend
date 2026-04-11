import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '.env.local'), override: true });

import bitable from './services/bitable.js';

// Test 1: find record
console.log('\n=== Test 1: Find 皮叔 2026-04-07 ===');
const record = await bitable.findRecord({ user_name: '皮叔', activity_date: '2026-04-07' });
console.log('Found:', record ? record.record_id + ' score=' + record.total_score : 'NOT FOUND');

// Test 2: upsert
console.log('\n=== Test 2: Upsert test record ===');
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
console.log('Upsert:', result.record_id);

// Test 3: read back
console.log('\n=== Test 3: Read back ===');
const readBack = await bitable.findRecord({ user_name: '测试用户', activity_date: '2026-04-11' });
console.log('Read back:', readBack ? 'YES' : 'NO');
if (readBack) {
  console.log('  user_name:', readBack.user_name);
  console.log('  new_leads:', readBack.new_leads);
  console.log('  total_score:', readBack.total_score);
}

// Test 4: team stats
console.log('\n=== Test 4: Team stats ===');
const stats = await bitable.getTeamStats();
console.log(JSON.stringify(stats));

// Test 5: ranking
console.log('\n=== Test 5: Ranking ===');
const ranking = await bitable.getRanking();
console.log(JSON.stringify(ranking));

// Cleanup
if (readBack) {
  await bitable.updateRecord(readBack.record_id, {
    fields: { is_submitted: [{ name: '否' }] }
  });
  console.log('\nCleaned up test record');
}
