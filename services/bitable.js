/**
 * 飞书多维表格 (Bitable) API 封装
 * ESM 版本，与项目 "type": "module" 一致
 */

import axios from 'axios';

// 尝试加载环境变量（兼容直接运行和作为模块导入）
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const envPath = join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  envContent.split('\n').forEach(line => {
    line = line.trim();
    if (line && !line.startsWith('#')) {
      const eq = line.indexOf('=');
      if (eq > 0) {
        const key = line.slice(0, eq).trim();
        const val = line.slice(eq + 1).trim();
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  });
}

// 多维表格配置
const BITABLE_APP_TOKEN = process.env.FEISHU_BITABLE_APP_TOKEN || 'LR0RbtG9PavAcyswZMvcETWbnEh';
const ACTIVITIES_TABLE_ID = process.env.FEISHU_BITABLE_TABLE_ID || 'tbl1blvjmScTokEi';

// 飞书应用配置
// 读操作使用 H5 应用（已有 Bitable 只读权限）
const READ_APP_ID = process.env.H5_APP_ID || 'cli_a95a6b370af8dcc8';
const READ_APP_SECRET = process.env.H5_APP_SECRET || 'v2XoWID99STcoN1l1ijQtTk0ryEdjizF';

// 写操作使用新 AI 教练应用（替代已停用的 cli_a95a59999e78dcc0）
// 需要在飞书开放平台开通 base:record:create 权限
const WRITE_APP_ID = process.env.FEISHU_APP_ID || 'cli_a94a9e266338dcb2';
const WRITE_APP_SECRET = process.env.FEISHU_APP_SECRET || 'jwD6beUwky70NfEeTmBamfHcxe0BwPzP';

// Token 缓存（读写分开）
let readToken = null;
let readTokenExpiresAt = 0;
let writeToken = null;
let writeTokenExpiresAt = 0;

/**
 * 获取读取 token（H5 应用，有 Bitable 只读权限）
 */
async function getReadToken() {
  if (readToken && Date.now() < readTokenExpiresAt) {
    return readToken;
  }

  const response = await axios.post(
    'https://open.feishu.cn/open-apis/auth/v3/app_access_token/internal',
    {
      app_id: READ_APP_ID,
      app_secret: READ_APP_SECRET
    }
  );

  if (response.data.code !== 0) {
    throw new Error('获取读 token 失败: ' + response.data.msg);
  }

  readToken = response.data.app_access_token;
  readTokenExpiresAt = Date.now() + (response.data.expire - 300) * 1000;
  return readToken;
}

/**
 * 获取写入 token（长连接应用，需要 Bitable 写权限）
 */
async function getWriteToken() {
  if (writeToken && Date.now() < writeTokenExpiresAt) {
    return writeToken;
  }

  const response = await axios.post(
    'https://open.feishu.cn/open-apis/auth/v3/app_access_token/internal',
    {
      app_id: WRITE_APP_ID,
      app_secret: WRITE_APP_SECRET
    }
  );

  if (response.data.code !== 0) {
    throw new Error('获取写 token 失败: ' + response.data.msg);
  }

  writeToken = response.data.app_access_token;
  writeTokenExpiresAt = Date.now() + (response.data.expire - 300) * 1000;
  return writeToken;
}

/**
 * 获取 tenant_access_token（兼容旧接口，默认读）
 */
async function getTenantAccessToken() {
  return getReadToken();
}

/**
 * 获取 Bitable API 请求头
 */
async function getHeaders(write = false) {
  const token = write ? await getWriteToken() : await getReadToken();
  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  };
}

/**
 * 格式化字段值（Bitable 期望的格式）
 * 单选字段需要传数组 [{ name: '是' }]
 * 日期字段需要传毫秒时间戳
 */
function formatFieldValue(fieldName, value) {
  if (value === null || value === undefined) return null;

  // 单选字段
  if (fieldName === 'is_submitted') {
    if (value === 1 || value === true || value === '是') return '是';
    if (value === 0 || value === false || value === '否') return '否';
    return value;
  }

  // 日期字段 - 转为毫秒时间戳
  if (fieldName === 'activity_date' || fieldName === 'created_at') {
    if (typeof value === 'string') {
      // 处理 YYYY-MM-DD 格式
      if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
        return new Date(value).getTime();
      }
    }
    if (value instanceof Date) {
      return value.getTime();
    }
    if (typeof value === 'number') {
      // 如果已经是秒级时间戳，转为毫秒
      return value < 1e12 ? value * 1000 : value;
    }
    return value;
  }

  return value;
}

