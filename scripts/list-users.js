#!/usr/bin/env node
// scripts/list-users.js
// 列出企业内所有用户

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

async function listUsers() {
  const token = await getTenantAccessToken();

  try {
    const response = await axios.get(
      `${FEISHU_API_BASE}/open-apis/contact/v3/users`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        params: {
          user_id_type: 'union_id',
          page_size: 50
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
  console.log('企业内用户列表');
  console.log('='.repeat(60));

  const users = await listUsers();

  if (users && users.items) {
    console.log(`\n共找到 ${users.items.length} 位用户:\n`);

    users.items.forEach((user, index) => {
      console.log(`${index + 1}. ${user.name} (${user.en_name || '无英文名'})`);
      console.log(`   用户 ID: ${user.user_id}`);
      console.log(`   邮箱：${user.email || '未公开'}`);
      console.log(`   手机号：${user.mobile || '未公开'}`);
      console.log('');
    });

    console.log('请复制上面的 user_id，填入多维表格的 user_id 列');
  } else {
    console.log('\n获取失败，请确保应用有「获取用户 ID」权限');
    console.log('需要在飞书开放平台添加权限：contact:user:readonly');
  }
}

main();
