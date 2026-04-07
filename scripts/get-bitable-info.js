#!/usr/bin/env node
// scripts/get-bitable-info.js
// 获取多维表格信息

require('dotenv').config({ path: __dirname + '/../.env' });
const axios = require('axios');

const FEISHU_APP_ID = process.env.FEISHU_APP_ID;
const FEISHU_APP_SECRET = process.env.FEISHU_APP_SECRET;
const FEISHU_API_BASE = 'https://open.feishu.cn';

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

async function listBitables() {
  const token = await getTenantAccessToken();

  try {
    const response = await axios.get(
      `${FEISHU_API_BASE}/open-apis/bitable/v1/apps`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('找到的多维表格：');
    console.log('='.repeat(60));

    const items = response.data.data.items;
    items.forEach(item => {
      console.log(`名称：${item.name}`);
      console.log(`Token: ${item.app_token}`);
      console.log(`URL: https://qcnbmg9xnz9p.feishu.cn/base/${item.app_token}`);
      console.log('-'.repeat(60));
    });

    return items;
  } catch (error) {
    console.error('获取失败:', error.message);
    return [];
  }
}

listBitables();
