# 保险活动量管理 SaaS - 商业化技术方案

## 一、产品概述

### 1.1 产品定位
面向保险销售团队的**活动量管理 + AI 教练复盘**SaaS 产品，帮助团队建立活动量习惯，提升销售产能。

### 1.2 核心价值
| 角色 | 价值 |
|------|------|
| 团队主管 | 实时查看团队活动量数据，AI 自动复盘，减少管理成本 |
| 销售人员 | 每日 AI 一对一复盘，持续改进销售技能 |
| 保险公司 | 标准化活动量管理，数据驱动产能提升 |

### 1.3 产品形态
```
┌─────────────────────────────────────────────────────────────┐
│                    飞书第三方应用                            │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │   H5 前端   │  │  AI 教练    │  │   管理后台          │ │
│  │  (活动量填报)│  │  (私信复盘) │  │  (数据看板 + 配置)   │ │
│  └─────────────┘  └─────────────┘  └─────────────────────┘ │
├─────────────────────────────────────────────────────────────┤
│                    SaaS 后端 (多租户)                        │
├─────────────────────────────────────────────────────────────┤
│          PostgreSQL (多租户数据隔离)                          │
└─────────────────────────────────────────────────────────────┘
```

---

## 二、技术架构

### 2.1 当前架构 vs 目标架构

| 模块 | 当前 | 目标 |
|------|------|------|
| 数据库 | SQLite (单文件) | PostgreSQL (多租户) |
| 认证 | 单飞书应用 | 飞书第三方应用 (ISV) |
| 部署 | Railway 单实例 | Railway + 多环境 |
| 数据隔离 | 无 | tenant_id 隔离 |

### 2.2 多租户架构选择

**推荐方案：基于 tenant_id 的逻辑隔离**

```
优点：
- 成本低（单数据库）
- 易于维护
- 支持弹性扩展

缺点：
- 需要代码层保证隔离
- 需要严格的权限控制
```

**数据模型：**
```sql
-- 租户表（团队/保险公司）
CREATE TABLE tenants (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,           -- 团队名称
  feishu_tenant_key TEXT,       -- 飞书企业 key
  status TEXT DEFAULT 'active', -- active/suspended/cancelled
  plan TEXT DEFAULT 'free',     -- free/pro/enterprise
  member_limit INTEGER DEFAULT 10,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 用户表（增加 tenant_id）
CREATE TABLE users (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,      -- 所属租户
  name TEXT NOT NULL,
  feishu_union_id TEXT,
  feishu_user_id TEXT,
  role TEXT DEFAULT 'member',   -- admin/member
  ...
);

-- 活动量表（增加 tenant_id 索引）
CREATE TABLE activities (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,      -- 所属租户
  user_id UUID NOT NULL,
  activity_date DATE NOT NULL,
  ...
  INDEX idx_tenant_date (tenant_id, activity_date)
);
```

---

## 三、实施计划

### 阶段一：多租户改造（2-3 周）

#### 3.1.1 数据库迁移
```bash
# 1. 部署 PostgreSQL（Railway 自带）
# 2. 创建迁移脚本
# 3. 数据迁移（SQLite → PostgreSQL）
```

**关键改动：**
| 文件 | 改动 |
|------|------|
| `services/db.js` | 从 SQLite 改为 PostgreSQL |
| `services/auth.js` | 登录时获取 tenant_id |
| 所有 SQL 查询 | 增加 `WHERE tenant_id = ?` |

#### 3.1.2 API 改造
```javascript
// 中间件：自动注入 tenant_id
async function tenantMiddleware(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  const session = await getSession(token);
  req.tenantId = session.user.tenant_id;
  next();
}

// 所有查询自动带 tenant_id
app.get('/api/activities/today', authMiddleware, tenantMiddleware, async (req, res) => {
  const activities = await db.findAll('activities', {
    tenant_id: req.tenantId,
    activity_date: today
  });
});
```

#### 3.1.3 飞书第三方应用
```
1. 注册飞书开放平台企业账号
2. 创建第三方应用（H5 应用 + 机器人）
3. 配置授权 scope：
   - contact:readonly (获取成员)
   - im:message (发送消息)
   - bitable:app (多维表格)
```

---

### 阶段二：管理后台（1-2 周）

