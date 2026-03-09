/**
 * Webhook 事件記錄器
 * 記錄所有 LINE Webhook 事件，特別是 follow 事件（加好友）
 * 
 * 使用方法：
 * 1. 在 server.js 中加入此模組
 * 2. 或獨立運行此腳本監聽事件
 */

const fs = require('fs');
const path = require('path');

const LOG_FILE = path.join(__dirname, '..', 'webhook-events.log');

function logEvent(event) {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    type: event.type,
    source: event.source,
    userId: event.source?.userId || 'N/A',
    replyToken: event.replyToken || 'N/A',
  };

  // 如果是 follow 事件（加好友），特別標記
  if (event.type === 'follow') {
    logEntry.action = '家長加好友';
    logEntry.message = `新家長加好友，User ID: ${event.source.userId}`;
  } else if (event.type === 'message') {
    logEntry.action = '收到訊息';
    logEntry.message = event.message?.text || 'N/A';
  }

  // 寫入日誌檔案（雲端環境檔案系統可能是唯讀，用 try-catch 保護）
  const logLine = JSON.stringify(logEntry) + '\n';
  try {
    fs.appendFileSync(LOG_FILE, logLine, 'utf-8');
  } catch (e) {
    console.warn('[webhook-log] 無法寫入檔案（雲端環境）:', e.message);
  }

  // 同時輸出到控制台
  console.log(`[${timestamp}] ${logEntry.action || event.type}:`, {
    userId: logEntry.userId,
    message: logEntry.message || '',
  });

  return logEntry;
}

function getRecentFollowEvents(limit = 10) {
  if (!fs.existsSync(LOG_FILE)) {
    return [];
  }

  const content = fs.readFileSync(LOG_FILE, 'utf-8');
  const lines = content.trim().split('\n').filter(line => line.trim());
  
  const followEvents = lines
    .map(line => {
      try {
        return JSON.parse(line);
      } catch (e) {
        return null;
      }
    })
    .filter(event => event && event.type === 'follow')
    .slice(-limit);

  return followEvents;
}

function exportUserIdsToCSV(outputFile) {
  const events = getRecentFollowEvents(1000);
  const csvLines = ['User ID,Timestamp,Action'];
  
  events.forEach(event => {
    csvLines.push(`"${event.userId}","${event.timestamp}","${event.action}"`);
  });

  fs.writeFileSync(outputFile, csvLines.join('\n'), 'utf-8');
  console.log(`✅ 已匯出 ${events.length} 個 User ID 到 ${outputFile}`);
}

// 如果直接執行此腳本，顯示最近的 follow 事件
if (require.main === module) {
  console.log('========================================');
  console.log('   最近的加好友事件');
  console.log('========================================\n');

  const events = getRecentFollowEvents(20);
  
  if (events.length === 0) {
    console.log('目前沒有記錄到加好友事件。');
    console.log('\n💡 提示：');
    console.log('   1. 請家長加 LINE 官方帳號為好友');
    console.log('   2. 系統會自動記錄事件');
    console.log('   3. 再次執行此腳本查看記錄');
  } else {
    console.log(`找到 ${events.length} 個加好友事件：\n`);
    events.forEach((event, index) => {
      console.log(`${index + 1}. User ID: ${event.userId}`);
      console.log(`   時間: ${event.timestamp}`);
      console.log('');
    });

    // 詢問是否匯出為 CSV
    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    rl.question('\n是否匯出為 CSV 檔案？(y/n): ', answer => {
      if (answer.toLowerCase() === 'y') {
        const outputFile = path.join(__dirname, '..', 'user-ids.csv');
        exportUserIdsToCSV(outputFile);
        console.log(`\n📄 CSV 檔案位置: ${outputFile}`);
      }
      rl.close();
    });
  }
}

module.exports = { logEvent, getRecentFollowEvents, exportUserIdsToCSV };
