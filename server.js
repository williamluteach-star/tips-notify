const express = require('express');
const line = require('@line/bot-sdk');
require('dotenv').config();

const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || 'dummy_token',
  channelSecret: process.env.LINE_CHANNEL_SECRET || 'dummy_secret',
};

// 只有在有真實 token 時才初始化 LINE Client
let client = null;
if (process.env.LINE_CHANNEL_ACCESS_TOKEN && process.env.LINE_CHANNEL_ACCESS_TOKEN !== 'dummy_token') {
  try {
    client = new line.Client(config);
  } catch (error) {
    console.warn('LINE Bot 初始化失敗（預覽模式）:', error.message);
  }
}

const app = express();

// Middleware
// ⚠️ 重要：LINE middleware 需要讀取 raw body 驗證簽名
// express.json() 不能套用到 /webhook，否則 stream 會被提前消耗
if (client) {
  app.use('/webhook', line.middleware(config));
} else {
  // 預覽模式：webhook 端點返回提示訊息
  app.post('/webhook', express.json(), (req, res) => {
    res.status(503).json({ error: 'LINE Bot 尚未設定，請參考設定指南完成設定' });
  });
}
// express.json() 只套用到 /api 路由，避免與 LINE webhook 衝突
app.use('/api', express.json());

// 靜態檔案服務（Web管理介面）
app.use(express.static('public'));

// 引入模組
const homeworkService = require('./services/homeworkService');
const notificationService = require('./services/notificationService');
const { logEvent } = require('./scripts/log-webhook-events');

// Webhook endpoint
app.post('/webhook', async (req, res) => {
  const events = req.body.events;

  for (const event of events) {
    // ✅ 每個事件都先寫入 log（確保 User ID 被記錄）
    logEvent(event);

    if (event.type === 'message' && event.message.type === 'text') {
      await handleMessage(event);
    } else if (event.type === 'follow') {
      await handleFollow(event);
    }
  }

  res.sendStatus(200);
});

// 引入家長配對工具
const parentPair = require('./scripts/pair-parents');

// 處理文字訊息
async function handleMessage(event) {
  if (!client) {
    console.warn('LINE Bot 未設定，無法處理訊息');
    return;
  }

  const userMessage = event.message.text;
  const userId = event.source.userId;

  // 嘗試從訊息中提取學生姓名並自動配對
  const studentName = parentPair.extractStudentName(userMessage);
  
  if (studentName) {
    // 自動配對並記錄（本地 JSON）
    parentPair.addPair(userId, studentName, userMessage);

    // ✅ 同步更新 Google Sheets，讓通知系統能使用正確的 User ID
    try {
      await homeworkService.updateStudentLineId(studentName, userId);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('✅ 自動配對成功！Google Sheets 已更新！');
      console.log(`   學生姓名: ${studentName}`);
      console.log(`   User ID: ${userId}`);
      console.log(`   訊息內容: ${userMessage}`);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    } catch (err) {
      console.warn('⚠️  Google Sheets 更新失敗，已保存到本地：', err.message);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('✅ 自動配對成功（本地記錄）');
      console.log(`   學生姓名: ${studentName}`);
      console.log(`   User ID: ${userId}`);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    }

    // 回覆家長確認
    await client.replyMessage(event.replyToken, {
      type: 'text',
      text: `感謝您的回覆！我們已收到${studentName}的家長資訊。您將收到孩子作業完成的相關通知。`,
    });
    return;
  }

  // 記錄所有訊息（用於取得 User ID）
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('💬 收到訊息');
  console.log(`   User ID: ${userId}`);
  console.log(`   訊息內容: ${userMessage}`);
  if (userMessage.includes('家長') || userMessage.includes('我是')) {
    console.log('   💡 提示：如果訊息包含「我是XXX的家長」，系統會自動配對');
  } else {
    console.log('   💡 請家長回覆「我是XXX的家長」以便自動配對');
  }
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // 家長查詢功能
  if (userMessage === '查詢' || userMessage === '查詢作業') {
    try {
      const records = await homeworkService.getRecentHomework(userId);
      if (records.length === 0) {
        await client.replyMessage(event.replyToken, {
          type: 'text',
          text: '目前沒有找到相關的作業記錄。',
        });
      } else {
        let message = '【近期作業完成記錄】\n\n';
        records.forEach((record, index) => {
          message += `${index + 1}. ${record.作業項目}\n   完成時間：${record.完成時間}\n\n`;
        });
        await client.replyMessage(event.replyToken, {
          type: 'text',
          text: message,
        });
      }
    } catch (error) {
      console.error('查詢錯誤:', error);
      await client.replyMessage(event.replyToken, {
        type: 'text',
        text: '查詢時發生錯誤，請稍後再試。',
      });
    }
    return;
  }

  // 預設回覆
  await client.replyMessage(event.replyToken, {
    type: 'text',
    text: '感謝您的訊息！如需查詢作業記錄，請輸入「查詢」或「查詢作業」。',
  });
}

