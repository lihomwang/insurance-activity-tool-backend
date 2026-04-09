#!/usr/bin/env node
// scripts/verify-app.js
// 验证应用 ID 和 Secret 是否匹配

require('dotenv').config({ path: __dirname + '/../.env' });
const axios = require('axios');

const FEISHU_APP_ID = process.env.FEISHU_APP_ID;
const FEISHU_APP_SECRET = process.env.FEISHU_APP_SECRET;
const FEISHU_API_BASE = 'https://open.feishu.cn';

async function verifyApp() {
  console.log('='.repeat(60));
  console.log('验证应用身份');
  console.log('='.repeat(60));
  console.log(`FEISHU_APP_ID: ${FEISHU_APP_ID}`);
  console.log(`FEISHU_APP_SECRET: ${FEISHU_APP_SECRET.substring(0, 8)}...`);
  console.log('');

  try {
    const response = await axios.post(
      `${FEISHU_API_BASE}/open-apis/auth/v3/tenant_access_token/internal`,
      {
        app_id: FEISHU_APP_ID,
        app_secret: FEISHU_APP_SECRET
      }
    );

    if (response.data.code === 0) {
      console.log('[OK] App ID 和 App Secret 匹配成功!');
      console.log(`Token: ${response.data.tenant_access_token.substring(0, 20)}...`);
      console.log(`过期时间：${response.data.expire} 秒`);
    } else {
      console.log('[FAIL] API 返回错误:', response.data.msg);
    }
  } catch (error) {
    console.log('[FAIL] 验证失败');
    console.log('状态码:', error.response?.status);
    console.log('错误信息:', error.response?.data);
  }
}

verifyApp();
