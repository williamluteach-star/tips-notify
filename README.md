# 作業完成通知系統

透過LINE官方帳號自動通知家長孩子作業完成情況的系統。

## 功能特色

- ✅ 自動記錄作業完成情況
- ✅ 即時通知家長
- ✅ 支援批量記錄
- ✅ 每日作業摘要
- ✅ 家長可查詢近期作業記錄
- ✅ 使用Google Sheets作為資料庫，操作簡單

## 系統需求

- Node.js 14.0 或以上
- Google Workspace 付費帳號
- LINE Developers 帳號（Messaging API）

## 安裝步驟

### 1. 安裝依賴套件

```bash
npm install
```

### 2. 設定環境變數

複製 `.env.example` 為 `.env` 並填入以下資訊：

```bash
cp .env.example .env
```

#### LINE Bot 設定

1. 前往 [LINE Developers](https://developers.line.biz/)
2. 建立新的 Provider 和 Channel
3. 啟用 Messaging API
4. 取得 Channel Access Token 和 Channel Secret
5. 填入 `.env` 檔案

#### Google Sheets 設定

1. 前往 [Google Cloud Console](https://console.cloud.google.com/)
2. 建立新專案或選擇現有專案
3. 啟用 Google Sheets API
4. 建立服務帳號（Service Account）
5. 下載 JSON 憑證檔案
6. 將憑證中的 `client_email` 和 `private_key` 填入 `.env`
7. 建立 Google Sheets，並將服務帳號的 email 加入為編輯者
8. 取得 Sheets ID（從網址中取得，例如：`https://docs.google.com/spreadsheets/d/XXXXX/edit` 的 `XXXXX`）

### 3. 建立 Google Sheets 模板

建立三個工作表：

#### 工作表1：學生資料表
| 學生姓名 | 年級 | 家長LINE ID | 家長姓名 | 聯絡電話 | 備註 |
|---------|------|------------|---------|---------|------|

#### 工作表2：作業記錄表
| 時間戳記 | 學生姓名 | 作業項目 | 完成時間 | 操作人員 | 通知狀態 | 備註 |
|---------|---------|---------|---------|---------|---------|------|

#### 工作表3：作業模板表（可選）
| 作業類別 | 作業名稱 | 適用年級 | 預設訊息模板 |
|---------|---------|---------|-------------|

### 4. 設定 Webhook URL

1. 部署伺服器（可使用 Google Cloud Functions、Heroku、或自己的伺服器）
2. 在 LINE Developers Console 設定 Webhook URL：`https://your-domain.com/webhook`
3. 啟用 Webhook

## 使用方式

### 啟動伺服器

```bash
npm start
```

開發模式（自動重啟）：

```bash
npm run dev
```

### API 使用範例

#### 記錄單筆作業

```bash
curl -X POST http://localhost:3000/api/homework \
  -H "Content-Type: application/json" \
  -d '{
    "studentName": "張小明",
    "homeworkItem": "數學練習本P.10",
    "completedTime": "2024-01-15T14:00:00",
    "operator": "工讀生A"
  }'
```

#### 批量記錄作業

```bash
curl -X POST http://localhost:3000/api/homework/batch \
  -H "Content-Type: application/json" \
  -d '{
    "records": [
      {
        "studentName": "張小明",
        "homeworkItem": "數學練習本P.10",
        "operator": "工讀生A"
      },
      {
        "studentName": "李小花",
        "homeworkItem": "國文作文",
        "operator": "工讀生B"
      }
    ]
  }'
```

#### 發送每日摘要

```bash
curl -X POST http://localhost:3000/api/daily-summary \
  -H "Content-Type: application/json" \
  -d '{
    "date": "2024-01-15"
  }'
```

### 家長互動

家長在LINE中：
- 輸入「查詢」或「查詢作業」：查看近期作業記錄
- 系統會自動回覆相關訊息

## 部署建議

### Google Cloud Functions

1. 安裝 Google Cloud SDK
2. 部署函數：

```bash
gcloud functions deploy homework-notification \
  --runtime nodejs18 \
  --trigger-http \
  --allow-unauthenticated \
  --entry-point app
```

### 其他平台

- **Heroku**: 可直接部署
- **Railway**: 支援 Node.js 應用
- **自己的伺服器**: 使用 PM2 管理進程

## 注意事項

1. **LINE訊息額度**：免費方案每月500則，建議升級至付費方案
2. **Google Sheets限制**：建議單一工作表不超過10,000筆記錄
3. **安全性**：妥善保管 `.env` 檔案，不要提交到版本控制
4. **備份**：定期備份 Google Sheets 資料

## 擴展功能建議

- [ ] Web管理介面（供工讀生使用）
- [ ] Excel匯入功能
- [ ] 統計報表功能
- [ ] 自動提醒未完成作業
- [ ] 多語言支援
- [ ] 訊息模板自訂

## 技術支援

如有問題，請檢查：
1. 環境變數是否正確設定
2. Google Sheets API 是否啟用
3. LINE Webhook 是否正確設定
4. 服務帳號是否有編輯權限

## 授權

ISC


