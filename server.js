const express = require('express');
const line = require('@line/bot-sdk');
const driveService = require('./services/driveService');
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

  // 嘗試從訊息中提取學生姓名並自動配對（支援多位兄弟姐妹）
  const studentNames = parentPair.extractStudentNames(userMessage);

  if (studentNames.length > 0) {
    // 每位學生各自配對同一個家長 User ID
    for (const name of studentNames) {
      parentPair.addPair(userId, name, userMessage);
    }

    // 同步配對到 Google Sheets（讓配對在部署重啟後仍然有效）
    for (const name of studentNames) {
      homeworkService.updateStudentLineId(name, userId).catch(e =>
        console.warn('[sync] 無法同步配對到 Google Sheets:', e.message)
      );
    }

    const nameList = studentNames.join('、');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ 自動配對成功（本地記錄＋Google Sheets）');
    console.log(`   學生姓名: ${nameList}`);
    console.log(`   User ID: ${userId}`);
    console.log(`   訊息內容: ${userMessage}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    // 回覆家長確認（列出所有孩子）
    await client.replyMessage(event.replyToken, {
      type: 'text',
      text: `感謝您的回覆！我們已收到${nameList}的家長資訊。您將收到孩子作業完成的相關通知。`,
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

  // 預設回覆（已關閉，如需重新開啟請取消下方註解）
  // await client.replyMessage(event.replyToken, {
  //   type: 'text',
  //   text: '感謝您的訊息！如需查詢作業記錄，請輸入「查詢」或「查詢作業」。',
  // });
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
// API：上傳照片到 Google Drive（接收 base64）
app.post('/api/upload-photo', async (req, res) => {
  try {
    const { base64, mimeType, fileName } = req.body;
    if (!base64 || !mimeType) return res.status(400).json({ error: '缺少照片資料' });
    // 限制 10MB（base64 約 1.37 倍原始大小）
    if (base64.length > 14 * 1024 * 1024) return res.status(400).json({ error: '照片超過 10MB 限制' });
    const result = await driveService.uploadPhoto(base64, mimeType, fileName || 'photo.jpg');
    res.json({ success: true, ...result });
  } catch (e) {
    console.error('[upload-photo]', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/api/homework', async (req, res) => {
  try {
    const { studentName, homeworkItem, completedTime, operator, photoUrl } = req.body;

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
        photoUrl: photoUrl || '',
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
    let notifyResult = null;
    try {
      notifyResult = await notificationService.notifyParent(studentName, homeworkItem, completedTime, photoUrl);
    } catch (error) {
      console.warn('發送通知失敗:', error.message);
      notifyResult = { success: false, message: error.message };
    }

    const notifyMsg = notifyResult?.success
      ? `通知已發送（${notifyResult.message}）`
      : `⚠️ 通知未送達：${notifyResult?.message || '未知原因'}`;

    res.json({
      success: true,
      message: `作業記錄已建立。${notifyMsg}`,
      record,
      notification: notifyResult,
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
app.get('/api/pending-userids', async (req, res) => {
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

  // 3. 整合：把 pairs 裡的資料也納入，標記所有已配對的學生（支援多孩子）
  // pairedMap: userId → [studentName, ...]
  const pairedMap = new Map();
  for (const p of pairs) {
    if (!pairedMap.has(p.userId)) pairedMap.set(p.userId, []);
    pairedMap.get(p.userId).push(p.studentName);
  }

  const result = [];

  // 來自 log 的 User ID
  for (const [uid, info] of logUserIds) {
    result.push({
      userId: uid,
      lastSeen: info.lastSeen,
      lastAction: info.lastAction,
      lastMessage: info.lastMessage,
      pairedStudents: pairedMap.get(uid) || [],
      source: 'webhook',
    });
  }

  // 來自 pairs.json 但不在 log 裡的（取最新一筆的時間）
  const seenInPairs = new Set();
  for (const p of pairs) {
    if (!logUserIds.has(p.userId) && !seenInPairs.has(p.userId)) {
      seenInPairs.add(p.userId);
      result.push({
        userId: p.userId,
        lastSeen: p.updatedAt || p.createdAt,
        lastAction: '手動配對',
        lastMessage: p.message || '',
        pairedStudents: pairedMap.get(p.userId) || [],
        source: 'pairs',
      });
    }
  }

  // 4. 也從 Google Sheets 讀取已有 lineUserId 的學生（部署重啟後配對仍可見）
  try {
    const allStudents = await homeworkService.getAllStudents();
    for (const student of allStudents) {
      if (!student.lineUserId) continue;
      const ids = student.lineUserId.split(',').map(s => s.trim()).filter(Boolean);
      for (const uid of ids) {
        const existing = result.find(r => r.userId === uid);
        if (existing) {
          // 補充 pairedStudents（若本地記錄的配對不完整）
          if (!existing.pairedStudents.includes(student.studentName)) {
            existing.pairedStudents.push(student.studentName);
          }
        } else {
          // Google Sheets 有記錄但本地已清空，補入清單
          result.push({
            userId: uid,
            lastSeen: '(Google Sheets)',
            lastAction: '已配對（Google Sheets）',
            lastMessage: '',
            pairedStudents: [student.studentName],
            source: 'sheets',
          });
        }
      }
    }
  } catch (e) {
    console.warn('[pending-userids] 無法從 Google Sheets 讀取:', e.message);
  }

  // 按時間排序（最新在前；Google Sheets 來源排末尾）
  result.sort((a, b) => {
    if (a.lastSeen === '(Google Sheets)') return 1;
    if (b.lastSeen === '(Google Sheets)') return -1;
    return new Date(b.lastSeen) - new Date(a.lastSeen);
  });

  res.json({ success: true, userIds: result, total: result.length });
});

// API: 將 User ID 配對到指定學生
// 支援多位家長配對同一學生（爸爸媽媽各自配對），以 parent-pairs.json 為主
app.post('/api/pair-userid', async (req, res) => {
  const { userId, studentName } = req.body;
  if (!userId || !studentName) {
    return res.status(400).json({ error: '缺少 userId 或 studentName' });
  }

  // 更新 parent-pairs.json（同一 userId 若重複配對則更新學生名稱）
  const parentPair = require('./scripts/pair-parents');
  parentPair.addPair(userId, studentName, '手動配對');

  // 同步到 Google Sheets 讓配對在部署重啟後也有效
  homeworkService.updateStudentLineId(studentName, userId).catch(e =>
    console.warn('[sync] 無法同步配對到 Google Sheets:', e.message)
  );

  res.json({ success: true, message: `✅ 已將 ${userId} 配對給 ${studentName}` });
});

// API: 刪除配對（刪除某 userId 的所有配對）
app.delete('/api/pair-userid/:userId', (req, res) => {
  const { userId } = req.params;
  try {
    const parentPair = require('./scripts/pair-parents');
    parentPair.removePair(decodeURIComponent(userId));
    res.json({ success: true, message: '已刪除配對' });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// API: 精準刪除：只刪除指定 userId + studentName 的那一筆配對
app.delete('/api/pair-userid/:userId/:studentName', async (req, res) => {
  const { userId, studentName } = req.params;
  const uid = decodeURIComponent(userId);
  const name = decodeURIComponent(studentName);
  try {
    // 1. 從本地 parent-pairs.json 移除
    const parentPair = require('./scripts/pair-parents');
    parentPair.removePairByStudent(uid, name);
    // 2. 同步從 Google Sheets 移除（才是持久化的資料來源）
    try {
      await homeworkService.removeStudentLineId(name, uid);
    } catch (gsErr) {
      console.warn('[delete pair] Google Sheets 移除失敗（不影響本地）:', gsErr.message);
    }
    res.json({ success: true, message: `已移除 ${name} 的配對` });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// API: 學期升級 — 所有學生年級 +1（12 → 畢業）
app.post('/api/students/increment-grade', async (req, res) => {
  try {
    const result = await homeworkService.incrementGrades();
    const msg = `年級升級完成：共更新 ${result.updated} 位學生` +
      (result.graduated.length ? `，其中 ${result.graduated.join('、')} 已畢業` : '') +
      (result.skipped.length ? `；${result.skipped.length} 位非數字年級已跳過` : '');
    res.json({ success: true, message: msg, result });
  } catch (e) {
    console.error('年級升級錯誤:', e);
    res.status(500).json({ success: false, error: e.message });
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

// API: 家長上傳作業照片後通知老師
// 前端直接上傳到 Cloudinary，完成後呼叫此端點讓 bot 推播給老師
app.post('/api/parent-notify', async (req, res) => {
  try {
    const { studentName, subject, photoUrl, uploadTime } = req.body;
    if (!studentName || !photoUrl) {
      return res.status(400).json({ error: '缺少必要欄位（studentName、photoUrl）' });
    }

    // 格式化上傳時間（台灣時區）
    const time = uploadTime
      ? new Date(uploadTime).toLocaleString('zh-TW', {
          timeZone: 'Asia/Taipei',
          year: 'numeric', month: '2-digit', day: '2-digit',
          hour: '2-digit', minute: '2-digit',
        })
      : new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });

    const subjectStr = subject || '未填寫';

    // 印 log，不管有沒有設定 LINE 都記錄下來
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📸 家長上傳作業照片');
    console.log(`   學生：${studentName}`);
    console.log(`   科目：${subjectStr}`);
    console.log(`   時間：${time}`);
    console.log(`   照片：${photoUrl}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    const teacherLineId = process.env.TEACHER_LINE_USER_ID;

    if (!client || !teacherLineId) {
      console.warn('[parent-notify] LINE 未設定或 TEACHER_LINE_USER_ID 未設定，跳過通知');
      return res.json({
        success: true,
        notified: false,
        message: '照片已上傳，老師通知功能尚未設定（TEACHER_LINE_USER_ID）',
      });
    }

    const messageText =
      `📸 【家長上傳作業照片】\n\n` +
      `👦 學生：${studentName}\n` +
      `📚 科目：${subjectStr}\n` +
      `⏰ 上傳時間：${time}\n\n` +
      `📷 查看照片：\n${photoUrl}`;

    await client.pushMessage(teacherLineId, { type: 'text', text: messageText });
    console.log(`[parent-notify] ✅ 已通知老師（${teacherLineId}）`);

    res.json({ success: true, notified: true, message: '已通知老師' });
  } catch (e) {
    console.error('[parent-notify] 錯誤:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

// 健康檢查
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// LINE 診斷 API：檢查 Token 有效性 + 每月配額
app.get('/api/debug/line-status', async (req, res) => {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token || token === 'dummy_token') {
    return res.json({ error: 'LINE_CHANNEL_ACCESS_TOKEN 未設定' });
  }
  const https = require('https');
  const fetch = (url) => new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { Authorization: `Bearer ${token}` } }, (response) => {
      let data = '';
      response.on('data', chunk => data += chunk);
      response.on('end', () => {
        resolve({ status: response.statusCode, body: (() => { try { return JSON.parse(data); } catch { return data; } })() });
      });
    });
    req.on('error', reject);
  });
  try {
    const [quota, usage, profile] = await Promise.all([
      fetch('https://api.line.me/v2/bot/message/quota'),
      fetch('https://api.line.me/v2/bot/message/quota/consumption'),
      fetch('https://api.line.me/v2/bot/info'),
    ]);
    res.json({
      token_prefix: token.substring(0, 20) + '...',
      quota: { status: quota.status, data: quota.body },
      usage: { status: usage.status, data: usage.body },
      bot_info: { status: profile.status, data: profile.body },
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
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


