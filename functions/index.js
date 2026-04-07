// functions/index.js
// 本地开发服务器入口

require('dotenv').config();
const http = require('http');

const activityHandler = require('./activity/index').handler;
const aiChatHandler = require('./ai-chat/index').handler;
const adminHandler = require('./admin/index').handler;
const schedulerHandler = require('./scheduler/index').handler;

const PORT = process.env.PORT || 3000;

const server = http.createServer(async (req, res) => {
  // 设置 CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', async () => {
    try {
      const url = new URL(req.url, `http://localhost:${PORT}`);
      const pathname = url.pathname;
      const query = Object.fromEntries(url.searchParams);

      console.log(`[${new Date().toISOString()}] ${req.method} ${pathname}`);

      let result;

      // 路由分发
      if (pathname.startsWith('/api/activity')) {
        result = await activityHandler(
          { body, query },
          { userId: query.userId }
        );
      } else if (pathname.startsWith('/api/ai-chat')) {
        result = await aiChatHandler({ body, query }, {});
      } else if (pathname.startsWith('/api/admin')) {
        result = await adminHandler({ body, query }, {});
      } else if (pathname.startsWith('/api/scheduler')) {
        result = await schedulerHandler({ body, query }, {});
      } else if (pathname === '/health') {
        result = { statusCode: 200, body: JSON.stringify({ status: 'ok' }) };
      } else {
        result = { statusCode: 404, body: JSON.stringify({ error: 'Not found' }) };
      }

      res.writeHead(result.statusCode, { 'Content-Type': 'application/json' });
      res.end(result.body);

    } catch (error) {
      console.error('Server error:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    }
  });
});

server.listen(PORT, () => {
  console.log('='.repeat(50));
  console.log('🚀 保险活动量管理工具 - 后端服务器');
  console.log('='.repeat(50));
  console.log(`环境：${process.env.NODE_ENV || 'development'}`);
  console.log(`端口：${PORT}`);
  console.log('');
  console.log('API 端点:');
  console.log(`  POST /api/activity/submit    - 提交活动量`);
  console.log(`  GET  /api/activity/today     - 获取今日数据`);
  console.log(`  GET  /api/activity/history   - 获取历史记录`);
  console.log(`  POST /api/ai-chat            - AI 对话`);
  console.log(`  GET  /api/admin/daily        - 每日分析`);
  console.log(`  GET  /api/admin/alerts       - 风险预警`);
  console.log(`  GET  /api/admin/team-overview - 团队概览`);
  console.log(`  POST /api/scheduler          - 定时任务`);
  console.log(`  GET  /health                 - 健康检查`);
  console.log('');
  console.log('按 Ctrl+C 停止服务器');
  console.log('='.repeat(50));
});