// 處理加好友事件
async function handleFollow(event) {
  if (!client) {
    console.warn('LINE Bot 未設定，無法處理加好友事件');
    return;
  }

  // 記錄加好友事件（取得 User ID）
  const userId = event.source.userId;
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📱 新家長加好友！');
  console.log(`   User ID: ${userId}`);
  console.log('   請將此 User ID 填入「學生資料表」的「家長LINE ID」欄位');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  await client.replyMessage(event.replyToken, {
    type: 'text',
    text: '歡迎！您將收到孩子作業完成的相關通知。如需查詢記錄，請輸入「查詢」。',
  });
}

// API: 記錄作業完成（供工讀生使用）
app.post('/api/homework', async (req, res) => {
  try {
    const { studentName, homeworkItem, completedTime, operator } = req.body;

    if (!studentName || !homeworkItem) {
      return res.status(400).json({ error: '缺少必要欄位：學生姓名、作業項目' });
    }

    // 記錄作業
    let record;
    try {
      record = await homeworkService.recordHomework({
        studentName,
        homeworkItem,
        completedTime: completedTime || new Date().toISOString(),
        operator: operator || '系統',
      });
    } catch (error) {
      // 如果 Google Sheets 未設定，返回模擬成功
      if (error.message.includes('GOOGLE') || error.message.includes('Sheets')) {
        return res.json({
          success: true,
          message: '作業記錄已建立（預覽模式：Google Sheets 尚未設定）',
          record: {
            studentName,
            homeworkItem,
            completedTime: completedTime || new Date().toISOString(),
            operator: operator || '系統',
            preview: true,
          },
        });
      }
      throw error;
    }

    // 發送通知給家長
    try {
      await notificationService.notifyParent(studentName, homeworkItem, completedTime);
    } catch (error) {
      console.warn('發送通知失敗（可能是 LINE Bot 未設定）:', error.message);
      // 即使通知失敗，記錄仍算成功
    }

    res.json({
      success: true,
      message: '作業記錄已建立，通知已發送',
      record,
    });
  } catch (error) {
    console.error('記錄作業錯誤:', error);
    res.status(500).json({ error: error.message });
  }
});

// API: 批量記錄作業
app.post('/api/homework/batch', async (req, res) => {
  try {
    const { records } = req.body;

    if (!Array.isArray(records) || records.length === 0) {
      return res.status(400).json({ error: '請提供作業記錄陣列' });
    }

    const results = [];
    for (const record of records) {
      try {
        const result = await homeworkService.recordHomework({
          studentName: record.studentName,
          homeworkItem: record.homeworkItem,
          completedTime: record.completedTime || new Date().toISOString(),
          operator: record.operator || '系統',
        });

        await notificationService.notifyParent(
          record.studentName,
          record.homeworkItem,
          record.completedTime
        );

        results.push({ success: true, record: result });
      } catch (error) {
        results.push({ success: false, error: error.message });
      }
    }

    res.json({
      success: true,
      message: `處理完成：${results.filter(r => r.success).length}/${results.length} 筆成功`,
      results,
    });
  } catch (error) {
    console.error('批量記錄錯誤:', error);
    res.status(500).json({ error: error.message });
  }
});

