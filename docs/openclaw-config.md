# OpenClaw AI 教练配置指南

## 前提条件
- ✅ Mac mini 已安装并运行 OpenClaw
- ✅ 已配置 Coding Plan 的 API Key
- ✅ 飞书已创建 OpenClaw 机器人 (ID: cli_a94a9e266338dcb2)

## 配置步骤

### 步骤 1: 创建飞书群聊

1. 打开飞书，创建新群聊
2. 命名群聊为 "AI 教练助手" 或类似名称
3. 邀请 OpenClaw 机器人加入群聊
4. 获取群聊的 `chat_id`：

**方法 A - 使用后端 API 获取：**
```bash
# 先获取 tenant_access_token
curl -X POST "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal" \
  -H "Content-Type: application/json" \
  -d '{"app_id":"cli_a95a6b370af8dcc8","app_secret":"v2XoWID99STcoN1l1ijQtTk0ryEdjizF"}'

# 然后用返回的 token 获取群聊列表
curl -X GET "https://open.feishu.cn/open-apis/im/v1/chats?page_size=50" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

**方法 B - 查看事件推送：**
1. 在群里发送一条测试消息
2. 查看 OpenClaw 收到的事件日志
3. 事件 JSON 中的 `chat_id` 字段就是

### 步骤 2: 更新 .env 配置

在 backend/.env 中添加：
```
# AI Provider 设置为 openclaw
AI_PROVIDER=openclaw

# OpenClaw 群聊 ID (替换为实际的 chat_id)
FEISHU_OPENCLAW_CHAT_ID=oc_XXXXXXXXXXXXXXXXXXXXXXXXX
```

### 步骤 3: 在 OpenClaw 中配置 AI 教练处理器

在 OpenClaw 的配置目录（通常是 ~/.openclaw 或项目目录）创建以下文件：

#### 3.1 创建指令配置文件

```yaml
# ~/.openclaw/instructions/ai-coach.yaml
name: AI 教练助手
description: 保险销售活动量 AI 教练
trigger: "[AI 教练请求]"

environment:
  DASHSCOPE_API_KEY: sk-1697fef9d8b843f1a12bebce6cc64fc8
  DASHSCOPE_MODEL: qwen-plus

instruction: |
  你是一个保险销售 AI 教练助手。当收到包含 "[AI 教练请求]" 的消息时：

  1. 解析消息中的用户数据：
     - 用户姓名
     - 总分
     - 各维度活动量

  2. 根据活动量生成个性化问题（1-5 个）和总结

  3. 返回 JSON 格式：
     ```json
     {
       "questions": ["问题 1", "问题 2"],
       "summary": "一句话总结鼓励"
     }
     ```

  4. 然后使用飞书 API 将结果发送回群聊

examples:
  - input: |
      [AI 教练请求]
      用户：张三
      用户 ID: ou_123
      总分：85
      活动量：新增准客户：3, 邀约：2, 销售面谈：1

    output: |
      收到，正在生成 AI 教练回复...

      ```json
      {
        "questions": [
          "张三，今天开发了 3 个新准客户，很棒！是怎么做到的？",
          "邀约了 2 个客户，有安排面谈吗？",
          "销售面谈进行了 1 场，客户意向如何？"
        ],
        "summary": "今天表现很棒，继续加油！保持这样的活动量，业绩一定会提升！"
      }
      ```
```

#### 3.2 创建自动回复脚本

```javascript
// ~/.openclaw/scripts/ai-coach-handler.js
const axios = require('axios');

// 飞书 API
const FEISHU_API_BASE = 'https://open.feishu.cn';

async function getTenantAccessToken() {
  const response = await axios.post(
    `${FEISHU_API_BASE}/open-apis/auth/v3/tenant_access_token/internal`,
    {
      app_id: 'cli_a95a6b370af8dcc8',
      app_secret: 'v2XoWID99STcoN1l1ijQtTk0ryEdjizF'
    }
  );
  return response.data.tenant_access_token;
}

