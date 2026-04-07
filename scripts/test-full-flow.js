#!/usr/bin/env node
// 测试完整流程

require('dotenv').config({ path: '.env' });
const axios = require('axios');

console.log('='.repeat(60));
console.log('测试环境配置');
console.log('='.repeat(60));
console.log('FEISHU_APP_ID:', process.env.FEISHU_APP_ID);
console.log('FEISHU_BITABLE_APP_TOKEN:', process.env.FEISHU_BITABLE_APP_TOKEN);
console.log('FEISHU_BITABLE_TABLE_ID:', process.env.FEISHU_BITABLE_TABLE_ID);
console.log('');

async function getTenantAccessToken() {
  const response = await axios.post(
    `${process.env.FEISHU_API_BASE}/open-apis/auth/v3/tenant_access_token/internal`,
    {
      app_id: process.env.FEISHU_APP_ID,
      app_secret: process.env.FEISHU_APP_SECRET
    }
  );
  if (response.data.code !== 0) {
    throw new Error(`获取 Token 失败：${response.data.msg}`);
  }
  return response.data.tenant_access_token;
}

async function testBitableData() {
  console.log('='.repeat(60));
  console.log('测试 1: 获取多维表格数据');
  console.log('='.repeat(60));

  const token = await getTenantAccessToken();
  console.log('[OK] 获取 Token 成功');

  const response = await axios.get(
    `${process.env.FEISHU_API_BASE}/open-apis/bitable/v1/apps/${process.env.FEISHU_BITABLE_APP_TOKEN}/tables/${process.env.FEISHU_BITABLE_TABLE_ID}/records`,
    {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    }
  );

  if (response.data.code !== 0) {
    console.log('[FAIL] 获取数据失败:', response.data.msg);
    return;
  }

  console.log('[OK] 获取数据成功');
  const items = response.data.data.items || [];
  console.log(`共 ${items.length} 条记录:`);

  const today = new Date().toISOString().split('T')[0];
  console.log('今天日期:', today);

  items.forEach((item, i) => {
    const fields = item.fields || {};
    const recordDate = fields.activity_date
      ? new Date(fields.activity_date).toISOString().split('T')[0]
      : '无日期';
    console.log(`${i + 1}. ${fields.user_name || '无名称'} - 日期：${recordDate} - 总分：${fields.total_score || '0'} - 手机：${fields.mobile || '无'}`);
  });

  // 过滤今天的数据
  const todayItems = items.filter(item => {
    const recordDate = item.fields?.activity_date
      ? new Date(item.fields.activity_date).toISOString().split('T')[0]
      : null;
    return recordDate === today;
  });

  console.log('');
  console.log(`今日数据：${todayItems.length} 条`);

  if (todayItems.length === 0) {
    console.log('[WARN] 没有找到今日数据，请在多维表格中添加今日数据');
  } else {
    console.log('[OK] 找到今日数据');
    todayItems.forEach(item => {
      console.log('  -', item.fields.user_name, '总分:', item.fields.total_score);
    });
  }
}

async function testSend_message() {
  console.log('');
  console.log('='.repeat(60));
  console.log('测试 2: 发送消息给用户');
  console.log('='.repeat(60));

  // 使用皮叔的用户 ID
  const testUserId = 'ou_8a46e978ee2f7c4a9e3ab1f6e3c0b5d8'; // 需要通过手机号获取

  const token = await getTenantAccessToken();

  // 先通过手机号获取用户 ID
  const mobile = '18611482031';
  console.log(`通过手机号 ${mobile} 获取用户 ID...`);

  const idResponse = await axios.post(
    `${process.env.FEISHU_API_BASE}/open-apis/contact/v3/users/batch_get_id`,
    { mobiles: [mobile] },
    {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      params: { user_ids_type: 'union_id' }
    }
  );

  if (idResponse.data.code === 0 && idResponse.data.data?.user_list?.length > 0) {
    const userId = idResponse.data.data.user_list[0].user_id;
    console.log('[OK] 获取用户 ID 成功:', userId);

    // 发送测试消息
    const card = {
      config: { wide_screen_mode: true },
      header: {
        template: 'blue',
        title: { tag: 'plain_text', content: '🤖 AI 教练测试' }
      },
      elements: [
        {
          tag: 'markdown',
          content: '你好！这是一条测试消息。\n\n如果你收到这条消息，说明 AI 教练功能正常工作！'
        },
        { tag: 'hr' },
        {
          tag: 'markdown',
          content: '💡 **今日总结**: 测试成功，继续保持！'
        }
      ]
    };

    console.log('正在发送消息...');
    const msgResponse = await axios.post(
      `${process.env.FEISHU_API_BASE}/open-apis/im/v1/messages`,
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
        params: { receive_id_type: 'union_id' }
      }
    );

    if (msgResponse.data.code === 0) {
      console.log('[OK] 消息发送成功!');
      console.log('消息 ID:', msgResponse.data.data.message_id);
    } else {
      console.log('[FAIL] 发送失败:', msgResponse.data.msg);
    }
  } else {
    console.log('[FAIL] 获取用户 ID 失败:', idResponse.data.msg);
  }
}

async function main() {
  try {
    await testBitableData();
    await testSend_message();
    console.log('');
    console.log('='.repeat(60));
    console.log('测试完成');
    console.log('='.repeat(60));
  } catch (error) {
    console.error('[ERROR]', error.message);
  }
}

main();
