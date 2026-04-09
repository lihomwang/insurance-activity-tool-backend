// services/db-sqlite.js
// SQLite 数据库操作模块 (本地开发用)

const Database = require('better-sqlite3');
const path = require('path');

let db = null;

function getDb() {
  if (!db) {
    const dbPath = process.env.SQLITE_DB_PATH || path.join(__dirname, '../data/dev.db');
    const fs = require('fs');

    // 确保数据目录存在
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    console.log('[DB] Connected to SQLite:', dbPath);
  }
  return db;
}

function initTables() {
  const database = getDb();

  // 用户表
  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      avatar TEXT,
      department TEXT,
      role TEXT DEFAULT 'member',
      phone TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 活动量表
  database.exec(`
    CREATE TABLE IF NOT EXISTS activities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      activity_date DATE NOT NULL,
      new_leads INTEGER DEFAULT 0,
      referral INTEGER DEFAULT 0,
      invitation INTEGER DEFAULT 0,
      sales_meeting INTEGER DEFAULT 0,
      recruit_meeting INTEGER DEFAULT 0,
      business_plan INTEGER DEFAULT 0,
      deal INTEGER DEFAULT 0,
      eop_guest INTEGER DEFAULT 0,
      cc_assessment INTEGER DEFAULT 0,
      training INTEGER DEFAULT 0,
      total_score INTEGER DEFAULT 0,
      is_locked INTEGER DEFAULT 0,
      is_submitted INTEGER DEFAULT 0,
      submitted_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, activity_date)
    )
  `);

  // AI 对话记录表
  database.exec(`
    CREATE TABLE IF NOT EXISTS ai_conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      conversation_date DATE NOT NULL,
      messages TEXT NOT NULL,
      question_count INTEGER DEFAULT 0,
      user_mood TEXT,
      summary TEXT,
      suggestion TEXT,
      highlights TEXT,
      concerns TEXT,
      has_risk_content INTEGER DEFAULT 0,
      risk_level TEXT DEFAULT 'low',
      risk_keywords TEXT,
      status TEXT DEFAULT 'pending',
      completed_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 风险预警表
  database.exec(`
    CREATE TABLE IF NOT EXISTS risk_alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      conversation_id INTEGER,
      alert_type TEXT,
      risk_level TEXT NOT NULL,
      trigger_content TEXT,
      ai_analysis TEXT,
      status TEXT DEFAULT 'unread',
      handled_by TEXT,
      handled_at DATETIME,
      handler_notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 每日分析表
  database.exec(`
    CREATE TABLE IF NOT EXISTS daily_analytics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      analytics_date DATE NOT NULL UNIQUE,
      total_members INTEGER,
      submitted_count INTEGER,
      avg_score REAL,
      max_score INTEGER,
      min_score INTEGER,
      dimension_stats TEXT,
      ai_conversation_count INTEGER,
      avg_question_count REAL,
      avg_mood_score REAL,
      risk_alert_count INTEGER,
      high_risk_count INTEGER,
      top_performers TEXT,
      common_issues TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 每周报表表
  database.exec(`
    CREATE TABLE IF NOT EXISTS weekly_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      week_start DATE NOT NULL,
      week_end DATE NOT NULL,
      admin_user_ids TEXT,
      week_data TEXT NOT NULL,
      three_highlights TEXT,
      three_issues TEXT,
      suggestions TEXT,
      sent_at DATETIME,
      sent_status TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(week_start, week_end)
    )
  `);

  console.log('[DB] Tables initialized');
}

function query(sql, params = []) {
  const database = getDb();
  const stmt = database.prepare(sql);

  if (sql.trim().toUpperCase().startsWith('SELECT')) {
    return { rows: stmt.all(...params) };
  } else {
    const result = stmt.run(...params);
    return { rows: [], changes: result.changes, lastInsertRowid: result.lastInsertRowid };
  }
}

function findOne(table, where) {
  const keys = Object.keys(where);
  const values = Object.values(where);
  const conditions = keys.map(key => `${key} = ?`).join(' AND ');

  const sql = `SELECT * FROM ${table} WHERE ${conditions} LIMIT 1`;
  const result = query(sql, values);
  return result.rows[0] || null;
}

function findAll(table, where = {}, options = {}) {
  let sql = `SELECT * FROM ${table}`;
  const values = [];

  if (Object.keys(where).length > 0) {
    const conditions = Object.keys(where).map(key => `${key} = ?`).join(' AND ');
    sql += ` WHERE ${conditions}`;
    values.push(...Object.values(where));
  }

  if (options.orderBy) {
    sql += ` ORDER BY ${options.orderBy}`;
  }

  if (options.limit) {
    sql += ` LIMIT ${options.limit}`;
  }

  const result = query(sql, values);
  return result.rows;
}

function insert(table, data) {
  const keys = Object.keys(data);

  // 将 Date 对象转换为 ISO 字符串
  const processedData = {};
  for (const [key, value] of Object.entries(data)) {
    processedData[key] = value instanceof Date ? value.toISOString() : value;
  }

  const values = Object.values(processedData);
  const placeholders = keys.map(() => '?').join(', ');

  const sql = `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})`;
  const result = query(sql, values);

  return findOne(table, { id: result.lastInsertRowid });
}

function update(table, where, data) {
  const whereKeys = Object.keys(where);
  const whereValues = Object.values(where);
  const dataKeys = Object.keys(data);

  // 将 Date 对象转换为 ISO 字符串
  const processedData = {};
  for (const [key, value] of Object.entries(data)) {
    processedData[key] = value instanceof Date ? value.toISOString() : value;
  }

  const dataValues = Object.values(processedData);

  const whereConditions = whereKeys.map(key => `${key} = ?`).join(' AND ');
  const setConditions = dataKeys.map(key => `${key} = ?`).join(', ');

  const sql = `UPDATE ${table} SET ${setConditions} WHERE ${whereConditions}`;
  query(sql, [...whereValues, ...dataValues]);

  return findOne(table, where);
}

function upsert(table, data, conflictColumns) {
  // SQLite 的 UPSERT 语法
  const keys = Object.keys(data);

  // 将 Date 对象转换为 ISO 字符串
  const processedData = {};
  for (const [key, value] of Object.entries(data)) {
    processedData[key] = value instanceof Date ? value.toISOString() : value;
  }

  const values = Object.values(processedData);
  const placeholders = keys.map(() => '?').join(', ');
  const conflictCols = conflictColumns.split(',').map(c => c.trim()).join(', ');
  const conflictKeys = conflictColumns.split(',').map(c => c.trim());

  const setConditions = keys
    .filter(k => !conflictKeys.includes(k))
    .map(key => `${key} = ?`)
    .join(', ');

  // 构建 UPDATE 的值数组（只包含非冲突列的值）
  const updateValues = keys
    .filter(k => !conflictKeys.includes(k))
    .map(k => processedData[k]);

  const sql = `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})
    ON CONFLICT(${conflictCols}) DO UPDATE SET ${setConditions}`;

  query(sql, [...values, ...updateValues]);

  // 返回更新后的记录
  const where = {};
  conflictKeys.forEach((key, i) => {
    where[key] = values[i];
  });

  return findOne(table, where);
}

module.exports = {
  getDb,
  initTables,
  query,
  findOne,
  findAll,
  insert,
  update,
  upsert
};
