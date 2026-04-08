-- PostgreSQL 数据库初始化脚本
-- 保险活动量管理 SaaS - 多租户版本

-- 启用 UUID 扩展
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- 核心表：租户
-- ============================================
CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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

CREATE INDEX idx_tenants_status ON tenants(status);

-- ============================================
-- 核心表：用户
-- ============================================
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  avatar VARCHAR(500),
  department VARCHAR(100),
  role VARCHAR(20) DEFAULT 'member',
  phone VARCHAR(20),
  feishu_user_id VARCHAR(100),
  feishu_open_id VARCHAR(100),
  feishu_union_id VARCHAR(100),
  mobile VARCHAR(20),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_users_tenant ON users(tenant_id);
CREATE INDEX idx_users_feishu ON users(tenant_id, feishu_union_id);

-- ============================================
-- 核心表：活动量配置（支持自定义维度）
-- ============================================
CREATE TABLE activity_dimensions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code VARCHAR(50) NOT NULL,
  name VARCHAR(100) NOT NULL,
  score INTEGER DEFAULT 1,
  icon VARCHAR(10),
  is_enabled BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(tenant_id, code)
);

CREATE INDEX idx_dimensions_tenant ON activity_dimensions(tenant_id);

-- 插入默认维度配置
INSERT INTO activity_dimensions (tenant_id, code, name, score, icon, sort_order)
SELECT
  t.id,
  codes.code,
  codes.name,
  codes.score,
  codes.icon,
  codes.sort_order
FROM tenants t
CROSS JOIN (
  VALUES
    ('new_leads', '新增准客户', 1, '📝', 1),
    ('referral', '转介绍', 3, '🌟', 2),
    ('invitation', '邀约', 1, '📅', 3),
    ('sales_meeting', '销售面谈', 10, '💼', 4),
    ('recruit_meeting', '增员面谈', 10, '👥', 5),
    ('business_plan', '事业项目书', 1, '📄', 6),
    ('deal', '成交', 10, '🎉', 7),
    ('eop_guest', '嘉宾参加 EOP', 5, '🎪', 8),
    ('cc_assessment', 'CC 测评', 5, '📊', 9),
    ('training', '送训', 10, '📚', 10)
) AS codes(code, name, score, icon, sort_order);

-- ============================================
-- 核心表：活动量
-- ============================================
CREATE TABLE activities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
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
  is_locked BOOLEAN DEFAULT false,
  is_submitted BOOLEAN DEFAULT false,
  submitted_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT unique_tenant_user_date UNIQUE (tenant_id, user_id, activity_date)
);

CREATE INDEX idx_activities_tenant ON activities(tenant_id);
CREATE INDEX idx_activities_date ON activities(tenant_id, activity_date);
CREATE INDEX idx_activities_user ON activities(tenant_id, user_id);

-- ============================================
-- 核心表：AI 对话记录
-- ============================================
CREATE TABLE ai_conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  conversation_date DATE NOT NULL,
  messages JSONB NOT NULL,
  question_count INTEGER DEFAULT 0,
  user_mood VARCHAR(50),
  summary TEXT,
  suggestion TEXT,
  highlights TEXT,
  concerns TEXT,
  has_risk_content BOOLEAN DEFAULT false,
  risk_level VARCHAR(20) DEFAULT 'low',
  risk_keywords TEXT,
  status VARCHAR(20) DEFAULT 'pending',
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_conversations_tenant ON ai_conversations(tenant_id);
CREATE INDEX idx_conversations_user ON ai_conversations(tenant_id, user_id, conversation_date);

-- ============================================
-- 扩展表：风险预警
-- ============================================
CREATE TABLE risk_alerts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  alert_date DATE NOT NULL,
  risk_level VARCHAR(20) NOT NULL,
  risk_type VARCHAR(50),
  risk_content TEXT,
  suggestion TEXT,
  is_handled BOOLEAN DEFAULT false,
  handled_at TIMESTAMP,
  handled_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_risk_alerts_tenant ON risk_alerts(tenant_id);
CREATE INDEX idx_risk_alerts_date ON risk_alerts(tenant_id, alert_date);

-- ============================================
-- 扩展表：每日分析
-- ============================================
CREATE TABLE daily_analytics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  analytics_date DATE NOT NULL,
  total_members INTEGER DEFAULT 0,
  submitted_count INTEGER DEFAULT 0,
  avg_score DECIMAL(5,2) DEFAULT 0,
  max_score INTEGER DEFAULT 0,
  min_score INTEGER DEFAULT 0,
  dimension_stats JSONB,
  ai_conversation_count INTEGER DEFAULT 0,
  avg_question_count DECIMAL(5,2) DEFAULT 0,
  avg_mood_score DECIMAL(5,2) DEFAULT 0,
  risk_alert_count INTEGER DEFAULT 0,
  high_risk_count INTEGER DEFAULT 0,
  top_performers JSONB,
  common_issues JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT unique_tenant_analytics_date UNIQUE (tenant_id, analytics_date)
);

CREATE INDEX idx_analytics_tenant ON daily_analytics(tenant_id);
CREATE INDEX idx_analytics_date ON daily_analytics(tenant_id, analytics_date);

-- ============================================
-- 扩展表：订阅
-- ============================================
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
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

CREATE INDEX idx_subscriptions_tenant ON subscriptions(tenant_id);

-- ============================================
-- 函数：自动更新 updated_at
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 为所有需要 updated_at 的表创建触发器
CREATE TRIGGER update_tenants_updated_at BEFORE UPDATE ON tenants
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_activities_updated_at BEFORE UPDATE ON activities
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 初始数据：创建默认租户（用于测试）
-- ============================================
INSERT INTO tenants (id, name, feishu_tenant_key, plan, member_limit)
VALUES
  ('00000000-0000-0000-0000-000000000001', '默认团队', 'default_tenant', 'free', 10);

-- 为默认租户插入维度配置
INSERT INTO activity_dimensions (tenant_id, code, name, score, icon, sort_order)
SELECT
  '00000000-0000-0000-0000-000000000001'::uuid,
  codes.code,
  codes.name,
  codes.score,
  codes.icon,
  codes.sort_order
FROM (
  VALUES
    ('new_leads', '新增准客户', 1, '📝', 1),
    ('referral', '转介绍', 3, '🌟', 2),
    ('invitation', '邀约', 1, '📅', 3),
    ('sales_meeting', '销售面谈', 10, '💼', 4),
    ('recruit_meeting', '增员面谈', 10, '👥', 5),
    ('business_plan', '事业项目书', 1, '📄', 6),
    ('deal', '成交', 10, '🎉', 7),
    ('eop_guest', '嘉宾参加 EOP', 5, '🎪', 8),
    ('cc_assessment', 'CC 测评', 5, '📊', 9),
    ('training', '送训', 10, '📚', 10)
) AS codes(code, name, score, icon, sort_order);