/**
 * 创建或更新活动量记录
 * 核心逻辑：按 user_name + activity_date 唯一标识
 * 多次提交时累加各维度数量，而不是覆盖
 * @param {Object} data - 活动量数据（本次提交的增量）
 * @returns {Object} 记录结果
 */
async function upsertActivity(data) {
  const { user_name, user_id, mobile, activity_date } = data;

  // Bitable filter on text fields uses exact match; search by user_name + date
  let existingRecord = null;
  if (user_name && activity_date) {
    existingRecord = await findRecord({ user_name, activity_date });
  }

  console.log(`[Bitable] upsertActivity: user=${user_name}, date=${activity_date}, existingRecord=${existingRecord ? existingRecord.record_id : 'NONE'}`);

  const fields = {};
  // 文本字段
  if (user_name) fields.user_name = user_name;
  // user_id 特殊处理：如果是更新记录，检查 user_id 是否包含对话状态 JSON
  // AI 教练将对话状态存为 JSON 字符串在 user_id 字段，不能被 H5 提交覆盖
  if (user_id) {
    if (existingRecord && typeof existingRecord.user_id === 'string' && existingRecord.user_id.startsWith('{')) {
      // 保留 AI 教练的对话状态，不覆盖
      console.log(`[Bitable] 保留 ${user_name} 的 AI 教练对话状态，不覆盖 user_id`);
    } else {
      fields.user_id = user_id;
    }
  }
  if (mobile) fields.mobile = mobile;
  // 日期字段
  if (activity_date) fields.activity_date = formatFieldValue('activity_date', activity_date);
  // 创建时间（仅新建时）
  if (!existingRecord) {
    fields.created_at = formatFieldValue('created_at', new Date());
  }
  // 单选字段
  if (data.is_submitted !== undefined) {
    fields.is_submitted = formatFieldValue('is_submitted', data.is_submitted);
  } else {
    fields.is_submitted = formatFieldValue('is_submitted', 1);
  }

  // 数值字段：累加模式
  const numFields = ['new_leads', 'referral', 'invitation', 'sales_meeting',
    'recruit_meeting', 'business_plan', 'deal', 'eop_guest', 'cc_assessment',
    'training'];

  if (existingRecord) {
    // 覆盖模式：使用本次提交的完整值，而不是累加
    // 因为前端每次提交的都是当前表单的完整值，不是增量
    numFields.forEach(f => {
      if (data[f] !== undefined) {
        fields[f] = Number(data[f]) || 0;
      } else {
        fields[f] = existingRecord[f] || 0;
      }
    });
    // 重新计算总分
    const dimensionScores = {
      new_leads: 1, referral: 3, invitation: 1, sales_meeting: 10,
      recruit_meeting: 10, business_plan: 1, deal: 10, eop_guest: 5,
      cc_assessment: 5, training: 10
    };
    let totalScore = 0;
    numFields.forEach(f => {
      totalScore += (fields[f] || 0) * (dimensionScores[f] || 0);
    });
    fields.total_score = totalScore;

    // 更新已有记录
    const result = await updateRecord(existingRecord.record_id, { fields });
    return { ...result, record_id: existingRecord.record_id };
  } else {
    // 新建记录：直接使用提交的值
    numFields.forEach(f => {
      if (data[f] !== undefined) fields[f] = Number(data[f]) || 0;
    });
    // 计算总分
    const dimensionScores = {
      new_leads: 1, referral: 3, invitation: 1, sales_meeting: 10,
      recruit_meeting: 10, business_plan: 1, deal: 10, eop_guest: 5,
      cc_assessment: 5, training: 10
    };
    let totalScore = 0;
    numFields.forEach(f => {
      totalScore += (fields[f] || 0) * (dimensionScores[f] || 0);
    });
    fields.total_score = totalScore;

    // 创建新记录
    const result = await createRecord({ fields });
    return result;
  }
}

