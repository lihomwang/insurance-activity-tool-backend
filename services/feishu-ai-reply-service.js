#!/usr/bin/env node
/**
 * 飞书 AI 回复服务 - 通过调用 Claude Code CLI 生成智能回复
 *
 * API:
 * POST /api/generate-reply
 * Body: { message, user_name, is_submitted, today_submitted_count }
 * Response: { reply: "..." }
 */

import http from 'http';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PORT = 3456;

// 千老师系统提示词
const SYSTEM_PROMPT = `你是"千老师"，一位资深的保险销售导师。

【你的人设】
- 你有 20 年保险销售经验，带过上千个徒弟
- 你专业、温暖、真诚，说话简洁有力
- 你共情能力强，能理解销售的压力和困难
- 你善于发现对方的优点，真诚地肯定

【你的说话风格】
- 像发微信一样说话，口语化、自然
- 每次只说 1-2 句话，最多不超过 3 句
- 不要使用 emoji，保持专业形象
- 不要贫嘴，不要过度调侃
- 不要用书面语、AI 腔调

【你的工作】
你是一个保险活动量管理工具的助手，帮助用户：
1. 查询活动量数据（提交人数、排行榜、个人数据等）
2. 解答填报相关问题（时间、入口等）
3. 鼓励和督促用户完成活动量填报`;

/**
 * 调用 Claude Code CLI 生成回复
 * 使用非交互模式（-p 参数）
 */
async function callClaudeCode(systemPrompt, userPrompt) {
  return new Promise((resolve, reject) => {
    const fullPrompt = `${systemPrompt}

---

用户输入：
${userPrompt}

---

请直接回复用户，简洁温暖，1-2 句话即可。不要输出其他说明。`;

    // 使用 claude 命令，-p 参数用于非交互模式
    const claude = spawn('claude', [
      '-p', fullPrompt,
      '--output-format', 'text',
      '--model', 'qwen3.5-plus'
    ], {
      env: {
        ...process.env,
        ANTHROPIC_AUTH_TOKEN: process.env.CODING_PLAN_API_KEY || 'sk-sp-87417cc737b44634b3883fb845effbd7',
        ANTHROPIC_BASE_URL: 'https://coding.dashscope.aliyuncs.com/apps/anthropic',
        CLICOLOR: '0',  // 禁用颜色输出
        FORCE_COLOR: '0' // 禁用颜色
      }
    });

    let output = '';
    let errorOutput = '';

    claude.stdout.on('data', (data) => {
      output += data.toString();
    });

    claude.stderr.on('data', (data) => {
      errorOutput += data.toString();
      console.error('[Claude CLI stderr]:', data.toString());
    });

    claude.on('close', (code) => {
      if (code !== 0) {
        console.error('[Claude CLI] Exit code:', code);
        console.error('[Claude CLI] Error:', errorOutput);
        reject(new Error(`Claude CLI exited with code ${code}: ${errorOutput}`));
      } else {
        // 提取回复内容
        const reply = output.trim();
        resolve(reply);
      }
    });

    // 超时处理
    setTimeout(() => {
      claude.kill('SIGTERM');
      reject(new Error('Claude CLI timeout'));
    }, 30000); // 30 秒超时
  });
}

/**
 * 生成飞书群聊回复
 */
async function generateReply({ message, user_name, is_submitted, today_submitted_count }) {
  const userPrompt = `用户在群里说："${message}"

当前用户：${user_name || '伙伴'}
用户今天是否已提交数据：${is_submitted ? '是' : '否'}
今天已有 ${today_submitted_count} 人提交数据

请直接回复用户，简洁温暖，1-2 句话即可。`;

  try {
    console.log('[AI] 调用 Claude Code...');
    const reply = await callClaudeCode(SYSTEM_PROMPT, userPrompt);
    console.log('[AI] Claude 回复:', reply);
    return reply;
  } catch (error) {
    console.error('[AI] 调用 Claude Code 失败:', error.message);
    return null;
  }
}

/**
 * HTTP 服务器处理
 */
const server = http.createServer(async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', service: 'feishu-ai-reply' }));
    return;
  }

  if (req.method === 'POST' && req.url === '/api/generate-reply') {
    let body = '';

    req.on('data', chunk => {
      body += chunk.toString();
    });

    req.on('end', async () => {
      try {
        const data = JSON.parse(body);
        console.log('[HTTP] 收到请求:', data);

        const reply = await generateReply(data);

        if (reply) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, reply }));
        } else {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'AI 生成失败' }));
        }
      } catch (error) {
        console.error('[HTTP] 错误:', error.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: error.message }));
      }
    });

    return;
  }

  // 404
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not Found' }));
});

server.listen(PORT, () => {
  console.log(`[Feishu AI Reply Service] 运行在 http://localhost:${PORT}`);
  console.log(`[Feishu AI Reply Service] Health: http://localhost:${PORT}/health`);
  console.log(`[Feishu AI Reply Service] Generate Reply: POST http://localhost:${PORT}/api/generate-reply`);
});
