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
const aiService = require('./aiService');

// ─────────────────────────────────────────────
// 週四/週六 個人週報勵志語（3 句隨機選 1）
// ─────────────────────────────────────────────
const WEEKLY_SUMMARY_ENCOURAGEMENTS = [
  `🐾 "Every small step you take brings you closer to your goal. Keep going!" 🚀\n（你邁出的每一個小步伐，都讓你離目標更近。繼續前進吧！）`,
  `🌟 "Believe in yourself and all that you are. You are stronger than you think." 💪\n（相信自己以及你所擁有的一切。你比你想像的還要強大。）`,
  `🌱 "Kids' hard work will pay off. Stay positive and keep shining!" ✨\n（孩子的努力會有回報的。保持正面，繼續閃耀！）`,
];

// ─────────────────────────────────────────────
// 週日 11:58 個人 AI 評語勵志語（6 句隨機選 1）
// ─────────────────────────────────────────────
const STUDENT_ENCOURAGEMENTS = [
  // 穩定進步型
  `規律是學習最強大的燃料，感謝你這週展現的穩定節奏。🚀\nConsistency is the ultimate fuel for learning. Thank you for maintaining such a steady rhythm this week. ⛽`,
  `每一天的數據累積，都在為未來的突破點構建最堅實的底層邏輯。📊\nEvery day of data accumulation builds a solid logical foundation for your future breakthroughs. 🏗️`,
  // 遇到挑戰型
  `學習曲線從來不是直線，目前的微調是為了下一階段的跳躍做準備。📈\nThe learning curve is never a straight line; these minor adjustments are simply preparing you for the next leap forward. 🪜`,
  `我們不追求一步登天，只追求比昨天的數據更精進一點點。🎯\nWe don't aim for overnight success; we aim for being slightly more precise than yesterday's data. 🔍`,
  // 表現優異型
  `卓越不是一個行為，而是一種習慣。很高興看見你將卓越變成了日常。🏆\nExcellence is not an act, but a habit. It's wonderful to see excellence becoming your daily standard. ✨`,
  `當你掌握了學習的邏輯，世界就沒有什麼能難倒你的知識。🌍\nOnce you master the logic of learning, no knowledge in the world can stand in your way. 💡`,
];

// ─────────────────────────────────────────────
// 週日 11:59 年級週報家長勵志語（2 句隨機選 1，搭配 ATOMIC_POWER 一起送）
// ─────────────────────────────────────────────
const PARENT_ENCOURAGEMENTS = [
  `每一次的現場投入，都是在為孩子的學習信心存入一筆資產。💎\nEvery moment of on-site engagement is a direct investment into your child's learning confidence. 🏦`,
  `讓孩子看見堅持的力量，就是我們能給他最好的科學教育。🤝\nShowing children the power of persistence is the finest scientific education we can provide. 🧬`,
];

const ATOMIC_POWER = `⚛️ 每天進步 1%，一年後你將強大 37 倍。微小的正向行為，將透過時間產生巨大的原子連鎖反應。\n"Improving by just 1% every day makes you 37 times better by the end of the year. Tiny positive actions trigger massive atomic chain reactions over time."`;

// ─────────────────────────────────────────────
// 工具函式
// ─────────────────────────────────────────────

/**
 * 遮蔽中文名字（只取中文字，中間換成 O）
 * 張艾菲 Effie → 張O菲
 * 李明 → 李O
 */
function maskChineseName(fullName) {
  const cn = (fullName || '').replace(/[^一-鿿]/g, '');
  if (cn.length === 0) return fullName;
  if (cn.length === 1) return cn;
  if (cn.length === 2) return cn[0] + 'O';
  return cn[0] + 'O' + cn[cn.length - 1];
}

function randomFrom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * 根據當前月份決定哪些年級要發送訊息：
 * 7~8月：只有 9 年級
 * 9月起：7、8、9 年級
 * 其餘月份：7、8 年級
 */
function getActiveGrades() {
  const month = moment().utcOffset('+08:00').month() + 1; // 1~12
  if (month === 7 || month === 8) return ['9'];
  if (month >= 9) return ['7', '8', '9'];
  return ['7', '8'];
}

/**
 * 判斷作業項目是否為請假記錄，並返回假別
 * "病假" → "病假"、"事假" → "事假"、其他 → null
 */
const LEAVE_TYPES = ['病假', '事假', '公假', '喪假'];
function parseLeaveType(item) {
  if (!item) return null;
  for (const t of LEAVE_TYPES) {
    if (item.trim() === t || item.includes(t)) return t;
  }
  return null;
}

/**
 * 從完整學生姓名提取「名」（去掉姓）＋ 保留英文名
 * 趙品懿 Yasmin → 品懿 Yasmin
 * 李明 → 明
 */
function extractGivenName(fullName) {
  const cn = (fullName || '').replace(/[^一-鿿]/g, '').trim();
  const en = ((fullName || '').match(/[A-Za-z]+/) || [])[0] || '';
  const givenCn = cn.length > 1 ? cn.slice(1) : cn;
  return en ? `${givenCn} ${en}` : givenCn;
}