// API: 發送每日摘要
app.post('/api/daily-summary', async (req, res) => {
  try {
    const { date } = req.body; // YYYY-MM-DD 格式，不提供則使用今天
    await notificationService.sendDailySummary(date);
    res.json({ success: true, message: '每日摘要已發送' });
  } catch (error) {
    console.error('發送摘要錯誤:', error);
    res.status(500).json({ error: error.message });
  }
});

// API: 取得最近記錄（供Web介面使用）
app.get('/api/recent-records', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const records = await homeworkService.getRecentRecords(limit);
    res.json({ success: true, records });
  } catch (error) {
    console.error('取得最近記錄錯誤:', error);
    res.status(500).json({ error: error.message, records: [] });
  }
});

// API: 取得學生列表（供前端下拉選單）
app.get('/api/students', async (req, res) => {
  try {
    const students = await homeworkService.getAllStudents();
    res.json({ success: true, students });
  } catch (error) {
    console.error('取得學生列表錯誤:', error);
    res.status(500).json({ error: error.message, students: [] });
  }
});

// API: 新增學生
app.post('/api/students', async (req, res) => {
  try {
    const { studentName, grade, lineUserId, parentName, phone, notes } = req.body;
    if (!studentName) {
      return res.status(400).json({ error: '缺少必要欄位：學生姓名' });
    }
    const student = await homeworkService.addStudent({ studentName, grade, lineUserId, parentName, phone, notes });
    res.json({ success: true, message: '學生已新增', student });
  } catch (error) {
    console.error('新增學生錯誤:', error);
    res.status(500).json({ error: error.message });
  }
});

// API: 取得 LINE 官方帳號基本資訊
app.get('/api/bot-info', async (req, res) => {
  const https = require('https');

  const basicId = process.env.LINE_BASIC_ID || '@334tjghl';
  const idWithout = basicId.replace('@', '');

  // 先回傳已知的靜態資訊
  const addFriendUrl = `https://line.me/R/ti/p/${basicId}`;
  const staticInfo = {
    basicId,
    qrCodeUrl: `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(addFriendUrl)}`,
    addFriendUrl,
  };

  // 嘗試從 LINE API 取得更多資訊（displayName, pictureUrl）
  if (!process.env.LINE_CHANNEL_ACCESS_TOKEN ||
      process.env.LINE_CHANNEL_ACCESS_TOKEN === 'your_line_channel_access_token') {
    return res.json({ success: true, ...staticInfo });
  }

  try {
    const data = await new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.line.me',
        path: '/v2/bot/info',
        method: 'GET',
        headers: { Authorization: 'Bearer ' + process.env.LINE_CHANNEL_ACCESS_TOKEN },
      };
      const req2 = https.request(options, (r) => {
        let body = '';
        r.on('data', c => body += c);
        r.on('end', () => {
          try { resolve(JSON.parse(body)); } catch (e) { resolve({}); }
        });
      });
      req2.on('error', reject);
      req2.end();
    });

    res.json({
      success: true,
      ...staticInfo,
      displayName: data.displayName || '',
      pictureUrl: data.pictureUrl || '',
      followersCount: data.followersCount,
    });
  } catch (e) {
    res.json({ success: true, ...staticInfo });
  }
});

