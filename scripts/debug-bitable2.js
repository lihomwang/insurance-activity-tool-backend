#!/usr/bin/env node
// scripts/debug-bitable2.js
// 调试多维表格 API - 尝试不同端点

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
  console.log('[OK] Token 获取成功');
  return response.data.tenant_access_token;
}

async function tryEndpoint(url, options = {}) {
  try {
    const response = await axios.get(url, options);
    console.log(`[OK] ${url}`);
    return response;
  } catch (error) {
    console.log(`[FAIL] ${url} - ${error.response?.status || error.message}`);
    return null;
  }
}

async function debugBitable() {
  console.log('='.repeat(60));
  console.log('多维表格 API 调试');
  console.log('='.repeat(60));
  console.log(`APP_TOKEN: ${APP_TOKEN}`);
  console.log(`TABLE_ID: ${TABLE_ID}`);
  console.log('');

  const token = await getTenantAccessToken();

  const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  };

  // 尝试不同的 API 端点
  console.log('尝试不同的 API 端点...');
  console.log('-'.repeat(60));

  // 端点 1: 获取应用列表
  await tryEndpoint(
    `${FEISHU_API_BASE}/open-apis/bitable/v1/apps`,
    { headers }
  );

  // 端点 2: 获取表格记录 (旧版)
  await tryEndpoint(
    `${FEISHU_API_BASE}/open-apis/bitable/v1/apps/${APP_TOKEN}/tables/${TABLE_ID}/records`,
    { headers }
  );

  // 端点 3: 获取表格记录 (新版)
  await tryEndpoint(
    `${FEISHU_API_BASE}/open-apis/awesome/bitable/v1/apps/${APP_TOKEN}/tables/${TABLE_ID}/records`,
    { headers }
  );

  // 端点 4: 获取表格元数据
  await tryEndpoint(
    `${FEISHU_API_BASE}/open-apis/bitable/v1/apps/${APP_TOKEN}/tables/${TABLE_ID}/metadata`,
    { headers }
  );

  // 端点 5: 获取表格字段 (新版)
  await tryEndpoint(
    `${FEISHU_API_BASE}/open-apis/bitable/v1/apps/${APP_TOKEN}/tables/${TABLE_ID}/fields`,
    { headers }
  );
}

debugBitable();
