# 飞书云函数部署指南

## 前提条件

1. **飞书开放平台账号** - 已登录 https://open.feishu.cn
2. **应用管理员权限** - 应用 ID: `cli_a95a6b370af8dcc8`
3. **Node.js 18+** - 本地开发环境
4. **飞书 CLI 工具** (可选) - 用于快速部署

## 部署方式

### 方式 1：使用飞书开发者工具（推荐）

#### 步骤 1：打开飞书开发者工具

```bash
open "/Applications/飞书开发者工具.app"
```

#### 步骤 2：创建云函数项目

1. 点击 **"云函数"** 标签
2. 点击 **"创建项目"** 或 **"+"**
3. 选择目录：
   ```
   /Users/boo/.openclaw/workspace/insurance-activity-tool-backend
   ```
4. 选择应用：`cli_a95a6b370af8dcc8`

#### 步骤 3：配置云函数

创建以下云函数：

**1. activity-api（活动量 API）**
- 函数名称：`activity-api`
- 入口文件：`functions/activity/index.js`
- 运行时：Node.js 18
- 内存：256MB
- 超时：30s
- 触发器：HTTP POST `/api/activity`

**2. ai-chat-api（AI 教练回调）**
- 函数名称：`ai-chat-api`
- 入口文件：`functions/ai-chat/index.js`
- 运行时：Node.js 18
- 内存：512MB
- 超时：60s
- 触发器：HTTP POST `/api/ai-chat`

**3. admin-api（管理员 API）**
- 函数名称：`admin-api`
- 入口文件：`functions/admin/index.js`
- 运行时：Node.js 18
- 内存：256MB
- 超时：30s
- 触发器：HTTP GET/POST `/api/admin`

**4. scheduler-api（定时任务）**
- 函数名称：`scheduler-api`
- 入口文件：`functions/scheduler/index.js`
- 运行时：Node.js 18
- 内存：512MB
- 超时：120s
- 触发器：
  - HTTP POST `/api/scheduler`
  - 定时触发器（见下方配置）

#### 步骤 4：配置定时触发器

在 `scheduler-api` 函数下添加 4 个定时触发器：

| 名称 | Cron 表达式 | 任务 | 说明 |
|------|-----------|------|------|
| daily-lock | `0 21 * * *` | `{"task":"lock"}` | 每天 21:00 锁定 |
| ai-coach | `5 21 * * *` | `{"task":"ai_coach"}` | 每天 21:05 AI 教练 |
| daily-analytics | `0 23 * * *` | `{"task":"daily_analytics"}` | 每天 23:00 分析 |
| weekly-report | `0 22 * * 4` | `{"task":"weekly_report"}` | 每周四 22:00 周报 |

#### 步骤 5：配置环境变量

为所有云函数添加以下环境变量：

```
NODE_ENV=production
DASHSCOPE_API_KEY=sk-1697fef9d8b843f1a12bebce6cc64fc8
DASHSCOPE_MODEL=qwen-plus
AI_PROVIDER=dashscope
FEISHU_APP_ID=cli_a95a6b370af8dcc8
FEISHU_APP_SECRET=v2XoWID99STcoN1l1ijQtTk0ryEdjizF
FEISHU_API_BASE=https://open.feishu.cn
```

#### 步骤 6：上传代码

1. 点击 **"上传"** 按钮
2. 等待上传完成
3. 点击 **"发布"** 上线

#### 步骤 7：获取云函数 URL

发布后，每个函数会获得一个 HTTPS URL，格式类似：
```
https://api.feishu.cn/open-api/lambda/API_TOKEN/activity-api
```

记录下 4 个函数的 URL，稍后需要配置到小程序中。

---

### 方式 2：使用飞书 CLI（命令行）

#### 安装飞书 CLI

```bash
# 使用 npm 安装
npm install -g @lark-base/cli

# 或使用 yarn
yarn global add @lark-base/cli
```

#### 登录

```bash
lark login
```

扫码登录飞书开放平台。

#### 部署

