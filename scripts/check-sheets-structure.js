/**
 * 檢查 Google Sheets 結構
 * 使用方法：node scripts/check-sheets-structure.js
 */

require('dotenv').config();
const { google } = require('googleapis');

async function checkSheetsStructure() {
  try {
    console.log('========================================');
    console.log('   檢查 Google Sheets 結構');
    console.log('========================================\n');

    // 初始化 Google Sheets API
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

    console.log(`📊 試算表名稱: ${spreadsheet.data.properties.title}`);
    console.log(`📋 工作表數量: ${spreadsheet.data.sheets.length}\n`);

    // 檢查必要的工作表
    const requiredSheets = ['學生資料表', '作業記錄表'];
    const optionalSheets = ['作業模板表'];
    const foundSheets = [];

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('檢查工作表：');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    for (const sheet of spreadsheet.data.sheets) {
      const sheetName = sheet.properties.title;
      foundSheets.push(sheetName);
      console.log(`📄 ${sheetName}`);

      // 檢查標題列
      try {
        const range = `${sheetName}!A1:Z1`;
        const response = await sheets.spreadsheets.values.get({
          spreadsheetId,
          range,
        });

        const headers = response.data.values?.[0] || [];
        
        if (sheetName === '學生資料表') {
          const expectedHeaders = ['學生姓名', '年級', '家長LINE ID', '家長姓名', '聯絡電話', '備註'];
          console.log(`   標題列: ${headers.join(' | ')}`);
          
          const missing = expectedHeaders.filter(h => !headers.includes(h));
          if (missing.length > 0) {
            console.log(`   ⚠️  缺少標題: ${missing.join(', ')}`);
          } else {
            console.log(`   ✅ 標題列正確`);
          }
        } else if (sheetName === '作業記錄表') {
          const expectedHeaders = ['時間戳記', '學生姓名', '作業項目', '完成時間', '操作人員', '通知狀態', '備註'];
          console.log(`   標題列: ${headers.join(' | ')}`);
          
          const missing = expectedHeaders.filter(h => !headers.includes(h));
          if (missing.length > 0) {
            console.log(`   ⚠️  缺少標題: ${missing.join(', ')}`);
          } else {
            console.log(`   ✅ 標題列正確`);
          }
        } else if (sheetName === '作業模板表') {
          console.log(`   標題列: ${headers.join(' | ')}`);
          console.log(`   ℹ️  作業模板表為可選，標題列可自訂`);
        } else {
          console.log(`   標題列: ${headers.join(' | ')}`);
        }
      } catch (error) {
        console.log(`   ⚠️  無法讀取標題列: ${error.message}`);
      }
      
      console.log('');
    }

    // 檢查必要的工作表是否存在
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('檢查結果：');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    let allGood = true;

    for (const required of requiredSheets) {
      if (foundSheets.includes(required)) {
        console.log(`✅ ${required}: 已建立`);
      } else {
        console.log(`❌ ${required}: 未找到（必須建立）`);
        allGood = false;
      }
    }

    for (const optional of optionalSheets) {
      if (foundSheets.includes(optional)) {
        console.log(`✅ ${optional}: 已建立（可選）`);
      } else {
        console.log(`ℹ️  ${optional}: 未建立（可選，不影響基本功能）`);
      }
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    if (allGood) {
      console.log('✅ 所有必要的工作表都已建立！');
      console.log('✅ 系統已準備就緒，可以開始使用！');
    } else {
      console.log('⚠️  請建立缺少的工作表');
    }
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  } catch (error) {
    console.error('❌ 檢查失敗:', error.message);
    if (error.message.includes('permission')) {
      console.error('\n💡 提示：請確認服務帳號已加入為編輯者');
      console.error(`   服務帳號: ${process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL}`);
    }
  }
}

checkSheetsStructure();
