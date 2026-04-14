import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '.env.local'), override: true });

const bitable = (await import('./services/bitable.js')).default;

const todayBJ = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' });
console.log(`今日北京日期: ${todayBJ}\n`);

// 模拟 API 调用：getUserActivities
// 测试1: user.id 为 null（强制走 user_name 回退）
console.log('=== Test 1: getUserActivities({ name: "周茉", id: null }) ===');
const r1 = await bitable.getUserActivities({ name: '周茉', id: null }, todayBJ);
console.log(`Result: ${r1 ? `total_score=${r1.total_score}` : 'NULL'}\n`);

// 测试2: 模拟真实 API 场景 - user.id 存在但不匹配 Bitable
console.log('=== Test 2: getUserActivities({ name: "周茉", id: "ou_nonexistent123" }) ===');
const r2 = await bitable.getUserActivities({ name: '周茉', id: 'ou_nonexistent123' }, todayBJ);
console.log(`Result: ${r2 ? `total_score=${r2.total_score}` : 'NULL'}\n`);

// 测试3: 用 listRecords 直接测试
console.log('=== Test 3: listRecords({ user_name: "周茉", activity_date: "' + todayBJ + '" }) ===');
const r3 = await bitable.listRecords({ user_name: '周茉', activity_date: todayBJ }, 1);
console.log(`Result: ${r3.length} records, first: ${r3[0] ? `total_score=${r3[0].total_score}` : 'NULL'}\n`);

console.log('✅ 测试完成');
