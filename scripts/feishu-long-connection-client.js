#!/usr/bin/env node
/**
 * 飞书长连接客户端
 * 使用方法：
 * 1. 在飞书后台启用长连接，获取 WebSocket URL
 * 2. 将 URL 填入 .env.local 的 FEISHU_WEBSOCKET_URL
 * 3. 运行：node scripts/feishu-long-connection-client.js
 */

const WebSocket = require('ws');
const axios = require('axios');
const crypto = require('crypto');
require('dotenv').config({ path: __dirname + '/../.env.local' });

// 配置
const FEISHU_APP_ID = process.env.FEISHU_APP_ID || 'cli_a95a6b370af8dcc8';
const FEISHU_APP_SECRET = process.env.FEISHU_APP_SECRET || 'v2XoWID99STcoN1l1ijQtTk0ryEdjizF';
const FEISHU_VERIFICATION_TOKEN = process.env.FEISHU_VERIFICATION_TOKEN;
const FEISHU_API_BASE = 'https://open.feishu.cn';
// 从飞书后台获取的 WebSocket URL
let FEISHU_WEBSOCKET_URL = process.env.FEISHU_WEBSOCKET_URL;

let tenantAccessToken = null;
let tokenExpiresAt = 0;

// 获取 Access Token
async function getTenantAccessToken() {
  if (tenantAccessToken && Date.now() < tokenExpiresAt) {
    return tenantAccessToken;
  }

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

  tenantAccessToken = response.data.tenant_access_token;
  tokenExpiresAt = Date.now() + (response.data.expire - 300) * 1000;
  return tenantAccessToken;
}

// 获取长连接 WebSocket URL（从飞书后台）
async function getWebSocketUrl() {
  if (FEISHU_WEBSOCKET_URL) {
    return FEISHU_WEBSOCKET_URL;
  }

  const token = await getTenantAccessToken();

  // 调用飞书 API 获取 WebSocket URL
  const response = await axios.post(
    `${FEISHU_API_BASE}/open-apis/im/v1/connection`,
    {},
    {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    }
  );

  if (response.data.code === 0) {
    FEISHU_WEBSOCKET_URL = response.data.data.url;
    console.log('[Info] 获取 WebSocket URL 成功');
    return FEISHU_WEBSOCKET_URL;
  } else {
    throw new Error(`获取 WebSocket URL 失败：${response.data.msg}`);
  }
}

// 发送消息
async function sendTextMessage(userId, text) {
  const token = await getTenantAccessToken();
  try {
    await axios.post(
      `${FEISHU_API_BASE}/open-apis/im/v1/messages`,
      {
        receive_id: userId,
        msg_type: 'text',
        content: JSON.stringify({ text })
      },
      {
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        params: { receive_id_type: 'union_id' }
      }
    );
    console.log('[Message] ✓ 已发送');
  } catch (error) {
    console.error('[Message] ✗ 发送失败:', error.message);
  }
}

// 创建 WebSocket 连接
async function createConnection() {
  console.log('');
  console.log('='.repeat(60));
  console.log('🚀 飞书长连接客户端 - AI 教练');
  console.log('='.repeat(60));
  console.log('');

  try {
    const wsUrl = await getWebSocketUrl();
    console.log('[WebSocket] 连接地址:', wsUrl);
    console.log('[WebSocket] 正在连接...');

    const ws = new WebSocket(wsUrl);

    ws.on('open', () => {
      console.log('[WebSocket] ✓ 连接成功！');
      console.log('[Info] 正在监听消息...');
      console.log('');
      console.log('提示：现在可以在飞书中给机器人发消息测试了');
      console.log('');
    });

    ws.on('message', async (data) => {
      try {
        const event = JSON.parse(data.toString());

        // PING - 回复 PONG
        if (event.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong' }));
          return;
        }

        // HELLO - 连接确认
        if (event.type === 'hello') {
          console.log('[WebSocket] Hello 收到');
          return;
        }

        // EVENTS - 事件列表
        if (event.type === 'events') {
          const events = event.events || [];
          for (const e of events) {
            await handleEvent(e, ws);
          }
        }

      } catch (error) {
        console.error('[Event] 处理错误:', error.message);
      }
    });

    ws.on('close', () => {
      console.log('[WebSocket] ✗ 连接断开');
      console.log('[Info] 5 秒后重连...');
      setTimeout(createConnection, 5000);
    });

    ws.on('error', (error) => {
      console.error('[WebSocket] ✗ 错误:', error.message);
    });

  } catch (error) {
    console.error('[Error] 启动失败:', error.message);
    console.log('[Info] 请在飞书后台启用长连接功能');
    console.log('[Info] 路径：飞书开发者后台 → 事件与回调 → 长连接 → 启用');
    console.log('');
    console.log('[Info] 10 秒后重试...');
    setTimeout(createConnection, 10000);
  }
}

// 处理事件
async function handleEvent(event, ws) {
  const { header, event: eventData } = event;

  if (header?.event_type === 'im.message.receive_v1') {
    const { message, sender } = eventData;

    if (!message || !sender) return;

    const senderId = sender.sender_id?.user_id || sender.sender_id?.union_id;
    let textContent = '';

    try {
      const content = typeof message.content === 'string' ? JSON.parse(message.content) : message.content;
      textContent = content.text || '';
    } catch (e) {}

    if (!textContent.trim()) return;

    console.log('');
    console.log('='.repeat(60));
    console.log(`[Message] 收到消息`);
    console.log(`  用户：${senderId}`);
    console.log(`  内容：${textContent}`);
    console.log('='.repeat(60));

    // TODO: AI 教练回复逻辑
    // 暂时回复测试消息
    await sendTextMessage(senderId, `🤖 收到您的消息了！\n\n您说：${textContent}\n\nAI 教练功能开发中...`);

    // 发送确认
    ws.send(JSON.stringify({ event_id: header?.event_id, status: 'ok' }));
  }
}

// 启动
createConnection();
