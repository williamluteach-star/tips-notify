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

    const timestamp = moment().format('YYYY-MM-DD HH:mm:ss');
    const completedTimeFormatted = completedTime
      ? moment(completedTime).format('YYYY-MM-DD HH:mm')
      : moment().format('YYYY-MM-DD HH:mm');

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

      const cutoffDate = moment().subtract(days, 'days');
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
}

module.exports = new HomeworkService();


