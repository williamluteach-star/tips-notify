/**
 * 測試腳本：檢查LINE Bot和Google Sheets連線
 * 使用方法：node scripts/test-connection.js
 */

require('dotenv').config();
const line = require('@line/bot-sdk');
const { google } = require('googleapis');

async function testLineConnection() {
  console.log('🔍 測試LINE Bot連線...');
  
  try {
    const client = new line.Client({
      channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
    });

    // 測試取得Channel資訊
    const profile = await client.getProfile('test'); // 這會失敗，但可以測試token是否有效
    console.log('✅ LINE Bot連線成功');
  } catch (error) {
    if (error.statusCode === 400) {
      console.log('✅ LINE Channel Access Token 格式正確（無法驗證完整功能，需實際User ID）');
    } else {
      console.log('❌ LINE Bot連線失敗:', error.message);
      console.log('   請檢查 LINE_CHANNEL_ACCESS_TOKEN 是否正確');
    }
  }
}

async function testGoogleSheetsConnection() {
  console.log('\n🔍 測試Google Sheets連線...');
  
  try {
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const authClient = await auth.getClient();
    const sheets = google.sheets({ version: 'v4', auth: authClient });

    // 測試讀取Sheets
    const response = await sheets.spreadsheets.get({
      spreadsheetId: process.env.GOOGLE_SHEETS_ID,
    });

    console.log('✅ Google Sheets連線成功');
    console.log(`   Sheets名稱: ${response.data.properties.title}`);
    console.log(`   工作表數量: ${response.data.sheets.length}`);
  } catch (error) {
    console.log('❌ Google Sheets連線失敗:', error.message);
    console.log('   請檢查以下項目：');
    console.log('   1. GOOGLE_SHEETS_ID 是否正確');
    console.log('   2. GOOGLE_SERVICE_ACCOUNT_EMAIL 是否正確');
    console.log('   3. GOOGLE_PRIVATE_KEY 是否正確');
    console.log('   4. 服務帳號是否有編輯權限');
  }
}

async function checkEnvironmentVariables() {
  console.log('🔍 檢查環境變數...\n');
  
  const requiredVars = [
    'LINE_CHANNEL_ACCESS_TOKEN',
    'LINE_CHANNEL_SECRET',
    'GOOGLE_SHEETS_ID',
    'GOOGLE_SERVICE_ACCOUNT_EMAIL',
    'GOOGLE_PRIVATE_KEY',
  ];

  let allPresent = true;
  requiredVars.forEach(varName => {
    if (process.env[varName]) {
      console.log(`✅ ${varName}: 已設定`);
    } else {
      console.log(`❌ ${varName}: 未設定`);
      allPresent = false;
    }
  });

  return allPresent;
}

async function main() {
  console.log('========================================');
  console.log('   系統連線測試');
  console.log('========================================\n');

  const envOk = await checkEnvironmentVariables();
  
  if (!envOk) {
    console.log('\n⚠️  請先完成環境變數設定（參考 .env.example）');
    return;
  }

  await testLineConnection();
  await testGoogleSheetsConnection();

  console.log('\n========================================');
  console.log('   測試完成');
  console.log('========================================');
}

main().catch(console.error);


