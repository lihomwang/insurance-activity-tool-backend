# 保险活动量管理工具 - 完整部署总结

## 项目结构

```
insurance-activity-tool/
├── insurance-activity-tool-h5-app/      # H5 网页应用（前端）
│   ├── index.html                       # 主页面
│   ├── css/
│   │   ├── app.css                      # 全局样式
│   │   ├── index.css                    # 开屏页
│   │   ├── dashboard.css                # 首页
│   │   ├── activity.css                 # 填报页
│   │   ├── report.css                   # 报表页
│   │   └── ranking.css                  # 排行页
│   ├── js/
│   │   ├── api.js                       # API 客户端
│   │   └── app.js                       # Vue 应用
│   └── README.md                        # 前端部署指南
│
└── insurance-activity-tool-backend/     # 后端服务
    ├── functions/
    │   ├── api/index.js                 # H5 API 统一入口（新增）
    │   ├── activity/index.js            # 活动量 API
    │   ├── ai-chat/index.js             # AI 教练 API
    │   ├── admin/index.js               # 管理员 API
    │   └── scheduler/index.js           # 定时任务 API
    ├── services/
    │   ├── db.js                        # 数据库
    │   ├── db-sqlite.js                 # SQLite 实现
    │   ├── stats.js                     # 统计服务（新增）
    │   ├── ranking.js                   # 排行榜服务（新增）
    │   ├── feishu.js                    # 飞书服务
    │   └── aiCoach.js                   # AI 教练
    ├── feishu-config.yaml               # 飞书部署配置
    └── docs/
        └── feishu-cloud-function-deploy.md  # 部署指南
```

## 已完成功能

### 前端（H5 网页应用）

| 页面 | 功能 | 状态 |
|------|------|------|
| 开屏页 | 登录入口 | ✅ |
| Dashboard | 本周总分、数据日历、已填报项目 | ✅ |
| 填报页 | 6 维度计数、实时分数、提交 | ✅ |
| 报表页 | 团队统计、维度汇总、进度条 | ✅ |
| 排行页 | 金银铜徽章、排行榜 | ✅ |

**UI 特性：**
- 阳光柠檬黄主题 (#FACC15)
- 移动端适配
- 触摸反馈动画
- 底部导航栏

### 后端（飞书云函数）

| API | 端点 | 状态 |
|-----|------|------|
| 健康检查 | GET /health | ✅ |
| 用户信息 | GET /api/user/info | ✅ |
| 周统计 | GET /api/stats/week | ✅ |
| 团队统计 | GET /api/stats/team | ✅ |
| 维度统计 | GET /api/stats/dimensions | ✅ |
| 排行榜 | GET /api/ranking | ✅ |
| 活动记录 | GET /api/activities | ✅ |
| 锁定状态 | GET /api/activity/lock-status | ✅ |
| 提交活动 | POST /api/activity/submit | ✅ |

**定时任务：**
- 21:00 每日锁定
- 21:05 AI 教练
- 23:00 每日分析
- 周四 22:00 周报

## 部署选项

### 方案 A: 飞书云函数（推荐）

**优点：**
- 与飞书深度集成
- 自动 HTTPS
- 无需管理服务器

**步骤：**
```bash
# 1. 安装飞书 CLI
npm install -g @larkapps/cli

# 2. 登录
larkapps login

# 3. 部署云函数
cd insurance-activity-tool-backend
larkapps function deploy --config feishu-config.yaml

# 4. 获取 API URL
larkapps function get-url --name h5-api

# 5. 更新前端配置
# 编辑 js/api.js，设置 API_BASE 和 USE_MOCK=false

# 6. 部署前端到飞书云存储
cd ../insurance-activity-tool-h5-app
larkapps upload --dir . --app-id cli_a95a6b370af8dcc8
```

### 方案 B: 外部服务器 + 飞书网页应用

**优点：**
- 完全控制
- 成本透明

**步骤：**
```bash
# 1. 购买云服务器（阿里云/腾讯云）

# 2. 上传代码
scp -r insurance-activity-tool-backend/* root@服务器:/opt/backend
cd /opt/backend
npm install --production

# 3. 配置环境变量
cat > .env << EOF
NODE_ENV=production
PORT=3000
DASHSCOPE_API_KEY=sk-xxxxx
EOF

# 4. 启动服务
npm start  # 或使用 PM2

# 5. 在飞书配置网页应用首页 URL
# 开放平台 → 应用管理 → 网页应用 → 首页 URL
```

### 方案 C: 免费托管（测试用）

**Vercel/Netlify 部署前端：**
```bash
cd insurance-activity-tool-h5-app
vercel  # 或 netlify deploy
```

**Railway 部署后端：**
```bash
cd insurance-activity-tool-backend
# 连接 GitHub 仓库，自动部署
```

## 本地测试

### 测试前端
```bash
cd insurance-activity-tool-h5-app
python3 -m http.server 8080
# 访问 http://localhost:8080
```

### 测试后端
```bash
cd insurance-activity-tool-backend
npm start
# 访问 http://localhost:3000/health
```

### API 测试
```bash
# 健康检查
curl http://localhost:3000/health

# 获取团队统计
curl http://localhost:3000/api/stats/team

# 获取排行榜
curl http://localhost:3000/api/ranking

# 提交活动
curl -X POST http://localhost:3000/api/activity/submit \
  -H "Content-Type: application/json" \
  -d '{"userId":"test","date":"2026-04-04","items":[{"dimensionId":"new_leads","count":5}]}'
```

## 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| NODE_ENV | 运行环境 | development |
| PORT | 服务端口 | 3000 |
| DASHSCOPE_API_KEY | 通义千问 API Key | sk-xxxxx |
| DASHSCOPE_MODEL | AI 模型 | qwen-plus |
| AI_PROVIDER | AI 供应商 | dashscope |

## 数据库

当前使用 SQLite (`data/insurance.db`)：

```sql
-- 用户表
CREATE TABLE users (
  user_id TEXT PRIMARY KEY,
  name TEXT,
  avatar TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 活动量表
CREATE TABLE activities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT,
  activity_date DATE,
  new_leads INTEGER DEFAULT 0,
  referral INTEGER DEFAULT 0,
  -- ... 其他维度
  total_score INTEGER DEFAULT 0,
  is_locked INTEGER DEFAULT 0,
  is_submitted INTEGER DEFAULT 0,
  submitted_at DATETIME,
  UNIQUE(user_id, activity_date)
);
```

## 下一步建议

1. **飞书 OAuth 集成**
   - 实现真实用户登录
   - 获取飞书用户信息

2. **飞书多维表格数据库**
   - 替代 SQLite
   - 支持多实例

3. **AI 教练优化**
   - 个性化问题生成
   - 历史数据对比

4. **数据可视化**
   - 趋势图表
   - 维度雷达图

5. **通知推送**
   - 飞书机器人提醒
   - 21:00 截止提醒

## 问题排查

### 前端空白
- 检查 Vue.js CDN 是否可访问
- 查看浏览器控制台错误
- 确认 CSS 文件路径正确

### API 404
- 检查路由路径
- 确认云函数已部署
- 查看飞书日志

### 数据库错误
- 检查 data/ 目录权限
- 确认表结构已创建
- 查看 services/db.js

## 联系支持

- 飞书开放平台：https://open.feishu.cn
- 通义千问 API: https://dashscope.aliyun.com
- 项目文档：docs/ 目录
