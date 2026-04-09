# 本地开发环境设置

## 已完成

✅ Node.js 依赖安装 (npm install)
✅ SQLite 数据库配置
✅ 数据库初始化脚本
✅ 完整测试套件 (5/5 测试通过)
✅ 本地开发服务器
✅ 活动量 API 测试通过

## 环境配置

### 1. 获取飞书 app_secret

1. 访问 [飞书开发者后台](https://open.feishu.cn/app-klamp/frame)
2. 选择应用 `cli_a95a6b370af8dcc8`
3. 进入"凭证管理"
4. 复制 `App Secret`
5. 填入 `.env` 文件的 `FEISHU_APP_SECRET`

### 2. 获取 Anthropic API Key

1. 访问 [Anthropic Console](https://console.anthropic.com/)
2. 创建新的 API Key
3. 填入 `.env` 文件的 `ANTHROPIC_API_KEY`

### 3. 配置管理员 ID

在 `.env` 中设置：
```
ADMIN_USER_IDS=ou_1234567890,ou_0987654321
```

## 运行命令

```bash
# 初始化数据库
npm run db:init

# 运行测试
npm test

# 启动开发服务器
npm run dev

# 测试 API
curl -X POST "http://localhost:3000/api/activity?userId=test_user_001" \
  -H "Content-Type: application/json" \
  -d '{"action":"submit","data":{"new_leads":5,"referral":2,"invitation":3,"sales_meeting":1,"deal":1}}'
```

## API 端点

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/activity` | POST | 活动量相关操作 (action: submit/today/history/lock_status) |
| `/api/ai-chat` | POST | AI 对话 |
| `/api/admin/daily` | GET | 每日分析 |
| `/api/admin/alerts` | GET | 风险预警 |
| `/api/admin/team-overview` | GET | 团队概览 |
| `/api/scheduler` | POST | 定时任务 |
| `/health` | GET | 健康检查 |

## 测试通过

```
✅ 数据库连接
✅ 表结构 (users, activities, ai_conversations, risk_alerts, daily_analytics, weekly_reports)
✅ 安全过滤模块 (抑郁/焦虑/自杀关键词检测)
✅ 活动量数据 CRUD
✅ AI 对话记录 CRUD
```

## 下一步

1. 配置 `.env` 中的 `FEISHU_APP_SECRET` 和 `ANTHROPIC_API_KEY`
2. 部署云函数到飞书
3. 配置定时任务 (21:00 锁定，21:05 AI 教练，周四 22:00 周报)
