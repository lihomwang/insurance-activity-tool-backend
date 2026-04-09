// services/db.js
// 数据库连接模块
// 根据环境变量自动选择 PostgreSQL 或 SQLite

const usePostgres = !!process.env.DATABASE_URL;

let dbModule = null;

if (usePostgres) {
  console.log('[DB] Using PostgreSQL');
  // 动态导入 PostgreSQL
  dbModule = await import('./db-postgres.js');
} else {
  console.log('[DB] Using SQLite');
  // 动态导入 SQLite
  dbModule = await import('./db-sqlite.js');
}

export default dbModule.default;
