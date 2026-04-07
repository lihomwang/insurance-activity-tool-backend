// services/auth.js
// 飞书认证服务

import axios from 'axios';
import db from './db.js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 加载环境变量
dotenv.config({ path: join(__dirname, '../.env.local'), override: true });

// H5 应用配置
const H5_APP_ID = process.env.H5_APP_ID || 'cli_a95a6b370af8dcc8';
const H5_APP_SECRET = process.env.H5_APP_SECRET || 'v2XoWID99STcoN1l1ijQtTk0ryEdjizF';

/**
 * 使用授权码获取用户 access_token
 */
async function getAccessToken(code) {
  const response = await axios.post(
    'https://open.feishu.cn/open-apis/authen/v1/oidc/access_token',
    {
      grant_type: 'authorization_code',
      code: code
    },
    {
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`${H5_APP_ID}:${H5_APP_SECRET}`).toString('base64'),
        'Content-Type': 'application/json'
      }
    }
  );

  if (response.data.code !== 0) {
    throw new Error(response.data.msg || '获取 token 失败');
  }

  return response.data.data;
}

/**
 * 获取用户信息
 */
async function getUserInfo(accessToken) {
  const response = await axios.get(
    'https://open.feishu.cn/open-apis/authen/v1/user_info',
    {
      headers: {
        'Authorization': 'Bearer ' + accessToken
      }
    }
  );

  if (response.data.code !== 0) {
    throw new Error(response.data.msg || '获取用户信息失败');
  }

  return response.data.data;
}

/**
 * 通过 union_id 获取或创建用户
 */
async function getOrCreateUser(feishuUserInfo) {
  const { union_id, open_id, name, avatar, mobile } = feishuUserInfo;

  // 先查找是否存在
  let user = await db.findOne('users', { feishu_union_id: union_id });

  if (user) {
    // 更新用户信息
    await db.update('users', { id: user.id }, {
      name: name || user.name,
      avatar: avatar || user.avatar,
      feishu_open_id: open_id || user.feishu_open_id,
      feishu_union_id: union_id || user.feishu_union_id,
      mobile: mobile || user.mobile,
      updated_at: new Date()
    });
    return user;
  }

  // 创建新用户
  const userId = 'user_' + union_id.slice(-8); // 生成简短的 user_id
  user = await db.insert('users', {
    id: userId,
    name: name || '飞书用户',
    avatar: avatar || '😊',
    feishu_user_id: union_id,
    feishu_open_id: open_id,
    feishu_union_id: union_id,
    mobile: mobile,
    created_at: new Date(),
    updated_at: new Date()
  });

  console.log('[Auth] 创建新用户:', { userId, name, union_id });
  return user;
}

/**
 * 处理飞书登录
 * @param {string} code - 飞书授权码
 * @returns {Object} 用户信息和 token
 */
export async function feishuLogin(code) {
  try {
    // 1. 获取 access_token
    const tokenData = await getAccessToken(code);
    const accessToken = tokenData.access_token;

    // 2. 获取用户信息
    const feishuUser = await getUserInfo(accessToken);

    // 3. 获取或创建本地用户
    const user = await getOrCreateUser(feishuUser);

    // 4. 生成会话 token（简单实现，实际应该用 JWT）
    const sessionToken = 'session_' + Date.now() + '_' + user.id;

    // 5. 保存 session（可以用 Redis，这里简单存内存）
    // TODO: 实现 session 存储

    return {
      user: {
        id: user.id,
        name: user.name,
        avatar: user.avatar,
        feishu_user_id: user.feishu_user_id,
        feishu_union_id: user.feishu_union_id,
        mobile: user.mobile
      },
      token: sessionToken,
      expires_in: tokenData.expires_in
    };
  } catch (error) {
    console.error('[Auth] 飞书登录失败:', error.message);
    throw error;
  }
}

/**
 * 验证 session token
 */
export async function verifyToken(token) {
  // TODO: 实现 token 验证
  // 简单实现：检查 token 格式
  if (!token || !token.startsWith('session_')) {
    return null;
  }
  // 实际应该查询 session 存储
  return { valid: true };
}

export default {
  feishuLogin,
  verifyToken,
  getAccessToken,
  getUserInfo
};
