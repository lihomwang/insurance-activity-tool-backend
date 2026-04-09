// scripts/lark-long-connection.js
// 飞书长连接客户端 - 使用官方 SDK
// 参考文档：https://open.feishu.cn/document/ukTMukTMukTM/ucTMzMjLhAT

const { Client, LongConnection, EventType } = require('@larksuite/openclaw-lark');
require('dotenv').config({ path: __dirname + '/../.env.local' });

// 配置
const FEISHU_APP_ID = process.env.FEISHU_APP_ID || 'cli_a95a6b370af8dcc8';
const FEISHU_APP_SECRET = process.env.FEISHU_APP_SECRET || 'v2XoWID99STcoN1l1ijQtTk0ryEdjizF';
const FEISHU_VERIFICATION_TOKEN = process.env.FEISHU_VERIFICATION_TOKEN;

console.log('');
console.log('='.repeat(60));
console.log('飞书长连接客户端');
console.log('='.repeat(60));
console.log('');

// 创建客户端
const client = new Client({
  appId: FEISHU_APP_ID,
  appSecret: FEISHU_APP_SECRET,
});

// 创建长连接实例
const longConnection = new LongConnection(client, {
  // 事件处理器
  handlers: {
    // 接收消息事件
    [EventType.ImMessageReceiveV1]: async (event) => {
      console.log('');
      console.log('='.repeat(60));
      console.log('[Event] 收到消息');
      console.log('  发送者:', event.sender?.user_id);
      console.log('  消息 ID:', event.message_id);
      console.log('  内容:', event.content);
      console.log('='.repeat(60));

      // TODO: 这里处理 AI 教练回复逻辑
      // 暂时回复一个测试消息
      try {
        await client.im.message.create({
          receive_id: event.sender.user_id,
          msg_type: 'text',
          content: JSON.stringify({
            text: `🤖 AI 教练收到您的消息了！\n\n您说：${JSON.parse(event.content).text}\n\n我正在思考如何回复您...`
          })
        }, {
          receive_id_type: 'union_id'
        });
        console.log('[Reply] ✓ 已回复');
      } catch (error) {
        console.error('[Reply] ✗ 回复失败:', error.message);
      }
    },

    // 消息已读事件（可选）
    [EventType.ImMessageReadV1]: async (event) => {
      console.log('[Event] 消息已读:', event.message_id);
    },
  }
});

// 监听连接状态
longConnection.on('connected', () => {
  console.log('[Connection] ✓ 已连接');
  console.log('[Info] 开始监听消息...');
  console.log('');
});

longConnection.on('disconnected', () => {
  console.log('[Connection] ✗ 连接断开');
  console.log('[Info] 3 秒后重连...');
});

longConnection.on('error', (error) => {
  console.error('[Connection] 错误:', error.message);
});

// 启动长连接
async function start() {
  try {
    console.log('[Info] 正在连接飞书...');
    await longConnection.connect();
    console.log('[Info] 长连接已启动');
  } catch (error) {
    console.error('[Error] 启动失败:', error.message);
    console.log('[Info] 5 秒后重试...');
    setTimeout(start, 5000);
  }
}

start();
