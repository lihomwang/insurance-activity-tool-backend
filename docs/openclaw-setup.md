# OpenClaw 配置说明
# 用于 AI 教练功能 - 使用 Coding Plan API Key

## 环境要求
- Node.js 18+
- OpenClaw (已配置 Coding Plan API Key)
- 飞书开放平台应用权限

## 配置步骤

### 1. 在 OpenClaw 中配置 Coding Plan API Key
```bash
# OpenClaw settings.json 或环境变量
DASHSCOPE_API_KEY=sk-1697fef9d8b843f1a12bebce6cc64fc8
DASHSCOPE_MODEL=qwen-plus
```

### 2. 飞书机器人配置
- 机器人 ID: `cli_a94a9e266338dcb2`
- 需要创建一个单独的群聊，邀请机器人加入
- 用于接收 AI 教练请求和发送回复

### 3. OpenClaw 监听消息流程

当收到消息包含 `[AI 教练请求]` 时：

1. 解析消息内容，提取用户数据
2. 调用百炼 API 生成问题和总结
3. 将回复发送回飞书（通过飞书 API 或直接在群里回复）

### 4. OpenClaw 处理脚本示例

```javascript
// OpenClaw AI 教练处理器
async function handleAICoachRequest(message) {
  const text = message.content;

  if (!text.includes('[AI 教练请求]')) {
    return;
  }

  // 解析用户数据
  const match = text.match(/用户：(.+)\n用户 ID: (.+)\n总分：(.+)\n活动量：(.+)/);
  if (!match) {
    return;
  }

  const userName = match[1];
  const userId = match[2];
  const totalScore = match[3];
  const activityDetails = match[4];

  // 构建 prompt
  const prompt = `你是一位专业的保险销售 AI 教练。成员"${userName}"今天的活动量数据如下：
- 总分：${totalScore}分
- 活动量：${activityDetails}

请生成 1-5 个个性化问题和一句话总结鼓励。
返回 JSON 格式：{"questions": ["问题 1", "问题 2"], "summary": "总结"}`;

  // 调用百炼 API (使用 Coding Plan Key)
  const response = await axios.post(
    'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    {
      model: 'qwen-plus',
      messages: [
        { role: 'system', content: '你是一位专业的保险销售 AI 教练。返回 JSON 格式。' },
        { role: 'user', content: prompt }
      ]
    },
    {
      headers: {
        'Authorization': `Bearer ${process.env.DASHSCOPE_API_KEY}`
      }
    }
  );

  // 解析并发送回复
  const result = JSON.parse(response.data.choices[0].message.content);

  // 发送回复给飞书
  await sendToFeishu({
    chat_id: message.chat_id,
    msg_type: 'interactive',
    content: JSON.stringify({
      config: { wide_screen_mode: true },
      header: {
        template: 'blue',
        title: { tag: 'plain_text', content: '🤖 AI 教练' }
      },
      elements: [
        {
          tag: 'markdown',
          content: result.questions.map((q, i) => `**${i + 1}.** ${q}`).join('\n\n')
        },
        { tag: 'hr' },
        {
          tag: 'markdown',
          content: `💡 **今日总结**: ${result.summary}`
        }
      ]
    })
  });
}
```

## 消息格式

### 后端发送给 OpenClaw 的消息
```
[AI 教练请求]
用户：张三
用户 ID: ou_abc123
总分：85
活动量：新增准客户：3, 邀约：2, 销售面谈：1
```

### OpenClaw 回复的消息
```json
{
  "questions": [
    "今天有 3 个新增准客户，是怎么开发出来的？",
    "邀约了 2 个客户，有安排面谈吗？"
  ],
  "summary": "今天表现不错，继续加油！"
}
```

## 注意事项

1. **安全问题**: OpenClaw 运行在内网，通过飞书机器人通信，不需要暴露到公网
2. **频率限制**: 百炼 Coding Plan 可能有调用频率限制，建议添加重试机制
3. **错误处理**: API 调用失败时要有 fallback 方案（返回默认回复）
4. **日志记录**: 记录每次 AI 调用，便于调试和审计
