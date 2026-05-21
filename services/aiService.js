const Anthropic = require('@anthropic-ai/sdk');
const { google } = require('googleapis');
const moment = require('moment');

class AIService {
  constructor() {
    this.client = null;
    this._initPromise = this._initClient();
  }

  async _initClient() {
    let apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      try { apiKey = await this._getKeyFromSheets(); }
      catch (e) { console.warn('[AI] 無法從 Google Sheets 讀取 API key:', e.message); }
    }
    if (apiKey) {
      try {
        this.client = new Anthropic({ apiKey });
        console.log('[AI] Claude API 初始化成功');
      } catch (e) { console.warn('[AI] Anthropic SDK 初始化失敗:', e.message); }
    } else {
      console.warn('[AI] 未設定 ANTHROPIC_API_KEY，AI 分析功能停用');
    }
  }

  async _getKeyFromSheets() {
    if (!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY || !process.env.GOOGLE_SHEETS_ID) return null;
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });
    const authClient = await auth.getClient();
    const sheets = google.sheets({ version: 'v4', auth: authClient });
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SHEETS_ID,
      range: 'Config!B1',
    });
    const key = response.data.values?.[0]?.[0]?.trim();
    if (key && key.startsWith('sk-ant-')) {
      console.log('[AI] 從 Google Sheets Config 讀取 API key 成功');
      return key;
    }
    return null;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 個人學習分析（雙 AI 協作）
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * 【Claude 甲】學習習慣觀察：本週模式 + 下週方向
   */
  async _analyzeHabits(chineseName, activeDays, totalItems, recordSummary) {
    const prompt = `你是英典教育的AI學習顧問（習慣分析師）。請根據以下學生本週（週一至週五）的學習記錄，用繁體中文產出兩個段落：

【本週觀察】2-3句，描述本週的學習模式（哪幾天有記錄、完成量、節奏特徵）。
【下週建議】1-2句，給出下週具體可行的學習方向，包含應繼續強化或需要調整的重點。

格式要求：
- 兩段以空行分隔，各段前保留「【本週觀察】」和「【下週建議】」標題
- 總字數不超過150字
- 語氣溫暖、專業，不要加稱呼，直接輸出內容

學生姓名：${chineseName}
本週出現天數：${activeDays} 天（本週共5天）
本週完成項數：${totalItems} 項
學習記錄（週一～週五）：
${recordSummary || '  本週無任何記錄'}`;

    const response = await this.client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      messages: [{ role: 'user', content: prompt }],
    });
    return response.content[0]?.text?.trim() || null;
  }

  /**
   * 【Claude 乙】學科內容分析：審閱甲的評語，補充學科強弱分析
   */
  async _analyzeSubjects(chineseName, recordSummary, jiaAnalysis) {
    const prompt = `你是英典教育的AI學科分析師（Claude 乙）。你的同事（Claude 甲，習慣分析師）已完成本週學習節奏的觀察，請你根據學生本週完成的作業項目，進行學科內容的補充分析。

同事的評語（供參考，不要重複內容）：
${jiaAnalysis}

學生本週作業記錄：
${recordSummary || '  本週無任何記錄'}

你的任務：
- 根據作業項目名稱，判斷本週涵蓋了哪些學科（如英文、數學、閱讀、寫作等）
- 指出哪些科目表現積極（作業量多或規律），哪些科目可再加強
- 給出一個具體的學科學習提醒

格式要求：
- 用「【學科分析】」作為開頭標題
- 2-3句話，不超過80字
- 語氣專業、具體，不重複甲已說過的內容
- 不要加稱呼，直接輸出內容`;

    const response = await this.client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      messages: [{ role: 'user', content: prompt }],
    });
    return response.content[0]?.text?.trim() || null;
  }

  /**
   * 分析單一學生的週學習記錄（雙 AI：甲習慣 + 乙學科，合併輸出）
   * @param {string} studentName - 學生姓名（含英文名）
   * @param {Array}  weekRecords - 週一～週五記錄
   * @returns {string|null} 合併後的 AI 評語
   */
  async analyzeStudentProgress(studentName, weekRecords) {
    await this._initPromise;
    if (!this.client) return null;

    const chineseName = studentName.replace(/[^一-鿿]/g, '').trim() || studentName;

    const byDate = {};
    weekRecords.forEach(r => {
      const raw = r.時間戳記 || r.完成時間 || '';
      const date = moment(raw, ['YYYY-MM-DD HH:mm:ss', 'YYYY/MM/DD HH:mm:ss']).format('MM/DD');
      if (!byDate[date]) byDate[date] = [];
      byDate[date].push(r.作業項目);
    });
    const activeDays = Object.keys(byDate).length;
    const totalItems = weekRecords.length;
    const recordSummary = Object.entries(byDate)
      .map(([date, items]) => `  ${date}：${items.join('、')}`)
      .join('\n');

    try {
      // ── Claude 甲：習慣分析 ──
      const jiaText = await this._analyzeHabits(chineseName, activeDays, totalItems, recordSummary);
      if (!jiaText) {
        console.warn(`[AI甲] ${studentName} 習慣分析失敗`);
        return null;
      }

      // ── Claude 乙：學科分析（審閱甲的輸出後補充）──
      let yiText = null;
      try {
        yiText = await this._analyzeSubjects(chineseName, recordSummary, jiaText);
      } catch (e) {
        console.warn(`[AI乙] ${studentName} 學科分析失敗：${e.message}`);
      }

      // 合併輸出
      return yiText ? `${jiaText}\n\n${yiText}` : jiaText;

    } catch (error) {
      const status = error.status || error.statusCode || (error.response?.status) || 'unknown';
      console.error(`[AI] 分析學生進度失敗 (HTTP ${status}):`, error.message);
      if (error.error) console.error('[AI] API 錯誤詳細:', JSON.stringify(error.error));
      return null;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 年級學習分析（雙 AI 協作）
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * 【Claude 甲】年級整體學習習慣觀察
   */
  async _analyzeGradeHabits(grade, studentCount, totalItems, activeDays, subjectSummary) {
    const prompt = `你是英典教育的AI學習顧問（習慣分析師）。以下是某年級本週（週一至週五）的整體學習數據，請用繁體中文產出年級層面的學習習慣觀察。

格式：
【年級學習觀察】2-3句，描述整體年級的學習參與度、節奏特徵。
【下週年級方向】1-2句，給出適合全年級的下週建議。

格式要求：
- 兩段以空行分隔，各段保留標題
- 總字數不超過120字
- 語氣溫暖、專業

年級：${grade} 年級
本週回報人數：${studentCount} 位學生
本週完成總項數：${totalItems} 項（平均每人 ${(totalItems/studentCount).toFixed(1)} 項）
各日回報情況：${activeDays}`;

    const response = await this.client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 350,
      messages: [{ role: 'user', content: prompt }],
    });
    return response.content[0]?.text?.trim() || null;
  }

  /**
   * 【Claude 乙】年級學科分布分析
   */
  async _analyzeGradeSubjects(grade, subjectSummary, jiaAnalysis) {
    const prompt = `你是英典教育的AI學科分析師（Claude 乙）。你的同事已完成 ${grade} 年級的學習節奏觀察，請你補充學科內容分析。

同事的觀察（供參考）：
${jiaAnalysis}

本週各學科作業分布：
${subjectSummary}

你的任務：
【學科重點提示】2-3句，說明本週年級整體哪些學科涵蓋較多、哪些相對不足，以及下週應重點補強的方向。

要求：總字數不超過80字，不重複甲已說過的內容，直接輸出。`;

    const response = await this.client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 250,
      messages: [{ role: 'user', content: prompt }],
    });
    return response.content[0]?.text?.trim() || null;
  }

  /**
   * 分析整個年級的週學習記錄（雙 AI 合併輸出）
   * @param {string} grade       - 年級（如 "5"）
   * @param {Array}  gradeRecords - 該年級本週所有作業記錄
   * @returns {string|null} 合併後的年級 AI 評語
   */
  async analyzeGradeProgress(grade, gradeRecords) {
    await this._initPromise;
    if (!this.client) return null;

    // 統計
    const byStudent = {};
    const byDate    = {};
    const bySubject = {};

    gradeRecords.forEach(r => {
      byStudent[r.學生姓名] = (byStudent[r.學生姓名] || 0) + 1;
      const d = moment(r.時間戳記 || r.完成時間 || '', ['YYYY-MM-DD HH:mm:ss', 'YYYY/MM/DD HH:mm:ss']).format('MM/DD');
      byDate[d] = (byDate[d] || 0) + 1;
      // 嘗試從作業項目名稱提取學科關鍵字
      const item = r.作業項目 || '';
      bySubject[item] = (bySubject[item] || 0) + 1;
    });

    const studentCount  = Object.keys(byStudent).length;
    const totalItems    = gradeRecords.length;
    const activeDays    = Object.entries(byDate).map(([d, n]) => `${d}（${n}項）`).join('、');
    const subjectSummary = Object.entries(bySubject)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([item, n]) => `${item}×${n}`)
      .join('、');

    try {
      const jiaText = await this._analyzeGradeHabits(grade, studentCount, totalItems, activeDays, subjectSummary);
      if (!jiaText) return null;

      let yiText = null;
      try {
        yiText = await this._analyzeGradeSubjects(grade, subjectSummary, jiaText);
      } catch (e) {
        console.warn(`[AI乙年級] ${grade}年級 學科分析失敗：${e.message}`);
      }

      return yiText ? `${jiaText}\n\n${yiText}` : jiaText;
    } catch (error) {
      const status = error.status || error.statusCode || (error.response?.status) || 'unknown';
      console.error(`[AI年級] ${grade}年級分析失敗 (HTTP ${status}):`, error.message);
      return null;
    }
  }
}

module.exports = new AIService();
