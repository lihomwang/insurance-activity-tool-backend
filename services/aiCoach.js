// services/aiCoach.js
// AI 教练对话引擎 - 真人式引导对话
// 风格：像一位经验丰富、共情能力强、专业的保险销售导师

import db from './db.js';
import feishu from './feishu.js';
import safetyFilter from './safetyFilter.js';
import axios from 'axios';

// AI 教练系统提示词 - 千老师人设
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
 * 调用 AI 生成回复（使用阿里百炼 Claude API）
 * @param {string} systemPrompt - 系统提示词
 * @param {string} userPrompt - 用户提示词
 */
async function callAI(systemPrompt, userPrompt) {
  try {
    const response = await axios.post(
      'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
      {
        model: 'claude-sonnet-4-20250514',  // 阿里百炼提供的 Claude 模型
        messages: [
          {
            role: 'system',
            content: systemPrompt
          },
          {
            role: 'user',
            content: userPrompt
          }
        ],
        temperature: 0.3,
        max_tokens: 200
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.DASHSCOPE_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );
    return response.data.choices[0].message.content;
  } catch (error) {
    console.error('调用 AI 失败:', error.message);
    throw error;
  }
}

/**
 * 生成关心询问消息（针对未提交数据的用户）
 * @param {Object} userData - 用户数据
 */
async function generateCareMessage(userData) {
  const { name } = userData;

  const userPrompt = `学员${name}今天没有提交活动量数据。

请发一条关心 + 提醒的消息：
1. 先关心询问原因（温暖、不质问）
2. 温和提醒活动量是保险销售的基础
3. 叮嘱提报数据是对自己负责

语气：温暖、专业、简洁，不要贫嘴。
长度：2-3 句话即可。

例子：
- "今天没看到你报数据，是太忙了吗？活动量是保险销售的基础，记得抽空填报哦，这是对自己工作的负责~"
- "今天还没报数据呢，是不是遇到什么事了？活动量记录很重要，是对自己工作的复盘和负责，别忘了填报哈~"

请返回一条消息，简洁有力。`;

  try {
    const content = await callAI(SYSTEM_PROMPT, userPrompt);
    return {
      message: content.trim()
    };
  } catch (error) {
    console.error('调用 AI 失败:', error.message);
    // 备用消息
    const fallbackMessages = [
      `今天没看到你报数据，是太忙了吗？活动量是保险销售的基础，记得抽空填报哦，这是对自己工作的负责~`,
      `今天还没报数据呢，是不是遇到什么事了？活动量记录很重要，是对自己工作的复盘和负责，别忘了填报哈~`,
      `活动量还没填报哦。这是对自己工作的记录和负责，再忙也别忘了~`
    ];
    return {
      message: fallbackMessages[Math.floor(Math.random() * fallbackMessages.length)]
    };
  }
}

/**
 * 根据活动量数据生成第一个问题（专业复盘）
 * @param {Object} userData - 用户数据
 * @param {Object} activityData - 当日活动量数据
 */
async function generateFirstMessage(userData, activityData) {
  const { name } = userData;
  const { total_score, new_leads, referral, invitation, sales_meeting, recruit_meeting, business_plan, deal } = activityData || {};

  // 构建数据复盘
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

  // 根据具体场景生成专业复盘
  if (deal > 0) {
    userPrompt += `🎉 今天有${deal}单成交！
请真诚庆祝，然后专业地复盘成功经验。
语气：真诚、专业、简洁。
例子："恭喜开单！🎉 这单能成，你做对了什么？"
例子："开单了！厉害！说说，关键突破点是啥？"`;
  } else if (invitation > 0 && sales_meeting === 0) {
    userPrompt += `邀约${invitation}人，但销售面谈是 0。
帮助分析原因：是被拒绝还是改期？
语气：专业、给建议。
例子："邀约不少，但面谈没有。是客户改期了，还是邀约话术可以优化？"
例子："邀约到面谈的转化是 0，聊聊，哪里可以改进？"`;
  } else if (sales_meeting > 0 && deal === 0) {
    userPrompt += `${sales_meeting}场面谈，但还没成交。
帮助分析面谈质量，给建议。
语气：专业、建设性。
例子："面谈了几场但没成交。面谈时客户的真实顾虑是啥？"
例子："面谈不少，但没转化。要不要聊聊面谈技巧？"
例子："面谈是成交的基础，继续坚持。今天面谈有什么新发现？"`;
  } else if (new_leads > 0 && referral > 0) {
    userPrompt += `今天新增${new_leads}个准客户，还有${referral}个转介绍，获客做得很好！
请肯定获客能力，问来源渠道。
例子："今天获客很给力！新客户和转介绍都是从哪来的？"
例子："准客户和转介绍都有，获客渠道挺广啊，说说怎么做的？"`;
  } else if (new_leads > 0) {
    userPrompt += `今天新增${new_leads}个准客户。
肯定获客，问来源。
例子："加了新客户？怎么认识的？"
例子："新客户来源是啥？"`;
  } else if (total_score >= 50) {
    userPrompt += `今天${total_score}分，表现优秀！
专业复盘，帮助总结成功模式。
例子："今天分数很高！说说，你做对了什么？"
例子："状态不错啊！今天的成功经验可以复制吗？"`;
  } else if (recruit_meeting > 0) {
    userPrompt += `今天有${recruit_meeting}场增员面谈。
帮助分析增员进展。
例子："增员面谈了几场？对方意向咋样？"
例子："增员是团队发展的基础，继续坚持。今天面得咋样？"`;
  } else if (business_plan > 0) {
    userPrompt += `今天讲了${business_plan}场事业计划。
帮助分析对方反应。
例子："讲了事业计划？对方反应咋样？"
例子："事业计划讲了几场？有进展吗？"`;
  } else if (total_score > 0 && total_score < 20) {
    userPrompt += `今天分数有点低，${total_score}分。
鼓励 + 提醒活动量是基础。
语气：温暖但坚定。
例子："今天分数不高啊。活动量是保险销售的基础，再忙也要保证基本量~"
例子："今天的活动量还可以再多一些。基础打好了，业绩自然来。"
例子："分数不高，但记录了就是进步。明天继续，活动量是基础！"`;
  } else {
    userPrompt += `今天有一些活动量。
简单肯定，问收获或困难。
语气：温暖、专业。
例子："今天忙啥了？有什么收获？"
例子："今天咋样？有什么想聊的？"`;
  }

  userPrompt += '\n\n请返回一条消息（1-2 句话，简洁有力），专业复盘，不要贫嘴。';

  try {
    const content = await callAI(SYSTEM_PROMPT, userPrompt);
    return {
      message: content.trim(),
      summary: ''
    };
  } catch (error) {
    console.error('调用 AI 失败:', error.message);
    return {
      message: '今天咋样？有什么收获吗？',
      summary: ''
    };
  }
}

/**
 * 判断是否是闲聊（不涉及工作话题）
 * @param {string} text - 用户消息
 * @param {Array} conversationHistory - 对话历史
 */
function isCasualChat(text, conversationHistory = []) {
  const workKeywords = [
    '保险', '保单', '客户', '签单', '成交', '面谈', '邀约', '增员',
    '事业计划', 'EOP', 'CC 测评', '送训', '转介绍', '准客户',
    '销售', '业绩', '开单', '拜访', '核保', '理赔', '佣金', '团队'
  ];

  const casualKeywords = [
    '早', '好', '在吗', '你好', 'hello', 'hi',
    '累', '困', '忙', '烦', '郁闷', '辛苦', '歇', '休息',
    '谢', 'thanks', '哈哈', '呵呵', '笑死', '牛逼', '可以',
    '天气', '周末', '放假', '吃饭', '睡觉', '上班', '下班'
  ];

  const lowerText = text.toLowerCase().trim();

  // 检查是否有工作关键词
  const hasWorkKeyword = workKeywords.some(k => lowerText.includes(k));

  // 检查是否有闲聊关键词
  const hasCasualKeyword = casualKeywords.some(k => lowerText.includes(k));

  // 如果对话历史都很短且没有工作话题，默认是闲聊
  const conversationHistoryText = conversationHistory.map(m => m.content).join(' ');
  const hasWorkInHistory = workKeywords.some(k => conversationHistoryText.includes(k));

  // 如果有工作关键词，不是闲聊
  if (hasWorkKeyword) return false;

  // 如果有闲聊关键词，或者对话历史没有工作话题，是闲聊
  if (hasCasualKeyword || !hasWorkInHistory) return true;

  return false;
}

/**
 * 根据用户回复生成下一个问题（像真人对话）
 */
async function generateNextMessage(conversationHistory, userReply) {
  // 判断是否是闲聊
  const isCasual = isCasualChat(userReply, conversationHistory);

  const historyText = conversationHistory
    .slice(-6) // 只用最近几轮对话
    .map(m => `${m.role === 'assistant' ? '教练' : '学员'}: ${m.content}`)
    .join('\n');

  let userPrompt = '';

  if (isCasual) {
    userPrompt = `对话历史：
${historyText}

学员刚刚回复："${userReply}"

⚠️ 这是闲聊场景！学员只是在和你聊天，没有提到工作。
请以朋友的身份回应：
- 先回应他说的话（共情、理解、有趣）
- 不要问保险相关问题（保单、客户、签单等）
- 可以问一个轻松的后续问题，或者只是回应
- 像微信聊天，不要太长
- 像朋友之间闲聊，别总想着推销保险`;
  } else {
    userPrompt = `对话历史：
${historyText}

学员刚刚回复："${userReply}"

请以保险销售导师的身份，回复学员。
- 先回应他说的话（共情、理解、肯定）
- 然后问一个引导性问题
- 像微信聊天，不要太长
- 一次只问一个问题`;
  }

  try {
    const content = await callAI(SYSTEM_PROMPT, userPrompt);
    return {
      message: content.trim()
    };
  } catch (error) {
    console.error('调用 AI 失败:', error.message);
    return {
      message: '你说得很有道理。然后呢？'
    };
  }
}

/**
 * 检查对话是否应该结束（最多 5 轮）
 */
function shouldEndConversation(questionCount) {
  return questionCount >= 5;
}

/**
 * 生成对话结束的复盘消息（个性化、温暖、鼓励）
 * @param {Object} userData - 用户数据
 * @param {Object} activityData - 活动量数据
 * @param {Array} conversationHistory - 对话历史
 */
async function generateEndingMessage(userData, activityData, conversationHistory) {
  const { name } = userData;

  const historyText = conversationHistory
    .slice(-8)
    .map(m => `${m.role === 'assistant' ? '教练' : '学员'}: ${m.content}`)
    .join('\n');

  const userPrompt = `学员${name}今天的活动量数据：
- 总分：${activityData.total_score || 0}分
- 新增准客户：${activityData.new_leads || 0}
- 转介绍：${activityData.referral || 0}
- 邀约：${activityData.invitation || 0}
- 销售面谈：${activityData.sales_meeting || 0}
- 增员面谈：${activityData.recruit_meeting || 0}
- 成交：${activityData.deal || 0}

对话历史：
${historyText}

请以保险销售导师的身份，给学员发一条结束语：
1. 先肯定他今天的表现（找出亮点）
2. 给出 1-2 条具体的小建议（可操作）
3. 温暖鼓励地收尾

语气要真诚、温暖，像朋友聊天，不要用 AI 腔调。
长度：3-4 句话即可。`;

  try {
    const content = await callAI(SYSTEM_PROMPT, userPrompt);
    return content.trim();
  } catch (error) {
    console.error('生成复盘消息失败:', error.message);
    return getGenericEndingMessage();
  }
}

/**
 * 通用结束消息（备用）
 */
function getGenericEndingMessage() {
  const endings = [
    '好，今天就聊到这。你今天的表现我看在眼里，有亮点也有可以改进的地方。明天继续，我看好你！',
    '行，不耽误你时间了。今天好好休息，明天咱们继续。记住啊，销售就是日复一日的坚持！',
    '好嘞，今天就到这。你今天的表现不错，继续保持！明天见~',
    '嗯，聊得差不多了。你今天说的我都记下了，明天咱们看看进展。加油！'
  ];
  return endings[Math.floor(Math.random() * endings.length)];
}

/**
 * 开始 AI 教练对话（每天 21:05 和 24:05 调用）
 * 第一批：21:05 - 针对 21:00 前提交的数据复盘
 * 第二批：24:05 - 针对 21:00-24:00 提交的数据复盘
 * @param {string} batch - 'first' (21:05) 或 'second' (24:05)
 */
async function startAICoachConversations(batch = 'first') {
  console.log(`[AI Coach] 开始今日${batch === 'first' ? '第一批' : '第二批'}对话...`);

  const today = new Date().toISOString().split('T')[0];

  // 确定复盘时间 cutoff
  // 第一批（21:05）：复盘所有在 21:00 前提交的数据
  // 第二批（24:05）：复盘所有在 21:00-24:00 提交的数据（即第一批之后提交的）

  // 获取所有用户
  const users = await db.findAll('users', {});

  console.log(`[AI Coach] 系统共有 ${users.length} 个用户`);

  for (const user of users) {
    try {
      // 检查是否有飞书 ID
      const userId = user.feishu_user_id || user.union_id;
      if (!userId) {
        console.log(`[AI Coach] 跳过 ${user.name} - 没有飞书 ID`);
        continue;
      }

      // 检查是否已有进行中的对话
      const existingConversation = await db.findOne('ai_conversations', {
        user_id: user.id,
        conversation_date: today,
        status: 'pending'
      });

      if (existingConversation) {
        console.log(`[AI Coach] 跳过 ${user.name} - 已有对话`);
        continue;
      }

      // 获取今日活动量数据
      const activity = await db.findOne('activities', {
        user_id: user.id,
        activity_date: today
      });

      // 检查是否已提交
      const isSubmitted = activity && activity.is_submitted === 1;

      if (!isSubmitted && batch === 'first') {
        // 未提交数据 - 只在第一批发送关心询问
        console.log(`[AI Coach] ${user.name} - 未提交数据，发送关心消息`);

        const careMessage = await generateCareMessage(user);
        await feishu.sendTextMessage(userId, careMessage.message);

        // 保存对话记录
        await db.insert('ai_conversations', {
          user_id: user.id,
          conversation_date: today,
          messages: JSON.stringify([
            { role: 'assistant', content: careMessage.message },
          ]),
          question_count: 1,
          summary: '',
          status: 'pending',
          feishu_chat_id: userId
        });

        console.log(`[AI Coach] 关心消息已发送至 ${user.name}`);
      } else if (isSubmitted) {
        // 已提交数据 - 发送数据复盘
        // 第一批：所有已提交的
        // 第二批：只处理第一批之后提交的（这里简化为所有已提交但未对话的）

        console.log(`[AI Coach] ${user.name} - 已提交数据，发送复盘消息`);

        // 生成第一条消息
        const aiResult = await generateFirstMessage({
          name: user.name,
          totalScore: activity.total_score,
          dimensions: {
            new_leads: activity.new_leads,
            referral: activity.referral,
            invitation: activity.invitation,
            sales_meeting: activity.sales_meeting,
            recruit_meeting: activity.recruit_meeting,
            business_plan: activity.business_plan,
            deal: activity.deal,
            eop_guest: activity.eop_guest,
            cc_assessment: activity.cc_assessment,
            training: activity.training
          }
        });

        // 发送文本消息
        await feishu.sendTextMessage(userId, aiResult.message);

        // 保存对话记录
        await db.insert('ai_conversations', {
          user_id: user.id,
          conversation_date: today,
          messages: JSON.stringify([
            { role: 'assistant', content: aiResult.message },
          ]),
          question_count: 1,
          summary: '',
          status: 'pending',
          feishu_chat_id: userId
        });

        console.log(`[AI Coach] 复盘消息已发送至 ${user.name}`);
      }

      // 避免频率限制
      await new Promise(resolve => setTimeout(resolve, 1500));

    } catch (error) {
      console.error(`[AI Coach] 错误：`, error.message);
    }
  }

  console.log('[AI Coach] 今日对话完成');
}

/**
 * 处理用户回复，生成下一个问题
 * @param {string} userId - 用户 ID
 * @param {string} userReply - 用户回复内容
 * @param {Object} conversation - 对话记录
 * @param {Object} activityData - 当日活动量数据（用于结束时复盘）
 */
async function handleUserReply(userId, userReply, conversation, activityData = null) {
  const messages = JSON.parse(conversation.messages || '[]');
  const questionCount = conversation.question_count || 0;

  // 安全检查
  const safetyResult = safetyFilter.analyzeMessage(userReply);
  if (safetyResult.hasRisk) {
    console.log('[AI Coach] 发现风险内容');
  }

  // 检查是否应该结束对话
  if (shouldEndConversation(questionCount)) {
    // 生成个性化复盘消息
    const endingMsg = activityData
      ? await generateEndingMessage({ name: '学员' }, activityData, messages)
      : getGenericEndingMessage();

    await feishu.sendTextMessage(userId, endingMsg);

    await db.update('ai_conversations', { id: conversation.id }, {
      messages: JSON.stringify([
        ...messages,
        { role: 'user', content: userReply },
        { role: 'assistant', content: endingMsg }
      ]),
      status: 'completed',
      summary: activityData ? `结束复盘已发送` : '',
      completed_at: new Date()
    });

    return { ended: true };
  }

  // 生成下一个回复
  const nextMsg = await generateNextMessage(messages, userReply);

  // 发送消息
  await feishu.sendTextMessage(userId, nextMsg.message);

  // 更新对话记录
  await db.update('ai_conversations', { id: conversation.id }, {
    messages: JSON.stringify([
      ...messages,
      { role: 'user', content: userReply },
      { role: 'assistant', content: nextMsg.message }
    ]),
    question_count: questionCount + 1
  });

  return { ended: false };
}

export {
  generateFirstMessage,
  generateNextMessage,
  startAICoachConversations,
  handleUserReply,
  shouldEndConversation,
  generateEndingMessage,
  isCasualChat
};
