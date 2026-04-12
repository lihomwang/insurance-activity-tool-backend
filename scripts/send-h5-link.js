// scripts/send-h5-link.js
// 在飞书群里发送 H5 应用卡片消息

import dotenv from 'dotenv';
import axios from 'axios';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 加载环境变量
dotenv.config({ path: join(__dirname, '../.env.local'), override: true });

// 配置
const FEISHU_APP_ID = process.env.FEISHU_APP_ID;
const FEISHU_APP_SECRET = process.env.FEISHU_APP_SECRET;

// H5 应用地址
const H5_URL = process.env.REPORT_URL || 'https://money888-e3c.pages.dev';

/**
 * 获取租户 Token
 */
async function getToken() {
  const response = await axios.post(
    'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal',
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
 * 发送交互式卡片消息到群
 */
async function sendInteractiveCard(chatId) {
  const token = await getToken();

  // 飞书交互式卡片 - 活动量日报卡片
  const cardContent = {
    config: {
      wide_screen_mode: true
    },
    header: {
      template: 'blue',
      title: {
        tag: 'plain_text',
        content: '📊 活动量管理 - 乐高骑士团队'
      }
    },
    elements: [
      {
        tag: 'div',
        text: {
          tag: 'lark_md',
          content: "**📅 每日活动量填报**\n记录每一天的努力，成就更好的自己！"
        }
      },
      {
        tag: 'note',
        elements: [
          {
            tag: 'plain_text',
            content: '💡 活动量是保险销售的基础，坚持记录，见证成长！'
          }
        ]
      },
      {
        tag: 'action',
        actions: [
          {
            tag: 'button',
            text: {
              tag: 'plain_text',
              content: '📝 填报今日活动量'
            },
            url: H5_URL,
            type: 'primary',
            multi_url_support: true
          },
          {
            tag: 'button',
            text: {
              tag: 'plain_text',
              content: '📈 查看我的数据'
            },
            url: H5_URL,
            type: 'default',
            multi_url_support: true
          },
          {
            tag: 'button',
            text: {
              tag: 'plain_text',
              content: '🏆 团队排行榜'
            },
            url: H5_URL,
            type: 'default',
            multi_url_support: true
          }
        ]
      },
      {
        tag: 'hr'
      },
      {
        tag: 'div',
        text: {
          tag: 'lark_md',
          content: "**⏰ 提醒**\n千老师 AI 教练会在每晚 21:05 与你进行一对一复盘对话 💪"
        }
      }
    ]
  };

  const response = await axios.post(
    `https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=chat_id`,
    {
      receive_id: chatId,
      msg_type: 'interactive',
      content: JSON.stringify(cardContent)
    },
    {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      params: {
        receive_id_type: 'chat_id'
      }
    }
  );

  console.log('✅ 卡片消息发送成功！');
  console.log('消息 ID:', response.data.data.message_id);
  return response.data.data.message_id;
}

// 主函数
async function main() {
  console.log('=== 飞书群发卡片消息工具 ===\n');
  console.log(`H5 地址：${H5_URL}\n`);

  const chatId = process.argv[2];

  if (!chatId) {
    console.log('使用方法：');
    console.log('  node scripts/send-h5-link.js <chat_id>');
    return;
  }

  console.log(`目标群聊：${chatId}`);
  console.log('发送卡片消息中...\n');

  try {
    await sendInteractiveCard(chatId);
    console.log('\n✅ 完成！');
  } catch (error) {
    console.error('\n❌ 发送失败:', error.response?.data || error.message);
  }
}

main();