#### 3.2.1 功能模块
| 模块 | 功能 |
|------|------|
| 团队管理 | 成员列表、导入/导出、角色分配 |
| 数据看板 | 今日/本周活动量、排行榜、趋势图 |
| 配置中心 | 活动量维度配置、分数配置 |
| AI 设置 | 复盘时间、消息模板 |

#### 3.2.2 技术选型
```
方案 A：独立管理后台（推荐）
- 前端：Vue3 + Element Plus
- 路由：/admin
- 权限：admin 角色访问

方案 B：H5 嵌入管理功能
- 优点：开发快
- 缺点：体验一般
```

---

### 阶段三：订阅系统（1 周）

#### 3.3.1 价格策略
| 版本 | 价格 | 功能 |
|------|------|------|
| 免费版 | ¥0 | 最多 10 人，基础活动量 + AI 复盘 |
| 专业版 | ¥299/月 | 最多 50 人，管理后台 + 数据导出 |
| 企业版 | ¥999/月 | 无限人数，定制配置 + 专属客服 |

#### 3.3.2 支付集成
```javascript
// 推荐：使用 Stripe 或 支付宝
const subscription = await stripe.subscriptions.create({
  customer: stripeCustomerId,
  items: [{ price: 'price_xxx' }],
  metadata: { tenantId }
});
```

---

### 阶段四：飞书服务商入驻（1-2 周）

#### 3.4.1 入驻流程
```
1. 注册企业账号（营业执照）
2. 申请成为服务商
3. 创建第三方应用
4. 提交审核
5. 上架到飞书应用商店
```

#### 3.4.2 技术准备
- 实现 OAuth 安装流程
- 实现企业数据隔离
- 实现卸载回调（数据清理）

---

## 四、详细设计

### 4.1 数据库设计（PostgreSQL）

```sql
-- 租户表
CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  feishu_tenant_key VARCHAR(100) UNIQUE,
  feishu_app_id VARCHAR(50),
  feishu_app_secret VARCHAR(100),
  status VARCHAR(20) DEFAULT 'active',
  plan VARCHAR(20) DEFAULT 'free',
  member_limit INTEGER DEFAULT 10,
  subscription_end DATE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 用户表
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  name VARCHAR(100) NOT NULL,
  avatar VARCHAR(500),
  feishu_user_id VARCHAR(100),
  feishu_union_id VARCHAR(100),
  feishu_open_id VARCHAR(100),
  mobile VARCHAR(20),
  role VARCHAR(20) DEFAULT 'member',
  department VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_tenant_user (tenant_id, feishu_union_id)
);

-- 活动量配置表（支持自定义维度）
CREATE TABLE activity_dimensions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  code VARCHAR(50) NOT NULL,  -- new_leads, referral, etc.
  name VARCHAR(100) NOT NULL, -- 新增准客户
  score INTEGER DEFAULT 1,
  icon VARCHAR(10),
  is_enabled BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 活动量表
CREATE TABLE activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  user_id UUID NOT NULL REFERENCES users(id),
  activity_date DATE NOT NULL,
  new_leads INTEGER DEFAULT 0,
  referral INTEGER DEFAULT 0,
  invitation INTEGER DEFAULT 0,
  sales_meeting INTEGER DEFAULT 0,
  recruit_meeting INTEGER DEFAULT 0,
  business_plan INTEGER DEFAULT 0,
  deal INTEGER DEFAULT 0,
  eop_guest INTEGER DEFAULT 0,
  cc_assessment INTEGER DEFAULT 0,
  training INTEGER DEFAULT 0,
  total_score INTEGER DEFAULT 0,
  is_submitted BOOLEAN DEFAULT false,
  is_locked BOOLEAN DEFAULT false,
  submitted_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(tenant_id, user_id, activity_date),
  INDEX idx_tenant_date (tenant_id, activity_date)
);

-- AI 对话表
CREATE TABLE ai_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  user_id UUID NOT NULL REFERENCES users(id),
  conversation_date DATE NOT NULL,
  messages JSONB NOT NULL,
  question_count INTEGER DEFAULT 0,
  summary TEXT,
  status VARCHAR(20) DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_tenant_user_date (tenant_id, user_id, conversation_date)
);

-- 订阅表
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  stripe_customer_id VARCHAR(100),
  stripe_subscription_id VARCHAR(100),
  plan VARCHAR(20) NOT NULL,
  status VARCHAR(20) NOT NULL,
  current_period_start DATE,
  current_period_end DATE,
  cancel_at_period_end BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 4.2 API 设计

```
认证相关
POST   /api/auth/feishu          - 飞书登录
POST   /api/auth/logout          - 登出
GET    /api/auth/me              - 获取当前用户信息

