# 飞书 CLI MCP 配置指南

## 概述

千老师是 Claude Code 在飞书的 CLI 分身，通过飞书官方 MCP 插件调用阿里百炼的 Claude Code。

**架构：**
```
飞书用户 → 飞书机器人 → 飞书 CLI MCP → Claude Code (阿里百炼) → 回复
```

**重要：** 不要在后端代码中直接调用 AI API！所有 AI 回复由飞书 CLI MCP 处理。

---

## 安装步骤

### 1. 安装飞书 CLI

```bash
npm install -g @larksuite/cli
```

### 2. 安装 MCP Skills

```bash
npx skills add https://github.com/larksuite/cli -y -g
```

### 3. 配置应用

```bash
lark-cli config init --new
```

### 4. 配置阿里百炼 API Key

在飞书 CLI 配置中添加阿里百炼 API Key（Coding Plan）：

```bash
lark-cli config set dashscope.api_key sk-xxxxxxxxxxxxxxxxxxxxxxxx
```

### 5. 配置飞书机器人

在飞书开放平台：
1. 进入应用管理 → 选择"千老师"应用
2. 配置 → 机器人 → 消息接收地址
3. 设置为飞书 CLI MCP 的地址

---

## 后端代码说明

**后端不再调用 AI API**，只处理：
- 用户认证（飞书 OAuth）
- 数据存储（PostgreSQL）
- 业务逻辑（活动量提交、统计、排行）
- 定时任务（AI 教练私信、周报）

**AI 教练私信** 仍然在后端处理，使用通义千问 `qwen-plus`（安全合规）。

**群聊 AI 回复** 由飞书 CLI MCP 的 Claude Code 处理。

---

## 环境变量

```bash
# 飞书开放平台配置
FEISHU_APP_ID=cli_a95a59999e78dcc0
FEISHU_APP_SECRET=oGkCG8FHYRxW3hNjVU3oceYgE3hYMkmE
FEISHU_VERIFICATION_TOKEN=1cd79a5727e4e24540c9527e416c7416

# 阿里百炼 API Key（仅用于 Claude Code，不直接调用）
DASHSCOPE_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxx

# 其他配置
NODE_ENV=production
PORT=3000
```

---

## 安全说明

**✅ 安全用法：**
- 阿里百炼 API Key 仅配置在飞书 CLI 中
- 由飞书 CLI MCP 插件调用 Claude Code
- 后端不直接调用 AI API

**❌ 危险用法：**
- 在后端代码中直接调用 `dashscope.aliyuncs.com` 使用 Claude 模型
- Coding Plan 只能用于 Claude Code Agent 调用

---

## 故障排查

### 检查飞书 CLI 是否安装

```bash
lark-cli --version
```

### 检查 MCP 配置

```bash
lark-cli config list
```

### 查看机器人日志

```bash
lark-cli logs
```

### 测试消息接收

在群里@千老师，查看日志是否有消息接收记录。
