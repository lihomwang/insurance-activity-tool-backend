// scripts/feishu-websocket-client.js
// 飞书长连接客户端 - 原生 WebSocket 实现
// 根据飞书文档：https://open.feishu.cn/document/ukTMukTMukTM/uETO1YjLxkTN24SM5UjN

const WebSocket = require('ws');
const axios = require('axios');
const crypto = require('crypto');
require('dotenv').config({ path: __dirname + '/../.env.local' });

// 配置
const FEISHU_APP_ID = process.env.FEISHU_APP_ID || 'cli_a95a6b370af8dcc8';
const FEISHU_APP_SECRET = process.env.FEISHU_APP_SECRET || 'v2XoWID99STcoN1l1ijQtTk0ryEdjizF';
const FEISHU_VERIFICATION_TOKEN = process.env.FEISHU_VERIFICATION_TOKEN;
const FEISHU_API_BASE = 'https://open.feishu.cn';

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

  console.log('[Auth] Token refreshed');
  return tenantAccessToken;
}

// 获取长连接 WebSocket URL
// 注意：这个 API 需要在飞书后台先启用长连接功能
async function getWebSocketUrl() {
  const token = await getTenantAccessToken();

  try {
    // 方法 1: 尝试使用长连接 API
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
      console.log('[WebSocket] 获取连接地址成功');
      return response.data.data.url;
    } else {
      throw new Error(response.data.msg);
    }
  } catch (error) {
    console.error('[WebSocket] 获取连接地址失败:', error.message);
    console.log('[提示] 请确保在飞书后台已启用长连接功能');
    console.log('[提示] 路径：飞书开发者后台 → 事件与回调 → 长连接 → 启用');
    throw error;
  }
}

// 验证签名
function verifySignature(timestamp, nonce, signature) {
  if (!FEISHU_VERIFICATION_TOKEN) {
    return true;
  }

  const arr = [timestamp, nonce, FEISHU_VERIFICATION_TOKEN];
  arr.sort();
  const sha = crypto.createHash('sha1');
  sha.update(arr.join(''));
  const calcSignature = sha.digest('hex');

  return signature === calcSignature;
}

// 发送消息
async function sendTextMessage(userId, text) {
  const token = await getTenantAccessToken();

  try {
    const response = await axios.post(
      `${FEISHU_API_BASE}/open-apis/im/v1/messages`,
      {
        receive_id: userId,
        msg_type: 'text',
        content: JSON.stringify({ text })
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

    console.log('[Message] ✓ 已发送:', text.substring(0, 30));
    return response.data.data;
  } catch (error) {
    console.error('[Message] ✗ 发送失败:', error.message);
    throw error;
  }
}

// 处理接收到的事件
async function handleEvent(event) {
  const { header, event: eventData } = event;

  console.log('');
  console.log('='.repeat(60));
  console.log('[Event] 收到事件');
  console.log('  类型:', header?.event_type);
  console.log('  Event ID:', header?.event_id);
  console.log('='.repeat(60));

  // 验证签名
  if (header?.signature && !verifySignature(header.timestamp, header.nonce, header.signature)) {
    console.log('[Event] ✗ 签名验证失败');
    return;
  }

  // 处理消息接收事件
  if (header?.event_type === 'im.message.receive_v1') {
    const { message, sender } = eventData;

    if (!message || !sender) {
      console.log('[Event] 无效消息，跳过');
      return;
    }

    const messageId = message.message_id;
    const chatId = message.chat_id;
    const messageType = message.message_type;
    const messageContent = message.content;

    // 解析消息内容
    let textContent = '';
    if (messageType === 'text') {
      const content = typeof messageContent === 'string' ? JSON.parse(messageContent) : messageContent;
      textContent = content.text || '';
    }

    if (!textContent.trim()) {
      console.log('[Event] 空消息，跳过');
      return;
    }

    // 获取发送者 ID
    const senderId = sender.sender_id?.user_id || sender.sender_id?.open_id || sender.sender_id?.union_id;
    if (!senderId) {
      console.log('[Event] 无发送者 ID，跳过');
      return;
    }

    console.log(`[Event] 用户消息：${senderId} 说 "${textContent}"`);

    // TODO: AI 教练回复逻辑
    // 暂时回复一个测试消息
    await sendTextMessage(senderId, `🤖 AI 教练收到您的消息了！\n\n您说：${textContent}\n\n（AI 教练功能开发中）`);
  }

  // 发送确认
  return { event_id: header?.event_id };
}

// 创建并启动 WebSocket 连接
async function startWebSocket() {
  console.log('');
  console.log('='.repeat(60));
  console.log('飞书长连接客户端');
  console.log('='.repeat(60));
  console.log('');

  try {
    const wsUrl = await getWebSocketUrl();
    console.log('[WebSocket] 连接地址:', wsUrl);

    const ws = new WebSocket(wsUrl);

    ws.on('open', () => {
      console.log('[WebSocket] ✓ 已连接');
      console.log('[Info] 开始监听事件...');
      console.log('');
    });

    ws.on('message', async (data) => {
      try {
        const event = JSON.parse(data.toString());
        console.log('[Raw] 收到:', JSON.stringify(event, null, 2));

        // 处理不同类型的事件
        if (event.type === 'hello') {
          console.log('[WebSocket] Hello 收到');
          return;
        }

        if (event.type === 'events') {
          const events = event.events || [];
          for (const e of events) {
            await handleEvent(e);
          }
          // 发送确认
          ws.send(JSON.stringify({ status: 'ok' }));
        }

        if (event.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong' }));
        }

      } catch (error) {
        console.error('[Event] 处理错误:', error.message);
      }
    });

    ws.on('close', () => {
      console.log('[WebSocket] ✗ 连接断开');
      console.log('[Info] 5 秒后重连...');
      setTimeout(startWebSocket, 5000);
    });

    ws.on('error', (error) => {
      console.error('[WebSocket] 错误:', error.message);
    });

  } catch (error) {
    console.error('[Error] 启动失败:', error.message);
    console.log('[Info] 10 秒后重试...');
    setTimeout(startWebSocket, 10000);
  }
}

// 启动
startWebSocket();