// 負責人通知：產出完成後透過 LINE 提醒陸宗呈 Derek 的家長
const OWNER_STUDENT_NAME = '陸宗呈 Derek';

/**
 * 計算距離期末考還有幾天（期末考約 6/25～6/30，各校不同）
 * 超過 30 天返回 null（不需要提醒）
 */
function daysUntilExam() {
  const now = moment().utcOffset('+08:00');
  const year = now.month() >= 6 ? now.year() + 1 : now.year(); // 7月後看明年
  const examDate = moment(`${year}-06-25`);
  const days = examDate.diff(now, 'days');
  return days >= 0 && days <= 35 ? days : null;
}

class NotificationService {
  /**
   * 從 parent-pairs.json 取得某學生所有配對的家長 LINE ID
   */
  /**
   * 透過 LINE 通知負責人（陸宗呈 Derek 的家長）
   */
  async notifyOwner(message) {
    if (!client) return;
    try {
      let lineIds = this.getParentLineUserIds(OWNER_STUDENT_NAME);
      if (!lineIds.length) {
        const fallback = await homeworkService.getParentLineUserId(OWNER_STUDENT_NAME);
        if (fallback) lineIds = fallback.split(',').map(s => s.trim()).filter(Boolean);
      }
      for (const uid of lineIds) {
        await client.pushMessage(uid, { type: 'text', text: message }).catch(e =>
          console.warn('[notifyOwner] 發送失敗:', e.message)
        );
      }
    } catch (e) {
      console.warn('[notifyOwner] 錯誤:', e.message);
    }
  }

  /**
   * 發送前檢查 LINE 訊息額度，不足時通知負責人
   * @param {string} label - 發送功能名稱（用於 log / 通知）
   * @param {number} estimatedCount - 預計發送則數
   * @returns {{ sufficient: boolean, remaining: number, limit: number, used: number }}
   */
  async checkLineQuota(label, estimatedCount) {
    if (!client) return { sufficient: true, remaining: 9999, limit: 9999, used: 0 };
    try {
      const [quotaRes, usageRes] = await Promise.all([
        client.getTargetLimitForAdditionalMessages(),
        client.getNumberOfMessagesSentThisMonth(),
      ]);
      const limit     = quotaRes.type === 'unlimited' ? Infinity : (quotaRes.value || 0);
      const used      = usageRes.totalUsage || 0;
      const remaining = limit === Infinity ? Infinity : limit - used;

      console.log(`[額度檢查][${label}] 上限：${limit === Infinity ? '無限制' : limit}，已用：${used}，剩餘：${remaining === Infinity ? '無限制' : remaining}，預計本次：${estimatedCount}`);

      if (remaining !== Infinity && remaining < estimatedCount) {
        const msg = `⚠️ LINE 訊息額度不足，${label} 取消發送\n\n上限：${limit} 則\n已用：${used} 則\n剩餘：${remaining} 則\n本次需要：${estimatedCount} 則\n\n請至 LINE Official Account Manager 升級方案（Light 方案 5,000 則/月）。`;
        console.error(`[額度檢查][${label}] 額度不足，取消發送`);
        await this.notifyOwner(msg);
        return { sufficient: false, remaining, limit, used };
      }

      // 低額度預警（剩餘 ≤ 100 則）
      if (remaining !== Infinity && remaining <= 100) {
        const msg = `⚠️ LINE 訊息額度偏低，請盡快升級方案\n\n上限：${limit} 則\n已用：${used} 則\n剩餘：${remaining} 則\n本次發送後預計剩餘：${remaining - estimatedCount} 則\n\n請至 LINE Official Account Manager 升級方案。`;
        console.warn(`[額度檢查][${label}] 額度偏低（剩餘 ${remaining} 則）`);
        await this.notifyOwner(msg);
      }

      return { sufficient: true, remaining, limit, used };
    } catch (e) {
      console.warn(`[額度檢查][${label}] 查詢失敗，跳過檢查：`, e.message);
      return { sufficient: true, remaining: 9999, limit: 9999, used: 0 };
    }
  }

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
   * 通知家長（即時，目前保留但實際上不再從 /api/homework 呼叫）
   */
  async notifyParent(studentName, homeworkItem, completedTime, photoUrl) {
    if (!client) {
      console.warn('LINE Bot 未設定，跳過通知發送');
      return { success: false, message: 'LINE Bot 未設定（預覽模式）' };
    }

    try {
      let lineUserIds = this.getParentLineUserIds(studentName);
      if (lineUserIds.length === 0) {
        const fallbackStr = await homeworkService.getParentLineUserId(studentName);
        if (fallbackStr) {
          lineUserIds = fallbackStr.split(',').map(s => s.trim()).filter(Boolean);
        }
      }
      if (lineUserIds.length === 0) {
        return { success: false, message: '找不到家長LINE ID' };
      }

      const timeFormatted = completedTime
        ? moment(completedTime).utcOffset('+08:00').format('YYYY年MM月DD日 HH:mm')
        : moment().utcOffset('+08:00').format('YYYY年MM月DD日 HH:mm');

      let messageText = `🎉 學習進度通知 🎉\n\n${studentName} 已完成以下進度：\n\n📚 ${homeworkItem}\n\n⏰ 完成時間：${timeFormatted}`;
      if (photoUrl) {
        messageText += `\n\n📷 進度照片：\n${photoUrl}`;
      }
      messageText += `\n\n✅ 孩子很努力！感謝您的肯定與鼓勵 🙏`;

      const message = { type: 'text', text: messageText };
      const results = [];
      for (const uid of lineUserIds) {
        try {
          await client.pushMessage(uid, message);
          results.push({ userId: uid, success: true });
        } catch (e) {
          const lineError = e.response?.data || e.response?.body || e.message;
          const statusCode = e.response?.status || e.statusCode || 'unknown';
          results.push({ userId: uid, success: false, error: `HTTP ${statusCode}: ${JSON.stringify(lineError)}` });
        }
      }
      const successCount = results.filter(r => r.success).length;
      return { success: successCount > 0, message: `已發送給 ${successCount}/${lineUserIds.length} 位家長`, results };
    } catch (error) {
      throw new Error(`發送通知失敗: ${error.message}`);
    }
  }

