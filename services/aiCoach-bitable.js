/**
 * AI 教练对话引擎 - Bitable 版本
 * 千老师人设：20 年保险销售经验的导师
 */

import axios from 'axios';
import bitable from './bitable.js';

// 千老师 AI 人设
const SYSTEM_PROMPT = `你是一位资深的保险销售导师，名字叫"千老师"。你有 20 年保险销售经验，带过上千个徒弟。

你的特点：
- 专业、温暖、真诚
- 说话简洁有力，像发微信
- 共情能力强，能理解销售的压力和困难
- 善于发现对方的优点，真诚地肯定

说话风格：
- 简洁、温暖、专业
- 用口语，像发微信，不要用书面语
- 不要用网络流行语，不要卖萌

⚠️ 重要规则：
- 每次只说 1-2 句话，只问 1 个问题
- 不要重复已经说过的内容
- 不要发重复的消息
- 简洁是第一原则
- 不要贫嘴，不要过度调侃
- 不要使用 emoji，保持专业形象`;

/**
 * 调用通义千问生成回复
 */
async function callAI(systemPrompt, userPrompt) {
  const apiKey = process.env.DASHSCOPE_API_KEY;
  if (!apiKey) {
    throw new Error('DASHSCOPE_API_KEY 未配置');
  }

  const response = await axios.post(
    'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    {
      model: process.env.DASHSCOPE_MODEL || 'qwen-plus',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.3,
      max_tokens: 200
    },
    {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    }
  );
  return response.data.choices[0].message.content;
}

/**
 * 发送飞书私信
 */
async function sendPrivateMessage(openId, text) {
  const tokenResp = await axios.post(
    'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal',
    {
      app_id: process.env.FEISHU_APP_ID,
      app_secret: process.env.FEISHU_APP_SECRET
    }
  );
  const token = tokenResp.data.tenant_access_token;

  const resp = await axios.post(
    'https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=open_id',
    {
      receive_id: openId,
      msg_type: 'text',
      content: JSON.stringify({ text })
    },
    {
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json'
      }
    }
  );

  if (resp.data.code !== 0) {
    throw new Error('发消息失败: ' + resp.data.msg);
  }
  return resp.data.data;
}

/**
 * 生成关心询问消息（未提交数据）
 */
async function generateCareMessage(name) {
  const userPrompt = `学员${name}今天没有提交活动量数据。

请发一条关心 + 提醒的消息：
1. 先关心询问原因（温暖、不质问）
2. 温和提醒活动量是保险销售的基础
3. 叮嘱提报数据是对自己负责

语气：温暖、专业、简洁，不要贫嘴。
长度：2-3 句话即可。

例子：
- "今天没看到你报数据，是太忙了吗？活动量是保险销售的基础，记得抽空填报哦，这是对自己工作的负责~"

请返回一条消息，简洁有力。`;

  try {
    const content = await callAI(SYSTEM_PROMPT, userPrompt);
    return content.trim();
  } catch (error) {
    console.error('[AI Coach] AI 调用失败:', error.message);
    return `今天没看到你报数据，是太忙了吗？活动量是保险销售的基础，记得抽空填报哦~`;
  }
}

/**
 * 生成第一条复盘消息（已提交数据）
 */
