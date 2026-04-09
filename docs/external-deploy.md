# 外部服务器部署指南

## 推荐方案：部署到任意云服务器

### 服务器选择

| 服务商 | 价格 | 链接 |
|--------|------|------|
| 阿里云 | ¥49/月起 | https://www.aliyun.com |
| 腾讯云 | ¥39/月起 | https://cloud.tencent.com |
| 华为云 | ¥45/月起 | https://www.huaweicloud.com |
|  Railway (免费) | $0 | https://railway.app |
|  Render (免费) | $0 | https://render.com |

**推荐**：国内用户用阿里云/腾讯云，有免费试用

---

## 部署步骤（以阿里云为例）

### 1. 购买服务器

1. 注册阿里云账号
2. 选择 "轻量应用服务器" 或 "ECS"
3. 选择配置：
   - CPU: 1 核
   - 内存：2GB
   - 系统：Ubuntu 22.04 或 CentOS 8
4. 完成购买

### 2. 连接服务器

```bash
# Mac 终端连接
ssh root@你的服务器 IP
```

### 3. 安装 Node.js

```bash
# Ubuntu/Debian
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# 验证安装
node -v
npm -v
```

### 4. 上传代码

```bash
# 在服务器上创建目录
mkdir -p /opt/insurance-activity-tool
cd /opt/insurance-activity-tool

# 使用 git 克隆（推荐）
git clone <你的代码仓库地址> .

# 或者用 scp 从本地上传
# 在本地 Mac 上执行：
# scp -r /Users/boo/.openclaw/workspace/insurance-activity-tool-backend root@服务器 IP:/opt/insurance-activity-tool
```

### 5. 安装依赖

```bash
npm install --production
```

### 6. 配置环境变量

```bash
# 创建.env 文件
cat > .env << EOF
NODE_ENV=production
PORT=3000
DASHSCOPE_API_KEY=sk-1697fef9d8b843f1a12bebce6cc64fc8
DASHSCOPE_MODEL=qwen-plus
AI_PROVIDER=dashscope
FEISHU_APP_ID=cli_a95a6b370af8dcc8
FEISHU_APP_SECRET=v2XoWID99STcoN1l1ijQtTk0ryEdjizF
FEISHU_API_BASE=https://open.feishu.cn
EOF
```

### 7. 安装 PM2（进程管理）

```bash
npm install -g pm2
```

### 8. 启动服务

```bash
# 初始化数据库
npm run db:init

# 启动服务
pm2 start functions/index.js --name insurance-api

# 设置开机自启
pm2 startup
pm2 save
```

### 9. 配置防火墙

在阿里云控制台：
1. 进入服务器管理
2. 防火墙/安全组
3. 添加入站规则：放行 3000 端口

### 10. 测试访问

在本地 Mac 浏览器访问：
```
http://你的服务器 IP:3000/health
```

应该返回：`{"status":"ok"}`

---

## 部署后配置

### 修改小程序 API 地址

编辑小程序 `app.js`：

```javascript
globalData: {
  // 改为你的服务器地址
  apiBase: 'http://你的服务器 IP:3000'

  // 或者用域名（需要配置 HTTPS）
  // apiBase: 'https://你的域名.com'
}
```

### 域名和 HTTPS（可选）

如果要正式上线，建议：
1. 购买域名（约¥50/年）
2. 配置 Nginx 反向代理
3. 申请免费 SSL 证书（Let's Encrypt）

---

## 免费部署方案（适合测试）

### 使用 Railway.app（推荐）

1. 访问 https://railway.app
2. 用 GitHub 账号登录
3. 创建新项目
4. 连接你的代码仓库
5. 添加环境变量
6. 自动部署

**优点**：
- 免费额度够用（$5/月）
- 自动 HTTPS
- 无需配置服务器

### 使用 Render.com

1. 访问 https://render.com
2. 注册账号
3. 创建 Web Service
4. 连接 GitHub 仓库
5. 配置环境变量
6. 部署

---

## 数据库方案

### 方案 A：SQLite（简单，但不推荐生产用）
- 优点：无需配置
- 缺点：服务器重启数据还在，但多实例会冲突

### 方案 B：飞书多维表格（推荐）
- 在飞书创建多维表格
- 修改 `services/db-sqlite.js` 使用 API

### 方案 C：云数据库
- 阿里云 RDS（付费）
- 或 MongoDB Atlas（免费额度）

---

## 快速开始（最简方案）

1. **注册 Railway.app**
2. **连接 GitHub 仓库**
3. **配置环境变量**
4. **自动部署完成**
5. **获取 Railway 提供的域名**
6. **修改小程序 apiBase**

搞定！