```bash
# 进入项目目录
cd /Users/boo/.openclaw/workspace/insurance-activity-tool-backend

# 部署所有函数
lark lambda deploy --config feishu-config.yaml

# 或单独部署某个函数
lark lambda deploy activity-api
lark lambda deploy ai-chat-api
lark lambda deploy admin-api
lark lambda deploy scheduler-api
```

#### 查看状态

```bash
# 查看函数列表
lark lambda list

# 查看函数详情
lark lambda get activity-api

# 查看日志
lark lambda logs activity-api --tail
```

---

## 部署后配置

### 1. 更新小程序 API 地址

修改小程序 `app.js`：

```javascript
globalData: {
  // 改为云函数地址
  apiBase: 'https://api.feishu.cn/open-api/lambda/YOUR_API_TOKEN'
}
```

或为每个 API 配置独立地址：

```javascript
globalData: {
  activityApi: 'https://api.feishu.cn/.../activity-api',
  adminApi: 'https://api.feishu.cn/.../admin-api',
  // ...
}
```

### 2. 配置飞书机器人回调

在飞书开放平台：

1. 进入应用 `cli_a95a6b370af8dcc8`
2. 点击 **"机器人"** → 选择你的机器人
3. 配置 **"消息接收地址"** 为 AI 教练的云函数 URL
4. 开通权限：
   - `im:message`
   - `im:chat`
   - `contact:employee:readonly`

### 3. 配置定时任务

如果使用手动配置：

1. 进入飞书开放平台 → 云函数
2. 选择 `scheduler-api` 函数
3. 点击 **"触发器"** → **"添加触发器"**
4. 选择 **"定时触发器"**
5. 填写 Cron 表达式和 Payload
6. 保存并启用

### 4. 数据库迁移

飞书云函数使用 SQLite 需要持久化存储：

**选项 A：使用飞书云数据库**
- 在飞书开放平台创建云数据库
- 修改 `services/db-sqlite.js` 连接云数据库

**选项 B：使用飞书多维表格**
- 创建多维表格存储数据
- 修改 `services/db-sqlite.js` 使用多维表格 API

**选项 C：使用外部数据库**
- 配置 PostgreSQL/MySQL 云数据库
- 修改 `DATABASE_URL` 环境变量

---

## 验证部署

### 测试云函数

```bash
# 测试活动量 API
curl -X POST https://api.feishu.cn/open-api/lambda/YOUR_TOKEN/activity-api \
  -H "Content-Type: application/json" \
  -d '{"action":"today","userId":"test"}'

# 测试管理员 API
curl -X POST https://api.feishu.cn/open-api/lambda/YOUR_TOKEN/admin-api \
  -H "Content-Type: application/json" \
  -d '{"action":"team_overview"}'

# 测试定时任务
curl -X POST https://api.feishu.cn/open-api/lambda/YOUR_TOKEN/scheduler-api \
  -H "Content-Type: application/json" \
  -d '{"task":"ai_coach"}'
```

### 查看日志

在飞书开发者工具中：
1. 选择云函数
2. 点击 **"日志"** 标签
3. 查看实时日志和错误信息

---

## 常见问题

### Q1: 上传失败
**解决**: 检查 node_modules 是否已排除，确保只上传业务代码

### Q2: 函数超时
**解决**: 增加内存和超时时间，AI 相关函数建议 512MB+

### Q3: 数据库丢失
**解决**: 使用云数据库或多维表格，不要使用本地 SQLite 文件

### Q4: 定时任务不执行
**解决**:
- 检查 Cron 表达式是否正确
- 检查触发器是否已启用
- 查看触发器日志

---

## 部署清单

- [ ] 创建 4 个云函数
- [ ] 配置 HTTP 触发器
- [ ] 配置定时触发器（scheduler-api）
- [ ] 配置环境变量
- [ ] 上传并发布代码
- [ ] 获取云函数 URL
- [ ] 更新小程序配置
- [ ] 配置机器人回调
- [ ] 测试所有 API
- [ ] 验证定时任务
