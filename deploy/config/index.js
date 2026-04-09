// config/index.js
require('dotenv').config();

module.exports = {
  // 飞书配置
  feishu: {
    appId: process.env.FEISHU_APP_ID,
    appSecret: process.env.FEISHU_APP_SECRET,
    verificationToken: process.env.FEISHU_VERIFICATION_TOKEN,
    encryptKey: process.env.FEISHU_ENCRYPT_KEY,
    apiBase: process.env.FEISHU_API_BASE || 'https://open.feishu.cn'
  },

  // 阿里百炼配置
  dashscope: {
    apiKey: process.env.DASHSCOPE_API_KEY,
    model: process.env.DASHSCOPE_MODEL || 'qwen-plus'
  },

  // Anthropic 配置 (备用)
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY
  },

  // 数据库配置
  database: {
    url: process.env.DATABASE_URL
  },

  // Redis 配置 (可选)
  redis: {
    url: process.env.REDIS_URL
  },

  // 管理员配置
  admin: {
    userIds: (process.env.ADMIN_USER_IDS || '').split(',').filter(Boolean)
  },

  // 环境配置
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 3000
};
