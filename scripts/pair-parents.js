/**
 * 家長配對工具
 * 記錄家長訊息中的學生姓名和 User ID 的對應關係
 */

const fs = require('fs');
const path = require('path');

const PAIR_FILE = path.join(__dirname, '..', 'parent-pairs.json');

// 載入配對記錄
function loadPairs() {
  if (fs.existsSync(PAIR_FILE)) {
    try {
      const content = fs.readFileSync(PAIR_FILE, 'utf-8');
      return JSON.parse(content);
    } catch (e) {
      return [];
    }
  }
  return [];
}

// 儲存配對記錄（雲端環境保護）
function savePairs(pairs) {
  try {
    fs.writeFileSync(PAIR_FILE, JSON.stringify(pairs, null, 2), 'utf-8');
  } catch (e) {
    console.warn('[pair-parents] 無法寫入檔案（雲端環境）:', e.message);
  }
}

// 新增配對
function addPair(userId, studentName, message = '') {
  const pairs = loadPairs();
  
  // 檢查是否已存在
  const existing = pairs.find(p => p.userId === userId);
  if (existing) {
    console.log(`⚠️  User ID ${userId} 已存在，更新為：${studentName}`);
    existing.studentName = studentName;
    existing.message = message;
    existing.updatedAt = new Date().toISOString();
  } else {
    pairs.push({
      userId,
      studentName,
      message,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }
  
  savePairs(pairs);
  return pairs;
}

// 從訊息中提取學生姓名
function extractStudentName(message) {
  // 常見格式：
  // "我是XXX的家長"
  // "我是XXX的媽媽"
  // "我是XXX的爸爸"
  // "XXX的家長"
  // "查詢 XXX"
  
  const patterns = [
    /我是(.+?)的(?:家長|媽媽|爸爸|父親|母親)/,
    /(.+?)的(?:家長|媽媽|爸爸|父親|母親)/,
    /查詢\s*(.+)/,
    /學生[：:]\s*(.+)/,
    /(.+?)的家長/,
  ];
  
  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }
  
  return null;
}

// 匯出為 CSV（方便匯入 Google Sheets）
function exportToCSV(outputFile) {
  const pairs = loadPairs();
  
  const csvLines = ['User ID,學生姓名,訊息內容,建立時間'];
  pairs.forEach(pair => {
    csvLines.push(`"${pair.userId}","${pair.studentName}","${pair.message}","${pair.createdAt}"`);
  });
  
  fs.writeFileSync(outputFile, csvLines.join('\n'), 'utf-8');
  console.log(`✅ 已匯出 ${pairs.length} 筆配對記錄到 ${outputFile}`);
}

// 顯示所有配對
function showPairs() {
  const pairs = loadPairs();
  
  if (pairs.length === 0) {
    console.log('目前沒有配對記錄。');
    return;
  }
  
  console.log(`\n找到 ${pairs.length} 筆配對記錄：\n`);
  pairs.forEach((pair, index) => {
    console.log(`${index + 1}. 學生：${pair.studentName}`);
    console.log(`   User ID: ${pair.userId}`);
    console.log(`   訊息：${pair.message || '(無)'}`);
    console.log(`   時間：${pair.createdAt}`);
    console.log('');
  });
}

// 如果直接執行此腳本
if (require.main === module) {
  const command = process.argv[2];
  
  if (command === 'show' || !command) {
    showPairs();
    
    const pairs = loadPairs();
    if (pairs.length > 0) {
      const readline = require('readline');
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });
      
      rl.question('\n是否匯出為 CSV 檔案？(y/n): ', answer => {
        if (answer.toLowerCase() === 'y') {
          const outputFile = path.join(__dirname, '..', 'parent-pairs.csv');
          exportToCSV(outputFile);
          console.log(`\n📄 CSV 檔案位置: ${outputFile}`);
          console.log('💡 您可以將此檔案匯入 Google Sheets 或手動填入');
        }
        rl.close();
      });
    }
  } else if (command === 'export') {
    const outputFile = process.argv[3] || path.join(__dirname, '..', 'parent-pairs.csv');
    exportToCSV(outputFile);
  }
}

module.exports = { addPair, extractStudentName, loadPairs, exportToCSV };
