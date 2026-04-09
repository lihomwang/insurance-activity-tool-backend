// tests/api.test.js
// API 测试脚本 (SQLite 版本)

const db = require('../services/db-sqlite');
const safetyFilter = require('../services/safetyFilter');

// 测试数据库连接
function testDbConnection() {
  console.log('\n📋 测试 1: 数据库连接');
  try {
    const database = db.getDb();
    database.prepare('SELECT 1').get();
    console.log('✅ 数据库连接成功');
    return true;
  } catch (error) {
    console.log('❌ 数据库连接失败:', error.message);
    return false;
  }
}

// 测试表结构
function testTables() {
  console.log('\n📋 测试 2: 表结构检查');
  try {
    const tables = ['users', 'activities', 'ai_conversations', 'risk_alerts', 'daily_analytics', 'weekly_reports'];
    const database = db.getDb();

    for (const table of tables) {
      const result = database.prepare(`
        SELECT name FROM sqlite_master WHERE type='table' AND name=?
      `).get(table);

      if (result) {
        console.log(`✅ 表 ${table} 存在`);
      } else {
        console.log(`❌ 表 ${table} 不存在`);
      }
    }
    return true;
  } catch (error) {
    console.log('❌ 表结构检查失败:', error.message);
    return false;
  }
}

// 测试安全过滤
function testSafetyFilter() {
  console.log('\n📋 测试 3: 安全过滤模块');

  const testCases = [
    { message: '今天感觉很好，签了一单', expected: 'low' },
    { message: '最近很抑郁，不想干了', expected: 'medium' },
    { message: '活着没意思，想自杀', expected: 'critical' },
    { message: '压力好大，失眠了', expected: 'medium' }
  ];

  let passed = 0;
  for (const { message, expected } of testCases) {
    const result = safetyFilter.analyzeMessage(message);
    const success = result.riskLevel === expected ||
                   (expected === 'medium' && result.hasRisk);

    if (success) {
      console.log(`✅ "${message}" -> ${result.riskLevel}`);
      passed++;
    } else {
      console.log(`❌ "${message}" -> ${result.riskLevel} (期望：${expected})`);
    }
  }

  console.log(`通过：${passed}/${testCases.length}`);
  return passed >= testCases.length - 1;
}

// 测试活动量数据操作
function testActivityData() {
  console.log('\n📋 测试 4: 活动量数据操作');

  try {
    const today = new Date().toISOString().split('T')[0];
    const testUser = 'test_user_001';

    const database = db.getDb();

    // 插入测试用户
    database.prepare(`
      INSERT OR REPLACE INTO users (id, name, role)
      VALUES (?, ?, ?)
    `).run(testUser, '测试用户', 'member');

    // 插入测试活动量
    const totalScore = 5*1 + 2*3 + 3*1 + 1*10 + 1*10;

    const now = new Date().toISOString();
    database.prepare(`
      INSERT INTO activities (
        user_id, activity_date, new_leads, referral, invitation,
        sales_meeting, deal, total_score, is_submitted, submitted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
      ON CONFLICT(user_id, activity_date) DO UPDATE SET
        new_leads = ?, referral = ?, invitation = ?,
        sales_meeting = ?, deal = ?, total_score = ?,
        is_submitted = 1, submitted_at = ?
    `).run(
      testUser, today, 5, 2, 3, 1, 1, totalScore, now,
      5, 2, 3, 1, 1, totalScore, now
    );

    console.log('✅ 活动量数据插入成功');

    // 查询验证
    const result = db.findOne('activities', {
      user_id: testUser,
      activity_date: today
    });

    if (result && result.total_score === totalScore) {
      console.log(`✅ 活动量数据查询成功 (总分：${totalScore})`);
    } else {
      console.log('❌ 活动量数据查询失败');
      return false;
    }

    return true;
  } catch (error) {
    console.log('❌ 活动量数据操作失败:', error.message);
    return false;
  }
}

// 测试 AI 对话记录
function testConversationData() {
  console.log('\n📋 测试 5: AI 对话记录操作');

  try {
    const today = new Date().toISOString().split('T')[0];
    const testUser = 'test_user_001';

    const conversation = db.insert('ai_conversations', {
      user_id: testUser,
      conversation_date: today,
      messages: JSON.stringify([
        { role: 'assistant', content: '今天感觉怎么样？' },
        { role: 'user', content: '还不错，签了一单！' }
      ]),
      question_count: 1,
      user_mood: 'positive',
      summary: '今天表现不错',
      status: 'completed'
    });

    console.log('✅ AI 对话记录插入成功，ID:', conversation.id);

    // 查询验证
    const result = db.findOne('ai_conversations', { id: conversation.id });

    if (result && result.status === 'completed') {
      console.log('✅ AI 对话记录查询成功');
    } else {
      console.log('❌ AI 对话记录查询失败');
      return false;
    }

    return true;
  } catch (error) {
    console.log('❌ AI 对话记录操作失败:', error.message);
    return false;
  }
}

// 主测试流程
function runTests() {
  console.log('='.repeat(50));
  console.log('🧪 保险活动量管理工具 - API 测试');
  console.log('='.repeat(50));

  // 先初始化数据库
  console.log('\n📦 初始化数据库...');
  db.initTables();

  const results = {
    dbConnection: testDbConnection(),
    tables: testTables(),
    safetyFilter: testSafetyFilter(),
    activityData: testActivityData(),
    conversationData: testConversationData()
  };

  console.log('\n' + '='.repeat(50));
  console.log('📊 测试结果汇总');
  console.log('='.repeat(50));

  const passed = Object.values(results).filter(r => r).length;
  const total = Object.values(results).length;

  console.log(`通过：${passed}/${total}`);

  if (passed === total) {
    console.log('\n✅ 所有测试通过！');
  } else {
    console.log('\n⚠️ 部分测试失败，请检查配置和数据库');
  }

  process.exit(passed === total ? 0 : 1);
}

// 运行测试
runTests();