/**
 * 创建记录
 */
async function createRecord({ fields }) {
  const headers = await getHeaders(true); // 使用写 token
  try {
    const response = await axios.post(
      `https://open.feishu.cn/open-apis/bitable/v1/apps/${BITABLE_APP_TOKEN}/tables/${ACTIVITIES_TABLE_ID}/records`,
      { fields },
      { headers }
    );

    if (response.data.code !== 0) {
      throw new Error('创建记录失败: ' + response.data.msg);
    }

    return {
      record_id: response.data.data.record.record_id,
      fields: response.data.data.record.fields
    };
  } catch (error) {
    if (error.response?.data) {
      console.error('[Bitable] Create error:', JSON.stringify(error.response.data, null, 2));
      throw new Error('创建记录失败: ' + (error.response.data.msg || error.response.data.code));
    }
    throw error;
  }
}

/**
 * 更新记录
 */
async function updateRecord(recordId, { fields }) {
  const headers = await getHeaders(true); // 使用写 token
  try {
    const response = await axios.put(
      `https://open.feishu.cn/open-apis/bitable/v1/apps/${BITABLE_APP_TOKEN}/tables/${ACTIVITIES_TABLE_ID}/records/${recordId}`,
      { fields },
      { headers }
    );

    if (response.data.code !== 0) {
      throw new Error('更新记录失败: ' + response.data.msg);
    }

    return {
      record_id: response.data.data.record.record_id,
      fields: response.data.data.record.fields
    };
  } catch (error) {
    if (error.response?.data) {
      console.error('[Bitable] Update error:', JSON.stringify(error.response.data, null, 2));
      throw new Error('更新记录失败: ' + (error.response.data.msg || error.response.data.code));
    }
    throw error;
  }
}

/**
 * 查找记录（通过多条件过滤，JS 端过滤）
 * @param {Object} conditions - 查找条件
 * @returns {Object|null} 第一条匹配的记录
 */
async function findRecord(conditions) {
  // Bitable v1 API filter 不稳定，fetch all and filter in JS
  const records = await getAllRecords();
  const match = records.find(r => {
    for (const [field, value] of Object.entries(conditions)) {
      if (value === undefined || value === null) continue;

      let fieldValue = r[field];

      // Handle date fields - use Beijing timezone for comparison
      if (field === 'activity_date' && fieldValue) {
        const recordDate = new Date(fieldValue).toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' });
        if (recordDate !== value) return false;
        continue;
      }

      // Handle is_submitted
      if (field === 'is_submitted') {
        const expected = (value === 1 || value === true) ? 1 : 0;
        let actual = 0;
        if (Array.isArray(fieldValue)) {
          actual = fieldValue.some(opt => opt.name === '是') ? 1 : 0;
        } else if (typeof fieldValue === 'number') {
          actual = fieldValue;
        }
        if (actual !== expected) return false;
        continue;
      }

      // String comparison for text fields
      if (String(fieldValue) !== String(value)) return false;
    }
    return true;
  });
  return match || null;
}

/**
 * 获取所有记录
 * Bitable v1 API filter 不稳定，所以直接全量获取后在 JS 端过滤
 * @param {number} pageSize - 每页数量
 * @returns {Array} 记录列表
 */
async function getAllRecords(pageSize = 100) {
  const headers = await getHeaders(false); // 使用读 token

  const response = await axios.get(
    `https://open.feishu.cn/open-apis/bitable/v1/apps/${BITABLE_APP_TOKEN}/tables/${ACTIVITIES_TABLE_ID}/records`,
    { headers, params: { page_size: pageSize } }
  );

  if (response.data.code !== 0) {
    throw new Error('查询记录失败: ' + response.data.msg);
  }

  const items = response.data.data.items || [];
  return items.map(item => {
    const fields = { ...item.fields };
    // Bitable returns some numbers as formatted strings (e.g. "085"), convert back
    const numFields = ['new_leads', 'referral', 'invitation', 'sales_meeting',
      'recruit_meeting', 'business_plan', 'deal', 'eop_guest', 'cc_assessment',
      'training', 'total_score'];
    numFields.forEach(f => {
      if (fields[f] !== undefined && fields[f] !== null) {
        fields[f] = Number(fields[f]) || 0;
      }
    });
    // Convert is_submitted from select option to number
    if (fields.is_submitted && Array.isArray(fields.is_submitted)) {
      fields.is_submitted = fields.is_submitted.some(opt => opt.name === '是') ? 1 : 0;
    } else if (typeof fields.is_submitted === 'string') {
      fields.is_submitted = fields.is_submitted === '是' ? 1 : 0;
    }
    return {
      record_id: item.record_id,
      ...fields
    };
  });
}

