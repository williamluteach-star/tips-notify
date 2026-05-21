const { google } = require('googleapis');
const moment = require('moment');
require('dotenv').config();

class HomeworkService {
  constructor() {
    this.sheets = null;
    this.spreadsheetId = process.env.GOOGLE_SHEETS_ID;
    this.init();
  }

  async init() {
    // 檢查是否有設定 Google Sheets
    if (!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || 
        process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL === 'your_service_account@project.iam.gserviceaccount.com' ||
        !process.env.GOOGLE_PRIVATE_KEY ||
        process.env.GOOGLE_PRIVATE_KEY === 'your_private_key') {
      console.warn('Google Sheets 未設定（預覽模式）');
      return;
    }

    try {
      const auth = new google.auth.GoogleAuth({
        credentials: {
          client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
          private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        },
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      });

      const authClient = await auth.getClient();
      this.sheets = google.sheets({ version: 'v4', auth: authClient });
    } catch (error) {
      console.warn('Google Sheets 初始化錯誤（預覽模式）:', error.message);
      // 預覽模式下不拋出錯誤
    }
  }

  /**
   * 記錄作業完成
   */
  async recordHomework({ studentName, homeworkItem, completedTime, operator, photoUrl = '' }) {
    if (!this.sheets) {
      await this.init();
    }

    // 如果 Google Sheets 未設定，拋出特殊錯誤讓上層處理
    if (!this.sheets) {
      throw new Error('GOOGLE_SHEETS_NOT_CONFIGURED');
    }

    const timestamp = moment().utcOffset('+08:00').format('YYYY-MM-DD HH:mm:ss');
    const completedTimeFormatted = completedTime
      ? moment(completedTime).utcOffset('+08:00').format('YYYY-MM-DD HH:mm')
      : moment().utcOffset('+08:00').format('YYYY-MM-DD HH:mm');

    const values = [[timestamp, studentName, homeworkItem, completedTimeFormatted, operator, '待通知', '', photoUrl]];

    try {
      const response = await this.sheets.spreadsheets.values.append({
        spreadsheetId: this.spreadsheetId,
        range: '作業記錄表!A2', // 從A2開始（A1是標題）
        valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS',
        resource: { values },
      });

      // 更新通知狀態為已通知
      const rowNumber = response.data.updates.updatedRange.match(/\d+/)[0];
      await this.updateNotificationStatus(rowNumber, '已通知');

      return {
        timestamp,
        studentName,
        homeworkItem,
        completedTime: completedTimeFormatted,
        operator,
        rowNumber,
      };
    } catch (error) {
      console.error('記錄作業錯誤:', error);
      throw new Error(`記錄作業失敗: ${error.message}`);
    }
  }

  /**
   * 更新通知狀態
   */
  async updateNotificationStatus(rowNumber, status) {
    try {
      await this.sheets.spreadsheets.values.update({
        spreadsheetId: this.spreadsheetId,
        range: `作業記錄表!F${rowNumber}`,
        valueInputOption: 'USER_ENTERED',
        resource: { values: [[status]] },
      });
    } catch (error) {
      console.error('更新通知狀態錯誤:', error);
    }
  }

  /**
   * 取得學生資料
   */
  async getStudentInfo(studentName) {
    if (!this.sheets) {
      await this.init();
    }

    try {
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: '學生資料表!A2:F', // 假設資料從第2行開始
      });

      const rows = response.data.values || [];
      const student = rows.find(row => row[0] === studentName);

      if (!student) {
        return null;
      }

