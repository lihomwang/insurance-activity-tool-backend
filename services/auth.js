// services/auth.js
// 飞书认证服务

import axios from 'axios';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import jwt from 'jsonwebtoken';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 加载环境变量（兼容开发和生产）
const envPath = join(__dirname, '..', '.env.local');
try {
  dotenv.config({ path: envPath });
} catch {
  // .env.local 不存在也没关系（生产环境）
}

// H5 应用配置
const H5_APP_ID = process.env.H5_APP_ID || 'cli_a95a6b370af8dcc8';
const H5_APP_SECRET = process.env.H5_APP_SECRET;
const JWT_SECRET = process.env.JWT_SECRET || 'insurance-activity-tool-secret-key-2026';

console.log('[Auth] H5 App ID:', H5_APP_ID);
console.log('[Auth] H5 App Secret set:', !!H5_APP_SECRET);

/**
 * 获取 App Access Token
 */
async function getAppAccessToken() {
  const response = await axios.post(
    'https://open.feishu.cn/open-apis/auth/v3/app_access_token/internal',
    {
      app_id: H5_APP_ID,
      app_secret: H5_APP_SECRET
    }
  );

  if (response.data.code !== 0) {
    throw new Error('获取 App Token 失败：' + response.data.msg);
  }

  return response.data.app_access_token;
}

/**
 * 使用授权码换取用户 token
 */
async function getAccessToken(code) {
  console.log('[Auth] Calling Feishu OIDC API with app_id:', H5_APP_ID);

  const appAccessToken = await getAppAccessToken();
  console.log('[Auth] Got App Access Token');

  const response = await axios.post(
    'https://open.feishu.cn/open-apis/authen/v1/oidc/access_token',
    {
      grant_type: 'authorization_code',
      code: code
    },
    {
      headers: {
        'Authorization': 'Bearer ' + appAccessToken,
        'Content-Type': 'application/json'
      }
    }
  );

  if (response.data.code !== 0) {
    console.error('[Auth] getAccessToken error:', response.data);
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
 * 处理飞书登录
 * 不再写数据库，直接生成 JWT
 */
export async function feishuLogin(code) {
  try {
    // 1. 获取 access_token
    const tokenData = await getAccessToken(code);
    const accessToken = tokenData.access_token;

    // 2. 获取用户信息
    const feishuUser = await getUserInfo(accessToken);

    // 3. 生成 JWT token
    const jwtToken = jwt.sign(
      {
        open_id: feishuUser.open_id,
        union_id: feishuUser.union_id,
        name: feishuUser.name,
        avatar: feishuUser.avatar_url || '😊',
        mobile: feishuUser.mobile
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    console.log('[Auth] 登录成功:', feishuUser.name);
    return {
      user: {
        open_id: feishuUser.open_id,
        union_id: feishuUser.union_id,
        name: feishuUser.name,
        avatar: feishuUser.avatar_url || '😊',
        mobile: feishuUser.mobile
      },
      token: jwtToken
    };
  } catch (error) {
    console.error('[Auth] 飞书登录失败:', error.message);
    throw error;
  }
}

export default {
  feishuLogin,
  getAccessToken,
  getUserInfo
};
