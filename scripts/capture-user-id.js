#!/usr/bin/env node
// scripts/capture-user-id.js
// 监听飞书事件，捕获用户 ID
// 使用方法：让团队成员给机器人发一条消息，然后运行这个脚本获取 ID

require('dotenv').config({ path: __dirname + '/../.env' });
const axios = require('axios');

const FEISHU_APP_ID = process.env.FEISHU_APP_ID || 'cli_a95a6b370af8dcc8';
const FEISHU_APP_SECRET = process.env.FEISHU_APP_SECRET || 'v2XoWID99STcoN1l1ijQtTk0ryEdjizF';
const FEISHU_API_BASE = 'https://open.feishu.cn';
const BOT_ID = process.env.FEISHU_OPENCLAW_BOT_ID || 'cli_a94a9e266338dcb2';

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
 * 获取机器人收到的消息
 */
async function getBotMessages(limit = 10) {
  const token = await getTenantAccessToken();

  try {
    // 获取机器人所在的群聊列表
    const chatsResponse = await axios.get(
      `${FEISHU_API_BASE}/open-apis/im/v1/chats`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        params: {
          page_size: 50
        }
      }
    );

    if (chatsResponse.data.code !== 0) {
      console.log('获取群聊列表失败:', chatsResponse.data.msg);
      return [];
    }

    const chats = chatsResponse.data.data.items || [];
    console.log(`机器人所在的群聊：${chats.length} 个`);

    // 获取每个群聊的最新消息
    const messages = [];
    for (const chat of chats) {
      const msgResponse = await axios.get(
        `${FEISHU_API_BASE}/open-apis/im/v1/messages`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          params: {
            chat_id: chat.chat_id,
            page_size: limit
          }
        }
      );

      if (msgResponse.data.code === 0) {
        messages.push(...(msgResponse.data.data.items || []));
      }
    }

    return messages;
  } catch (error) {
    console.error('获取消息失败:', error.message);
    return [];
  }
}

async function main() {
  console.log('='.repeat(60));
  console.log('捕获用户 ID 工具');
  console.log('='.repeat(60));
  console.log('');
  console.log('使用说明:');
  console.log('1. 让团队成员给 OpenClaw 机器人发一条消息');
  console.log('2. 运行这个脚本获取发送者的 user_id');
  console.log('');

  const messages = await getBotMessages();

  if (messages.length === 0) {
    console.log('没有找到消息，请先让团队成员给机器人发消息');
    return;
  }

  console.log(`找到 ${messages.length} 条消息:\n`);

  // 提取消息发送者信息
  const senders = new Map();

  messages.forEach(msg => {
    const sender = msg.sender;
    if (sender && sender.id && sender.id !== BOT_ID) {
      const key = sender.id;
      if (!senders.has(key)) {
        senders.set(key, {
          user_id: sender.id,
          name: sender.name || sender.sender_name,
          type: sender.type
        });
      }
    }
  });

  if (senders.size === 0) {
    console.log('没有找到用户消息（可能只有机器人自己发的消息）');
    return;
  }

  console.log('找到以下用户:');
  console.log('');

  senders.forEach((user, id) => {
    console.log(`姓名：${user.name || '未知'}`);
    console.log(`user_id: ${user.user_id}`);
    console.log(`user_type: ${user.type}`);
    console.log('');
    console.log('--- 复制上面的 user_id 填入多维表格的 user_id 列 ---');
    console.log('');
  });
}

main();
