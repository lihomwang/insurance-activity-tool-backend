// services/tenant.js
// 多租户中间件

import db from './db.js';

/**
 * 从 JWT 或 Session 中提取 tenant_id
 * 注入到 req 对象中
 */
async function tenantMiddleware(req, res, next) {
  try {
    // 1. 从 Authorization header 获取 token
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      // 公开 API 不需要租户上下文
      return next();
    }

    // 2. 从 session 或 JWT 中获取用户信息
    // 这里简化处理，实际应该用 JWT 解码
    const session = await getSession(token);

    if (!session || !session.user || !session.user.tenant_id) {
      return res.status(401).json({
        success: false,
        message: 'Invalid token or missing tenant context'
      });
    }

    // 3. 注入 tenant_id 到 request
    req.tenantId = session.user.tenant_id;
    req.user = session.user;

    next();
  } catch (error) {
    console.error('[Tenant] Error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Tenant middleware error'
    });
  }
}

/**
 * 获取 session（简化实现，生产环境用 Redis 或 JWT）
 */
const sessions = new Map();

async function getSession(token) {
  if (!token) return null;

  // 检查内存 session
  const session = sessions.get(token);
  if (session && session.expiresAt > Date.now()) {
    return session;
  }

  // 从数据库获取用户信息
  try {
    const user = await db.findOne('users', { feishu_user_id: token });
    if (user) {
      return {
        user: {
          id: user.id,
          tenant_id: user.tenant_id,
          name: user.name,
          role: user.role
        },
        expiresAt: Date.now() + 7200 * 1000 // 2 小时
      };
    }
  } catch (error) {
    console.error('[Session] Error:', error.message);
  }

  return null;
}

/**
 * 创建 session
 */
async function createSession(user, tenantId) {
  const token = 'tenant_' + Date.now() + '_' + user.id;
  sessions.set(token, {
    user: {
      id: user.id,
      tenant_id: tenantId,
      name: user.name,
      role: user.role
    },
    expiresAt: Date.now() + 7200 * 1000
  });
  return token;
}

/**
 * 强制租户检查的中间件
 * 用于需要租户上下文的 API
 */
function requireTenant() {
  return (req, res, next) => {
    if (!req.tenantId) {
      return res.status(403).json({
        success: false,
        message: 'Tenant context required'
      });
    }
    next();
  };
}

/**
 * 管理员权限检查
 */
function requireAdmin() {
  return (req, res, next) => {
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Admin access required'
      });
    }
    next();
  };
}

export default {
  tenantMiddleware,
  requireTenant,
  requireAdmin,
  getSession,
  createSession
};