  /**
   * 發送個人學習進度週報（週四早上10點 / 週六晚上6點）
   * 週六版本額外加入 AI 分析整週（Mon-Sat）學習習慣
   * startDate / endDate 格式：'YYYY-MM-DD'
   */
  async sendWeeklySummary(startDate, endDate) {
    if (!client) {
      return { success: false, message: 'LINE Bot 未設定（預覽模式）' };
    }

    try {
      const activeGrades = getActiveGrades();
      const normName = n => (n || '').replace(/\s+/g, ' ').trim();
      const allStudents = await homeworkService.getAllStudents();
      const gradeMap = {};
      allStudents.forEach(s => { if (s.grade) gradeMap[normName(s.studentName)] = String(s.grade); });

      const allRecords = await homeworkService.getHomeworkByDateRange(startDate, endDate);
      // 只保留本月應發送年級的學生記錄（正規化姓名做比對）
      const records = allRecords.filter(r => activeGrades.includes(gradeMap[normName(r.學生姓名)]));

      if (records.length === 0) {
        console.log(`[週摘要] ${startDate} ~ ${endDate} 無學習記錄（本月有效年級：${activeGrades.join('、')}）`);
        return { success: true, message: '此區間無學習記錄', sent: 0 };
      }

      // 依學生分組（正規化姓名：去頭尾空白、合併多重空白）
      const grouped = {};
      records.forEach(r => {
        const key = normName(r.學生姓名);
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(r);
      });

      // 額度檢查（估計：每位學生平均 2 個 LINE ID）
      const estimatedMsgs = Object.keys(grouped).length * 2;
      const quota = await this.checkLineQuota('週摘要', estimatedMsgs);
      if (!quota.sufficient) {
        return { success: false, message: `LINE 額度不足（剩餘 ${quota.remaining} 則，預計 ${estimatedMsgs} 則），發送取消`, sent: 0 };
      }

      const startFmt = moment(startDate).format('MM/DD');
      const endFmt   = moment(endDate).format('MM/DD');
      const results  = [];

      for (const [studentName, items] of Object.entries(grouped)) {
        let lineUserIds = this.getParentLineUserIds(studentName);
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

        // 本期進度列表
        const givenName = extractGivenName(studentName);
        const hwItems   = items.filter(r => !parseLeaveType(r.作業項目));
        const leaveItems = items.filter(r => parseLeaveType(r.作業項目));

        let msg = `📋【${startFmt}～${endFmt} 學習進度週報】\n\n`;
        msg += `${givenName} 本期完成：\n\n`;
        hwItems.forEach((r, i) => {
          const dateStr = moment(r.時間戳記, ['YYYY-MM-DD HH:mm:ss', 'YYYY/MM/DD HH:mm:ss']).format('MM/DD');
          msg += `${i + 1}. ${r.作業項目}\n   📅 ${dateStr}\n\n`;
        });
        if (leaveItems.length > 0) {
          leaveItems.forEach(r => {
            const dateStr = moment(r.時間戳記, ['YYYY-MM-DD HH:mm:ss', 'YYYY/MM/DD HH:mm:ss']).format('MM/DD');
            const lt = parseLeaveType(r.作業項目);
            const icon = lt === '病假' ? '🏥' : lt === '事假' ? '📋' : lt === '公假' ? '📌' : '🕊️';
            msg += `${icon} ${lt}　📅 ${dateStr}\n\n`;
          });
        }
        msg += `✅ 共完成 ${hwItems.length} 項進度\n\n`;
        msg += `${randomFrom(WEEKLY_SUMMARY_ENCOURAGEMENTS)}\n\n`;
        msg += `感謝您的關注 🙏`;

        for (const uid of lineUserIds) {
          try {
            await client.pushMessage(uid, { type: 'text', text: msg });
            console.log(`[週摘要] ✅ 已發送給 ${studentName} 的家長（${uid}）`);
            results.push({ studentName, userId: uid, success: true });
          } catch (e) {
            console.error(`[週摘要] ❌ 發送失敗 ${uid}:`, e.message);
            results.push({ studentName, userId: uid, success: false, error: e.message });
          }
        }
      }

      const successCount = results.filter(r => r.success).length;
      return {
        success: true,
        message: `週摘要發送完成：${successCount}/${results.length} 位家長`,
        period: `${startDate} ~ ${endDate}`,
        results,
      };
    } catch (error) {
      console.error('[週摘要] 錯誤:', error);
      throw new Error(`發送週摘要失敗: ${error.message}`);
    }
  }