      return {
        studentName: student[0],
        grade: student[1],
        lineUserId: student[2],
        parentName: student[3],
        phone: student[4],
        notes: student[5] || '',
      };
    } catch (error) {
      console.error('取得學生資料錯誤:', error);
      throw new Error(`取得學生資料失敗: ${error.message}`);
    }
  }

  /**
   * 取得家長的LINE User ID
   */
  async getParentLineUserId(studentName) {
    const studentInfo = await this.getStudentInfo(studentName);
    return studentInfo?.lineUserId || null;
  }

  /**
   * 取得近期作業記錄（根據LINE User ID）
   */
  async getRecentHomework(lineUserId, days = 7) {
    if (!this.sheets) {
      await this.init();
    }

    try {
      // 先找到對應的學生
      const studentResponse = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: '學生資料表!A2:F',
      });

      const students = studentResponse.data.values || [];
      // 支援逗號分隔多位家長：只要 lineUserId 包含在欄位C內即符合
      const student = students.find(row => {
        const ids = (row[2] || '').split(',').map(s => s.trim()).filter(Boolean);
        return ids.includes(lineUserId);
      });

      if (!student) {
        return [];
      }

      const studentName = student[0];

      // 取得作業記錄
      const homeworkResponse = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: '作業記錄表!A2:G',
      });

      const cutoffDate = moment().utcOffset('+08:00').subtract(days, 'days');
      const records = (homeworkResponse.data.values || [])
        .filter(row => {
          if (row[1] !== studentName) return false;
          // 支援多種日期格式
          const recordDate = moment(row[0], ['YYYY-MM-DD HH:mm:ss', 'YYYY/MM/DD HH:mm:ss', moment.ISO_8601], true);
          if (!recordDate.isValid()) return true; // 無法解析的日期仍顯示
          return recordDate.isAfter(cutoffDate);
        })
        .map(row => ({
          時間戳記: row[0],
          學生姓名: row[1],
          作業項目: row[2],
          完成時間: row[3],
          操作人員: row[4],
          通知狀態: row[5],
          備註: row[6] || '',
        }))
        .reverse(); // 最新的在前

      return records;
    } catch (error) {
      console.error('取得作業記錄錯誤:', error);
      throw new Error(`取得作業記錄失敗: ${error.message}`);
    }
  }

  /**
   * 取得所有學生資料（供前端下拉選單使用）
   */
  async getAllStudents() {
    if (!this.sheets) {
      await this.init();
    }

    if (!this.sheets) {
      return [];
    }

    try {
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: '學生資料表!A2:F',
      });

      return (response.data.values || [])
        .filter(row => row[0]) // 過濾掉空行
        .map(row => ({
          studentName: row[0],
          grade: row[1] || '',
          lineUserId: row[2] || '',
          parentName: row[3] || '',
          phone: row[4] || '',
          notes: row[5] || '',
        }));
    } catch (error) {
      console.error('取得學生列表錯誤:', error);
      throw new Error(`取得學生列表失敗: ${error.message}`);
    }
  }

  /**
   * 更新學生的 LINE User ID（配對用）
   * 支援多位家長：以逗號分隔儲存，不重複新增
   * 預覽模式（無 Google Sheets）靜默失敗，不拋出錯誤
   */
  // 從 Google Sheets 移除指定學生的某個家長 LINE User ID
  async removeStudentLineId(studentName, lineUserId) {
    if (!this.sheets) await this.init();
    if (!this.sheets) return null;

    try {
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: '學生資料表!A2:C',
      });

      const rows = response.data.values || [];
      const rowIndex = rows.findIndex(row => row[0] === studentName);

      if (rowIndex === -1) {
        console.warn(`[GSheets] 找不到學生：${studentName}`);
        return null;
      }

      const sheetRow = rowIndex + 2;
      const existingRaw = (rows[rowIndex] || [])[2] || '';
      const existingIds = existingRaw
        ? existingRaw.split(',').map(s => s.trim()).filter(Boolean)
        : [];

      const newIds = existingIds.filter(id => id !== lineUserId);
      const newValue = newIds.join(',');

      await this.sheets.spreadsheets.values.update({
        spreadsheetId: this.spreadsheetId,
        range: `學生資料表!C${sheetRow}`,
        valueInputOption: 'USER_ENTERED',
        resource: { values: [[newValue]] },
      });

      console.log(`[GSheets] 已移除 ${studentName} 的家長 LINE ID：${lineUserId}`);
      return { studentName, lineUserId: newValue };
    } catch (error) {
      console.error('移除 LINE User ID 錯誤:', error);
      throw new Error(`移除失敗: ${error.message}`);
    }
  }

  async updateStudentLineId(studentName, lineUserId) {
    if (!this.sheets) await this.init();
    if (!this.sheets) return null; // 預覽模式靜默失敗

    try {
      // 找到該學生在工作表的行號
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: '學生資料表!A2:C',
      });

      const rows = response.data.values || [];
      const rowIndex = rows.findIndex(row => row[0] === studentName);

      if (rowIndex === -1) {
        console.warn(`[GSheets] 找不到學生：${studentName}，略過同步`);
        return null;
      }

      const sheetRow = rowIndex + 2; // 1-indexed + header row
      // 讀取現有的 ID（可能是逗號分隔的多個）
      const existingRaw = (rows[rowIndex] || [])[2] || '';
      const existingIds = existingRaw
        ? existingRaw.split(',').map(s => s.trim()).filter(Boolean)
        : [];

      // 只有尚未存在才新增，避免重複
      if (!existingIds.includes(lineUserId)) {
        existingIds.push(lineUserId);
      }

      const newValue = existingIds.join(',');

      await this.sheets.spreadsheets.values.update({
        spreadsheetId: this.spreadsheetId,
        range: `學生資料表!C${sheetRow}`,
        valueInputOption: 'USER_ENTERED',
        resource: { values: [[newValue]] },
      });

      console.log(`[GSheets] 已同步 ${studentName} 的家長 LINE ID（${existingIds.length} 位）`);
      return { studentName, lineUserId: newValue };
    } catch (error) {
      console.error('更新 LINE User ID 錯誤:', error);
      throw new Error(`更新失敗: ${error.message}`);
    }
  }

  /**
   * 新增學生
   */
  async addStudent({ studentName, grade, lineUserId, parentName, phone, notes }) {
    if (!this.sheets) {
      await this.init();
    }

    if (!this.sheets) {
      throw new Error('GOOGLE_SHEETS_NOT_CONFIGURED');
    }

    const values = [[studentName, grade || '', lineUserId || '', parentName || '', phone || '', notes || '']];

    try {
      await this.sheets.spreadsheets.values.append({
        spreadsheetId: this.spreadsheetId,
        range: '學生資料表!A2',
        valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS',
        resource: { values },
      });

      return { studentName, grade, lineUserId, parentName, phone, notes };
    } catch (error) {
      console.error('新增學生錯誤:', error);
      throw new Error(`新增學生失敗: ${error.message}`);
    }
  }

  /**
   * 取得最近作業記錄（供 Web 介面顯示）
   */
  async getRecentRecords(limit = 20) {
    if (!this.sheets) {
      await this.init();
    }

    if (!this.sheets) {
      return [];
    }

    try {
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: '作業記錄表!A2:G',
      });

      const rows = (response.data.values || [])
        .filter(row => row[0]) // 過濾空行
        .map(row => ({
          時間戳記: row[0],
          學生姓名: row[1],
          作業項目: row[2],
          完成時間: row[3],
          操作人員: row[4],
          通知狀態: row[5] || '待通知',
          備註: row[6] || '',
        }))
        .reverse(); // 最新在前

      return rows.slice(0, limit);
    } catch (error) {
      console.error('取得最近記錄錯誤:', error);
      throw new Error(`取得最近記錄失敗: ${error.message}`);
    }
  }

  /**
   * 學期升級：將所有學生年級（數字 1-12）加 1
   * 已是 12 的標記為「畢業」並跳過；非數字格式的也跳過
   */
  async incrementGrades() {
    if (!this.sheets) await this.init();
    if (!this.sheets) throw new Error('GOOGLE_SHEETS_NOT_CONFIGURED');

    // 讀取整個學生資料表（A到B欄：姓名、年級）
    const response = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: '學生資料表!A2:B',
    });

    const rows = response.data.values || [];
    const updates = [];    // { row, newGrade }
    const graduated = [];  // studentName of grade 12
    const skipped = [];    // studentName with non-numeric grade

    rows.forEach((row, i) => {
      if (!row[0]) return; // 跳過空行
      const studentName = row[0];
      const gradeRaw = (row[1] || '').trim();
      const grade = parseInt(gradeRaw, 10);

      if (isNaN(grade)) {
        skipped.push({ studentName, grade: gradeRaw });
        return;
      }

      const sheetRow = i + 2; // 1-indexed + header
      if (grade >= 12) {
        graduated.push(studentName);
        // 將年級標記為「畢業」
        updates.push({ row: sheetRow, newGrade: '畢業' });
      } else {
        updates.push({ row: sheetRow, newGrade: String(grade + 1) });
      }
    });

    // 批次更新（每個 cell 單獨 update，或用 batchUpdate）
    if (updates.length > 0) {
      const data = updates.map(u => ({
        range: `學生資料表!B${u.row}`,
        values: [[u.newGrade]],
      }));
      await this.sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: this.spreadsheetId,
        resource: {
          valueInputOption: 'USER_ENTERED',
          data,
        },
      });
    }

    return {
      updated: updates.length,
      graduated,
      skipped,
      details: updates,
    };
  }

  /**
   * 記錄批量輸入的原始文字（寫入「批量輸入記錄」工作表）
   * 欄位：A=送出時間, B=操作人員, C=筆數, D=原始內容
   */
  async recordBatchInput({ operator, count, rawInput }) {
    if (!this.sheets) await this.init();
    if (!this.sheets) return null;

    const timestamp = new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });

    try {
      await this.sheets.spreadsheets.values.append({
        spreadsheetId: this.spreadsheetId,
        range: '批量輸入記錄!A2',
        valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS',
        resource: { values: [[timestamp, operator || '', count || 0, rawInput || '']] },
      });
      return { timestamp, operator, count, rawInput };
    } catch (error) {
      if (error.message && error.message.includes('Unable to parse range')) {
        console.warn('[GSheets] 「批量輸入記錄」工作表不存在，請先手動新增此工作表。');
      } else {
        console.error('記錄批量輸入錯誤:', error.message);
      }
      return null;
    }
  }

  /**
   * 記錄家長上傳作業照片（寫入「家長上傳記錄」工作表）
   * 欄位：A=上傳時間, B=學生姓名, C=科目, D=照片網址
   */
  async recordParentUpload({ studentName, subject, photoUrl, uploadTime }) {
    if (!this.sheets) await this.init();
    if (!this.sheets) return null; // 預覽模式靜默略過

    const timestamp = uploadTime
      ? new Date(uploadTime).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })
      : new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });

    try {
      await this.sheets.spreadsheets.values.append({
        spreadsheetId: this.spreadsheetId,
        range: '家長上傳記錄!A2',
        valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS',
        resource: { values: [[timestamp, studentName, subject || '未填寫', photoUrl]] },
      });
      return { timestamp, studentName, subject, photoUrl };
    } catch (error) {
      // 工作表不存在時給出明確提示
      if (error.message && error.message.includes('Unable to parse range')) {
        console.warn('[GSheets] 「家長上傳記錄」工作表不存在，請先在 Google Sheets 手動新增此工作表。');
      } else {
        console.error('記錄家長上傳錯誤:', error.message);
      }
      return null;
    }
  }

  /**
   * 取得家長上傳記錄（供 Web 介面顯示）
   */
  async getParentUploads(limit = 50) {
    if (!this.sheets) await this.init();
    if (!this.sheets) return [];

    try {
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: '家長上傳記錄!A2:D',
      });

      const rows = (response.data.values || [])
        .filter(row => row[0])
        .map(row => ({
          uploadTime: row[0],
          studentName: row[1] || '',
          subject: row[2] || '',
          photoUrl: row[3] || '',
        }))
        .reverse(); // 最新在前

      return rows.slice(0, limit);
    } catch (error) {
      if (error.message && error.message.includes('Unable to parse range')) {
        console.warn('[GSheets] 「家長上傳記錄」工作表不存在。');
        return [];
      }
      console.error('取得家長上傳記錄錯誤:', error.message);
      return [];
    }
  }

  /**
   * 取得日期區間的作業記錄（供週摘要使用）
   */
  async getHomeworkByDateRange(startDate, endDate) {
    if (!this.sheets) await this.init();
    if (!this.sheets) return [];

    const start = moment(startDate).startOf('day');
    const end   = moment(endDate).endOf('day');

    try {
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: '作業記錄表!A2:G',
      });

      return (response.data.values || [])
        .filter(row => {
          if (!row[0]) return false;
          const d = moment(row[0], ['YYYY-MM-DD HH:mm:ss', 'YYYY/MM/DD HH:mm:ss'], true);
          return d.isValid() && d.isBetween(start, end, null, '[]');
        })
        .map(row => ({
          時間戳記: row[0],
          學生姓名: row[1] || '',
          作業項目: row[2] || '',
          完成時間: row[3] || '',
          操作人員: row[4] || '',
          通知狀態: row[5] || '',
          備註: row[6] || '',
        }));
    } catch (error) {
      console.error('取得日期區間作業記錄錯誤:', error);
      throw new Error(`取得日期區間作業記錄失敗: ${error.message}`);
    }
  }

  /**
   * 取得指定日期的作業記錄
   */
  async getHomeworkByDate(date) {
    if (!this.sheets) {
      await this.init();
    }

    const targetDate = moment(date).format('YYYY-MM-DD');

    try {
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: '作業記錄表!A2:G',
      });

      const records = (response.data.values || [])
        .filter(row => {
          const recordDate = moment(row[0], 'YYYY-MM-DD HH:mm:ss').format('YYYY-MM-DD');
          return recordDate === targetDate;
        })
        .map(row => ({
          時間戳記: row[0],
          學生姓名: row[1],
          作業項目: row[2],
          完成時間: row[3],
          操作人員: row[4],
          通知狀態: row[5],
          備註: row[6] || '',
        }));

      return records;
    } catch (error) {
      console.error('取得日期作業記錄錯誤:', error);
      throw new Error(`取得日期作業記錄失敗: ${error.message}`);
    }
  }
  /**
   * 確保工作表存在，不存在則自動建立（含表頭）
   */
  async _ensureSheet(sheetTitle, headers) {
    if (!this.sheets) return;
    try {
      // 用 spreadsheets.get 取得全部工作表清單，比嘗試讀取 range 更可靠
      const meta = await this.sheets.spreadsheets.get({ spreadsheetId: this.spreadsheetId });
      const exists = (meta.data.sheets || []).some(s => s.properties.title === sheetTitle);
      if (!exists) {
        await this.sheets.spreadsheets.batchUpdate({
          spreadsheetId: this.spreadsheetId,
          requestBody: { requests: [{ addSheet: { properties: { title: sheetTitle } } }] },
        });
        await this.sheets.spreadsheets.values.update({
          spreadsheetId: this.spreadsheetId,
          range: `${sheetTitle}!A1:${String.fromCharCode(64 + headers.length)}1`,
          valueInputOption: 'USER_ENTERED',
          resource: { values: [headers] },
        });
        console.log(`[GSheets] 已自動建立工作表：${sheetTitle}`);
      }
    } catch (e) {
      console.warn(`[GSheets] _ensureSheet 失敗 ${sheetTitle}:`, e.message);
    }
  }

  /**
   * 儲存 AI 評語到「AI評語待審」工作表
   * 欄位：A=週期, B=學生姓名, C=AI原始評語1(甲:習慣), D=AI原始評語2(乙:學科), E=最終評語, F=狀態, G=產生時間, H=Token費用
   */
  async saveAIAnalysis({ period, studentName, jiaText = '', yiText = '', costInfo = '' }) {
    if (!this.sheets) await this.init();
    if (!this.sheets) return null;
    await this._ensureSheet('AI評語待審', ['週期', '學生姓名', 'AI原始評語1(甲)', 'AI原始評語2(乙)', '最終評語', '狀態', '產生時間', 'Token費用']);

    const combined = yiText ? `${jiaText}\n\n${yiText}` : jiaText;
    const timestamp = new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });
    try {
      const existing = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: 'AI評語待審!A2:H',
      });
      const rows = existing.data.values || [];
      const rowIndex = rows.findIndex(r => r[0] === period && r[1] === studentName);

      if (rowIndex >= 0) {
        const sheetRow = rowIndex + 2;
        await this.sheets.spreadsheets.values.update({
          spreadsheetId: this.spreadsheetId,
          range: `AI評語待審!C${sheetRow}:H${sheetRow}`,
          valueInputOption: 'USER_ENTERED',
          resource: { values: [[jiaText, yiText, combined, '待審', timestamp, costInfo]] },
        });
        console.log(`[GSheets] AI評語 upsert（更新）：${studentName} / ${period}`);
      } else {
        await this.sheets.spreadsheets.values.append({
          spreadsheetId: this.spreadsheetId,
          range: 'AI評語待審!A2',
          valueInputOption: 'USER_ENTERED',
          insertDataOption: 'INSERT_ROWS',
          resource: { values: [[period, studentName, jiaText, yiText, combined, '待審', timestamp, costInfo]] },
        });
        console.log(`[GSheets] AI評語 upsert（新增）：${studentName} / ${period}`);
      }
      return { period, studentName };
    } catch (error) {
      console.error('儲存 AI 評語錯誤:', error.message);
      return null;
    }
  }

  /**
   * 儲存年級週報到「年級週報待審」工作表（upsert）
   * 欄位：A=週期, B=年級, C=AI原始評語1(甲:習慣), D=AI原始評語2(乙:學科), E=最終評語, F=狀態, G=產生時間, H=Token費用
   */
  async saveGradeReport({ period, grade, jiaText = '', yiText = '', fullMsg = '', costInfo = '' }) {
    if (!this.sheets) await this.init();
    if (!this.sheets) return null;
    await this._ensureSheet('年級週報待審', ['週期', '年級', 'AI原始評語1(甲)', 'AI原始評語2(乙)', '最終評語', '狀態', '產生時間', 'Token費用']);

    const timestamp = new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });
    try {
      const existing = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: '年級週報待審!A2:H',
      });
      const rows = existing.data.values || [];
      const rowIndex = rows.findIndex(r => r[0] === period && r[1] === grade);

      if (rowIndex >= 0) {
        const sheetRow = rowIndex + 2;
        await this.sheets.spreadsheets.values.update({
          spreadsheetId: this.spreadsheetId,
          range: `年級週報待審!C${sheetRow}:H${sheetRow}`,
          valueInputOption: 'USER_ENTERED',
          resource: { values: [[jiaText, yiText, fullMsg, '待審', timestamp, costInfo]] },
        });
      } else {
        await this.sheets.spreadsheets.values.append({
          spreadsheetId: this.spreadsheetId,
          range: '年級週報待審!A2',
          valueInputOption: 'USER_ENTERED',
          insertDataOption: 'INSERT_ROWS',
          resource: { values: [[period, grade, jiaText, yiText, fullMsg, '待審', timestamp, costInfo]] },
        });
      }
      return { period, grade };
    } catch (error) {
      console.error('儲存年級週報錯誤:', error.message);
      return null;
    }
  }

  /**
   * 取得指定週期的年級週報（供審核與發送）
   */
  async getGradeReports(period) {
    if (!this.sheets) await this.init();
    if (!this.sheets) return [];
    try {
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: '年級週報待審!A2:H',
      });
      return (response.data.values || [])
        .filter(row => row[0] === period)
        .map(row => ({
          period:    row[0] || '',
          grade:     row[1] || '',
          jiaText:   row[2] || '',
          yiText:    row[3] || '',
          finalText: row[4] || row[2] || '',  // E=最終評語
          status:    row[5] || '待審',
          createdAt: row[6] || '',
        }));
    } catch (error) {
      console.error('取得年級週報錯誤:', error.message);
      return [];
    }
  }

  /**
   * 標記某週期所有年級週報為已發送
   */
  async markGradeReportsSent(period) {
    if (!this.sheets) await this.init();
    if (!this.sheets) return null;
    try {
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: '年級週報待審!A2:H',
      });
      const rows = response.data.values || [];
      const updates = rows
        .map((row, i) => ({ row, sheetRow: i + 2 }))
        .filter(({ row }) => row[0] === period && row[5] !== '已發送'); // F=狀態
      if (updates.length === 0) return null;
      const data = updates.map(({ sheetRow }) => ({
        range: `年級週報待審!F${sheetRow}`,  // F=狀態
        values: [['已發送']],
      }));
      await this.sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: this.spreadsheetId,
        resource: { valueInputOption: 'USER_ENTERED', data },
      });
      return { period, marked: updates.length };
    } catch (error) {
      console.error('標記年級週報已發送錯誤:', error.message);
      return null;
    }
  }

  /**
   * 取得指定週期的所有 AI 評語
   */
  async getAIAnalyses(period) {
    if (!this.sheets) await this.init();
    if (!this.sheets) return [];

    try {
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: 'AI評語待審!A2:H',
      });

      return (response.data.values || [])
        .filter(row => row[0] === period)
        .map(row => ({
          period:      row[0] || '',
          studentName: row[1] || '',
          jiaText:     row[2] || '',
          yiText:      row[3] || '',
          finalText:   row[4] || row[2] || '',  // E=最終評語
          status:      row[5] || '待審',
          createdAt:   row[6] || '',
        }));
    } catch (error) {
      console.error('取得 AI 評語錯誤:', error.message);
      return [];
    }
  }

  /**
   * 更新某學生的最終評語（老師修改後）→ 寫入 E 欄
   */
  async updateAIAnalysisFinal(period, studentName, finalText) {
    if (!this.sheets) await this.init();
    if (!this.sheets) return null;

    try {
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: 'AI評語待審!A2:H',
      });

      const rows = response.data.values || [];
      const rowIndex = rows.findIndex(row => row[0] === period && row[1] === studentName);
      if (rowIndex === -1) return null;

      const sheetRow = rowIndex + 2;
      await this.sheets.spreadsheets.values.update({
        spreadsheetId: this.spreadsheetId,
        range: `AI評語待審!E${sheetRow}`,  // E=最終評語
        valueInputOption: 'USER_ENTERED',
        resource: { values: [[finalText]] },
      });
      return { period, studentName, finalText };
    } catch (error) {
      console.error('更新 AI 評語錯誤:', error.message);
      return null;
    }
  }

  /**
   * 標記某週期所有評語為已發送 → 寫入 F 欄（狀態）
   */
  async markAIAnalysesSent(period) {
    if (!this.sheets) await this.init();
    if (!this.sheets) return null;

    try {
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: 'AI評語待審!A2:H',
      });

      const rows = response.data.values || [];
      const updates = rows
        .map((row, i) => ({ row, sheetRow: i + 2 }))
        .filter(({ row }) => row[0] === period && row[5] !== '已發送'); // F=狀態

      if (updates.length === 0) return null;

      const data = updates.map(({ sheetRow }) => ({
        range: `AI評語待審!F${sheetRow}`,  // F=狀態
        values: [['已發送']],
      }));

      await this.sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: this.spreadsheetId,
        resource: { valueInputOption: 'USER_ENTERED', data },
      });

      return { updated: updates.length };
    } catch (error) {
      console.error('標記已發送錯誤:', error.message);
      return null;
    }
  }

  /**
   * 讀取「成績記錄」工作表中指定學生的月考成績
   *
   * 格式彈性：第一列為任意欄位標題（例如你原有的成績表），
   * 第一欄為學生姓名，程式自動配對標題與數值，不強制固定欄位。
   *
   * @returns {string} 供 AI prompt 使用的成績文字，找不到資料回傳空字串
   */
  async getStudentScores(studentName) {
    if (!this.sheets) await this.init();
    if (!this.sheets) return '';
    try {
      // 讀取含標題列的全部資料（A1 開始，最多 Z 欄）
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: '成績記錄!A1:Z',
      });
      const rows = response.data.values || [];
      if (rows.length < 2) return '';

      const headers = rows[0];
      const dataRow = rows.slice(1).find(r => r[0] === studentName);
      if (!dataRow) return '';

      // 把標題與數值配對（跳過第一欄學生姓名），有值才輸出
      const pairs = headers
        .map((h, i) => {
          if (i === 0) return null; // 跳過姓名欄
          const val = (dataRow[i] || '').trim();
          if (!val) return null;
          return `  ${h}：${val}`;
        })
        .filter(Boolean);

      if (pairs.length === 0) return '';
      return `【歷次月考成績記錄】\n${pairs.join('\n')}`;
    } catch (error) {
      // 工作表不存在時靜默略過，不影響主流程
      return '';
    }
  }

  /**
   * 【一次性】讀取「成績記錄」所有學生，讓雙 AI 進行初步認識，
   * 並將結果寫回同一工作表的末尾三欄：AI原始評語1(甲) / AI原始評語2(乙) / Token費用
   */
  async analyzeAndSaveScoreIntros() {
    if (!this.sheets) await this.init();
    if (!this.sheets) throw new Error('GOOGLE_SHEETS_NOT_CONFIGURED');

    const aiService = require('./aiService');

    // 1. 讀取整張成績記錄表（A1:Z，含標題列）
    const response = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: '成績記錄!A1:Z',
    });
    const rows = response.data.values || [];
    if (rows.length < 2) return { success: false, message: '成績記錄工作表沒有資料' };

    const headers = rows[0];
    const dataRows = rows.slice(1).filter(r => r[0]); // 只處理有姓名的列

    // 2. 找出目前最後一欄（成績欄）的位置
    //    若 header 最後幾欄已是 AI 欄位，先移除，重新寫入
    const AI_HEADERS = ['AI原始評語1(甲)', 'AI原始評語2(乙)', 'Token費用'];
    let scoreColCount = headers.length;
    // 移除尾端已有的 AI 欄位，避免重複疊加
    while (scoreColCount > 0 && AI_HEADERS.includes(headers[scoreColCount - 1])) {
      scoreColCount--;
    }

    // 3. 計算要寫入的欄位位置（1-based）：成績欄之後接 3 欄
    const jiaColIdx  = scoreColCount;     // 0-based index
    const yiColIdx   = scoreColCount + 1;
    const costColIdx = scoreColCount + 2;

    // 欄位字母轉換（支援 A-Z, AA-AZ...）
    const colLetter = (idx) => {
      let s = '';
      idx++; // 轉成 1-based
      while (idx > 0) {
        idx--;
        s = String.fromCharCode(65 + (idx % 26)) + s;
        idx = Math.floor(idx / 26);
      }
      return s;
    };

    const jiaCol  = colLetter(jiaColIdx);
    const yiCol   = colLetter(yiColIdx);
    const costCol = colLetter(costColIdx);

    // 4. 先寫入（或更新）表頭的 AI 三欄
    const headerRow = 1;
    await this.sheets.spreadsheets.values.update({
      spreadsheetId: this.spreadsheetId,
      range: `成績記錄!${jiaCol}${headerRow}:${costCol}${headerRow}`,
      valueInputOption: 'USER_ENTERED',
      resource: { values: [AI_HEADERS] },
    });

    // 5. 逐一分析每位學生並寫回
    const results = [];
    for (let i = 0; i < dataRows.length; i++) {
      const dataRow = dataRows[i];
      const studentName = dataRow[0];
      const sheetRow = i + 2; // 1-based + 1 header

      // 組成成績摘要
      const pairs = headers.slice(0, scoreColCount)
        .map((h, idx) => {
          if (idx === 0) return null;
          const val = (dataRow[idx] || '').trim();
          return val ? `  ${h}：${val}` : null;
        })
        .filter(Boolean);

      if (pairs.length === 0) {
        console.log(`[成績分析] ${studentName} 無成績資料，跳過`);
        results.push({ studentName, skipped: true });
        continue;
      }
      const scoresSummary = `【歷次月考成績記錄】\n${pairs.join('\n')}`;

      console.log(`[成績分析] 開始分析 ${studentName}...`);
      const aiResult = await aiService.analyzeStudentFromScores(studentName, scoresSummary).catch(e => {
        console.error(`[成績分析] ${studentName} AI 錯誤：${e.message}`);
        return null;
      });

      if (!aiResult) {
        results.push({ studentName, error: 'AI 分析失敗' });
        continue;
      }

      const { jiaText, yiText, costInfo } = aiResult;

      await this.sheets.spreadsheets.values.update({
        spreadsheetId: this.spreadsheetId,
        range: `成績記錄!${jiaCol}${sheetRow}:${costCol}${sheetRow}`,
        valueInputOption: 'USER_ENTERED',
        resource: { values: [[jiaText || '', yiText || '', costInfo || '']] },
      });

      console.log(`[成績分析] ${studentName} ✅ 寫入完成`);
      results.push({ studentName, success: true, costInfo });

      // 避免 API rate limit
      await new Promise(r => setTimeout(r, 800));
    }

    const successCount = results.filter(r => r.success).length;
    return {
      success: true,
      message: `成績分析完成：${successCount}/${dataRows.length} 位學生`,
      results,
      columns: { jia: jiaCol, yi: yiCol, cost: costCol },
    };
  }
}

module.exports = new HomeworkService();