async function generateFirstMessage(name, data) {
  const { total_score, new_leads, referral, invitation, sales_meeting, recruit_meeting, business_plan, deal } = data;

  let userPrompt = `学员${name}今天的活动量数据：
- 总分：${total_score || 0}分
- 新增准客户：${new_leads || 0}
- 转介绍：${referral || 0}
- 邀约：${invitation || 0}
- 销售面谈：${sales_meeting || 0}
- 增员面谈：${recruit_meeting || 0}
- 事业计划：${business_plan || 0}
- 成交：${deal || 0}

`;

  if (deal > 0) {
    userPrompt += `🎉 今天有${deal}单成交！请真诚庆祝，然后专业地复盘成功经验。\n例子："恭喜开单！这单能成，你做对了什么？"`;
  } else if (invitation > 0 && sales_meeting === 0) {
    userPrompt += `邀约${invitation}人，但销售面谈是 0。帮助分析原因。\n例子："邀约不少，但面谈没有。是客户改期了，还是邀约话术可以优化？"`;
  } else if (sales_meeting > 0 && deal === 0) {
    userPrompt += `${sales_meeting}场面谈，但还没成交。帮助分析面谈质量。\n例子："面谈了几场但没成交。面谈时客户的真实顾虑是啥？"`;
  } else if (new_leads > 0 && referral > 0) {
    userPrompt += `今天新增${new_leads}个准客户，还有${referral}个转介绍，获客做得很好！\n例子："今天获客很给力！新客户和转介绍都是从哪来的？"`;
  } else if (new_leads > 0) {
    userPrompt += `今天新增${new_leads}个准客户。肯定获客，问来源。\n例子："加了新客户？怎么认识的？"`;
  } else if (total_score >= 50) {
    userPrompt += `今天${total_score}分，表现优秀！专业复盘。\n例子："今天分数很高！说说，你做对了什么？"`;
  } else if (recruit_meeting > 0) {
    userPrompt += `今天有${recruit_meeting}场增员面谈。\n例子："增员面谈了几场？对方意向咋样？"`;
  } else if (business_plan > 0) {
    userPrompt += `今天讲了${business_plan}场事业计划。\n例子："讲了事业计划？对方反应咋样？"`;
  } else if (total_score > 0 && total_score < 20) {
    userPrompt += `今天分数有点低，${total_score}分。鼓励 + 提醒活动量是基础。\n例子："今天分数不高啊。活动量是保险销售的基础，再忙也要保证基本量~"`;
  } else {
    userPrompt += `今天有一些活动量。简单肯定，问收获或困难。\n例子："今天忙啥了？有什么收获？"`;
  }

  userPrompt += '\n\n请返回一条消息（1-2 句话，简洁有力），专业复盘，不要贫嘴。';

  try {
    const content = await callAI(SYSTEM_PROMPT, userPrompt);
    return content.trim();
  } catch (error) {
    console.error('[AI Coach] AI 调用失败:', error.message);
    return `今天咋样？有什么收获吗？`;
  }
}

/**
 * 生成下一个回复（用户回复后）
 */
async function generateNextMessage(history, userReply) {
  const historyText = history.slice(-6)
    .map(m => `${m.role === 'assistant' ? '教练' : '学员'}: ${m.content}`)
    .join('\n');

  const userPrompt = `对话历史：
${historyText}

学员刚刚回复："${userReply}"

请以保险销售导师的身份，回复学员。
- 先回应他说的话（共情、理解、肯定）
- 然后问一个引导性问题
- 像微信聊天，不要太长
- 一次只问一个问题`;

  try {
    const content = await callAI(SYSTEM_PROMPT, userPrompt);
    return content.trim();
  } catch (error) {
    console.error('[AI Coach] AI 调用失败:', error.message);
    return `你说得很有道理。然后呢？`;
  }
}

/**
 * 生成对话结束的复盘消息
 */
async function generateEndingMessage(name, data, history) {
  const historyText = history.slice(-8)
    .map(m => `${m.role === 'assistant' ? '教练' : '学员'}: ${m.content}`)
    .join('\n');

  const userPrompt = `学员${name}今天的活动量：总分${data.total_score || 0}分。

对话历史：
${historyText}

请以保险销售导师的身份，给学员发一条结束语：
1. 先肯定他今天的表现（找出亮点）
2. 给出 1-2 条具体的小建议
3. 温暖鼓励地收尾

语气要真诚、温暖，像朋友聊天，不要用 AI 腔调。
长度：3-4 句话即可。`;

  try {
    const content = await callAI(SYSTEM_PROMPT, userPrompt);
    return content.trim();
  } catch (error) {
    console.error('[AI Coach] AI 调用失败:', error.message);
    const endings = [
      '好，今天就聊到这。你今天的表现我看在眼里，明天继续，我看好你！',
      '行，不耽误你时间了。今天好好休息，明天咱们继续。销售就是日复一日的坚持！',
      '好嘞，今天就到这。你今天的表现不错，继续保持！明天见~',
    ];
    return endings[Math.floor(Math.random() * endings.length)];
  }
}

/**
 * 从 Bitable 获取所有用户的 open_id 映射
 * 通过飞书通讯录查询
 */
async function getUserOpenIds(names) {
  const tokenResp = await axios.post(
    'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal',
    {
      app_id: process.env.FEISHU_APP_ID,
      app_secret: process.env.FEISHU_APP_SECRET
    }
  );
  const token = tokenResp.data.tenant_access_token;

  const nameMap = {};
  for (const name of names) {
    try {
      const resp = await axios.get(
        `https://open.feishu.cn/open-apis/contact/v3/users/batch_get_id?user_ids=${encodeURIComponent(name)}&user_id_type=user_id`,
        { headers: { 'Authorization': 'Bearer ' + token } }
      );
      // Use search instead
      const searchResp = await axios.get(
        `https://open.feishu.cn/open-apis/contact/v3/users/search?query=${encodeURIComponent(name)}`,
        { headers: { 'Authorization': 'Bearer ' + token } }
      );
      if (searchResp.data.data?.users?.length > 0) {
        nameMap[name] = searchResp.data.data.users[0].open_id;
        console.log(`[AI Coach] ${name} -> ${nameMap[name]}`);
      }
    } catch (e) {
      console.log(`[AI Coach] 查询用户 ${name} 失败:`, e.response?.data?.msg || e.message);
    }
    await new Promise(r => setTimeout(r, 200));
  }
  return nameMap;
}

