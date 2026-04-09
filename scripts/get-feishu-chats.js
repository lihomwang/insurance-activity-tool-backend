// scripts/get-feishu-chats.js
// 获取飞书群聊列表工具

require('dotenv').config();
const axios = require('axios');

async function getTenantAccessToken() {
  const response = await axios.post(
    `${process.env.FEISHU_API_BASE || 'https://open.feishu.cn'}/open-apis/auth/v3/tenant_access_token/internal`,
    {
      app_id: process.env.FEISHU_APP_ID,
      app_secret: process.env.FEISHU_APP_SECRET
    }
  );
  return response.data.tenant_access_token;
}

async function getChatList() {
  const token = await getTenantAccessToken();

  const response = await axios.get(
    `${process.env.FEISHU_API_BASE || 'https://open.feishu.cn'}/open-apis/im/v1/chats`,
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

  return response.data.data;
}

// 主程序
(async () => {
  try {
    console.log('正在获取飞书群聊列表...\n');

    const result = await getChatList();
    const chats = result.items || [];

    console.log(`找到 ${chats.length} 个群聊:\n`);
    console.log('─'.repeat(80));

    chats.forEach((chat, index) => {
      console.log(`${index + 1}. ${chat.name || '未命名群'}
   Chat ID: ${chat.chat_id}
   类型：${chat.chat_mode === 'group' ? '群聊' : '单聊'}
   成员数：${chat.member_count || '-'}
   创建时间：${new Date(chat.create_time).toLocaleString('zh-CN')}`);
      console.log('─'.repeat(80));
    });

    console.log('\n请复制你要使用的群聊的 chat_id，然后添加到 .env 文件：');
    console.log('FEISHU_OPENCLAW_CHAT_ID=oc_xxxxxxxxxxxxx');

  } catch (error) {
    console.error('获取失败:', error.response?.data || error.message);
  }

  process.exit(0);
})();
