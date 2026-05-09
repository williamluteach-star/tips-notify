# 作業完成通知系統 - 工作紀錄
**最後更新：2026-05-09**
**專案：** https://tips-notify-production.up.railway.app
**GitHub：** https://github.com/williamluteach-star/tips-notify
**LINE OA：** @334tjghl（英典教育）

---

## 系統架構

- **後端：** Node.js / Express，部署在 Railway（auto-deploy from GitHub `main`）
- **資料庫：** Google Sheets（學生資料表、作業記錄表）
- **通知：** LINE Messaging API（pushMessage）
- **環境變數（Railway）：**
  - `LINE_CHANNEL_ACCESS_TOKEN` — Token 前綴：F7Vmryd7aYd0i1Q7JDe/...
  - `LINE_CHANNEL_SECRET`
  - `GOOGLE_SHEETS_ID`
  - `GOOGLE_SERVICE_ACCOUNT_KEY`

---

## 已完成功能

| 功能 | 狀態 | 說明 |
|------|------|------|
| 老師登入（點名） | ✅ | sessionStorage，支援 10 位老師 |
| 作業記錄提交 | ✅ | 寫入 Google Sheets 作業記錄表 |
| LINE 通知家長 | ✅ | pushMessage，含 emoji |
| 家長配對（webhook） | ✅ | 家長傳學生名字 → 自動配對並同步 Google Sheets |
| 刪除配對 | ✅ | 同步刪除 Google Sheets 欄位C |
| 家長查詢作業（查詢指令） | ✅ | 傳「查詢」→ replyMessage 回覆（免費，不佔配額） |
| Admin 主任介面 | ✅ | 密碼保護，可管理配對 |
| LINE 診斷 API | ✅ | GET /api/debug/line-status |

---

## 重要注意事項

### LINE 配額（最重要！）
- 免費方案：200 則 pushMessage / 月
- **2026年3月配額已用完（200/200）**
- **4月1日重置**，之後可正常發通知
- pushMessage 佔配額；replyMessage（家長先傳訊息的回覆）完全免費
- 升級方案：NT$800/月 → 500則；更高方案 → 無限則

### Webhook 回覆（目前關閉）
- 位置：`server.js` → `handleMessage()` 最底部
- 要開啟時取消以下程式碼的註解：
```javascript
// await client.replyMessage(event.replyToken, {
//   type: 'text',
//   text: '感謝您的訊息！如需查詢作業記錄，請輸入「查詢」或「查詢作業」。',
// });
```

### 資料持久化
- `parent-pairs.json`：**每次 Railway 部署會清空**，僅當 session 快取用
- Google Sheets 欄位C（學生資料表）：才是真正的持久資料
- 兩者會在配對/刪除時自動同步

### 照片上傳（尚未實作）
- Railway 硬碟每次部署清空，需接 Google Drive 才能持久儲存
- 實作方式：上傳 → Google Drive → 取得公開連結 → 附在 LINE 通知

---

## 老師名單

| 老師 | Emoji | 按鈕顏色 |
|------|-------|---------|
| Doris | 👩‍🏫 | 藍 |
| Peggy | 👩‍🏫 | 紫 |
| 姿莉 | 🌸 | 粉紅 |
| Anita | 🌺 | 紅 |
| Phoebe | 🌼 | 黃橘 |
| 太陽 | ☀️ | 橘 |
| 米漿 | 🥛 | 水藍 |
| 小熊 | 🐻 | 綠 |
| Henry | 🦁 | 金 |
| 郁涵 | 🌹 | 玫瑰紅 |

---

## 主要檔案

```
├── server.js                    # Express 主程式、所有 API routes、webhook
├── services/
│   ├── notificationService.js   # LINE pushMessage、支援多位家長
│   └── homeworkService.js       # Google Sheets 讀寫、查詢
├── scripts/
│   └── pair-parents.js          # 本地配對快取（ephemeral）
└── public/
    ├── index.html               # 前端 UI
    ├── app.js                   # 前端 JS，含圓形隨機排列演算法
    └── styles.css               # 樣式
```

---

## 近期 Commits

```
1130fb8  圓形填充隨機排列：icon大小±30%隨機；logo放大50%
ea0d01d  老師按鈕改為圓形排列
98d6611  Apple Watch grid 風格：各色icon + 浮動動畫
df92bd0  老師按鈕改為圓形Apple風格
1fedd96  新增emoji通知訊息、加入8位老師
677a9ed  修正查詢：支援逗號分隔多位家長ID
0ccf411  關閉webhook預設自動回覆訊息
746fde4  新增LINE診斷API（/api/debug/line-status）
3e60ce8  刪除配對同步Google Sheets；LINE錯誤訊息詳細化
```

---

## 2026-05-09 完成項目

### LINE 群組支援
- handleMessage 偵測 source.type === 'group'，使用 groupId（C...）配對
- 新增 handleJoinGroup：Bot 加入群組時自動發說明訊息
- 家長在群組傳「我是XXX的家長」即完成配對，通知發到整個群組（省配額）

### 通知文字全面更新
- 「作業完成通知」→「學習進度通知」、「作業」→「進度」
- 移除名字前的 👦 emoji
- 群組配對回覆：「通知將傳送到此群組」

### AI 個人分析（週六版本新增）
- 新增 services/aiService.js（Claude API，model: claude-haiku-4-5-20251001）
- 週六 18:00 個人週報後附加 AI 分析整週（Mon-Sat）學習習慣
- 環境變數 ANTHROPIC_API_KEY 已在 Railway 設定

### 班級學習進度週報（週日 11:58）
- 新增 notificationService.sendClassWeeklySummary()
- 名字遮蔽：張艾菲 Effie → 張O菲（只取中文，中間換O）
- 每位學生按日期列出詳細進度
- 評語：隨機學生勵志語（6句）+ 隨機家長心理建設（2句）+ 固定 Atomic Power
- 評語只在班級週報出現，個人週報不顯示
- 年級欄位在「學生資料表」B欄（7/8/9/10/11/12）
- 新增排程任務 class-weekly-summary-sunday

### package.json
- 新增 @anthropic-ai/sdk ^0.30.0

---

## 下次待辦（優先順序）

### 1. AI 評語審核介面（最優先）
老師先在後台看 AI 產生的評語草稿、手動修改，確認後再按「發送」推 LINE
- 需新增後台頁面（AI 評語審核）
- 可編輯每位學生的評語
- 發送按鈕（單筆 / 全部）
- 儲存機制：Google Sheets「AI評語待審」工作表 或 JSON 暫存
- 發送後標記已發送

### 2. 其他待處理
- 劉家豐Amone：Sheets 名字有空格問題，需修正（目前通知失敗）
- 陳冠杰 Jay、陳冠倫 Harry：尚未配對 LINE ID
- weekly-homework-summary 排程確認已還原為自動計算（非手動覆寫日期）
