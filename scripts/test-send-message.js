#!/usr/bin/env node
// scripts/test-send-message.js
// 测试发送消息给用户

require('dotenv').config({ path: __dirname + '/../.env' });
const axios = require('axios');

const FEISHU_APP_ID = process.env.FEISHU_APP_ID || 'cli_a95a6b370af8dcc8';
const FEISHU_APP_SECRET = process.env.FEISHU_APP_SECRET || 'v2XoWID99STcoN1l1ijQtTk0ryEdjizF';
const FEISHU_API_BASE = 'https://open.feishu.cn';

// 测试用户 ID
const USER_ID = process.argv[2] || '995b7g55';

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

async function sendTestMessage(userId) {
  const token = await getTenantAccessToken();

  // 创建测试卡片消息
  const card = {
    config: {
      wide_screen_mode: true
    },
    header: {
      template: 'blue',
      title: {
        tag: 'plain_text',
        content: '🤖 AI 教练测试'
      }
    },
    elements: [
      {
        tag: 'markdown',
        content: '你好！这是一条测试消息。\n\n如果你收到这条消息，说明 AI 教练功能正常工作！'
      },
      {
        tag: 'hr'
      },
      {
        tag: 'markdown',
        content: '💡 **今日总结**: 测试成功，继续保持！'
      }
    ]
  };

  try {
    const response = await axios.post(
      `${FEISHU_API_BASE}/open-apis/im/v1/messages`,
      {
        receive_id: userId,
        msg_type: 'interactive',
        content: JSON.stringify(card)
      },
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        params: {
          receive_id_type: 'union_id'
        }
      }
    );

    if (response.data.code === 0) {
      console.log('[OK] 消息发送成功!');
      console.log('消息 ID:', response.data.data.message_id);
    } else {
      console.log('[FAIL] 发送失败:', response.data.msg);
    }
  } catch (error) {
    console.error('[ERROR] 发送失败:', error.message);
    if (error.response?.data) {
      console.error('错误详情:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

console.log('='.repeat(60));
console.log('测试发送飞书消息');
console.log('='.repeat(60));
console.log(`目标用户 ID: ${USER_ID}`);
console.log('');

sendTestMessage(USER_ID);
