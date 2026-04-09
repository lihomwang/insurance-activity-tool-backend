// services/db-postgres.js
// PostgreSQL 数据库连接模块

import pkg from 'pg';
const { Pool } = pkg;

let pool = null;

function getPool() {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;

    if (!connectionString) {
      throw new Error('DATABASE_URL environment variable is not set');
    }

    pool = new Pool({
      connectionString,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000
    });

    pool.on('connect', () => {
      console.log('[DB] Connected to PostgreSQL');
    });

    pool.on('error', (err) => {
      console.error('[DB] Unexpected error on idle client', err);
    });
  }
  return pool;
}

async function query(sql, params = []) {
  const client = await getPool().connect();
  try {
    const result = await client.query(sql, params);
    return result;
  } finally {
    client.release();
  }
}

async function findOne(table, where, options = {}) {
  const keys = Object.keys(where);
  const values = Object.values(where);
  const conditions = keys.map((key, i) => `${key} = $${i + 1}`).join(' AND ');

  let sql = `SELECT * FROM ${table} WHERE ${conditions}`;

  if (options.orderBy) {
    sql += ` ORDER BY ${options.orderBy}`;
  }

  sql += ' LIMIT 1';

  const result = await query(sql, values);
  return result.rows[0] || null;
}

async function findAll(table, where = {}, options = {}) {
  let sql = `SELECT * FROM ${table}`;
  const values = [];
  let paramIndex = 1;

  if (Object.keys(where).length > 0) {
    const conditions = Object.keys(where).map(key => {
      values.push(where[key]);
      return `${key} = $${paramIndex++}`;
    }).join(' AND ');
    sql += ` WHERE ${conditions}`;
  }

  if (options.orderBy) {
    sql += ` ORDER BY ${options.orderBy}`;
  }

  if (options.limit) {
    sql += ` LIMIT $${paramIndex++}`;
    values.push(options.limit);
  }

  const result = await query(sql, values);
  return result.rows;
}

async function insert(table, data) {
  const keys = Object.keys(data);
  const values = Object.values(data);
  const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');

  const sql = `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders}) RETURNING *`;
  const result = await query(sql, values);
  return result.rows[0];
}

async function upsert(table, data, conflictColumns) {
  const keys = Object.keys(data);
  const values = Object.values(data);
  const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');

  // 构建 UPDATE SET 部分，排除 conflict columns
  const updateKeys = keys.filter(k => !conflictColumns.includes(k));
  const updateSet = updateKeys.map((key, i) => `${key} = EXCLUDED.${key}`).join(', ');

  let sql = `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})`;

  if (updateSet) {
    sql += ` ON CONFLICT (${conflictColumns.join(',')}) DO UPDATE SET ${updateSet}`;
  }

  sql += ' RETURNING *';

  const result = await query(sql, values);
  return result.rows[0];
}

async function update(table, where, data) {
  const whereKeys = Object.keys(where);
  const whereValues = Object.values(where);
  const dataKeys = Object.keys(data);

  const whereConditions = whereKeys.map((key, i) => `${key} = $${i + 1}`).join(' AND ');
  const setConditions = dataKeys.map((key, i) => `${key} = $${whereValues.length + i + 1}`).join(', ');

  const sql = `UPDATE ${table} SET ${setConditions} WHERE ${whereConditions} RETURNING *`;
  const result = await query(sql, [...whereValues, ...Object.values(data)]);
  return result.rows[0];
}

async function remove(table, where) {
  const keys = Object.keys(where);
  const values = Object.values(where);
  const conditions = keys.map((key, i) => `${key} = $${i + 1}`).join(' AND ');

  const sql = `DELETE FROM ${table} WHERE ${conditions}`;
  const result = await query(sql, values);
  return result.rowCount;
}

async function count(table, where = {}) {
  let sql = `SELECT COUNT(*) as count FROM ${table}`;
  const values = [];

  if (Object.keys(where).length > 0) {
    const conditions = Object.keys(where).map((key, i) => `${key} = $${i + 1}`).join(' AND ');
    sql += ` WHERE ${conditions}`;
    values.push(...Object.values(where));
  }

  const result = await query(sql, values);
  return parseInt(result.rows[0].count, 10);
}

async function close() {
  if (pool) {
    await pool.end();
    pool = null;
    console.log('[DB] PostgreSQL connection closed');
  }
}

// 事务支持
async function transaction(callback) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export default {
  query,
  findOne,
  findAll,
  insert,
  upsert,
  update,
  remove,
  count,
  close,
  transaction,
  getPool
};