  /**
   * 【週六 18:02】產生年級學習進度週報並存到 Google Sheets「年級週報待審」
   * 老師可在週日前審核/修改，確認後週日 11:59 發送
   */
  async generateAndSaveGradeReports(startDate, endDate) {
    try {
      const allStudents = await homeworkService.getAllStudents();
      const records = await homeworkService.getHomeworkByDateRange(startDate, endDate);
      const period = `${startDate}~${endDate}`;

      if (records.length === 0) {
        return { success: true, message: '此區間無學習記錄', generated: 0 };
      }

      const gradeMap = {};
      allStudents.forEach(s => { if (s.grade) gradeMap[s.studentName] = String(s.grade); });

      // 不納入年級週報的學生（無每日記錄者）
      const GRADE_REPORT_EXCLUDE = ['張宇婷', '張恆軒', '董洧彤'];

      // 年級週報依月份決定年級（統一使用 getActiveGrades）
      const TARGET_GRADES = getActiveGrades();
      const grades = [...new Set(records.map(r => gradeMap[r.學生姓名]).filter(g => g && TARGET_GRADES.includes(g)))].sort();
      const startFmt = moment(startDate).format('MM/DD');
      const endFmt   = moment(endDate).format('MM/DD');
      const results  = [];

      for (const grade of grades) {
        const studentsInGrade = allStudents.filter(s => String(s.grade) === grade && !GRADE_REPORT_EXCLUDE.includes(s.studentName));
        const gradeRecords = records.filter(r => gradeMap[r.學生姓名] === grade && !GRADE_REPORT_EXCLUDE.includes(r.學生姓名));

        const byStudent = {};
        gradeRecords.forEach(r => {
          if (!byStudent[r.學生姓名]) byStudent[r.學生姓名] = [];
          byStudent[r.學生姓名].push(r);
        });

        const studentLines = Object.entries(byStudent).map(([name, recs]) => {
          const masked = maskChineseName(name);
          const leaveRecs = recs.filter(r => parseLeaveType(r.作業項目));
          const hwRecs    = recs.filter(r => !parseLeaveType(r.作業項目));
          const byDate = {};
          hwRecs.forEach(r => {
            const d = moment(r.時間戳記, ['YYYY-MM-DD HH:mm:ss', 'YYYY/MM/DD HH:mm:ss']).format('MM/DD');
            if (!byDate[d]) byDate[d] = [];
            byDate[d].push(r.作業項目);
          });
          let line = masked;
          if (Object.keys(byDate).length > 0) {
            line += `\n${Object.entries(byDate).map(([d, items]) => `  ${d}　${items.join('、')}`).join('\n')}`;
          }
          if (leaveRecs.length > 0) {
            const leaveStr = leaveRecs.map(r => {
              const lt = parseLeaveType(r.作業項目);
              if (lt === '病假') return '🏥 病假';
              if (lt === '事假') return '📋 事假';
              if (lt === '公假') return '📌 公假';
              return '🕊️ 喪假';
            }).join('、');
            line += `\n  （${leaveStr}）`;
          }
          return line;
        });

        const totalItems = gradeRecords.filter(r => !parseLeaveType(r.作業項目)).length;

        // 未回報的學生名單（可能請假或未繳）
        const noReportStudents = studentsInGrade
          .filter(s => !byStudent[s.studentName])
          .map(s => maskChineseName(s.studentName));

        // 每位學生項數對比（供 AI 比較用）
        const studentComparison = studentsInGrade.map(s => {
          const count = byStudent[s.studentName]?.length || 0;
          return `${maskChineseName(s.studentName)}：${count > 0 ? count + '項' : '⚠️ 無回報'}`;
        }).join('、');

        // 期末考倒數
        const examDays = daysUntilExam();

        let msg = `📊【${startFmt}～${endFmt} 年級學習進度週報】（${grade}年級）\n\n`;
        msg += studentLines.join('\n\n');
        if (noReportStudents.length > 0) {
          msg += `\n\n⚠️ 本週無回報：${noReportStudents.join('、')}`;
        }
        msg += `\n\n────────────────`;
        if (examDays !== null) {
          msg += `\n📅 期末考倒數：約 ${examDays} 天（各校約 6/25～6/30）`;
        }

        // 雙 AI 分析：甲（習慣）+ 乙（學科）年級觀察
        let jiaAiText = '', yiAiText = '', gradeCostInfo = '';
        try {
          const aiGradeResult = await aiService.analyzeGradeProgress(
            grade, gradeRecords, studentsInGrade, studentComparison, examDays
          );
          if (aiGradeResult) {
            jiaAiText = aiGradeResult.jiaText || '';
            yiAiText  = aiGradeResult.yiText  || '';
            gradeCostInfo = aiGradeResult.costInfo || '';
            const aiBlock = [jiaAiText, yiAiText].filter(Boolean).join('\n\n');
            if (aiBlock) msg += `\n\n━━━━━━━━━━━━━━━━\n🤖 AI 老師年級觀察\n\n${aiBlock}`;
            console.log(`[年級週報] ✅ ${grade}年級 AI分析已附加`);
          }
        } catch (e) {
          console.warn(`[年級週報] ${grade}年級 AI分析失敗（略過）:`, e.message);
        }

        await homeworkService.saveGradeReport({ period, grade, jiaText: jiaAiText, yiText: yiAiText, fullMsg: msg, costInfo: gradeCostInfo });
        console.log(`[年級週報] ✅ ${grade}年級 已存入待審`);
        results.push({ grade, success: true });
      }

      const gradeList = results.map(r => r.grade).join('、');
      await this.notifyOwner(`✅ 年級週報已產生完成（${gradeList} 年級）\n請前往「年級週報待審」工作表審核，確認後將狀態改為「通過」，週日 12:00 系統會自動發送給家長。`);
      return {
        success: true,
        message: `已產生 ${results.length} 個年級的週報`,
        period,
        results,
      };
    } catch (error) {
      console.error('[年級週報產生] 錯誤:', error);
      throw new Error(`產生年級週報失敗: ${error.message}`);
    }
  }

