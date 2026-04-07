#!/usr/bin/env node
// scripts/get-my-user-id.js
// 获取当前登录用户的飞书 ID

require('dotenv').config({ path: __dirname + '/../.env' });
const axios = require('axios');

const FEISHU_APP_ID = process.env.FEISHU_APP_ID || 'cli_a95a6b370af8dcc8';
const FEISHU_APP_SECRET = process.env.FEISHU_APP_SECRET || 'v2XoWID99STcoN1l1ijQtTk0ryEdjizF';
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

async function getMyUserInfo() {
  const token = await getTenantAccessToken();

  try {
    const response = await axios.get(
      `${FEISHU_API_BASE}/open-apis/authen/v1/user_info`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (response.data.code === 0) {
      return response.data.data;
    } else {
      throw new Error(response.data.msg);
    }
  } catch (error) {
    console.error('获取失败:', error.message);
    return null;
  }
}

async function main() {
  console.log('='.repeat(60));
  console.log('获取当前用户飞书 ID');
  console.log('='.repeat(60));

  const userInfo = await getMyUserInfo();

  if (userInfo) {
    console.log('\n当前用户信息:');
    console.log(`  姓名：${userInfo.name}`);
    console.log(`  英文名：${userInfo.en_name}`);
    console.log(`  邮箱：${userInfo.email}`);
    console.log(`  手机号：${userInfo.mobile}`);
    console.log(`  用户 ID: ${userInfo.user_id}`);
    console.log(`  部门 ID: ${userInfo.department_ids?.join(', ')}`);
    console.log('');
    console.log('请复制上面的 user_id，填入多维表格的 user_id 列');
  } else {
    console.log('\n获取失败，请确保应用有「获取用户 ID」权限');
    console.log('权限：contact:user:readonly');
  }
}

main();
