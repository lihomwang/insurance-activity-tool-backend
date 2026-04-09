-- 保险活动量管理工具 - 数据库表结构
-- PostgreSQL Schema

-- ================== 用户表 ==================
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(64) PRIMARY KEY,           -- 飞书 user_id
  name VARCHAR(100) NOT NULL,           -- 姓名
  avatar VARCHAR(255),                  -- 头像 URL
  department VARCHAR(100),              -- 部门
  role VARCHAR(20) DEFAULT 'member',    -- admin / member
  phone VARCHAR(20),                    -- 手机号
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_users_department ON users(department);

-- ================== 活动量表 ==================
CREATE TABLE IF NOT EXISTS activities (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  activity_date DATE NOT NULL,

  -- 10 个维度数据
  new_leads INTEGER DEFAULT 0,          -- 新增准客户 (1 分)
  referral INTEGER DEFAULT 0,           -- 转介绍 (3 分)
  invitation INTEGER DEFAULT 0,         -- 邀约 (1 分)
  sales_meeting INTEGER DEFAULT 0,      -- 销售面谈 (10 分)
  recruit_meeting INTEGER DEFAULT 0,    -- 增员面谈 (10 分)
  business_plan INTEGER DEFAULT 0,      -- 事业项目书 (1 分)
  deal INTEGER DEFAULT 0,               -- 成交 (10 分)
  eop_guest INTEGER DEFAULT 0,          -- 嘉宾参加 EOP (5 分)
  cc_assessment INTEGER DEFAULT 0,      -- CC 测评 (5 分)
  training INTEGER DEFAULT 0,           -- 送训 (10 分)

  total_score INTEGER DEFAULT 0,        -- 总分
  is_locked BOOLEAN DEFAULT FALSE,      -- 是否锁定 (21:00 后)
  is_submitted BOOLEAN DEFAULT FALSE,   -- 是否已提交
  submitted_at TIMESTAMP,               -- 提交时间

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(user_id, activity_date)
);

CREATE INDEX idx_activities_date ON activities(activity_date);
CREATE INDEX idx_activities_user ON activities(user_id);

-- ================== AI 对话记录表 ==================
CREATE TABLE IF NOT EXISTS ai_conversations (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  conversation_date DATE NOT NULL,

  -- 对话内容
  messages JSONB NOT NULL,              -- 完整对话记录
  question_count INTEGER DEFAULT 0,     -- 问题数量
  user_mood VARCHAR(50),                -- 用户情绪：positive/neutral/negative

  -- AI 分析结果
  summary TEXT,                         -- AI 总结
  suggestion TEXT,                      -- AI 建议
  highlights TEXT[],                    -- 优秀表现 (数组)
  concerns TEXT[],                      -- 需关注问题 (数组)

  -- 安全标记
  has_risk_content BOOLEAN DEFAULT FALSE,
  risk_level VARCHAR(20) DEFAULT 'low',  -- low/medium/high
  risk_keywords TEXT[],

  -- 状态
  status VARCHAR(20) DEFAULT 'pending', -- pending/completed/flagged
  completed_at TIMESTAMP,

  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_conversations_user ON ai_conversations(user_id);
CREATE INDEX idx_conversations_date ON ai_conversations(conversation_date);
CREATE INDEX idx_conversations_status ON ai_conversations(status);

-- ================== 风险预警表 ==================
CREATE TABLE IF NOT EXISTS risk_alerts (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  conversation_id INTEGER REFERENCES ai_conversations(id),

  alert_type VARCHAR(50),               -- depression/anxiety/suicide/violence
  risk_level VARCHAR(20) NOT NULL,      -- low/medium/high/critical
  trigger_content TEXT,                 -- 触发内容片段
  ai_analysis TEXT,

  -- 处理状态
  status VARCHAR(20) DEFAULT 'unread',  -- unread/read/resolved
  handled_by VARCHAR(64),               -- 处理人 admin_id
  handled_at TIMESTAMP,
  handler_notes TEXT,

  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_alerts_status ON risk_alerts(status);
CREATE INDEX idx_alerts_created ON risk_alerts(created_at);

-- ================== 每日分析表 ==================
CREATE TABLE IF NOT EXISTS daily_analytics (
  id SERIAL PRIMARY KEY,
  analytics_date DATE NOT NULL,

  -- 团队整体数据
  total_members INTEGER,
  submitted_count INTEGER,
  avg_score DECIMAL(5,1),
  max_score INTEGER,
  min_score INTEGER,

  -- 维度统计 (JSON)
  dimension_stats JSONB,

  -- AI 对话统计
  ai_conversation_count INTEGER,
  avg_question_count DECIMAL(3,1),
  avg_mood_score DECIMAL(3,1),

  -- 风险统计
  risk_alert_count INTEGER,
  high_risk_count INTEGER,

  -- 优秀/问题汇总
  top_performers JSONB,
  common_issues JSONB,

  created_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(analytics_date)
);

-- ================== 每周报表表 ==================
CREATE TABLE IF NOT EXISTS weekly_reports (
  id SERIAL PRIMARY KEY,
  week_start DATE NOT NULL,             -- 周五
  week_end DATE NOT NULL,               -- 下周四

  -- 接收人
  admin_user_ids TEXT[],

  -- 完整数据
  week_data JSONB NOT NULL,

  -- AI 分析
  three_highlights TEXT[],              -- 三大优秀
  three_issues TEXT[],                  -- 三大问题
  suggestions TEXT[],                   -- 改进建议

  -- 发送状态
  sent_at TIMESTAMP,
  sent_status VARCHAR(20),              -- pending/sent/failed

  created_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(week_start, week_end)
);

-- ================== 初始数据 ==================
-- 插入默认管理员 (需要替换为真实的飞书 user_id)
-- INSERT INTO users (id, name, role) VALUES ('openid_xxx', '管理员', 'admin');
