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
  async _analyzeHabits(chineseName, activeDays, totalItems, recordSummary, examDays, leaveSummary = '') {
    const examNote = examDays !== null
      ? `\n⚠️ 期末考備考提醒：距離期末考（各校約6/25～6/30）還有 ${examDays} 天，請在【下週建議】中加入備考複習的具體提醒。`
      : '';
    const leaveNote = leaveSummary
      ? `\n本週請假記錄：\n${leaveSummary}\n（病假：適時關心提醒多休息；事假：提醒把握時間補回進度）`
      : '';

    const prompt = `你是英典教育的AI學習顧問（習慣分析師）。請根據以下學生本週（週一至週五）的學習記錄，用繁體中文產出兩個段落：

【本週觀察】2-3句，描述本週的學習模式（哪幾天有記錄、完成量、節奏特徵）。若有請假，請簡短提及。
【下週建議】1-2句，給出下週具體可行的學習方向，包含應繼續強化或需要調整的重點。

格式要求：
- 兩段以空行分隔，各段前保留「【本週觀察】」和「【下週建議】」標題
- 總字數不超過150字
- 語氣溫暖、專業，不要加稱呼，直接輸出內容${examNote}

學生姓名：${chineseName}
本週出現天數：${activeDays} 天（本週共5天）
本週完成作業項數：${totalItems} 項${leaveNote}
學習記錄（週一～週五）：
${recordSummary || '  本週無任何作業記錄'}`;

    const response = await this.client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      messages: [{ role: 'user', content: prompt }],
    });
    return { text: response.content[0]?.text?.trim() || null, usage: response.usage };
  }

  /**
   * 【Claude 乙】學科內容分析：審閱甲的評語，補充學科強弱分析
   */
  async _analyzeSubjects(chineseName, recordSummary, jiaAnalysis, examDays) {
    const examNote = examDays !== null
      ? `\n注意：距期末考約 ${examDays} 天，若有科目練習量不足，請在分析中點出需優先複習的學科。`
      : '';

    const prompt = `你是英典教育的AI學科分析師（Claude 乙）。你的同事（Claude 甲，習慣分析師）已完成本週學習節奏的觀察，請你根據學生本週完成的作業項目，進行學科內容的補充分析。${examNote}

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
    return { text: response.content[0]?.text?.trim() || null, usage: response.usage };
  }

  /**
   * 計算 Claude Haiku 4.5 的費用（USD）
   * 定價：輸入 $0.80/MTok，輸出 $4.00/MTok
   */
  _calcCost(inputTokens, outputTokens) {
    return (inputTokens * 0.80 + outputTokens * 4.00) / 1_000_000;
  }

  /**
   * 格式化費用摘要（存入 Sheets G 欄）
   */
  _formatCostInfo(inputTokens, outputTokens) {
    const usd = this._calcCost(inputTokens, outputTokens);
    return `輸入 ${inputTokens} / 輸出 ${outputTokens} tokens | $${usd.toFixed(6)} USD`;
  }

  /**
   * 分析單一學生的週學習記錄（雙 AI：甲習慣 + 乙學科，合併輸出）
   * @param {string} studentName - 學生姓名（含英文名）
   * @param {Array}  weekRecords - 週一～週五記錄
   * @returns {string|null} 合併後的 AI 評語
   */
  async analyzeStudentProgress(studentName, weekRecords, leaveSummary = '') {
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

    // 期末考倒數（距 6/25 在 35 天內才提醒）
    const now = moment().utcOffset('+08:00');
    const year = now.month() >= 6 ? now.year() + 1 : now.year();
    const examDate = moment(`${year}-06-25`);
    const examDays = examDate.diff(now, 'days');
    const examDaysArg = examDays >= 0 && examDays <= 35 ? examDays : null;

    try {
      // ── Claude 甲：習慣分析 ──
      const jia = await this._analyzeHabits(chineseName, activeDays, totalItems, recordSummary, examDaysArg, leaveSummary);
      if (!jia?.text) {
        console.warn(`[AI甲] ${studentName} 習慣分析失敗`);
        return null;
      }

      // ── Claude 乙：學科分析（審閱甲的輸出後補充）──
      let yi = null;
      try {
        yi = await this._analyzeSubjects(chineseName, recordSummary, jia.text, examDaysArg);
      } catch (e) {
        console.warn(`[AI乙] ${studentName} 學科分析失敗：${e.message}`);
      }

      // 合併文字
      const text = yi?.text ? `${jia.text}\n\n${yi.text}` : jia.text;

      // 累計 token 用量
      const inputTokens  = (jia.usage?.input_tokens  || 0) + (yi?.usage?.input_tokens  || 0);
      const outputTokens = (jia.usage?.output_tokens || 0) + (yi?.usage?.output_tokens || 0);
      const costInfo = this._formatCostInfo(inputTokens, outputTokens);
      console.log(`[AI] ${studentName} ${costInfo}`);

      return { text, inputTokens, outputTokens, costInfo };

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
   * 【Claude 甲】年級整體學習習慣觀察 + 學生進度比較
   */
  async _analyzeGradeHabits(grade, totalStudents, reportingCount, totalItems, activeDays, studentComparison, examDays) {
    const avgItems = reportingCount > 0 ? (totalItems / reportingCount).toFixed(1) : '0';
    const noReportCount = totalStudents - reportingCount;

    const examNote = examDays !== null
      ? `\n⚠️ 期末考備考：距離期末考（約6/25～6/30）還有 ${examDays} 天，請在觀察中適當提醒備考節奏。`
      : '';

    const prompt = `你是英典教育的AI學習顧問（習慣分析師）。以下是 ${grade} 年級本週（週一至週五）的整體學習數據，請用繁體中文產出：

【年級學習觀察】2-3句，比較各學生的進度差異，點名表現較突出與較少回報的學生（用遮蔽名如「張O菲」），若有無回報的學生請提醒老師關心是否請假。
【下週年級方向】1-2句，給出全年級共同的下週學習建議。

格式要求：
- 兩段以空行分隔，各段保留「【】」標題
- 總字數不超過150字，語氣溫暖專業，不加稱呼${examNote}

資料：
年級：${grade} 年級
全班人數：${totalStudents} 人
本週有回報：${reportingCount} 人，無回報：${noReportCount} 人
本週完成總項數：${totalItems} 項（有回報者平均 ${avgItems} 項）
各日回報情況：${activeDays}
各學生本週項數：${studentComparison}`;

    const response = await this.client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      messages: [{ role: 'user', content: prompt }],
    });
    return { text: response.content[0]?.text?.trim() || null, usage: response.usage };
  }

  /**
   * 【Claude 乙】年級學科分布分析
   */
  async _analyzeGradeSubjects(grade, subjectSummary, jiaAnalysis, examDays) {
    const examNote = examDays !== null
      ? `\n注意：距期末考約 ${examDays} 天，若有學科複習量不足，請在提示中點出。`
      : '';

    const prompt = `你是英典教育的AI學科分析師（Claude 乙）。你的同事（Claude 甲）已完成 ${grade} 年級的學習節奏與進度比較，請你補充學科內容層面的分析。

同事的觀察（供參考，不要重複）：
${jiaAnalysis}

本週作業項目分布（項目名稱×次數）：
${subjectSummary}${examNote}

你的任務：
【學科重點提示】2-3句，說明本週哪些學科涵蓋較多、哪些不足，以及下週應補強的學科方向。

要求：總字數不超過100字，不重複甲已說過的內容，直接輸出。`;

    const response = await this.client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 280,
      messages: [{ role: 'user', content: prompt }],
    });
    return { text: response.content[0]?.text?.trim() || null, usage: response.usage };
  }

  /**
   * 分析整個年級的週學習記錄（雙 AI 合併輸出）
   * @param {string} grade            - 年級（如 "5"）
   * @param {Array}  gradeRecords     - 該年級本週所有作業記錄
   * @param {Array}  allStudentsInGrade - 全班學生清單（包含無回報者）
   * @param {string} studentComparison - 遮蔽名稱的各人項數對比字串
   * @param {number|null} examDays    - 距期末考天數（null = 不用提醒）
   * @returns {string|null} 合併後的年級 AI 評語
   */
  async analyzeGradeProgress(grade, gradeRecords, allStudentsInGrade = [], studentComparison = '', examDays = null) {
    await this._initPromise;
    if (!this.client) return null;

    const byStudent = {};
    const byDate    = {};
    const bySubject = {};

    gradeRecords.forEach(r => {
      byStudent[r.學生姓名] = (byStudent[r.學生姓名] || 0) + 1;
      const d = moment(r.時間戳記 || r.完成時間 || '', ['YYYY-MM-DD HH:mm:ss', 'YYYY/MM/DD HH:mm:ss']).format('MM/DD');
      byDate[d] = (byDate[d] || 0) + 1;
      const item = r.作業項目 || '';
      bySubject[item] = (bySubject[item] || 0) + 1;
    });

    const totalStudents  = allStudentsInGrade.length || Object.keys(byStudent).length;
    const reportingCount = Object.keys(byStudent).length;
    const totalItems     = gradeRecords.length;
    const activeDays     = Object.entries(byDate).map(([d, n]) => `${d}（${n}項）`).join('、') || '無';
    const subjectSummary = Object.entries(bySubject)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([item, n]) => `${item}×${n}`)
      .join('、');

    try {
      const jia = await this._analyzeGradeHabits(
        grade, totalStudents, reportingCount, totalItems, activeDays, studentComparison, examDays
      );
      if (!jia?.text) return null;

      let yi = null;
      try {
        yi = await this._analyzeGradeSubjects(grade, subjectSummary, jia.text, examDays);
      } catch (e) {
        console.warn(`[AI乙年級] ${grade}年級 學科分析失敗：${e.message}`);
      }

      const text = yi?.text ? `${jia.text}\n\n${yi.text}` : jia.text;

      const inputTokens  = (jia.usage?.input_tokens  || 0) + (yi?.usage?.input_tokens  || 0);
      const outputTokens = (jia.usage?.output_tokens || 0) + (yi?.usage?.output_tokens || 0);
      const costInfo = this._formatCostInfo(inputTokens, outputTokens);
      console.log(`[AI年級] ${grade}年級 ${costInfo}`);

      return { text, inputTokens, outputTokens, costInfo };
    } catch (error) {
      const status = error.status || error.statusCode || (error.response?.status) || 'unknown';
      console.error(`[AI年級] ${grade}年級分析失敗 (HTTP ${status}):`, error.message);
      return null;
    }
  }
}

module.exports = new AIService();
