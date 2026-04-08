// services/aiCoach.js
// AI 教练对话引擎 - 真人式引导对话
// 风格：像一位经验丰富、共情能力强、专业的保险销售导师

import db from './db.js';
import feishu from './feishu.js';
import safetyFilter from './safetyFilter.js';
import axios from 'axios';

// AI 教练系统提示词 - 千老师人设
const SYSTEM_PROMPT = `你是一位资深的保险销售导师，名字叫"千老师"。千颂伊的千。你有 20 年保险销售经验，带过上千个徒弟。

你的特点：
- 美丽、温柔、有经验、睿智
- 毒舌但温柔，爱说笑但一针见血
- 说话像真人，有情感、有温度
- 共情能力强，能理解销售的压力和困难
- 善于发现对方的优点，真诚地肯定
- 问问题像聊天，一次只问一个，不给压力

说话风格：
- 会开玩笑、会调侃，但底色是温柔和关心
- 一针见血指出问题，但不会让人难受
- 真诚地夸人，不敷衍
- 用口语，像发微信，不要用书面语

对话风格示例：
❌ AI 味："今天成交的这单，你觉得最关键的因素是什么？"
✅ 千老师："这单能成，可不是运气好。说说，你当时做对了什么？"

❌ AI 味："这个经验能复制到你其他的客户身上吗？"
✅ 千老师："这个方法挺灵的，其他客户是不是也能试试？"

❌ AI 味："被拒绝了还是改期了？"
✅ 千老师："客户改期了？还是...心里有点小嘀咕？"

❌ AI 味："今天没有提交活动量数据，请问是什么原因？"
✅ 千老师："今天没看到你报数据啊，是不是忙到飞起了？还是偷偷开单去了？"

⚠️ 重要规则：
- 不要主动问保险相关问题（保单、客户、签单等），除非对方明确提到工作话题
- 如果对方只是闲聊（比如问候、抱怨累、分享心情），就陪 TA 闲聊，不要扯到保险
- 只有以下情况才聊保险：
  1. 对话结束时做复盘
  2. 对方主动问保险相关的问题
  3. 对方自己提到了客户、面谈、成交等工作话题

记住：
- 每次只说一两句话，问一个问题
- 用口语，不要用书面语
- 适当用 emoji，但不要多（最多 1 个）
- 像发微信一样，不要像发邮件
- 毒舌是表象，温柔是底色
- 闲聊时就好好闲聊，别总想着推销保险`;

/**
 * 生成关心询问消息（针对未提交数据的用户）
 * @param {Object} userData - 用户数据
 */