  /**
   * 【週日 11:59】從 Sheets 讀取已審核年級週報並發送給家長
   */
  async sendSavedGradeReports(startDate, endDate) {
    if (!client) {
      return { success: false, message: 'LINE Bot 未設定（預覽模式）' };
    }
    try {
      const period = `${startDate}~${endDate}`;
      const reports = await homeworkService.getGradeReports(period);

      if (reports.length === 0) {
        return { success: true, message: '無待發送的年級週報', sent: 0 };
      }

      const allStudents = await homeworkService.getAllStudents();

      // 額度檢查（每個年級估計 15 位家長）
      const pendingReports = reports.filter(r => r.status !== '已發送');
      const estimatedMsgs  = pendingReports.length * 15;
      const quota = await this.checkLineQuota('年級週報', estimatedMsgs);
      if (!quota.sufficient) {
        return { success: false, message: `LINE 額度不足（剩餘 ${quota.remaining} 則，預計 ${estimatedMsgs} 則），發送取消`, sent: 0 };
      }

      const allResults  = [];

      for (const report of reports) {
        if (report.status === '已發送') continue;
        const { grade, finalText } = report;

        const studentsInGrade = allStudents.filter(s => String(s.grade) === grade);
        const allLineIds = new Set();
        for (const student of studentsInGrade) {
          const fromPairs = this.getParentLineUserIds(student.studentName);
          if (fromPairs.length > 0) {
            fromPairs.forEach(id => allLineIds.add(id));
          } else if (student.lineUserId) {
            student.lineUserId.split(',').map(s => s.trim()).filter(Boolean).forEach(id => allLineIds.add(id));
          }
        }

        if (allLineIds.size === 0) {
          console.warn(`[年級週報發送] ${grade}年級 無已配對家長`);
          continue;
        }

        const gradeMsg = `${finalText}\n\n${randomFrom(PARENT_ENCOURAGEMENTS)}\n\n${ATOMIC_POWER}`;

        for (const uid of allLineIds) {
          try {
            await client.pushMessage(uid, { type: 'text', text: gradeMsg });
            allResults.push({ grade, userId: uid, success: true });
          } catch (e) {
            allResults.push({ grade, userId: uid, success: false, error: e.message });
          }
        }
      }

      await homeworkService.markGradeReportsSent(period);
      const successCount = allResults.filter(r => r.success).length;
      return {
        success: true,
        message: `年級週報發送完成：${successCount}/${allResults.length}`,
        period,
        results: allResults,
      };
    } catch (error) {
      console.error('[年級週報發送] 錯誤:', error);
      throw new Error(`發送年級週報失敗: ${error.message}`);
    }
  }