async function sendCoachReply(chatId, questions, summary) {
  const token = await getTenantAccessToken();

  const cardContent = {
    config: { wide_screen_mode: true },
    header: {
      template: 'blue',
      title: { tag: 'plain_text', content: '🤖 AI 教练' }
    },
    elements: [
      {
        tag: 'markdown',
        content: questions.map((q, i) => `**${i + 1}.** ${q}`).join('\n\n')
      },
      { tag: 'hr' },
      {
        tag: 'markdown',
        content: `💡 **今日总结**: ${summary}`
      }
    ]
  };

  await axios.post(
    `${FEISHU_API_BASE}/open-apis/im/v1/messages`,
    {
      chat_id: chatId,
      msg_type: 'interactive',
      content: JSON.stringify(cardContent)
    },
    {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      params: { receive_id_type: 'chat_id' }
    }
  );
}

async function generateAIResponse(userData) {
  const prompt = `你是一位专业的保险销售 AI 教练。成员"${userData.name}"今天的活动量数据如下：
- 总分：${userData.totalScore}分
- 活动量：${userData.activityDetails || '今日暂无数据'}

请生成 1-5 个个性化问题和一句话总结鼓励。
返回 JSON 格式：{"questions": ["问题 1", "问题 2"], "summary": "总结"}，只返回 JSON，不要其他内容。`;

  const response = await axios.post(
    'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    {
      model: 'qwen-plus',
      messages: [
        { role: 'system', content: '你是保险销售 AI 教练，返回 JSON 格式。' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.7,
      max_tokens: 1000
    },
    {
      headers: {
        'Authorization': `Bearer ${process.env.DASHSCOPE_API_KEY}`,
        'Content-Type': 'application/json'
      }
    }
  );

  const content = response.data.choices[0].message.content;
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  return JSON.parse(jsonMatch[0]);
}

// 主处理函数
module.exports = async function(message) {
  try {
    const text = message.content?.text || message.content;

    if (!text || !text.includes('[AI 教练请求]')) {
      return;
    }

    console.log('[AI Coach] 收到 AI 教练请求:', text);

    // 解析消息
    const userMatch = text.match(/用户：(.+)\n/);
    const idMatch = text.match(/用户 ID: (.+)\n/);
    const scoreMatch = text.match(/总分：(.+)\n/);
    const activityMatch = text.match(/活动量：(.+)/);

    const userData = {
      name: userMatch ? userMatch[1] : '成员',
      userId: idMatch ? idMatch[1] : '',
      totalScore: scoreMatch ? parseInt(scoreMatch[1]) : 0,
      activityDetails: activityMatch ? activityMatch[1] : '暂无数据'
    };

    // 生成 AI 回复
    const aiResult = await generateAIResponse(userData);

    // 发送回复到飞书
    const chatId = message.chat_id;
    await sendCoachReply(chatId, aiResult.questions, aiResult.summary);

    console.log('[AI Coach] 已发送教练回复到飞书');

  } catch (error) {
    console.error('[AI Coach] 处理失败:', error.message);
  }
};
```

### 步骤 4: 配置 OpenClaw 触发器

在 OpenClaw 配置中添加：

```yaml
# ~/.openclaw/config.yaml
triggers:
  - type: feishu_message
    bot_id: cli_a94a9e266338dcb2
    handler: ./scripts/ai-coach-handler.js
    filter:
      contains: "[AI 教练请求]"
```

### 步骤 5: 测试配置

1. 重启 OpenClaw 服务
2. 在飞书后端调用 API 发送测试消息：

```bash
# 发送测试消息给 OpenClaw
curl -X POST "http://localhost:3000/api/scheduler" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "test_ai_coach",
    "chat_id": "你的 chat_id"
  }'
```

3. 检查飞书群聊是否收到 AI 教练回复

## 故障排查

### 问题 1: 收不到消息
- 检查 OpenClaw 是否正在运行
- 检查机器人是否在群聊中
- 检查飞书应用权限配置

### 问题 2: API 调用失败
- 检查 DASHSCOPE_API_KEY 是否有效
- 检查网络连接
- 查看 OpenClaw 日志

### 问题 3: 回复格式错误
- 检查 AI 返回的 JSON 是否合法
- 添加错误处理和重试逻辑

## 完成后

配置完成后，设置 `.env` 中的 `AI_PROVIDER=openclaw` 即可使用 OpenClaw 调用 AI 教练功能。
