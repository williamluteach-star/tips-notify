const Anthropic = require('@anthropic-ai/sdk');
const { google } = require('googleapis');
const moment = require('moment');

class AIService {
  constructor() {
    this.client = null;
    // Kick off async init; store the promise so analyzeStudentProgress can await it
    this._initPromise = this._initClient();
  }

  /**
   * Try to find the Anthropic API key:
   *   1. process.env.ANTHROPIC_API_KEY  (normal case)
   *   2. Google Sheets Config!B1        (Railway Runtime-V2 snapshot workaround)
   */
  async _initClient() {
    let apiKey = process.env.ANTHROPIC_API_KEY;

    if (!apiKey) {
      try {
        apiKey = await this._getKeyFromSheets();
      } catch (e) {
        console.warn('[AI] 無法從 Google Sheets 讀取 API key:', e.message);
      }
    }

    if (apiKey) {
      try {
        this.client = new Anthropic({ apiKey });
        console.log('[AI] Claude API 初始化成功');
      } catch (e) {
        console.warn('[AI] Anthropic SDK 初始化失敗:', e.message);
      }
    } else {
      console.warn('[AI] 未設定 ANTHROPIC_API_KEY，AI 分析功能停用');
    }
  }

  /**
   * Read ANTHROPIC_API_KEY from Google Sheets "Config" tab, cell B1.
   * Falls back silently if Google credentials are not configured.
   */
  async _getKeyFromSheets() {
    if (
      !process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL ||
      !process.env.GOOGLE_PRIVATE_KEY ||
      !process.env.GOOGLE_SHEETS_ID
    ) {
      return null;
    }

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

  /**
   * 分析單一學生的完整週學習習慣，產出個人化評語與建議
   * @param {string} studentName - 學生姓名（含英文名）
   * @param {Array}  weekRecords - 完整週記錄（Mon-Sat）
   * @returns {string|null} AI 評語，或 null（若無 API key）
   */
  async analyzeStudentProgress(studentName, weekRecords) {
    // Ensure async init is complete before proceeding
    await this._initPromise;
    if (!this.client) return null;

    // 只取中文名（去除英文名）用於 prompt
    const chineseName = studentName.replace(/[^一-鿿]/g, '').trim() || studentName;

    // 按日期分組
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

    const prompt = `你是英典教育的AI學習顧問。請根據以下學生本週（週一至週五）的學習記錄，用繁體中文產出兩個段落：

【本週觀察】2-3句，描述本週的學習模式（哪幾天有記錄、完成量、節奏特徵）。
【下週建議】1-2句，給出下週具體可行的學習方向，包含應繼續強化或需要調整的重點。

格式要求：
- 兩段以空行分隔，各段前加上「【本週觀察】」和「【下週建議】」標題
- 總字數不超過150字
- 語氣溫暖、專業，像一位關心學生的老師
- 不要加稱呼，直接輸出內容

學生姓名：${chineseName}
本週出現天數：${activeDays} 天（本週共5天）
本週完成項數：${totalItems} 項
學習記錄（週一～週五）：
${recordSummary || '  本週無任何記錄'}`;

    try {
      const response = await this.client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 400,
        messages: [{ role: 'user', content: prompt }],
      });
      return response.content[0]?.text?.trim() || null;
    } catch (error) {
      const status = error.status || error.statusCode || (error.response?.status) || 'unknown';
      console.error(`[AI] 分析學生進度失敗 (HTTP ${status}):`, error.message);
      if (error.error) console.error('[AI] API 錯誤詳細:', JSON.stringify(error.error));
      return null;
    }
  }
}

module.exports = new AIService();
