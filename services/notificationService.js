const line = require('@line/bot-sdk');
const moment = require('moment');
const fs = require('fs');
const path = require('path');
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
   * 從 parent-pairs.json 取得某學生所有配對的家長 LINE User ID
   * 支援爸媽同時配對同一學生（多對一）
   */
  getParentLineUserIds(studentName) {
    const pairsFile = path.join(__dirname, '..', 'parent-pairs.json');
    try {
      if (fs.existsSync(pairsFile)) {
        const pairs = JSON.parse(fs.readFileSync(pairsFile, 'utf-8'));
        const matched = pairs
          .filter(p => p.studentName === studentName)
          .map(p => p.userId);
        if (matched.length > 0) return matched;
      }
    } catch (e) {
      console.warn('[notification] 讀取 parent-pairs.json 失敗:', e.message);
    }
    return [];
  }

  /**
   * 通知家長作業完成（支援多位家長同時收到）
   */
  async notifyParent(studentName, homeworkItem, completedTime, photoUrl) {
    if (!client) {
      console.warn('LINE Bot 未設定，跳過通知發送');
      return { success: false, message: 'LINE Bot 未設定（預覽模式）' };
    }

    try {
      // 先從 parent-pairs.json 取得所有配對的家長 ID
      let lineUserIds = this.getParentLineUserIds(studentName);

      // 若 parent-pairs.json 沒有資料，fallback 到 Google Sheets（支援逗號分隔多位家長）
      if (lineUserIds.length === 0) {
        const fallbackStr = await homeworkService.getParentLineUserId(studentName);
        if (fallbackStr) {
          lineUserIds = fallbackStr.split(',').map(s => s.trim()).filter(Boolean);
        }
      }

      if (lineUserIds.length === 0) {
        console.warn(`找不到學生 ${studentName} 的家長LINE ID`);
        return { success: false, message: '找不到家長LINE ID' };
      }

      // 格式化完成時間
      const timeFormatted = completedTime
        ? moment(completedTime).format('YYYY年MM月DD日 HH:mm')
        : moment().format('YYYY年MM月DD日 HH:mm');

      // 建立訊息（有照片則附上連結）
      let messageText = `🎉 作業完成通知 🎉\n\n👦 ${studentName} 已完成以下作業：\n\n📚 ${homeworkItem}\n\n⏰ 完成時間：${timeFormatted}`;
      if (photoUrl) {
        messageText += `\n\n📷 作業照片：\n${photoUrl}`;
      }
      const encouragements = [
        `🐾 "Every small step you take brings you closer to your goal. Keep going!" 🚀\n（你邁出的每一個小步伐，都讓你離目標更近。繼續前進吧！）`,
        `🌟 "Believe in yourself and all that you are. You are stronger than you think." 💪\n（相信自己以及你所擁有的一切。你比你想像的還要強大。）`,
        `🌱 "Kid's hard work will pay off. Stay positive and keep shining!" ✨\n（你的努力會有回報的。保持正面，繼續閃耀！）`,
      ];
      const randomMsg = encouragements[Math.floor(Math.random() * encouragements.length)];
      messageText += `\n\n✅ 孩子很努力！感謝您的肯定與鼓勵 🙏\n${randomMsg}`;
      
      const message = { type: 'text', text: messageText };

      // 發送給所有配對的家長
      const results = [];
      for (const uid of lineUserIds) {
        try {
          await client.pushMessage(uid, message);
          console.log(`   ✅ 已發送給 ${uid}（${studentName} 的家長）`);
          results.push({ userId: uid, success: true });
        } catch (e) {
          const lineError = e.response?.data || e.response?.body || e.message;
          const statusCode = e.response?.status || e.statusCode || 'unknown';
          console.error(`   ❌ 發送給 ${uid} 失敗 [HTTP ${statusCode}]:`, JSON.stringify(lineError));
          results.push({ userId: uid, success: false, error: `HTTP ${statusCode}: ${JSON.stringify(lineError)}` });
        }
      }

      const successCount = results.filter(r => r.success).length;
      return {
        success: successCount > 0,
        message: `已發送給 ${successCount}/${lineUserIds.length} 位家長`,
        results,
      };
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

      // 發送給每位學生的所有家長
      const results = [];
      for (const [studentName, studentRecords] of Object.entries(groupedByStudent)) {
        // 先從 parent-pairs.json 取得所有配對的家長 ID
        let lineUserIds = this.getParentLineUserIds(studentName);

        // fallback 到 Google Sheets（支援逗號分隔多位家長）
        if (lineUserIds.length === 0) {
          const fallbackStr = await homeworkService.getParentLineUserId(studentName);
          if (fallbackStr) {
            lineUserIds = fallbackStr.split(',').map(s => s.trim()).filter(Boolean);
          }
        }

        if (lineUserIds.length === 0) {
          results.push({ studentName, success: false, message: '找不到LINE ID' });
          continue;
        }

        // 建立摘要訊息
        let msgText = `【${moment(targetDate).format('YYYY年MM月DD日')} 作業完成摘要】\n\n${studentName}今日完成：\n\n`;
        studentRecords.forEach((record, index) => {
          msgText += `${index + 1}. ${record.作業項目}\n   ⏰ ${record.完成時間}\n\n`;
        });
        msgText += `共完成 ${studentRecords.length} 項作業\n\n感謝您的關注！`;

        // 發送給所有配對的家長
        for (const uid of lineUserIds) {
          try {
            await client.pushMessage(uid, { type: 'text', text: msgText });
            results.push({ studentName, userId: uid, success: true });
          } catch (error) {
            console.error(`發送摘要給 ${studentName}（${uid}）錯誤:`, error);
            results.push({ studentName, userId: uid, success: false, error: error.message });
          }
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


