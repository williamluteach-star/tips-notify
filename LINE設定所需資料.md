# LINE Bot 設定所需資料

## 📋 您需要提供的資料

### 1. Channel Access Token（頻道存取權杖）
- **用途**：讓系統可以透過 LINE API 發送訊息給家長
- **格式**：一串很長的英數字字串，例如：`AbCdEf1234567890...`
- **長度**：通常很長（200+ 字元）

### 2. Channel Secret（頻道密鑰）
- **用途**：驗證 Webhook 請求的真實性
- **格式**：一串英數字字串，例如：`1234567890abcdef...`
- **長度**：通常較短（約 30-50 字元）

---

## 🔍 如何取得這些資料？

### 步驟 1：登入 LINE Developers Console
1. 前往：https://developers.line.biz/console/
2. 使用您的 LINE Developers 帳號登入

### 步驟 2：選擇您的 Provider
- 在頁面頂部選擇您之前建立的 Provider

### 步驟 3：選擇 Messaging API Channel
- 在 Provider 下找到您的 Messaging API Channel
- 點擊進入 Channel 設定頁面

### 步驟 4：取得 Channel Access Token
1. 在 Channel 設定頁面，點擊「Messaging API」標籤
2. 向下滾動找到「Channel access token」區塊
3. 如果還沒有 token，點擊「Issue」按鈕產生一個
4. 如果已有 token，直接複製（點擊「Copy」或手動選取複製）
5. ⚠️ **重要**：如果 token 顯示為 `***`，需要點擊「Reissue」重新產生

### 步驟 5：取得 Channel Secret
1. 在同一個頁面（Messaging API 標籤）
2. 找到「Channel secret」區塊
3. 直接複製這個值

---

## 📝 資料範例格式

### Channel Access Token 範例：
```
AbCdEf1234567890GhIjKlMnOpQrStUvWxYz1234567890AbCdEf1234567890GhIjKlMnOpQrStUvWxYz1234567890AbCdEf1234567890GhIjKlMnOpQrStUvWxYz1234567890
```

### Channel Secret 範例：
```
1234567890abcdef1234567890abcdef
```

---

## ✅ 檢查清單

在提供資料前，請確認：
- [ ] 已登入 LINE Developers Console
- [ ] 已找到 Messaging API Channel
- [ ] 已取得 Channel Access Token（可以複製）
- [ ] 已取得 Channel Secret（可以複製）
- [ ] Token 不是顯示為 `***`（如果是，需要重新產生）

---

## 🚀 下一步

取得這兩項資料後，請告訴我：
1. Channel Access Token
2. Channel Secret

我會協助您：
- 建立 .env 檔案
- 填入這些設定
- 測試 LINE Bot 連線

---

## 💡 小提醒

- **安全性**：這些資料請妥善保管，不要分享給他人
- **Token 過期**：如果 token 失效，可以在同一個頁面重新產生
- **多個 Channel**：如果您有多個 Channel，請確認選擇正確的那一個
