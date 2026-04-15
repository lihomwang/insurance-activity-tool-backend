/**
 * 数据修正脚本 - 非交互版本
 * 自动清理重复记录：保留最高分的那条，其他标记为未提交
 */
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '..', '.env.local'), override: true });

const bitable = (await import('../services/bitable.js')).default;

// 解析命令行参数
const args = process.argv.slice(2);
const userFilter = args.find(a => a.startsWith('--user='))?.split('=')[1];
const dateFilter = args.find(a => a.startsWith('--date='))?.split('=')[1];
const dryRun = args.includes('--dry-run');
const force = args.includes('--force');

async function main() {
  console.log('=== 数据修正工具（自动模式）===\n');

  let records = await bitable.getAllRecords();

  const formatDate = (d) => {
    if (!d) return '-';
    if (typeof d === 'number') {
      return new Date(d).toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' });
    }
    return String(d).split('T')[0];
  };

  // 按用户+日期分组
  const groups = {};
  records.forEach(r => {
    if (!r.is_submitted || !r.user_name) return;
    const dateStr = formatDate(r.activity_date);
    const key = `${r.user_name}|||${dateStr}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(r);
  });

  // 过滤
  let duplicateKeys = Object.entries(groups).filter(([key]) => {
    const [name, date] = key.split('|||');
    if (userFilter && !name.includes(userFilter)) return false;
    if (dateFilter && date !== dateFilter) return false;
    return true;
  });

  // 只处理有重复的组
  const duplicates = duplicateKeys.filter(([, recs]) => recs.length > 1);

  if (duplicates.length === 0) {
    console.log('✅ 没有发现重复记录');
    return;
  }

  console.log(`发现 ${duplicates.length} 组重复记录：\n`);

  for (let i = 0; i < duplicates.length; i++) {
    const [key, recs] = duplicates[i];
    const [name, date] = key.split('|||');
    console.log(`[${i}] ${name} | ${date} | ${recs.length} 条记录:`);
    recs.forEach((r, j) => {
      console.log(`    [${j}] record_id=${r.record_id} total_score=${r.total_score} new_leads=${r.new_leads} referral=${r.referral} invitation=${r.invitation} sales_meeting=${r.sales_meeting} recruit_meeting=${r.recruit_meeting} deal=${r.deal}`);
    });
    console.log('');
  }

  // 自动清理策略：
  // 1. 如果组内所有记录分数相同 -> 保留任意一条
  // 2. 如果有不同分数 -> 保留较低分（翻倍bug：高分=2x，低分=真实值）
  // 3. 特殊情况：周茉4/14有16条，15条2分+1条12分 -> 12分是翻倍后的真实值(6x2)
  //    真实值应为6分，但6分不在记录中 -> 保留12分（至少包含了完整维度数据）

  if (dryRun) {
    console.log('\n🔍 预览模式，不会执行任何修改\n');
    let totalRemoved = 0;
    for (const [key, recs] of duplicates) {
      const [name, date] = key.split('|||');
      const scores = recs.map(r => r.total_score);
      const uniqueScores = [...new Set(scores)];

      let keep, remove;
      if (uniqueScores.length === 1) {
        // 所有分数相同，保留第一条
        keep = recs[0];
        remove = recs.slice(1);
      } else if (recs.length > 3) {
        // 多条记录（如周茉4/14的16条）-> 保留最高分（包含完整数据）
        const sorted = [...recs].sort((a, b) => b.total_score - a.total_score);
        keep = sorted[0];
        remove = sorted.slice(1);
      } else {
        // 2条不同分数 -> 保留较低分（真实值）
        const sorted = [...recs].sort((a, b) => a.total_score - b.total_score);
        keep = sorted[0];
        remove = sorted.slice(1);
      }

      totalRemoved += remove.length;
      console.log(`${name} | ${date}: 保留 record_id=${keep.record_id} (score=${keep.total_score})，标记 ${remove.length} 条为未提交`);
    }
    console.log(`\n总计将标记 ${totalRemoved} 条记录为未提交`);
    return;
  }

  if (!force) {
    console.log('\n⚠️  将自动保留每组最高分记录，标记其他记录为未提交');
    console.log('使用 --force 参数确认执行，或 --dry-run 预览');
    return;
  }

  console.log('\n开始清理...\n');

  let totalRemoved = 0;
  for (const [key, recs] of duplicates) {
    const [name, date] = key.split('|||');
    const scores = recs.map(r => r.total_score);
    const uniqueScores = [...new Set(scores)];

    let keep, remove;
    if (uniqueScores.length === 1) {
      keep = recs[0];
      remove = recs.slice(1);
    } else if (recs.length > 3) {
      const sorted = [...recs].sort((a, b) => b.total_score - a.total_score);
      keep = sorted[0];
      remove = sorted.slice(1);
    } else {
      const sorted = [...recs].sort((a, b) => a.total_score - b.total_score);
      keep = sorted[0];
      remove = sorted.slice(1);
    }

    console.log(`${name} | ${date}: 保留 record_id=${keep.record_id} (score=${keep.total_score})`);

    for (const r of remove) {
      try {
        // Bitable 的 is_submitted 是单选字段，需要用数组格式
        await bitable.updateRecord(r.record_id, {
          fields: { is_submitted: [{ name: '否' }] }
        });
        console.log(`  ✓ 已标记 ${r.record_id} (score=${r.total_score}) 为未提交`);
        totalRemoved++;
      } catch (err) {
        console.log(`  ✗ 标记失败: ${err.message}`);
      }
    }
    console.log('');
  }

  console.log(`\n✅ 清理完成！共标记 ${totalRemoved} 条记录为未提交`);
}

main().catch(console.error);
