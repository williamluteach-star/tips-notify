/**
 * 從Excel/CSV匯入學生資料到Google Sheets
 * 使用方法：node scripts/import-students.js <檔案路徑>
 * 
 * CSV格式範例：
 * 學生姓名,年級,家長LINE ID,家長姓名,聯絡電話,備註
 * 張小明,國小三年級,U1234567890,張爸爸,0912-345-678,
 * 李小花,國中一年級,U0987654321,李媽媽,0911-222-333,
 */

require('dotenv').config();
const fs = require('fs');
const { google } = require('googleapis');

async function importStudents(filePath) {
  try {
    // 讀取CSV檔案
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n').filter(line => line.trim());
    
    if (lines.length < 2) {
      console.log('❌ CSV檔案格式錯誤：至少需要標題行和一行資料');
      return;
    }

    // 解析CSV（簡單版本，不處理引號內的逗號）
    const headers = lines[0].split(',').map(h => h.trim());
    const data = lines.slice(1).map(line => {
      const values = line.split(',').map(v => v.trim());
      return headers.reduce((obj, header, index) => {
        obj[header] = values[index] || '';
        return obj;
      }, {});
    });

    console.log(`📊 讀取到 ${data.length} 筆學生資料\n`);

    // 連接到Google Sheets
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const authClient = await auth.getClient();
    const sheets = google.sheets({ version: 'v4', auth: authClient });
    const spreadsheetId = process.env.GOOGLE_SHEETS_ID;

    // 準備資料（對應到Google Sheets欄位順序）
    const values = data.map(row => [
      row['學生姓名'] || '',
      row['年級'] || '',
      row['家長LINE ID'] || '',
      row['家長姓名'] || '',
      row['聯絡電話'] || '',
      row['備註'] || '',
    ]);

    // 寫入Google Sheets
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: '學生資料表!A2',
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      resource: { values },
    });

    console.log('✅ 學生資料已成功匯入Google Sheets');
    console.log(`   共匯入 ${data.length} 筆資料\n`);

    // 顯示匯入的資料摘要
    console.log('匯入的學生資料：');
    data.forEach((row, index) => {
      console.log(`  ${index + 1}. ${row['學生姓名']} (${row['年級']}) - ${row['家長姓名']}`);
    });

  } catch (error) {
    console.error('❌ 匯入失敗:', error.message);
    if (error.code === 'ENOENT') {
      console.error('   檔案不存在，請檢查檔案路徑');
    }
  }
}

// 主程式
const filePath = process.argv[2];

if (!filePath) {
  console.log('使用方法：node scripts/import-students.js <CSV檔案路徑>');
  console.log('\nCSV格式範例：');
  console.log('學生姓名,年級,家長LINE ID,家長姓名,聯絡電話,備註');
  console.log('張小明,國小三年級,U1234567890,張爸爸,0912-345-678,');
  process.exit(1);
}

importStudents(filePath);


