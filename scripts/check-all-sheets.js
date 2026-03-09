/**
 * 檢查所有工作表的詳細資訊
 */

require('dotenv').config();
const { google } = require('googleapis');

async function checkAllSheets() {
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

    const spreadsheet = await sheets.spreadsheets.get({
      spreadsheetId,
    });

    console.log('========================================');
    console.log('   檢查所有工作表');
    console.log('========================================\n');
    console.log(`📊 試算表名稱: ${spreadsheet.data.properties.title}\n`);

    for (const sheet of spreadsheet.data.sheets) {
      const sheetName = sheet.properties.title;
      const gid = sheet.properties.sheetId;
      
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`📄 工作表: ${sheetName} (gid=${gid})`);
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

      try {
        const range = `${sheetName}!A1:Z1`;
        const response = await sheets.spreadsheets.values.get({
          spreadsheetId,
          range,
        });

        const headers = response.data.values?.[0] || [];
        console.log('📝 標題列：');
        if (headers.length > 0) {
          headers.forEach((header, index) => {
            const col = String.fromCharCode(65 + index);
            console.log(`  ${col}1: ${header || '(空白)'}`);
          });
        } else {
          console.log('  (沒有標題列)');
        }
        console.log('');

        // 檢查是否符合預期格式
        if (sheetName === '學生資料表') {
          const expectedHeaders = ['學生姓名', '年級', '家長LINE ID', '家長姓名', '聯絡電話', '備註'];
          const missing = expectedHeaders.filter(h => !headers.includes(h));
          if (missing.length === 0) {
            console.log('✅ 標題列符合「學生資料表」格式');
          } else {
            console.log(`⚠️  缺少標題: ${missing.join(', ')}`);
          }
        } else if (sheetName === '作業記錄表') {
          const expectedHeaders = ['時間戳記', '學生姓名', '作業項目', '完成時間', '操作人員', '通知狀態', '備註'];
          const missing = expectedHeaders.filter(h => !headers.includes(h));
          if (missing.length === 0) {
            console.log('✅ 標題列符合「作業記錄表」格式');
          } else {
            console.log(`⚠️  缺少標題: ${missing.join(', ')}`);
            console.log(`   預期標題: ${expectedHeaders.join(' | ')}`);
          }
        } else if (sheetName === '作業模板表') {
          console.log('ℹ️  作業模板表（可選）');
        } else {
          console.log(`ℹ️  其他工作表：${sheetName}`);
        }

        // 檢查資料
        const dataRange = `${sheetName}!A2:Z10`;
        const dataResponse = await sheets.spreadsheets.values.get({
          spreadsheetId,
          range: dataRange,
        });

        const rows = dataResponse.data.values || [];
        if (rows.length > 0) {
          console.log(`\n📊 資料行數: ${rows.length} 行`);
        } else {
          console.log(`\n📊 目前沒有資料（只有標題列）`);
        }

      } catch (error) {
        console.error(`❌ 讀取失敗: ${error.message}`);
      }

      console.log('');
    }

    // 總結
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('總結：');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const sheetNames = spreadsheet.data.sheets.map(s => s.properties.title);
    const requiredSheets = ['學生資料表', '作業記錄表'];
    
    for (const required of requiredSheets) {
      if (sheetNames.includes(required)) {
        console.log(`✅ ${required}: 已建立`);
      } else {
        console.log(`❌ ${required}: 未找到`);
      }
    }

    if (sheetNames.includes('作業模板表')) {
      console.log(`✅ 作業模板表: 已建立（可選）`);
    }

  } catch (error) {
    console.error('❌ 檢查失敗:', error.message);
  }
}

checkAllSheets();