async function generateCareMessage(userData) {
  const { name } = userData;

  const userPrompt = `学员${name}今天没有提交活动量数据。

请发一条关心的消息，像朋友一样问候，不要质问或责备。

语气要温暖、关心、真诚：
- 可能是太忙忘记了
- 可能是今天确实没什么活动
- 可能是遇到困难了

例子：
- "今天没看到你报数据，是不是忙忘记了？"
- "今天咋样？看你还没报数据，是不是遇到什么事了？"
- "嘿，今天的活动量还没报哦，是不是太忙了？"

请返回一条消息（1-2 句话），像微信聊天一样自然。`;

  try {
    const response = await axios.post(
      'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
      {
        model: 'qwen-plus',
        messages: [
          {
            role: 'system',
            content: SYSTEM_PROMPT + '\n\n有学员今天没有提交活动量数据，请发一条关心的消息。'
          },
          {
            role: 'user',
            content: userPrompt
          }
        ],
        temperature: 0.8,
        max_tokens: 150
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.DASHSCOPE_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const content = response.data.choices[0].message.content;
    return {
      message: content.trim()
    };
  } catch (error) {
    console.error('调用 AI 失败:', error.message);
    // 备用消息
    const fallbackMessages = [
      `今天没看到你报数据，是不是忙忘记了？记得抽空填报哦~`,
      `今天咋样？看你还没报数据，是不是遇到什么事了？`,
      `嘿，今天的活动量还没报哦，是不是太忙了？`,
      `今天忙啥呢？活动量别忘了填报哈~`
    ];
    return {
      message: fallbackMessages[Math.floor(Math.random() * fallbackMessages.length)]
    };
  }
}

/**
 * 根据活动量数据生成第一个问题（像真人聊天开场）
 * @param {Object} userData - 用户数据
 * @param {Object} activityData - 当日活动量数据
 */
async function generateFirstMessage(userData, activityData) {
  const { name } = userData;
  const { total_score, new_leads, referral, invitation, sales_meeting, recruit_meeting, business_plan, deal, eop_guest, cc_assessment, training } = activityData || {};

  // 构建详细的对话场景
  let userPrompt = `学员${name}今天的活动量数据如下：
- 总分：${total_score || 0}分
- 新增准客户：${new_leads || 0}
- 转介绍：${referral || 0}
- 邀约：${invitation || 0}
- 销售面谈：${sales_meeting || 0}
- 增员面谈：${recruit_meeting || 0}
- 事业计划：${business_plan || 0}
- 成交：${deal || 0}
- 嘉宾参加 EOP：${eop_guest || 0}
- CC 测评：${cc_assessment || 0}
- 送训：${training || 0}

`;

  // 根据具体场景生成个性化引导
  if (total_score === 0 || total_score === undefined) {
    userPrompt += `⚠️ 该学员今天没有提交活动量数据。
请发一条关心的消息，像朋友一样问候。
语气要温暖、关心，不要质问或责备。
 focus on: 是不是太忙忘记了？还是今天确实没什么活动？
例子："今天没看到你报数据，是不是忙忘记了？"
例子："今天咋样？看你还没报数据，是不是遇到什么事了？"`;
  } else if (deal > 0) {
    userPrompt += `🎉 太棒了！今天有${deal}单成交！
请发消息庆祝，然后问一个引导性问题，了解成功经验。
语气要兴奋、真诚地肯定。
例子："听说你今天开单了？🎉 厉害啊！这单怎么成的？"
例子："开单了！恭喜！🎉 说说，这单有啥特别的？"`;
  } else if (invitation > 0 && sales_meeting === 0) {
    userPrompt += `⚠️ 今天邀约了${invitation}人，但销售面谈是 0。
可能是被拒绝了，也可能客户改期了。
发一条安慰 + 关心的消息，问一个引导性问题。
语气要理解、不给压力。
例子："今天约了几个客户？最后都改期了？"
例子："邀约挺多的啊，客户都见上了吗？"`;
  } else if (sales_meeting > 0 && deal === 0) {
    userPrompt += `今天有${sales_meeting}场面谈，但还没成交。
发一条鼓励的消息，问面谈收获或下一步计划。
语气要鼓励、关注进展。
例子："今天面谈了几场？聊得咋样？"
例子："面谈挺多的啊，有进展吗？"`;
  } else if (new_leads > 0) {
    userPrompt += `今天新增了${new_leads}个准客户，不错！
发一条肯定的消息，问客户来源。
例子："今天加了新客户？咋认识的？"
例子："新客户来源咋样？"`;
  } else if (total_score >= 50) {
    userPrompt += `今天分数很高，${total_score}分！表现优秀！
发一条表扬的消息，问成功的关键因素。
例子："今天分数很高啊！状态不错？"
例子："今天很给力啊！有什么好经验？"`;
  } else if (recruit_meeting > 0) {
    userPrompt += `今天有${recruit_meeting}场增员面谈。
发一条肯定的消息，问增员进展。
例子："今天面了几个增员对象？聊得咋样？"`;
  } else if (business_plan > 0) {
    userPrompt += `今天讲了${business_plan}场事业计划。
发一条鼓励的消息，问对方反应。
例子："今天讲了事业计划？对方意向咋样？"`;
  } else {
    userPrompt += `今天有一些活动量，但还不够亮眼。
发一条关心的消息，问今天的收获或遇到的困难。
语气要温暖、关心。
例子："今天忙啥了？有什么收获？"
例子："今天咋样？有什么想聊的吗？"`;
  }

  userPrompt += '\n\n请返回一条消息（1-2 句话，只问 1 个问题），像微信聊天一样。';

  try {
    const response = await axios.post(
      'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
      {
        model: 'qwen-plus',
        messages: [
          {
            role: 'system',
            content: SYSTEM_PROMPT + '\n\n你现在要主动找学员聊天，根据他今天的活动量数据发第一条消息。'
          },
          {
            role: 'user',
            content: userPrompt
          }
        ],
        temperature: 0.8,
        max_tokens: 150
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.DASHSCOPE_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const content = response.data.choices[0].message.content;
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
    const response = await axios.post(
      'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
      {
        model: 'qwen-plus',
        messages: [
          {
            role: 'system',
            content: SYSTEM_PROMPT + '\n\n你现在在和学员微信聊天，根据对话历史回复他。'
          },
          {
            role: 'user',
            content: userPrompt
          }
        ],
        temperature: 0.8,
        max_tokens: 200
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.DASHSCOPE_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const content = response.data.choices[0].message.content;
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
    const response = await axios.post(
      'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
      {
        model: 'qwen-plus',
        messages: [
          {
            role: 'system',
            content: SYSTEM_PROMPT + '\n\n对话结束了，请给学员发一条温暖的复盘消息。'
          },
          {
            role: 'user',
            content: userPrompt
          }
        ],
        temperature: 0.8,
        max_tokens: 200
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.DASHSCOPE_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    return response.data.choices[0].message.content.trim();
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
 * 开始 AI 教练对话（每天 21:05 调用）
 * 发送文本消息，像真人聊天
 */
async function startAICoachConversations() {
  console.log('[AI Coach] 开始今日对话...');

  const today = new Date().toISOString().split('T')[0];

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

      if (!isSubmitted) {
        // 未提交数据 - 发送关心询问
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
      } else {
        // 已提交数据 - 发送数据复盘
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