活动量相关
GET    /api/activities/today     - 今日活动量
POST   /api/activities/submit    - 提交活动量
GET    /api/activities/history   - 历史数据
GET    /api/activities/stats     - 统计数据

AI 教练相关
POST   /api/ai-coach/start       - 开始对话（内部调用）
POST   /api/ai-coach/reply       - 用户回复

管理后台（admin 权限）
GET    /api/admin/team           - 团队列表
POST   /api/admin/member/import  - 导入成员
GET    /api/admin/dashboard      - 数据看板
GET    /api/admin/config         - 获取配置
PUT    /api/admin/config         - 更新配置

订阅相关
GET    /api/subscription         - 获取订阅信息
POST   /api/subscription/checkout - 创建结账会话
POST   /api/subscription/webhook  - Stripe 回调
```

### 4.3 部署架构

```
                    ┌─────────────────┐
                    │   Cloudflare    │
                    │     (CDN)       │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │   Netlify       │
                    │   (H5 前端)      │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │   Railway       │
                    │   (API 服务)     │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │   Railway       │
                    │  (PostgreSQL)   │
                    └─────────────────┘
```

---

## 五、安全设计

### 5.1 数据隔离
```javascript
// 所有查询必须带 tenant_id
async function findActivities(tenantId, filters) {
  return db.query(
    'SELECT * FROM activities WHERE tenant_id = $1 AND ...',
    [tenantId, ...]
  );
}

// 中间件强制注入
app.use('/api/*', (req, res, next) => {
  if (!req.tenantId) {
    return res.status(403).json({ error: 'Missing tenant context' });
  }
  next();
});
```

### 5.2 权限控制
```javascript
// 角色权限矩阵
const PERMISSIONS = {
  admin: ['read', 'write', 'delete', 'manage_members'],
  member: ['read', 'write']
};

// 权限中间件
function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.user.permissions.includes(permission)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  };
}
```

### 5.3 API 限流
```javascript
import rateLimit from 'express-rate-limit';

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 分钟
  max: 100 // 每 IP 最多 100 次
});

app.use('/api/', limiter);
```

---

## 六、成本估算

| 项目 | 免费档 | 专业档 | 企业档 |
|------|--------|--------|--------|
| Railway | ¥0 | ¥300/月 | ¥300/月 |
| PostgreSQL | 内置 | 内置 | 内置 |
| 域名 | ¥60/年 | ¥60/年 | ¥60/年 |
| 飞书 | ¥0 | ¥0 | ¥0 |
| **合计** | **¥60/年** | **¥3660/年** | **¥3660/年** |

**盈亏平衡点：**
- 专业版 ¥299/月，13 个客户即可覆盖成本
- 企业版 ¥999/月，4 个客户即可覆盖成本

---

## 七、上线检查清单

### 上线前必须完成
- [ ] 多租户数据隔离测试
- [ ] 压力测试（100 并发）
- [ ] 安全审计（SQL 注入、XSS）
- [ ] 备份策略（每日自动备份）
- [ ] 监控告警（错误率、响应时间）
- [ ] 隐私政策、服务条款
- [ ] 飞书应用审核通过

---

## 八、下一步行动

1. **确认产品定位**：目标客户是谁？（保险团队/独立经纪人/其他销售团队）
2. **确定 MVP 范围**：先做哪些功能？
3. **开始多租户改造**：我可以帮你实现

---

## 附录

### A. 飞书第三方应用文档
- https://open.feishu.cn/document/ukzMzI4LzQyNDIyODIw
- https://open.feishu.cn/document/ukzMzI4LzQyMjQyODIy

### B. Railway PostgreSQL 文档
- https://docs.railway.app/databases/postgresql

### C. 参考竞品
- 销售易
- 纷享销客
- 励销云

---

**文档版本：** v1.0  
**创建时间：** 2026-04-08  
**作者：** AI Assistant
