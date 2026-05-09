const Anthropic = require('@anthropic-ai/sdk');
const moment = require('moment');

class AIService {
  constructor() {
    this.client = null;
    if (process.env.ANTHROPIC_API_KEY) {
      try {
        this.client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
        console.log('[AI] Claude API 初始化成功');
      } catch (e) {
        console.warn('[AI] Anthropic SDK 初始化失敗:', e.message);
      }
    } else {
      console.warn('[AI] 未設定 ANTHROPIC_API_KEY，AI 分析功能停用');
    }
  }

  /**
   * 分析單一學生的完整週學習習慣，產出個人化評語與建議
   * @param {string} studentName - 學生姓名（含英文名）
   * @param {Array}  weekRecords - 完整週記錄（Mon-Sat）
   * @returns {string|null} AI 評語，或 null（若無 API key）
   */
  async analyzeStudentProgress(studentName, weekRecords) {
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

    const prompt = `你是英典教育的AI學習顧問。請根據以下學生本週的學習記錄，用繁體中文寫一段個人化的觀察與建議。

要求：
- 約3-4句話，不超過100字
- 語氣溫暖、專業，像一位關心學生的老師
- 提到具體的學習模式（哪幾天有記錄、完成量等）
- 給出一個具體可行的建議
- 不要加任何標題、前綴或稱呼，直接輸出內容

學生姓名：${chineseName}
本週出現天數：${activeDays} 天（本週共6天）
本週完成項數：${totalItems} 項
學習記錄：
${recordSummary || '  本週無任何記錄'}`;

    try {
      const response = await this.client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 250,
        messages: [{ role: 'user', content: prompt }],
      });
      return response.content[0]?.text?.trim() || null;
    } catch (error) {
      console.error('[AI] 分析學生進度失敗:', error.message);
      return null;
    }
  }
}

module.exports = new AIService();
