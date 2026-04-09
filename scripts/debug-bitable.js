#!/usr/bin/env node
// scripts/debug-bitable.js
// 调试多维表格 API

require('dotenv').config({ path: __dirname + '/../.env' });
const axios = require('axios');

const FEISHU_APP_ID = process.env.FEISHU_APP_ID;
const FEISHU_APP_SECRET = process.env.FEISHU_APP_SECRET;
const FEISHU_API_BASE = 'https://open.feishu.cn';
const APP_TOKEN = process.env.FEISHU_BITABLE_APP_TOKEN;
const TABLE_ID = process.env.FEISHU_BITABLE_TABLE_ID;

async function getTenantAccessToken() {
  const response = await axios.post(
    `${FEISHU_API_BASE}/open-apis/auth/v3/tenant_access_token/internal`,
    {
      app_id: FEISHU_APP_ID,
      app_secret: FEISHU_APP_SECRET
    }
  );
  if (response.data.code !== 0) {
    throw new Error(`获取 Token 失败：${response.data.msg}`);
  }
  return response.data.tenant_access_token;
}

async function debugBitable() {
  console.log('='.repeat(60));
  console.log('多维表格调试工具');
  console.log('='.repeat(60));
  console.log(`APP_TOKEN: ${APP_TOKEN}`);
  console.log(`TABLE_ID: ${TABLE_ID}`);
  console.log('');

  const token = await getTenantAccessToken();
  console.log('[OK] Token 获取成功');

  try {
    // 获取表格元数据
    const response = await axios.get(
      `${FEISHU_API_BASE}/open-apis/bitable/v1/apps/${APP_TOKEN}/tables/${TABLE_ID}/metadata`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('[OK] 表格元数据获取成功');
    console.log('');
    console.log('表格字段：');
    console.log('-'.repeat(60));

    const tables = response.data.data;
    tables.forEach(table => {
      console.log(`表名：${table.table_name}`);
      console.log(`Table ID: ${table.id}`);
      console.log('字段列表:');
      table.columns?.forEach(col => {
        console.log(`  - ${col.field_name} (${col.type})`);
      });
      console.log('');
    });

  } catch (error) {
    console.error('[ERROR] API 调用失败:', error.message);
    if (error.response?.data) {
      console.error('错误详情:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

debugBitable();