/**
 * 获取对话状态（从 Bitable 记录的 user_id 字段中）
 * 我们在 user_id 字段临时存储 JSON 对话状态
 */
async function getConversationState(userName, date) {
  const record = await bitable.findRecord({ user_name: userName, activity_date: date });
  if (!record) return null;
  const convData = record.user_id;
  if (!convData) return null;
  try {
    return JSON.parse(convData);
  } catch {
    return null;
  }
}

/**
 * 保存对话状态
 */
async function saveConversationState(userName, date, state) {
  const record = await bitable.findRecord({ user_name: userName, activity_date: date });
  if (!record) {
    console.log(`[AI Coach] 找不到 ${userName} 的记录，无法保存对话状态`);
    return;
  }
  await bitable.updateRecord(record.record_id, {
    fields: { user_id: JSON.stringify(state) }
  });
}

/**
 * 开始 AI 教练对话（每天 21:05）
 * @param {Object} config - { targetUser: '用户名' } 指定用户，不传则全部
 */
async function startAICoachConversations(config = {}) {
  console.log('[AI Coach] 开始今日 AI 教练对话...');

  const today = new Date();
  // 使用北京时区的日期
  const todayStr = today.toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' });

  // 获取所有已提交的记录
  const records = await bitable.getAllRecords();
  const submittedRecords = records.filter(r => r.is_submitted);

  console.log(`[AI Coach] 今天已提交 ${submittedRecords.length} 条记录`);

  // 过滤指定用户
  let targetRecords = submittedRecords;
  if (config.targetUser) {
    targetRecords = submittedRecords.filter(r => r.user_name === config.targetUser);
    if (targetRecords.length === 0) {
      console.log(`[AI Coach] 找不到用户 ${config.targetUser} 的今日提交记录`);
      return { success: true, message: `未找到 ${config.targetUser} 的今日提交记录` };
    }
  }

  // 获取用户 open_id
  const names = [...new Set(targetRecords.map(r => r.user_name))];
  const nameToOpenId = await getUserOpenIds(names);

  let sentCount = 0;
  let skippedCount = 0;

  for (const record of targetRecords) {
    const name = record.user_name;
    const openId = nameToOpenId[name];

    if (!openId) {
      console.log(`[AI Coach] 跳过 ${name} - 未找到飞书 open_id`);
      skippedCount++;
      continue;
    }

    // 检查是否已有进行中的对话
    const convState = await getConversationState(name, todayStr);
    if (convState?.status === 'pending') {
      console.log(`[AI Coach] 跳过 ${name} - 已有进行中的对话`);
      skippedCount++;
      continue;
    }

    try {
      const data = {
        total_score: record.total_score,
        new_leads: record.new_leads,
        referral: record.referral,
        invitation: record.invitation,
        sales_meeting: record.sales_meeting,
        recruit_meeting: record.recruit_meeting,
        business_plan: record.business_plan,
        deal: record.deal,
        eop_guest: record.eop_guest,
        cc_assessment: record.cc_assessment,
        training: record.training
      };

      const message = await generateFirstMessage(name, data);
      console.log(`[AI Coach] ${name}: ${message}`);

      await sendPrivateMessage(openId, message);
      console.log(`[AI Coach] 消息已发送至 ${name} (${openId})`);

      // 保存对话状态
      await saveConversationState(name, todayStr, {
        status: 'pending',
        question_count: 1,
        history: [
          { role: 'assistant', content: message }
        ],
        activity_data: data
      });

      sentCount++;
      // 避免频率限制
      await new Promise(r => setTimeout(r, 1500));
    } catch (error) {
      console.error(`[AI Coach] ${name} 发送失败:`, error.message);
    }
  }

  console.log(`[AI Coach] 今日对话完成: 发送 ${sentCount} 人，跳过 ${skippedCount} 人`);
  return { success: true, sent: sentCount, skipped: skippedCount };
}

export default {
  startAICoachConversations,
  generateFirstMessage,
  generateNextMessage,
  generateEndingMessage,
  generateCareMessage
};
