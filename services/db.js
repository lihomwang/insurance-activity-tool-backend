// services/db.js
// 数据库连接模块
// 根据环境变量自动选择 PostgreSQL 或 SQLite

const usePostgres = !!process.env.DATABASE_URL;

if (usePostgres) {
  console.log('[DB] Using PostgreSQL');
  export { default } from './db-postgres.js';
} else {
  console.log('[DB] Using SQLite');
  export { default } from './db-sqlite.js';
}