/**
 * 列出记录（兼容旧接口，实际调用 getAllRecords 并在 JS 端过滤）
 */
async function listRecords(conditions = {}, pageSize = 100) {
  const allRecords = await getAllRecords(pageSize);

  if (Object.keys(conditions).length === 0) {
    return allRecords;
  }

  return allRecords.filter(r => {
    for (const [field, value] of Object.entries(conditions)) {
      if (value === undefined || value === null) continue;

      let fieldValue = r[field];

      if (field === 'activity_date' && fieldValue) {
        const recordDate = new Date(fieldValue).toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' });
        if (recordDate !== value) return false;
        continue;
      }

      if (field === 'is_submitted') {
        const expected = (value === 1 || value === true) ? 1 : 0;
        let actual = 0;
        if (Array.isArray(fieldValue)) {
          actual = fieldValue.some(opt => opt.name === '是') ? 1 : 0;
        } else if (typeof fieldValue === 'number') {
          actual = fieldValue;
        }
        if (actual !== expected) return false;
        continue;
      }

      if (String(fieldValue) !== String(value)) return false;
    }
    return true;
  });
}

/**
 * 获取用户周统计
 * 记分周期：周四 9:00 AM ~ 下周四 22:00 PM（北京时间）
 * @param {Object} user - 用户对象 { name, id }
 */
async function getUserWeekStats(user) {
  const userName = typeof user === 'string' ? user : user?.name;
  const userId = typeof user === 'object' ? user?.id : null;

  // 计算本周期的起始日期（周四）
  // 周期规则：周四 9:00 到下周四 22:00
  const now = new Date();
  const bjNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }));
  const dayOfWeek = bjNow.getDay(); // 0=Sun, 4=Thu
  const bjHour = bjNow.getHours();

  // 找到本周期的起始周四
  let cycleStartThursday = new Date(bjNow);
  if (dayOfWeek === 4 && bjHour >= 9) {
    // 周四 9:00 之后，周期从今天开始
  } else if (dayOfWeek === 4) {
    // 周四 9:00 之前，周期从上周四开始
    cycleStartThursday.setDate(cycleStartThursday.getDate() - 7);
  } else {
    // 其他日期，找到最近的周四
    const daysSinceThursday = (dayOfWeek - 4 + 7) % 7;
    cycleStartThursday.setDate(cycleStartThursday.getDate() - daysSinceThursday);
  }
  const weekStart = cycleStartThursday.toISOString().split('T')[0];

  // Get all records and filter by user
  let records;
  if (userId) {
    records = await listRecords({ user_id: userId }, 500);
  } else if (userName) {
    records = await listRecords({ user_name: userName }, 500);
  } else {
    records = [];
  }

  let weekScore = 0;
  let activityCount = 0;

  records.forEach(r => {
    if (r.activity_date && r.is_submitted) {
      const recordDate = new Date(r.activity_date).toISOString().split('T')[0];
      if (recordDate >= weekStart) {
        weekScore += r.total_score || 0;
        activityCount++;
      }
    }
  });

  return { weekScore, activityCount };
}

/**
 * 获取团队统计
 * 过滤掉非团队成员
 */
