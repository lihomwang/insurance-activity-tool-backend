#!/usr/bin/env node
// scripts/get-user-id.js
// 根据姓名获取飞书用户 ID

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

/**
 * 通过手机号获取用户 ID
 */
async function getUserByMobile(mobile) {
  const token = await getTenantAccessToken();

  try {
    const response = await axios.post(
      `${FEISHU_API_BASE}/open-apis/contact/v3/users/batch_get_id`,
      {
        mobiles: [mobile]
      },
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        params: {
          user_ids_type: 'union_id'
        }
      }
    );

    if (response.data.code === 0 && response.data.data?.user_list?.length > 0) {
      return response.data.data.user_list[0];
    }
    return null;
  } catch (error) {
    console.error(`查询失败 (${mobile}):`, error.message);
    return null;
  }
}

/**
 * 通过姓名搜索用户（需要通讯录权限）
 */
async function searchUserByName(name) {
  const token = await getTenantAccessToken();

  try {
    const response = await axios.get(
      `${FEISHU_API_BASE}/open-apis/contact/v3/users/search`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        params: {
          user_id_type: 'union_id',
          name: name,
          page_size: 10
        }
      }
    );

    if (response.data.code === 0 && response.data.data?.items?.length > 0) {
      return response.data.data.items[0];
    }
    return null;
  } catch (error) {
    console.error(`搜索失败 (${name}):`, error.message);
    return null;
  }
}

// 主程序
async function main() {
  console.log('='.repeat(60));
  console.log('飞书用户 ID 查询工具');
  console.log('='.repeat(60));

  const token = await getTenantAccessToken();
  console.log('[OK] Token 获取成功');

  // 查询方式选择
  console.log('\n请选择查询方式:');
  console.log('1. 通过手机号查询（需要提供手机号）');
  console.log('2. 通过姓名搜索（需要通讯录权限）');
  console.log('');

  // 测试搜索「皮叔」
  console.log('尝试搜索「皮叔」...');
  const result = await searchUserByName('皮叔');
  if (result) {
    console.log('找到了:');
    console.log(`  姓名：${result.name || result.user_name}`);
    console.log(`  ID: ${result.user_id}`);
    console.log(`  部门：${result.department?.join(', ') || '未知'}`);
  } else {
    console.log('未找到「皮叔」');
  }
}

main();