  /**
   * 發送年級學習進度週報（保留舊 API 相容性，內部轉發至新流程）
   * @deprecated 請改用 generateAndSaveGradeReports + sendSavedGradeReports
   */
  async sendClassWeeklySummary(startDate, endDate) {
    if (!client) {
      return { success: false, message: 'LINE Bot 未設定（預覽模式）' };
    }

    try {
      // 取得所有學生（含年級）
      const allStudents = await homeworkService.getAllStudents();
      // 取得本週所有作業記錄
      const records = await homeworkService.getHomeworkByDateRange(startDate, endDate);

      if (records.length === 0) {
        console.log(`[班級週報] ${startDate} ~ ${endDate} 無學習記錄`);
        return { success: true, message: '此區間無學習記錄', sent: 0 };
      }

      // 依學生姓名 → 年級的對照表
      const gradeMap = {};
      allStudents.forEach(s => {
        if (s.grade) gradeMap[s.studentName] = String(s.grade);
      });

      // 只保留本月應發送的年級
      const activeGrades = getActiveGrades();
      const grades = [...new Set(
        records
          .map(r => gradeMap[r.學生姓名])
          .filter(g => g && activeGrades.includes(g))
      )].sort();

      // 額度檢查（每個年級估計 1 則 group 訊息）
      const estimatedMsgs = grades.length;
      const quota = await this.checkLineQuota('班級週報', estimatedMsgs);
      if (!quota.sufficient) {
        return { success: false, message: `LINE 額度不足（剩餘 ${quota.remaining} 則，預計 ${estimatedMsgs} 則），發送取消`, sent: 0 };
      }

      const startFmt = moment(startDate).format('MM/DD');
      const endFmt   = moment(endDate).format('MM/DD');
      const allResults = [];

      for (const grade of grades) {
        // 該年級的學生名單
        const studentsInGrade = allStudents.filter(s => String(s.grade) === grade);
        // 該年級本週的記錄
        const gradeRecords = records.filter(r => gradeMap[r.學生姓名] === grade);

        // 依學生分組記錄
        const byStudent = {};
        gradeRecords.forEach(r => {
          if (!byStudent[r.學生姓名]) byStudent[r.學生姓名] = [];
          byStudent[r.學生姓名].push(r);
        });

        // 依日期分組（每位學生）
        const studentLines = Object.entries(byStudent).map(([name, recs]) => {
          const masked = maskChineseName(name);
          const byDate = {};
          recs.forEach(r => {
            const d = moment(r.時間戳記, ['YYYY-MM-DD HH:mm:ss', 'YYYY/MM/DD HH:mm:ss']).format('MM/DD');
            if (!byDate[d]) byDate[d] = [];
            byDate[d].push(r.作業項目);
          });
          const lines = Object.entries(byDate)
            .map(([d, items]) => `  ${d}　${items.join('、')}`)
            .join('\n');
          return `${masked}\n${lines}`;
        });

        // 統計
        const reportStudentCount = Object.keys(byStudent).length;
        const totalItems = gradeRecords.length;

        // 組合訊息
        let msg = `📊【${startFmt}～${endFmt} 年級學習進度週報】（${grade}年級）\n\n`;
        msg += studentLines.join('\n\n');
        msg += `\n\n────────────────\n`;
        msg += `📈 本週共 ${reportStudentCount} 位同學回報進度，合計 ${totalItems} 項\n\n`;
        msg += randomFrom(STUDENT_ENCOURAGEMENTS);
        msg += `\n\n${randomFrom(PARENT_ENCOURAGEMENTS)}`;
        msg += `\n\n${ATOMIC_POWER}`;

        // 收集該年級所有已配對家長的 LINE ID（不重複）
        const allLineIds = new Set();
        for (const student of studentsInGrade) {
          const fromPairs = this.getParentLineUserIds(student.studentName);
          if (fromPairs.length > 0) {
            fromPairs.forEach(id => allLineIds.add(id));
          } else if (student.lineUserId) {
            student.lineUserId.split(',').map(s => s.trim()).filter(Boolean).forEach(id => allLineIds.add(id));
          }
        }

        if (allLineIds.size === 0) {
          console.warn(`[班級週報] ${grade}年級 無已配對家長`);
          continue;
        }

        console.log(`[班級週報] ${grade}年級 → 發送給 ${allLineIds.size} 個 LINE ID`);

        for (const uid of allLineIds) {
          try {
            await client.pushMessage(uid, { type: 'text', text: msg });
            allResults.push({ grade, userId: uid, success: true });
          } catch (e) {
            console.error(`[班級週報] ❌ ${grade}年級 發送失敗 ${uid}:`, e.message);
            allResults.push({ grade, userId: uid, success: false, error: e.message });
          }
        }
      }

      const successCount = allResults.filter(r => r.success).length;
      return {
        success: true,
        message: `班級週報發送完成：${successCount}/${allResults.length}`,
        period: `${startDate} ~ ${endDate}`,
        grades,
        results: allResults,
      };
    } catch (error) {
      console.error('[班級週報] 錯誤:', error);
      throw new Error(`發送班級週報失敗: ${error.message}`);
    }
  }