async function getTeamStats() {
  const records = await getAllRecords();

  // 过滤名单：排除非团队成员
  const EXCLUDED_USERS = ['皮叔', '测试用户', 'test', '测试'];

  const userScores = {};
  const userSet = new Set();

  records.forEach(r => {
    if (r.is_submitted && r.user_name) {
      // 排除非团队成员
      if (EXCLUDED_USERS.some(ex => r.user_name.includes(ex))) return;
      userSet.add(r.user_name);
      if (!userScores[r.user_name]) userScores[r.user_name] = 0;
      userScores[r.user_name] += r.total_score || 0;
    }
  });

  const totalMembers = 12; // 团队固定人数
  const submittedCount = Object.keys(userScores).length;
  const totalScore = Object.values(userScores).reduce((sum, s) => sum + s, 0);
  const avgScore = submittedCount > 0 ? Math.round(totalScore / submittedCount) : 0;

  let starName = '-';
  let maxScore = 0;
  for (const [name, score] of Object.entries(userScores)) {
    if (score > maxScore) {
      maxScore = score;
      starName = name;
    }
  }

  return { totalMembers, avgScore, totalScore, starName };
}

/**
 * 获取维度统计
 * 过滤掉非团队成员
 */
async function getDimensionStats() {
  const records = await getAllRecords();

  // 过滤名单：排除非团队成员
  const EXCLUDED_USERS = ['皮叔', '测试用户', 'test', '测试'];

  const dimensions = {
    new_leads: { count: 0, score: 0 },
    referral: { count: 0, score: 0 },
    invitation: { count: 0, score: 0 },
    sales_meeting: { count: 0, score: 0 },
    recruit_meeting: { count: 0, score: 0 },
    business_plan: { count: 0, score: 0 },
    deal: { count: 0, score: 0 },
    eop_guest: { count: 0, score: 0 },
    cc_assessment: { count: 0, score: 0 },
    training: { count: 0, score: 0 }
  };

  const dimensionScores = {
    new_leads: 1, referral: 3, invitation: 1, sales_meeting: 10,
    recruit_meeting: 10, business_plan: 1, deal: 10, eop_guest: 5,
    cc_assessment: 5, training: 10
  };

  records.forEach(r => {
    if (!r.is_submitted) return;
    // 排除非团队成员
    if (r.user_name && EXCLUDED_USERS.some(ex => r.user_name.includes(ex))) return;
    Object.keys(dimensions).forEach(key => {
      const count = r[key] || 0;
      dimensions[key].count += count;
      dimensions[key].score += count * (dimensionScores[key] || 0);
    });
  });

  return dimensions;
}

/**
 * 获取排行榜
 * 过滤掉非团队成员（皮叔、测试用户等）
 */
async function getRanking() {
  const records = await getAllRecords();

  // 过滤名单：排除非团队成员
  const EXCLUDED_USERS = ['皮叔', '测试用户', 'test', '测试'];

  const userScores = {};
  const userAvatars = {};

  records.forEach(r => {
    if (!r.is_submitted || !r.user_name) return;
    // 排除非团队成员
    if (EXCLUDED_USERS.some(ex => r.user_name.includes(ex))) return;
    if (!userScores[r.user_name]) userScores[r.user_name] = 0;
    userScores[r.user_name] += r.total_score || 0;
    if (!userAvatars[r.user_name]) {
      userAvatars[r.user_name] = '😊';
    }
  });

  const ranking = Object.entries(userScores)
    .map(([name, score]) => ({
      id: name,
      name,
      avatar: userAvatars[name] || '😊',
      score
    }))
    .sort((a, b) => b.score - a.score)
    .map((item, index) => ({ ...item, rank: index + 1 }));

  return ranking;
}

/**
 * 获取用户当日活动数据
 * @param {Object} user - 用户对象 { name, id }
 * @param {string} date - 日期 YYYY-MM-DD
 */
async function getUserActivities(user, date) {
  // Try user_id first if available
  let records = [];
  if (user?.id) {
    records = await listRecords({ user_id: user.id, activity_date: date }, 500);
  }
  // Fallback to user_name
  if (records.length === 0 && user?.name) {
    records = await listRecords({ user_name: user.name, activity_date: date }, 500);
  }

  if (records.length === 0 || !records[0].is_submitted) {
    return null;
  }

  return records[0];
}

export default {
  getTenantAccessToken,
  upsertActivity,
  createRecord,
  updateRecord,
  findRecord,
  listRecords,
  getAllRecords,
  getUserWeekStats,
  getTeamStats,
  getDimensionStats,
  getRanking,
  getUserActivities
};
