# 保险活动量管理工具 - AI 教练后端

## 项目结构

```
insurance-activity-tool-backend/
├── functions/           # 飞书云函数
│   ├── activity/        # 活动量 API
│   ├── ai-chat/         # AI 对话回调
│   ├── admin/           # 管理员 API
│   └── scheduler/       # 定时任务
├── services/            # 业务服务
│   ├── aiCoach.js       # AI 对话引擎
│   ├── safetyFilter.js  # 安全过滤
│   ├── feishuSender.js  # 飞书消息
│   └── analytics.js     # 数据分析
├── database/            # 数据库
│   ├── schema.sql       # 表结构
│   └── migrations/      # 迁移脚本
├── config/              # 配置文件
├── scripts/             # 脚本工具
└── tests/               # 测试用例
```

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

```bash
cp .env.example .env
# 编辑 .env 填入真实配置
```

### 3. 本地开发

```bash
npm run dev
```

### 4. 数据库迁移

```bash
npm run db:migrate
```

## 核心功能

| 功能 | 端点 | 说明 |
|------|------|------|
| 活动量提交 | POST /api/activity/submit | 提交当日活动量 |
| AI 对话 | POST /api/ai/chat | 飞书机器人回调 |
| 每日分析 | GET /api/admin/daily | 管理员查看 |
| 风险预警 | GET /api/alerts | 预警列表 |

## 定时任务

- **21:00** - 锁定当日数据
- **21:05** - 触发 AI 对话
- **周四 22:00** - 生成周报

## 技术栈

- Node.js 18+
- 飞书云函数
- PostgreSQL
- Claude API (Anthropic)

## 文档

- [后端设计文档](BACKEND_DESIGN.md)
- [AI 教练需求](AI_COACH_REQUIREMENTS.md)
