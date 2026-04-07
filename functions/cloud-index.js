/**
 * 保险活动量管理工具 - 飞书云函数统一入口
 * 整合所有 API 功能到一个 handler
 */

const activityHandler = require('./activity/index').handler
const aiChatHandler = require('./ai-chat/index').handler
const adminHandler = require('./admin/index').handler
const schedulerHandler = require('./scheduler/index').handler
const receiveMessageHandler = require('./receive-message/index').handler

/**
 * 云函数入口
 * @param {Object} event - 事件对象
 * @param {Object} context - 上下文对象
 */
exports.handler = async (event, context) => {
  // 解析请求
  const httpMethod = event.httpMethod || 'GET'
  const path = event.path || '/'
  const headers = event.headers || {}
  const body = event.body ? JSON.parse(event.body) : {}
  const query = event.queryStringParameters || {}

  console.log(`[${new Date().toISOString()}] ${httpMethod} ${path}`)

  try {
    let result

    // 健康检查
    if (httpMethod === 'GET' && path === '/health') {
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
          status: 'ok',
          timestamp: new Date().toISOString()
        })
      }
    }

    // 飞书事件回调（优先处理，因为没有 httpMethod）
    if (body.type === 'url_verification' || body.type === 'event_callback') {
      console.log('[Event] 处理飞书事件回调')
      return receiveMessageHandler(event, context)
    }

    // 活动量 API
    if (path.startsWith('/api/activity')) {
      result = await activityHandler({ httpMethod, path, body, query, headers }, context)
    }
    // AI 教练 API
    else if (path.startsWith('/api/ai-chat')) {
      result = await aiChatHandler({ httpMethod, path, body, query, headers }, context)
    }
    // 管理员 API
    else if (path.startsWith('/api/admin')) {
      result = await adminHandler({ httpMethod, path, body, query, headers }, context)
    }
    // 定时任务 API
    else if (path.startsWith('/api/scheduler')) {
      result = await schedulerHandler({ httpMethod, path, body, query, headers }, context)
    }
    // 404
    else {
      return {
        statusCode: 404,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
          success: false,
          message: 'Not Found'
        })
      }
    }

    return result

  } catch (error) {
    console.error('云函数执行错误:', error)
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        success: false,
        message: error.message
      })
    }
  }
}
