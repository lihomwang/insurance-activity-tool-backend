// services/tenant.js
// 多租户中间件

import jwt from 'jsonwebtoken';

// JWT 密钥（需要与 api-server.js 保持一致）
const JWT_SECRET = process.env.JWT_SECRET || 'insurance-activity-tool-secret-key-2026';

/**
 * 从 JWT 中提取 tenant_id 和用户信息
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

    // 2. 解码 JWT token 获取用户信息
    const decoded = jwt.verify(token, JWT_SECRET);

    if (!decoded || !decoded.tenant_id) {
      return res.status(401).json({
        success: false,
        message: 'Invalid token or missing tenant context'
      });
    }

    // 3. 注入 tenant_id 和用户信息到 request
    req.tenantId = decoded.tenant_id;
    req.user = {
      id: decoded.id,
      tenant_id: decoded.tenant_id,
      name: decoded.name,
      avatar: decoded.avatar,
      feishu_user_id: decoded.feishu_user_id
    };

    next();
  } catch (error) {
    console.error('[Tenant] Error:', error.message);
    return res.status(401).json({
      success: false,
      message: '登录已过期或 token 无效'
    });
  }
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
  requireAdmin
};
