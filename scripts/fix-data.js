/**
 * 数据修正脚本 - 修正因双记录 bug 导致的 inflated scores
 * 使用方法：
 *   node scripts/fix-data.js          # 查看所有记录
 *   node scripts/fix-data.js --user 千老师   # 查看指定用户
 */
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import readline from 'readline';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '..', '.env.local'), override: true });

const bitable = (await import('../services/bitable.js')).default;

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function ask(question) {
  return new Promise(resolve => rl.question(question, resolve));
}

// 解析命令行参数
const args = process.argv.slice(2);
const userFilter = args.find(a => a === '--user') ? args[args.indexOf('--user') + 1] : null;
const dateFilter = args.find(a => a === '--date') ? args[args.indexOf('--date') + 1] : null;

async function main() {
  console.log('=== 数据修正工具 ===\n');

  let records = await bitable.getAllRecords();

  // 格式化日期
  const formatDate = (d) => {
    if (!d) return '-';
    if (typeof d === 'number') {
      return new Date(d).toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' });
    }
    return String(d).split('T')[0];
  };

  // 按用户+日期分组，找出可能的双记录
  const groups = {};
  records.forEach(r => {
    if (!r.is_submitted || !r.user_name) return;
    const dateStr = formatDate(r.activity_date);
    const key = `${r.user_name}|||${dateStr}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(r);
  });

  // 过滤
  let duplicateKeys = Object.entries(groups).filter(([key, recs]) => {
    const [name] = key.split('|||');
    const [, date] = key.split('|||');
    if (userFilter && !name.includes(userFilter)) return false;
    if (dateFilter && date !== dateFilter) return false;
    return recs.length > 1;
  });

  if (duplicateKeys.length === 0) {
    console.log('✅ 没有发现重复记录');
    rl.close();
    return;
  }

  console.log(`发现 ${duplicateKeys.length} 组重复记录：\n`);

  // 显示所有重复组
  for (let i = 0; i < duplicateKeys.length; i++) {
    const [key, recs] = duplicateKeys[i];
    const [name, date] = key.split('|||');
    console.log(`[${i}] ${name} | ${date} | ${recs.length} 条记录:`);
    recs.forEach((r, j) => {
      console.log(`    [${j}] record_id=${r.record_id} total_score=${r.total_score} new_leads=${r.new_leads} referral=${r.referral} invitation=${r.invitation} sales_meeting=${r.sales_meeting} recruit_meeting=${r.recruit_meeting} deal=${r.deal}`);
    });
    console.log('');
  }

  // 交互修正
  console.log('\n--- 交互修正 ---');
  console.log('选择操作：');
  console.log('  d <组号>  - 删除该组所有记录（确认重复）');
  console.log('  k <组号>  - 保留最高分记录，删除其他');
  console.log('  r <组号>  - 保留最新记录，删除其他');
  console.log('  q         - 退出');
  console.log('');

  while (true) {
    const answer = await ask('操作 (d/k/r + 组号，或 q 退出): ');
    const trimmed = answer.trim();

    if (trimmed === 'q' || trimmed === 'quit') {
      console.log('退出修正工具');
      break;
    }

    const parts = trimmed.split(/\s+/);
    const action = parts[0].toLowerCase();
    const groupIdx = parseInt(parts[1]);

    if (isNaN(groupIdx) || groupIdx < 0 || groupIdx >= duplicateKeys.length) {
      console.log('无效的组号，请重试');
      continue;
    }

    const [key, recs] = duplicateKeys[groupIdx];
    const [name, date] = key.split('|||');

    if (action === 'd') {
      // 删除所有记录
      console.log(`将删除 ${name} | ${date} 的所有 ${recs.length} 条记录`);
      const confirm = await ask('确认删除？(y/n): ');
      if (confirm.trim().toLowerCase() === 'y') {
        for (const r of recs) {
          try {
            await bitable.updateRecord(r.record_id, { fields: { is_submitted: '否' } });
            console.log(`  ✓ 已标记 ${r.record_id} 为未提交`);
          } catch (err) {
            console.log(`  ✗ 删除失败: ${err.message}`);
          }
        }
        console.log('完成\n');
      }
    } else if (action === 'k') {
      // 保留最高分记录，删除其他
      const sorted = [...recs].sort((a, b) => b.total_score - a.total_score);
      const keep = sorted[0];
      console.log(`将保留 record_id=${keep.record_id} (score=${keep.total_score})，删除其他`);
      const confirm = await ask('确认？(y/n): ');
      if (confirm.trim().toLowerCase() === 'y') {
        for (const r of sorted.slice(1)) {
          try {
            await bitable.updateRecord(r.record_id, { fields: { is_submitted: '否' } });
            console.log(`  ✓ 已标记 ${r.record_id} 为未提交`);
          } catch (err) {
            console.log(`  ✗ 删除失败: ${err.message}`);
          }
        }
        console.log('完成\n');
      }
    } else if (action === 'r') {
      // 保留最新记录（按 record_id 排序，后创建的在后面）
      const sorted = [...recs].sort((a, b) => a.record_id.localeCompare(b.record_id));
      const keep = sorted[sorted.length - 1];
      console.log(`将保留 record_id=${keep.record_id} (最新)，删除其他`);
      const confirm = await ask('确认？(y/n): ');
      if (confirm.trim().toLowerCase() === 'y') {
        for (const r of sorted.slice(0, -1)) {
          try {
            await bitable.updateRecord(r.record_id, { fields: { is_submitted: '否' } });
            console.log(`  ✓ 已标记 ${r.record_id} 为未提交`);
          } catch (err) {
            console.log(`  ✗ 删除失败: ${err.message}`);
          }
        }
        console.log('完成\n');
      }
    } else {
      console.log('未知操作，请输入 d/k/r + 组号，或 q 退出');
    }
  }

  rl.close();
}

main().catch(console.error);
