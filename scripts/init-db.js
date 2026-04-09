// scripts/init-db.js
// SQLite 数据库初始化脚本

require('dotenv').config();
const db = require('../services/db-sqlite');

console.log('='.repeat(50));
console.log('📦 初始化数据库');
console.log('='.repeat(50));

try {
  // 初始化表结构
  db.initTables();
  console.log('✅ 表结构创建成功');

  // 插入测试数据
  const testUser = {
    id: 'test_user_001',
    name: '皮叔',
    avatar: 'https://api.dicebear.com/7.x/miniavs/svg?seed=Felix',
    department: '乐高骑士团队',
    role: 'member'
  };

  const database = db.getDb();
  const stmt = database.prepare(`
    INSERT OR REPLACE INTO users (id, name, avatar, department, role)
    VALUES (?, ?, ?, ?, ?)
  `);
  stmt.run(testUser.id, testUser.name, testUser.avatar, testUser.department, testUser.role);

  console.log('✅ 测试用户已创建:', testUser.name);

  // 显示所有表
  const tables = database.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
  console.log('\n📋 数据库表列表:');
  tables.forEach(t => console.log(`   - ${t.name}`));

  console.log('\n' + '='.repeat(50));
  console.log('✨ 数据库初始化完成！');
  console.log('='.repeat(50));

  process.exit(0);
} catch (error) {
  console.error('\n❌ 初始化失败:', error.message);
  process.exit(1);
}
