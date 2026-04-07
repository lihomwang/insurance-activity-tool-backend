// scripts/migrate-db.js
// 数据库迁移脚本 - 添加飞书用户 ID 字段

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = process.env.SQLITE_DB_PATH || path.join(__dirname, '../data/dev.db');

// 确保数据目录存在
const dir = path.dirname(dbPath);
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

const db = new Database(dbPath);

console.log('='.repeat(60));
console.log('📦 数据库迁移 - 添加飞书用户 ID 字段');
console.log('='.repeat(60));

try {
  // 检查现有表结构
  const tableInfo = db.pragma("table_info('users')");
  const columns = tableInfo.map(c => c.name);

  console.log('\n当前 users 表字段:', columns);

  // 添加缺失的字段
  const newColumns = [
    { name: 'feishu_user_id', type: 'TEXT' },
    { name: 'feishu_open_id', type: 'TEXT' },
    { name: 'feishu_union_id', type: 'TEXT' },
    { name: 'mobile', type: 'TEXT' }
  ];

  newColumns.forEach(col => {
    if (!columns.includes(col.name)) {
      db.exec(`ALTER TABLE users ADD COLUMN ${col.name} ${col.type}`);
      console.log(`✅ 已添加字段：${col.name}`);
    } else {
      console.log(`  字段已存在：${col.name}`);
    }
  });

  // 显示更新后的表结构
  const updatedInfo = db.pragma("table_info('users')");
  console.log('\n迁移后 users 表字段:');
  updatedInfo.forEach(c => console.log(`   - ${c.name} (${c.type})`));

  // 显示现有用户
  const users = db.prepare('SELECT * FROM users').all();
  console.log('\n现有用户:');
  users.forEach(u => console.log(`   - ${u.name} (${u.feishu_user_id || '无飞书 ID'})`));

  console.log('\n' + '='.repeat(60));
  console.log('✨ 数据库迁移完成！');
  console.log('='.repeat(60));

  db.close();
  process.exit(0);
} catch (error) {
  console.error('\n❌ 迁移失败:', error.message);
  console.error(error.stack);
  db.close();
  process.exit(1);
}
