const line = require('@line/bot-sdk');
const moment = require('moment');
require('dotenv').config();

// 只有在有真實 token 時才初始化 LINE Client
let client = null;
if (process.env.LINE_CHANNEL_ACCESS_TOKEN && process.env.LINE_CHANNEL_ACCESS_TOKEN !== 'your_line_channel_access_token') {
  try {
    client = new line.Client({
      channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
    });
  } catch (error) {
    console.warn('LINE Client 初始化失敗（預覽模式）:', error.message);
  }
}

const homeworkService = require('./homeworkService');

class NotificationService {
  /**
   * 通知家長作業完成
   */
  async notifyParent(studentName, homeworkItem, completedTime) {
    if (!client) {
      console.warn('LINE Bot 未設定，跳過通知發送');
      return { success: false, message: 'LINE Bot 未設定（預覽模式）' };
    }

    try {
      // 取得家長的LINE User ID
      const lineUserId = await homeworkService.getParentLineUserId(studentName);

      if (!lineUserId) {
        console.warn(`找不到學生 ${studentName} 的家長LINE ID`);
        return { success: false, message: '找不到家長LINE ID' };
      }

      // 格式化完成時間
      const timeFormatted = completedTime
        ? moment(completedTime).format('YYYY年MM月DD日 HH:mm')
        : moment().format('YYYY年MM月DD日 HH:mm');

      // 建立訊息
      const message = {
        type: 'text',
        text: `【作業完成通知】\n\n${studentName}已完成以下作業：\n📝 ${homeworkItem}\n⏰ 完成時間：${timeFormatted}\n\n感謝您的關注！`,
      };

      // 發送訊息
      await client.pushMessage(lineUserId, message);

      return { success: true, message: '通知已發送' };
    } catch (error) {
      console.error('發送通知錯誤:', error);
      throw new Error(`發送通知失敗: ${error.message}`);
    }
  }

  /**
   * 發送每日摘要給所有家長
   */
  async sendDailySummary(date) {
    try {
      const targetDate = date || moment().format('YYYY-MM-DD');
      const records = await homeworkService.getHomeworkByDate(targetDate);

      if (records.length === 0) {
        console.log(`日期 ${targetDate} 沒有作業記錄`);
        return { success: true, message: '當日無作業記錄' };
      }

      // 依學生分組
      const groupedByStudent = {};
      records.forEach(record => {
        if (!groupedByStudent[record.學生姓名]) {
          groupedByStudent[record.學生姓名] = [];
        }
        groupedByStudent[record.學生姓名].push(record);
      });

      // 發送給每位家長
      const results = [];
      for (const [studentName, studentRecords] of Object.entries(groupedByStudent)) {
        try {
          const lineUserId = await homeworkService.getParentLineUserId(studentName);
          if (!lineUserId) {
            results.push({ studentName, success: false, message: '找不到LINE ID' });
            continue;
          }

          // 建立摘要訊息
          let message = `【${moment(targetDate).format('YYYY年MM月DD日')} 作業完成摘要】\n\n${studentName}今日完成：\n\n`;
          studentRecords.forEach((record, index) => {
            message += `${index + 1}. ${record.作業項目}\n   ⏰ ${record.完成時間}\n\n`;
          });
          message += `共完成 ${studentRecords.length} 項作業\n\n感謝您的關注！`;

          await client.pushMessage(lineUserId, {
            type: 'text',
            text: message,
          });

          results.push({ studentName, success: true });
        } catch (error) {
          console.error(`發送摘要給 ${studentName} 錯誤:`, error);
          results.push({ studentName, success: false, error: error.message });
        }
      }

      return {
        success: true,
        message: `摘要發送完成：${results.filter(r => r.success).length}/${results.length} 位家長`,
        results,
      };
    } catch (error) {
      console.error('發送每日摘要錯誤:', error);
      throw new Error(`發送每日摘要失敗: ${error.message}`);
    }
  }

  /**
   * 批量通知（使用LINE Broadcast API，需升級至Premium帳號）
   */
  async broadcastMessage(messageText) {
    if (!client) {
      console.warn('LINE Bot 未設定，無法發送廣播訊息');
      return { success: false, message: 'LINE Bot 未設定（預覽模式）' };
    }

    try {
      // 注意：Broadcast API 需要 Premium 帳號
      // 這裡提供基本實作，實際使用時需確認帳號等級
      await client.broadcast({
        type: 'text',
        text: messageText,
      });

      return { success: true, message: '廣播訊息已發送' };
    } catch (error) {
      console.error('廣播訊息錯誤:', error);
      throw new Error(`廣播訊息失敗: ${error.message}`);
    }
  }
}

module.exports = new NotificationService();


