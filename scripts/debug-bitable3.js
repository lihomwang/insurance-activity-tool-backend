#!/usr/bin/env node
// scripts/debug-bitable3.js
// 详细调试多维表格 API

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
  console.log('多维表格 API 详细调试');
  console.log('='.repeat(60));
  console.log(`APP_TOKEN: ${APP_TOKEN}`);
  console.log(`TABLE_ID: ${TABLE_ID}`);
  console.log('');

  const token = await getTenantAccessToken();

  const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  };

  try {
    const response = await axios.get(
      `${FEISHU_API_BASE}/open-apis/bitable/v1/apps/${APP_TOKEN}/tables/${TABLE_ID}/records`,
      { headers }
    );
    console.log('[OK] 数据获取成功');
    console.log(JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.log('[FAIL] API 调用失败');
    console.log('状态码:', error.response?.status);
    console.log('错误信息:', error.response?.data);
    console.log('');
    console.log('完整错误:');
    console.log(JSON.stringify(error.response?.data, null, 2));
  }
}

debugBitable();
