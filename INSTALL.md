# 后端安装和部署指南

## 前提条件

- Node.js >= 18.0.0
- PostgreSQL >= 14
- 飞书开放平台账号
- Anthropic API Key

---

## 1. 安装依赖

```bash
cd /Users/boo/.openclaw/workspace/insurance-activity-tool-backend
npm install
```

---

## 2. 配置环境变量

```bash
# 复制环境变量模板
cp .env.example .env

# 编辑 .env 文件，填入真实配置
```

### 需要配置的内容：

#### 飞书开放平台
1. 访问 https://open.feishu.cn
2. 创建企业内部应用
3. 获取 App ID、App Secret
4. 在「凭证与基础信息」页面复制

#### Anthropic API
1. 访问 https://console.anthropic.com
2. 创建 API Key
3. 填入 `.env` 文件

#### 数据库
```bash
# 创建数据库
createdb insurance_activity

# 更新 DATABASE_URL
DATABASE_URL=postgresql://localhost:5432/insurance_activity
```

---

## 3. 数据库迁移

```bash
# 运行迁移脚本
npm run db:migrate
```

成功后应看到：
```
✅ 数据库连接成功
✅ 表结构创建成功

📋 已创建的表:
   - activities
   - ai_conversations
   - daily_analytics
   - risk_alerts
   - users
   - weekly_reports
```

---

## 4. 本地测试

```bash
# 启动开发服务器
npm run dev
```

### 测试 API

```bash
# 测试活动量提交
curl -X POST http://localhost:3000/api/activity/submit \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "test_user_123",
    "data": {
      "new_leads": 5,
      "invitation": 3,
      "sales_meeting": 1
    }
  }'

# 测试获取今日数据
curl http://localhost:3000/api/activity/today?userId=test_user_123
```

---

## 5. 部署到飞书云函数

### 安装飞书 CLI

```bash
npm install -g @lark-base/cli
feishu login
```

### 部署函数

```bash
# 部署活动量 API
feishu function deploy --name activity --entry functions/activity/index.js

# 部署 AI 对话 API
feishu function deploy --name ai-chat --entry functions/ai-chat/index.js

# 部署管理员 API
feishu function deploy --name admin --entry functions/admin/index.js

# 部署定时任务
feishu function deploy --name scheduler --entry functions/scheduler/index.js
```

### 配置定时器

在飞书云函数控制台配置：

| 函数 | Cron 表达式 | 说明 |
|------|-----------|------|
| scheduler | `0 21 * * *` | 每天 21:00 锁定数据 |
| scheduler | `5 21 * * *` | 每天 21:05 AI 教练 |
| scheduler | `0 23 * * *` | 每天 23:00 生成分析 |
| scheduler | `0 22 * * 4` | 每周四 22:00 周报 |

---

## 6. 验证部署

### 检查日志

```bash
feishu function logs --name activity --tail
```

### 测试飞书集成

1. 在飞书开放平台配置机器人
2. 将机器人添加到群聊
3. 发送消息测试 AI 对话

---

## 常见问题

### Q: 数据库连接失败
A: 检查 PostgreSQL 是否运行，DATABASE_URL 是否正确

### Q: 飞书 API 返回 401
A: 检查 App ID 和 App Secret 是否正确，是否有权限

### Q: Anthropic API 失败
A: 检查 API Key 是否有额度，网络是否畅通

---

## 下一步

部署完成后：
1. 配置飞书小程序后端域名
2. 在小程序中调用 API
3. 测试完整流程