  /**
   * 【週六 6:01】產生 AI 個人分析並存到 Google Sheets「AI評語待審」
   * 老師可在週日前審核/修改，確認後週日 11:59 發送
   */
  async generateAndSaveAIAnalyses(startDate, endDate) {
    try {
      const activeGrades = getActiveGrades();
      const normName = n => (n || '').replace(/\s+/g, ' ').trim();
      const allStudents = await homeworkService.getAllStudents();
      const gradeMap = {};
      allStudents.forEach(s => { if (s.grade) gradeMap[normName(s.studentName)] = String(s.grade); });

      const allRecords = await homeworkService.getHomeworkByDateRange(startDate, endDate);
      // 只保留本月應發送年級的學生記錄（用 normName 正規化空格再查 gradeMap）
      const records = allRecords.filter(r => activeGrades.includes(gradeMap[normName(r.學生姓名)]));
      const period = `${startDate}~${endDate}`;

      if (records.length === 0) {
        console.log(`[AI產生] ${period} 無學習記錄（本月有效年級：${activeGrades.join('、')}）`);
        return { success: true, message: '此區間無學習記錄', generated: 0 };
      }

      // 依學生分組（以正規化後的姓名為 key，避免雙空格造成分組錯誤）
      const grouped = {};
      records.forEach(r => {
        const key = normName(r.學生姓名);
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(r);
      });

      const results = [];
      for (const [studentName, allRecs] of Object.entries(grouped)) {
        const leaveRecs  = allRecs.filter(r => parseLeaveType(r.作業項目));
        const weekRecords = allRecs.filter(r => !parseLeaveType(r.作業項目));
        const leaveSummary = leaveRecs.length > 0
          ? leaveRecs.map(r => {
              const raw = r.時間戳記 || r.完成時間 || '';
              const d = moment(raw, ['YYYY-MM-DD HH:mm:ss', 'YYYY/MM/DD HH:mm:ss']).format('MM/DD');
              return `  ${d}：${r.作業項目}`;
            }).join('\n')
          : '';
        // 讀取月考成績（若有「成績記錄」工作表）
        const scoresSummary = await homeworkService.getStudentScores(studentName).catch(() => '');

        const studentGrade = gradeMap[studentName] || null; // studentName 已是 normName 後的 key
        const aiResult = await aiService.analyzeStudentProgress(studentName, weekRecords, leaveSummary, scoresSummary, studentGrade);
        if (!aiResult) {
          console.warn(`[AI產生] ${studentName} AI 分析失敗`);
          results.push({ studentName, success: false });
          continue;
        }
        const { jiaText, yiText, costInfo } = aiResult;
        await homeworkService.saveAIAnalysis({ period, studentName, jiaText, yiText, costInfo });
        console.log(`[AI產生] ✅ ${studentName} 已儲存`);
        results.push({ studentName, success: true });
      }

      const successCount = results.filter(r => r.success).length;
      await this.notifyOwner(`✅ AI 個人評語已產生完成（${successCount}/${results.length} 位學生）\n請前往「AI評語待審」工作表審核，確認後將狀態改為「通過」，週日 11:59 系統會自動發送給家長。`);
      return {
        success: true,
        message: `已產生 ${successCount}/${results.length} 位學生的 AI 分析`,
        period,
        results,
      };
    } catch (error) {
      console.error('[AI產生] 錯誤:', error);
      throw new Error(`產生 AI 分析失敗: ${error.message}`);
    }
  }

