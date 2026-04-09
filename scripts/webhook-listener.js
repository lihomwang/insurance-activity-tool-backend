// scripts/webhook-listener.js
// 飞书长连接消息监听器
// 使用 WebSocket 接收飞书事件回调

const WebSocket = require('ws');
const axios = require('axios');
const crypto = require('crypto');
require('dotenv').config({ path: __dirname + '/../.env.local' });

// 配置
const FEISHU_APP_ID = process.env.FEISHU_APP_ID || 'cli_a95a6b370af8dcc8';
const FEISHU_APP_SECRET = process.env.FEISHU_APP_SECRET || 'v2XoWID99STcoN1l1ijQtTk0ryEdjizF';
const FEISHU_VERIFICATION_TOKEN = process.env.FEISHU_VERIFICATION_TOKEN;
const FEISHU_ENCRYPT_KEY = process.env.FEISHU_ENCRYPT_KEY;
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

// 验证签名
function verifySignature(timestamp, nonce, signature) {
  if (!FEISHU_VERIFICATION_TOKEN) {
    console.warn('[Warn] No verification token configured');
    return true;
  }

  const arr = [timestamp, nonce, FEISHU_VERIFICATION_TOKEN];
  arr.sort();
  const sha = crypto.createHash('sha1');
  sha.update(arr.join(''));
  const calcSignature = sha.digest('hex');

  return signature === calcSignature;
}

// 解密消息
function decryptMessage(encrypt) {
  if (!FEISHU_ENCRYPT_KEY) {
    return JSON.parse(Buffer.from(encrypt, 'base64').toString());
  }

  const decipher = crypto.createDecipheriv(
    'aes-128-cbc',
    Buffer.from(FEISHU_ENCRYPT_KEY, 'base64'),
    Buffer.from(FEISHU_ENCRYPT_KEY, 'base64')
  );
  decipher.setAutoPadding(false);
  let decrypted = decipher.update(encrypt, 'base64', 'utf8');
  decrypted += decipher.final('utf8');

  const pad = decrypted.charCodeAt(decrypted.length - 1);
  decrypted = decrypted.substring(0, decrypted.length - pad);

  return JSON.parse(decrypted);
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

    console.log('[Message] Sent:', text.substring(0, 50));
    return response.data.data;
  } catch (error) {
    console.error('[Message] Send failed:', error.message);
    throw error;
  }
}

// 发送卡片消息
async function sendInteractiveCard(userId, cardContent) {
  const token = await getTenantAccessToken();

  try {
    const response = await axios.post(
      `${FEISHU_API_BASE}/open-apis/im/v1/messages`,
      {
        receive_id: userId,
        msg_type: 'interactive',
        content: JSON.stringify(cardContent)
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

    console.log('[Card] Sent to:', userId);
    return response.data.data;
  } catch (error) {
    console.error('[Card] Send failed:', error.message);
    throw error;
  }
}

// 处理用户消息
async function handleUserMessage(event) {
  const { message, sender } = event;

  if (!message || !sender) {
    console.log('[Event] Invalid event, skipping');
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
    console.log('[Event] Empty message, skipping');
    return;
  }

  // 获取发送者 ID
  const senderId = sender.sender_id?.user_id || sender.sender_id?.open_id || sender.sender_id?.union_id;
  if (!senderId) {
    console.log('[Event] No sender ID, skipping');
    return;
  }

  console.log('');
  console.log('='.repeat(60));
  console.log(`[Event] 收到用户消息`);
  console.log(`  用户 ID: ${senderId}`);
  console.log(`  消息：${textContent}`);
  console.log('='.repeat(60));

  // TODO: 这里是 AI 教练对话逻辑
  // 1. 查询用户
  // 2. 查找进行中的对话
  // 3. 生成回复
  // 4. 发送回复

  // 暂时回复一个测试消息
  await sendTextMessage(senderId, `收到您的消息了：${textContent}\n\nAI 教练功能正在开发中...`);
}

// 创建 WebSocket 连接
async function createWebSocket() {
  const token = await getTenantAccessToken();

  // 获取 WebSocket 连接地址
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

  if (response.data.code !== 0) {
    throw new Error(`获取 WebSocket 地址失败：${response.data.msg}`);
  }

  const wsUrl = response.data.data.url;
  console.log('[WebSocket] Got URL:', wsUrl);

  return wsUrl;
}

// 启动监听器
async function startListener() {
  console.log('');
  console.log('='.repeat(60));
  console.log('飞书长连接消息监听器');
  console.log('='.repeat(60));
  console.log('');

  try {
    const wsUrl = await createWebSocket();
    const ws = new WebSocket(wsUrl);

    ws.on('open', () => {
      console.log('[WebSocket] Connected!');
      console.log('[Info] 开始监听消息...');
      console.log('');
    });

    ws.on('message', async (data) => {
      try {
        const event = JSON.parse(data.toString());

        // 处理不同类型的事件
        if (event.type === 'hello') {
          console.log('[WebSocket] Hello received');
          return;
        }

        if (event.type === 'events') {
          const events = event.events || [];

          for (const e of events) {
            // 验证签名
            const header = e.header;
            if (header?.signature) {
              const valid = verifySignature(header.timestamp, header.nonce, header.signature);
              if (!valid) {
                console.log('[Event] Invalid signature, skipping');
                continue;
              }
            }

            // 解密消息（如果有加密）
            if (e.encrypt) {
              Object.assign(e, decryptMessage(e.encrypt));
            }

            // 处理事件
            if (header?.event_type === 'im.message.receive_v1') {
              await handleUserMessage(e.event);
            }

            // 发送确认
            ws.send(JSON.stringify({
              event_id: header?.event_id
            }));
          }
        }

        if (event.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong' }));
        }

      } catch (error) {
        console.error('[Event] Process error:', error.message);
      }
    });

    ws.on('close', () => {
      console.log('[WebSocket] Disconnected');
      console.log('[Info] 5 秒后重连...');
      setTimeout(startListener, 5000);
    });

    ws.on('error', (error) => {
      console.error('[WebSocket] Error:', error.message);
    });

  } catch (error) {
    console.error('[Error] Start failed:', error.message);
    console.log('[Info] 5 秒后重试...');
    setTimeout(startListener, 5000);
  }
}

// 启动
startListener();
