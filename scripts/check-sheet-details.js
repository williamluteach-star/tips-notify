/**
 * 檢查特定工作表的詳細資訊
 */

require('dotenv').config();
const { google } = require('googleapis');

async function checkSheetDetails(sheetName) {
  try {
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n').replace(/"/g, ''),
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const authClient = await auth.getClient();
    const sheets = google.sheets({ version: 'v4', auth: authClient });
    const spreadsheetId = process.env.GOOGLE_SHEETS_ID;

    // 取得試算表資訊
    const spreadsheet = await sheets.spreadsheets.get({
      spreadsheetId,
    });

    console.log(`📊 試算表名稱: ${spreadsheet.data.properties.title}\n`);

    // 列出所有工作表
    console.log('📋 所有工作表：');
    spreadsheet.data.sheets.forEach((sheet, index) => {
      const name = sheet.properties.title;
      const gid = sheet.properties.sheetId;
      console.log(`  ${index + 1}. ${name} (gid=${gid})`);
    });
    console.log('');

    // 檢查指定的工作表
    if (sheetName) {
      const targetSheet = spreadsheet.data.sheets.find(
        s => s.properties.title === sheetName
      );

      if (!targetSheet) {
        console.log(`❌ 找不到工作表「${sheetName}」`);
        console.log('\n可用的工作表名稱：');
        spreadsheet.data.sheets.forEach(s => {
          console.log(`  - ${s.properties.title}`);
        });
        return;
      }

      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`檢查工作表：「${sheetName}」`);
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

      // 讀取標題列
      try {
        const range = `${sheetName}!A1:Z1`;
        const response = await sheets.spreadsheets.values.get({
          spreadsheetId,
          range,
        });

        const headers = response.data.values?.[0] || [];
        console.log('📝 標題列：');
        headers.forEach((header, index) => {
          const col = String.fromCharCode(65 + index); // A, B, C...
          console.log(`  ${col}1: ${header || '(空白)'}`);
        });
        console.log('');

        // 檢查是否符合「學生資料表」的格式
        if (sheetName === '學生資料表') {
          const expectedHeaders = ['學生姓名', '年級', '家長LINE ID', '家長姓名', '聯絡電話', '備註'];
          console.log('✅ 預期標題列：');
          expectedHeaders.forEach((header, index) => {
            const col = String.fromCharCode(65 + index);
            console.log(`  ${col}1: ${header}`);
          });
          console.log('');

          const missing = expectedHeaders.filter(h => !headers.includes(h));
          const extra = headers.filter(h => h && !expectedHeaders.includes(h));

          if (missing.length === 0 && extra.length === 0) {
            console.log('✅ 標題列完全符合！');
          } else {
            if (missing.length > 0) {
              console.log(`⚠️  缺少標題: ${missing.join(', ')}`);
            }
            if (extra.length > 0) {
              console.log(`ℹ️  額外標題: ${extra.join(', ')}`);
            }
          }
        }

        // 讀取前幾行資料（如果有）
        const dataRange = `${sheetName}!A2:Z10`;
        const dataResponse = await sheets.spreadsheets.values.get({
          spreadsheetId,
          range: dataRange,
        });

        const rows = dataResponse.data.values || [];
        if (rows.length > 0) {
          console.log(`\n📊 資料行數: ${rows.length}`);
          console.log('前3行資料預覽：');
          rows.slice(0, 3).forEach((row, index) => {
            console.log(`  第${index + 2}行: ${row.join(' | ')}`);
          });
        } else {
          console.log('\n📊 目前沒有資料（只有標題列）');
        }

      } catch (error) {
        console.error(`❌ 讀取工作表失敗: ${error.message}`);
      }
    }

  } catch (error) {
    console.error('❌ 檢查失敗:', error.message);
    if (error.message.includes('permission')) {
      console.error('\n💡 提示：請確認服務帳號已加入為編輯者');
      console.error(`   服務帳號: ${process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL}`);
    }
  }
}

// 從命令列參數取得工作表名稱
const sheetName = process.argv[2] || '學生資料表';
checkSheetDetails(sheetName);
