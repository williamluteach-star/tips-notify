/**
 * 設定助手 - 互動式設定引導
 * 使用方法：node scripts/setup-helper.js
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

async function main() {
  console.log('========================================');
  console.log('   作業通知系統 - 設定助手');
  console.log('========================================\n');

  const envPath = path.join(__dirname, '..', '.env');
  let envContent = '';

  // 檢查是否已有 .env 檔案
  if (fs.existsSync(envPath)) {
    console.log('⚠️  發現現有的 .env 檔案');
    const overwrite = await question('是否要覆蓋現有設定？(y/n): ');
    if (overwrite.toLowerCase() !== 'y') {
      console.log('已取消設定。');
      rl.close();
      return;
    }
    envContent = fs.readFileSync(envPath, 'utf-8');
  }

  console.log('\n📝 開始設定...\n');

  // LINE Bot 設定
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('第一步：LINE Bot 設定');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('請前往 LINE Developers Console:');
  console.log('👉 https://developers.line.biz/console/\n');
  console.log('1. 選擇您的 Provider');
  console.log('2. 選擇或建立 Messaging API Channel');
  console.log('3. 在「Messaging API」標籤下找到：');
  console.log('   - Channel access token');
  console.log('   - Channel secret\n');

  const lineToken = await question('請輸入 Channel Access Token: ');
  const lineSecret = await question('請輸入 Channel Secret: ');

  // Google Sheets 設定
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('第二步：Google Sheets 設定');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('請前往 Google Cloud Console:');
  console.log('👉 https://console.cloud.google.com/\n');
  console.log('1. 建立或選擇專案');
  console.log('2. 啟用 Google Sheets API');
  console.log('3. 建立服務帳號並下載 JSON 憑證\n');

  const googleSheetsId = await question('請輸入 Google Sheets ID（從網址中取得）: ');
  const googleEmail = await question('請輸入服務帳號 Email: ');
  
  console.log('\n請輸入 Private Key（完整內容，包含 BEGIN/END 標記）:');
  console.log('（輸入完成後請按 Enter，然後輸入 END 結束）');
  let privateKey = '';
  let line = '';
  while ((line = await question('')) !== 'END') {
    privateKey += line + '\n';
  }
  privateKey = privateKey.trim();

  // 建立 .env 內容
  const newEnvContent = `# LINE Bot 設定
LINE_CHANNEL_ACCESS_TOKEN=${lineToken}
LINE_CHANNEL_SECRET=${lineSecret}

# Google Sheets 設定
GOOGLE_SHEETS_ID=${googleSheetsId}
GOOGLE_SERVICE_ACCOUNT_EMAIL=${googleEmail}
GOOGLE_PRIVATE_KEY=${privateKey}

# 系統設定
PORT=3000
NODE_ENV=development
`;

  // 寫入檔案
  try {
    fs.writeFileSync(envPath, newEnvContent, 'utf-8');
    console.log('\n✅ .env 檔案已建立！\n');
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('下一步：');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('1. 建立 Google Sheets 並設定工作表');
    console.log('2. 將服務帳號加入為編輯者');
    console.log('3. 執行測試：node scripts/test-connection.js\n');
    
  } catch (error) {
    console.error('❌ 寫入檔案失敗:', error.message);
    console.log('\n請手動建立 .env 檔案，內容如下：\n');
    console.log(newEnvContent);
  }

  rl.close();
}

main().catch(console.error);
