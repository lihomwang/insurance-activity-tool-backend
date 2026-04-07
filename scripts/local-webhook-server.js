// scripts/local-webhook-server.js
// 本地 Webhook 服务器 - 接收飞书事件回调
// 配合 ngrok 使用：ngrok http 3000

const express = require('express');
const crypto = require('crypto');
require('dotenv').config({ path: __dirname + '/../.env.local' });

// 配置
const FEISHU_APP_ID = process.env.FEISHU_APP_ID || 'cli_a95a6b370af8dcc8';
const FEISHU_APP_SECRET = process.env.FEISHU_APP_SECRET || 'v2XoWID99STcoN1l1ijQtTk0ryEdjizF';
const FEISHU_VERIFICATION_TOKEN = process.env.FEISHU_VERIFICATION_TOKEN;
const FEISHU_ENCRYPT_KEY = process.env.FEISHU_ENCRYPT_KEY;
const FEISHU_API_BASE = 'https://open.feishu.cn';
const PORT = process.env.PORT || 3000;

const axios = require('axios');
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

  const valid = signature === calcSignature;
  console.log(`[Signature] ${valid ? '✓ 验证通过' : '✗ 验证失败'}`);
  return valid;
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

    console.log('[Message] ✓ 已发送:', text.substring(0, 30));
    return response.data.data;
  } catch (error) {
    console.error('[Message] ✗ 发送失败:', error.message);
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

    console.log('[Card] ✓ 已发送至:', userId);
    return response.data.data;
  } catch (error) {
    console.error('[Card] ✗ 发送失败:', error.message);
    throw error;
  }
}

// 处理用户消息 - AI 教练回复
async function handleUserMessage(event) {
  const { message, sender } = event;

  if (!message || !sender) {
    console.log('[Event] ✗ 无效事件');
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
    console.log('[Event] ✗ 空消息');
    return;
  }

  // 获取发送者 ID
  const senderId = sender.sender_id?.user_id || sender.sender_id?.open_id || sender.sender_id?.union_id;
  if (!senderId) {
    console.log('[Event] ✗ 无发送者 ID');
    return;
  }

  console.log('');
  console.log('='.repeat(60));
  console.log(`[Event] ✓ 收到用户消息`);
  console.log(`  用户 ID: ${senderId}`);
  console.log(`  消息：${textContent}`);
  console.log('='.repeat(60));

  // AI 教练回复逻辑
  // 暂时回复一个测试消息
  await sendTextMessage(senderId, `🤖 AI 教练收到您的消息了！\n\n您说：${textContent}\n\n我正在思考如何回复您...（AI 教练功能开发中）`);
}

// 创建 Express 服务器
const app = express();

// 解析 JSON 请求体
app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf.toString();
  }
}));

// 健康检查
app.get('/', (req, res) => {
  res.send('飞书 Webhook 服务器运行中...');
});

// 飞书回调入口
app.post('/feishu/webhook', async (req, res) => {
  console.log('');
  console.log('[Webhook] 收到请求');

  try {
    const body = req.body;
    const { challenge, token, type, header, event: eventData } = body;

    console.log('[Webhook] 类型:', type);
    console.log('[Webhook] 事件类型:', header?.event_type);

    // 1. 验证挑战（初次配置时需要）
    if (type === 'url_verification') {
      console.log('[Webhook] 验证挑战');
      if (!verifySignature(header?.timestamp, header?.nonce, header?.signature)) {
        return res.status(401).json({ error: 'Invalid signature' });
      }
      return res.json({ challenge });
    }

    // 2. 处理事件回调
    if (type === 'event_callback') {
      // 验证签名
      if (!verifySignature(header?.timestamp, header?.nonce, header?.signature)) {
        console.log('[Webhook] ✗ 签名验证失败');
        return res.status(401).json({ error: 'Invalid signature' });
      }

      // 解密消息（如果有加密）
      if (body.encrypt && FEISHU_ENCRYPT_KEY) {
        console.log('[Webhook] 解密消息');
        const decrypted = decryptMessage(body.encrypt);
        Object.assign(eventData, decrypted);
      }

      // 处理接收消息事件
      if (header?.event_type === 'im.message.receive_v1') {
        console.log('[Webhook] 处理接收消息事件');
        // 异步处理，不阻塞响应
        handleUserMessage(eventData).catch(err => {
          console.error('[Webhook] 处理消息错误:', err.message);
        });
      }

      // 立即返回成功
      return res.json({ success: true });
    }

    // 其他事件类型，返回成功
    return res.json({ success: true });

  } catch (error) {
    console.error('[Webhook] 错误:', error.message);
    return res.status(500).json({ error: error.message });
  }
});

// 启动服务器
app.listen(PORT, () => {
  console.log('');
  console.log('='.repeat(60));
  console.log('飞书 Webhook 服务器');
  console.log('='.repeat(60));
  console.log(`本地地址：http://localhost:${PORT}/feishu/webhook`);
  console.log('');
  console.log('使用 ngrok 暴露到公网:');
  console.log(`  ngrok http ${PORT}`);
  console.log('');
  console.log('然后在飞书后台填写 ngrok 提供的公网 URL');
  console.log('='.repeat(60));
  console.log('');
});
