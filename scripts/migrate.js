// scripts/migrate.js
// 数据库迁移脚本

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

async function migrate() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL
  });

  try {
    await client.connect();
    console.log('✅ 数据库连接成功');

    // 读取 schema.sql
    const schemaPath = path.join(__dirname, '../database/schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf-8');

    // 执行 SQL
    await client.query(schema);
    console.log('✅ 表结构创建成功');

    // 显示创建的表
    const tables = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);

    console.log('\n📋 已创建的表:');
    tables.rows.forEach(row => {
      console.log(`   - ${row.table_name}`);
    });

  } catch (error) {
    console.error('❌ 迁移失败:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

migrate().then(() => {
  console.log('\n✨ 迁移完成');
  process.exit(0);
});
