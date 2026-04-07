# 飞书云函数部署指南

## 前提条件

1. 飞书开放平台开发者账号
2. 已创建飞书应用（App ID: `cli_a95a6b370af8dcc8`）
3. 已开通云函数服务

## 部署步骤

### 1. 安装飞书 CLI 工具

```bash
# 使用 npm 安装
npm install -g @larkapps/cli

# 或使用 yarn
yarn global add @larkapps/cli
```

### 2. 登录飞书开放平台

```bash
larkapps login
```

扫码登录。

### 3. 配置应用

编辑 `feishu-config.yaml` 确认配置：

```yaml
version: '1.0.0'
functions:
  - name: h5-api
    handler: functions/api/index.handler
    runtime: Node.js 18
    memory: 512
    timeout: 30
    environment:
      - key: NODE_ENV
        value: production
      - key: DASHSCOPE_API_KEY
        value: sk-1697fef9d8b843f1a12bebce6cc64fc8
```

### 4. 部署云函数

```bash
cd /Users/boo/.openclaw/workspace/insurance-activity-tool-backend

# 部署所有函数
larkapps function deploy --config feishu-config.yaml

# 或单独部署 H5 API
larkapps function deploy --name h5-api --config feishu-config.yaml
```

### 5. 获取 API 地址

部署完成后，查看 HTTP 触发器 URL：

```bash
larkapps function list --name h5-api
```

输出示例：
```
Function: h5-api
  Trigger: http
  URL: https://cli_a95a6b370af8dcc8.feishu.cn/api
```

### 6. 配置 H5 应用 API 地址

编辑 H5 应用 `js/api.js`:

```javascript
const API_BASE = 'https://cli_a95a6b370af8dcc8.feishu.cn'
const USE_MOCK = false
```

### 7. 测试 API

```bash
# 健康检查
curl https://cli_a95a6b370af8dcc8.feishu.cn/api/health

# 获取团队统计
curl https://cli_a95a6b370af8dcc8.feishu.cn/api/stats/team

# 获取排行榜
curl https://cli_a95a6b370af8dcc8.feishu.cn/api/ranking
```

## 数据库初始化

首次部署需要初始化数据库：

```bash
# 在飞书开发者工具中执行
larkapps function invoke --name h5-api --data '{"action": "init_db"}'
```

或在代码中自动初始化（见 `services/db.js`）。

## 定时任务配置

部署后，定时任务会自动配置：

| 任务 | Cron | 说明 |
|------|------|------|
| 每日锁定 | `0 21 * * *` | 21:00 锁定当日数据 |
| AI 教练 | `5 21 * * *` | 21:05 生成 AI 教练问题 |
| 每日分析 | `0 23 * * *` | 23:00 生成每日报告 |
| 每周报告 | `0 22 * * 4` | 周四 22:00 生成周报 |

## 环境变量管理

敏感信息建议使用飞书密钥管理：

```bash
# 设置密钥
larkapps secret set DASHSCOPE_API_KEY sk-xxxxx

# 在 config.yaml 中引用
environment:
  - key: DASHSCOPE_API_KEY
    value: {{secret.DASHSCOPE_API_KEY}}
```

## 日志查看

```bash
# 查看实时日志
larkapps function logs --name h5-api --follow

# 查看最近 100 条日志
larkapps function logs --name h5-api --limit 100
```

## 常见问题

### Q: 部署失败 "Permission denied"
A: 确保应用有云函数权限，在飞书开放平台 → 应用管理 → 权限管理中开通。

### Q: 函数超时
A: 增加 timeout 值或优化数据库查询。

### Q: CORS 错误
A: 已在 handler 中设置 CORS headers，检查是否正确返回。

### Q: 数据库不存在
A: 首次运行会自动创建 SQLite 数据库文件在 `data/insurance.db`。

## 部署 H5 前端

云函数部署完成后，部署前端：

1. **使用飞书云存储**
   ```bash
   cd /Users/boo/.openclaw/workspace/insurance-activity-tool-h5-app
   larkapps upload --dir . --app-id cli_a95a6b370af8dcc8
   ```

2. **或使用外部托管** (Vercel/Netlify)
   - 上传 H5 应用文件
   - 获取公开 URL
   - 在飞书应用配置中设置首页 URL

## 完整部署脚本

```bash
#!/bin/bash
# deploy.sh

set -e

echo "🚀 开始部署..."

# 1. 部署后端云函数
echo "📦 部署云函数..."
cd /Users/boo/.openclaw/workspace/insurance-activity-tool-backend
larkapps function deploy --config feishu-config.yaml

# 2. 获取 API URL
API_URL=$(larkapps function get-url --name h5-api)
echo "✅ API URL: $API_URL"

# 3. 更新前端配置
echo "🔧 更新前端配置..."
cd /Users/boo/.openclaw/workspace/insurance-activity-tool-h5-app
sed -i '' "s|const API_BASE = '.*'|const API_BASE = '$API_URL'|" js/api.js
sed -i '' "s|const USE_MOCK = .*|const USE_MOCK = false|" js/api.js

# 4. 部署前端
echo "📱 部署前端..."
larkapps upload --dir . --app-id cli_a95a6b370af8dcc8

echo "✅ 部署完成！"
```

## 回滚

```bash
# 查看历史版本
larkapps function versions --name h5-api

# 回滚到上一版本
larkapps function rollback --name h5-api --version 1
```