// API: 取得已捕捉但未配對的家長 User ID
app.get('/api/pending-userids', (req, res) => {
  const fs = require('fs');
  const path = require('path');

  // 1. 從 parent-pairs.json 取得已自動配對的記錄
  const pairsFile = path.join(__dirname, 'parent-pairs.json');
  let pairs = [];
  if (fs.existsSync(pairsFile)) {
    try { pairs = JSON.parse(fs.readFileSync(pairsFile, 'utf-8')); } catch (e) {}
  }

  // 2. 從 webhook-events.log 取得所有出現過的 User ID
  const logFile = path.join(__dirname, 'webhook-events.log');
  const logUserIds = new Map(); // userId -> 最新事件資訊
  if (fs.existsSync(logFile)) {
    const lines = fs.readFileSync(logFile, 'utf-8').trim().split('\n');
    for (const line of lines) {
      try {
        const ev = JSON.parse(line);
        if (ev.userId && ev.userId !== 'N/A') {
          logUserIds.set(ev.userId, {
            userId: ev.userId,
            lastSeen: ev.timestamp,
            lastAction: ev.action || ev.type,
            lastMessage: ev.message || '',
          });
        }
      } catch (e) {}
    }
  }

  // 3. 整合：把 pairs 裡的資料也納入，標記是否已配對
  const pairedMap = new Map(pairs.map(p => [p.userId, p.studentName]));

  const result = [];

  // 來自 log 的 User ID
  for (const [uid, info] of logUserIds) {
    result.push({
      userId: uid,
      lastSeen: info.lastSeen,
      lastAction: info.lastAction,
      lastMessage: info.lastMessage,
      pairedStudent: pairedMap.get(uid) || null,
      source: 'webhook',
    });
  }

  // 來自 pairs.json 但不在 log 裡的
  for (const p of pairs) {
    if (!logUserIds.has(p.userId)) {
      result.push({
        userId: p.userId,
        lastSeen: p.updatedAt || p.createdAt,
        lastAction: '自動配對',
        lastMessage: p.message || '',
        pairedStudent: p.studentName,
        source: 'pairs',
      });
    }
  }

  // 按時間排序（最新在前）
  result.sort((a, b) => new Date(b.lastSeen) - new Date(a.lastSeen));

  res.json({ success: true, userIds: result, total: result.length });
});

// API: 將 User ID 配對到指定學生（更新 Google Sheets + parent-pairs.json）
app.post('/api/pair-userid', async (req, res) => {
  const { userId, studentName } = req.body;
  if (!userId || !studentName) {
    return res.status(400).json({ error: '缺少 userId 或 studentName' });
  }

  // 1. 更新 parent-pairs.json
  const parentPair = require('./scripts/pair-parents');
  parentPair.addPair(userId, studentName, '手動配對');

  // 2. 更新 Google Sheets 學生資料表
  try {
    await homeworkService.updateStudentLineId(studentName, userId);
    res.json({ success: true, message: `✅ 已將 ${userId} 配對給 ${studentName}，並更新 Google Sheets` });
  } catch (e) {
    // Sheets 更新失敗也回傳部分成功
    res.json({ success: true, message: `✅ 已配對到本機記錄，但 Google Sheets 更新失敗：${e.message}` });
  }
});

// API: 主任登入驗證
app.post('/api/director-login', (req, res) => {
  const { password } = req.body;
  const directorPassword = process.env.DIRECTOR_PASSWORD || 'tips2024';
  if (password === directorPassword) {
    res.json({ success: true });
  } else {
    res.status(401).json({ success: false, error: '密碼錯誤' });
  }
});

// 健康檢查
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 啟動伺服器
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('========================================');
  console.log('   作業完成通知系統');
  console.log('========================================');
  console.log(`✅ 伺服器運行在 http://localhost:${PORT}`);
  console.log(`📱 Web管理介面: http://localhost:${PORT}`);
  console.log(`🔗 Webhook URL: https://your-domain.com/webhook`);
  
  if (!client) {
    console.log('\n⚠️  預覽模式：LINE Bot 尚未設定');
    console.log('   請參考「設定指南.md」完成設定');
  }
  
  if (!process.env.GOOGLE_SHEETS_ID || process.env.GOOGLE_SHEETS_ID === 'your_google_sheets_id') {
    console.log('⚠️  預覽模式：Google Sheets 尚未設定');
    console.log('   請參考「設定指南.md」完成設定');
  }
  
  console.log('========================================\n');
});