  /**
   * 【週日 11:59】從 Sheets 讀取已審核評語並發送給家長
   */
  async sendAIWeeklyAnalysis(startDate, endDate) {
    if (!client) {
      return { success: false, message: 'LINE Bot 未設定（預覽模式）' };
    }

    try {
      const activeGrades = getActiveGrades();
      const allStudents = await homeworkService.getAllStudents();
      const gradeMap = {};
      allStudents.forEach(s => { if (s.grade) gradeMap[s.studentName] = String(s.grade); });

      const period = `${startDate}~${endDate}`;
      const allAnalyses = await homeworkService.getAIAnalyses(period);
      // 只發送狀態為「通過」且本月應發送年級的學生
      const analyses = allAnalyses.filter(a =>
        a.status === '通過' && activeGrades.includes(gradeMap[a.studentName])
      );

      if (analyses.length === 0) {
        console.log(`[AI發送] ${period} 無已通過審核的 AI 評語（本月有效年級：${activeGrades.join('、')}）`);
        return { success: true, message: '無待發送的 AI 評語（未有狀態為「通過」的評語）', sent: 0 };
      }

      // 額度檢查（每位學生估計 2 個 LINE ID）
      const estimatedMsgs = analyses.length * 2;
      const quota = await this.checkLineQuota('AI評語', estimatedMsgs);
      if (!quota.sufficient) {
        return { success: false, message: `LINE 額度不足（剩餘 ${quota.remaining} 則，預計 ${estimatedMsgs} 則），發送取消`, sent: 0 };
      }

      const startFmt = moment(startDate).format('MM/DD');
      const endFmt   = moment(endDate).format('MM/DD');
      const results  = [];

      for (const analysis of analyses) {
        const { studentName, finalText } = analysis;

        let lineUserIds = this.getParentLineUserIds(studentName);
        if (lineUserIds.length === 0) {
          const fallbackStr = await homeworkService.getParentLineUserId(studentName);
          if (fallbackStr) {
            lineUserIds = fallbackStr.split(',').map(s => s.trim()).filter(Boolean);
          }
        }
        if (lineUserIds.length === 0) {
          console.warn(`[AI發送] ⚠️ 找不到 ${studentName} 的 LINE ID，跳過（狀態不變）`);
          results.push({ studentName, success: false, message: '找不到LINE ID' });
          continue;
        }

        // 只顯示名（去掉姓），保留英文名，看起來更親切
        const displayName = extractGivenName(studentName);
        const msg = `🤖【${startFmt}～${endFmt} AI 老師本週觀察】\n\n${displayName}\n\n${finalText}\n\n${randomFrom(STUDENT_ENCOURAGEMENTS)}\n\n感謝您的關注 🙏`;

        let studentSent = false;
        for (const uid of lineUserIds) {
          try {
            await client.pushMessage(uid, { type: 'text', text: msg });
            console.log(`[AI發送] ✅ 已發送給 ${studentName} 的家長（${uid}）`);
            results.push({ studentName, userId: uid, success: true });
            studentSent = true;
          } catch (e) {
            console.error(`[AI發送] ❌ 發送失敗 ${uid}:`, e.message);
            results.push({ studentName, userId: uid, success: false, error: e.message });
          }
        }

        // 只有成功發送才標記為已發送（逐筆標記，避免發送失敗卻被標為已發送）
        if (studentSent) {
          await homeworkService.markAIAnalysisSentOne(period, studentName);
        }
      }

      const successCount = results.filter(r => r.success).length;
      return {
        success: true,
        message: `AI 分析發送完成：${successCount}/${results.length} 位家長`,
        period,
        results,
      };
    } catch (error) {
      console.error('[AI發送] 錯誤:', error);
      throw new Error(`發送 AI 分析失敗: ${error.message}`);
    }
  }

  /**
   * 發送每日摘要（保留備用）
   */
  async sendDailySummary(date) {
    try {
      const targetDate = date || moment().utcOffset('+08:00').format('YYYY-MM-DD');
      const records = await homeworkService.getHomeworkByDate(targetDate);
      if (records.length === 0) {
        return { success: true, message: '當日無學習記錄' };
      }
      const groupedByStudent = {};
      records.forEach(record => {
        if (!groupedByStudent[record.學生姓名]) groupedByStudent[record.學生姓名] = [];
        groupedByStudent[record.學生姓名].push(record);
      });
      const results = [];
      for (const [studentName, studentRecords] of Object.entries(groupedByStudent)) {
        let lineUserIds = this.getParentLineUserIds(studentName);
        if (lineUserIds.length === 0) {
          const fallbackStr = await homeworkService.getParentLineUserId(studentName);
          if (fallbackStr) lineUserIds = fallbackStr.split(',').map(s => s.trim()).filter(Boolean);
        }
        if (lineUserIds.length === 0) {
          results.push({ studentName, success: false, message: '找不到LINE ID' });
          continue;
        }
        let msgText = `【${moment(targetDate).format('YYYY年MM月DD日')} 學習進度摘要】\n\n${studentName}今日完成：\n\n`;
        studentRecords.forEach((record, index) => {
          msgText += `${index + 1}. ${record.作業項目}\n   ⏰ ${record.完成時間}\n\n`;
        });
        msgText += `共完成 ${studentRecords.length} 項進度\n\n感謝您的關注！`;
        for (const uid of lineUserIds) {
          try {
            await client.pushMessage(uid, { type: 'text', text: msgText });
            results.push({ studentName, userId: uid, success: true });
          } catch (error) {
            results.push({ studentName, userId: uid, success: false, error: error.message });
          }
        }
      }
      return { success: true, message: `摘要發送完成：${results.filter(r => r.success).length}/${results.length} 位家長`, results };
    } catch (error) {
      throw new Error(`發送每日摘要失敗: ${error.message}`);
    }
  }

  /**
   * 批量廣播（需 Premium 帳號）
   */
  async broadcastMessage(messageText) {
    if (!client) return { success: false, message: 'LINE Bot 未設定（預覽模式）' };
    try {
      await client.broadcast({ type: 'text', text: messageText });
      return { success: true, message: '廣播訊息已發送' };
    } catch (error) {
      throw new Error(`廣播訊息失敗: ${error.message}`);
    }
  }
}

module.exports = new NotificationService();
