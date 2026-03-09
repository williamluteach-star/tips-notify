# 如何查看 LINE Channel Secret 和 Channel Access Token

## 📍 快速路徑

1. 前往 LINE Developers Console：https://developers.line.biz/console/
2. 登入您的 LINE 帳號
3. 選擇您的 Provider
4. 選擇 Messaging API Channel
5. 點擊「Messaging API」標籤
6. 找到 Channel secret 和 Channel access token

---

## 📋 詳細步驟

### 步驟 1：登入 LINE Developers Console

1. **開啟瀏覽器**
   - 前往：https://developers.line.biz/console/
   - 或搜尋「LINE Developers Console」

2. **登入**
   - 使用您的 LINE 帳號登入
   - 如果還沒有帳號，需要先註冊

### 步驟 2：選擇 Provider

1. **查看頁面頂部**
   - 會看到「Provider」選擇器
   - 點擊下拉選單

2. **選擇您的 Provider**
   - 如果只有一個 Provider，會自動選擇
   - 如果有多個，選擇您要使用的

### 步驟 3：選擇 Messaging API Channel

1. **在 Provider 頁面中**
   - 找到「Channels」區塊
   - 或點擊左側選單的「Channels」

2. **找到 Messaging API Channel**
   - 會顯示 Channel 名稱和類型
   - 點擊 Channel 名稱進入設定頁面

### 步驟 4：查看 Channel Secret

1. **進入 Channel 設定頁面**
   - 點擊 Channel 名稱後，會進入詳細設定頁面

2. **找到「Basic settings」標籤**
   - 通常在頁面頂部的標籤列
   - 點擊「Basic settings」

3. **查看 Channel secret**
   - 在「Channel secret」區塊中
   - 會顯示一串英數字字串
   - 例如：`93a10f747e80771631cd27aa45e40e5b`
   - 點擊「Copy」或手動複製

### 步驟 5：查看 Channel Access Token

1. **點擊「Messaging API」標籤**
   - 在 Channel 設定頁面的標籤列中
   - 點擊「Messaging API」

2. **找到「Channel access token」區塊**
   - 向下滾動找到這個區塊

3. **查看或產生 Token**
   - **如果已有 Token**：
     - 會顯示 Token（可能部分隱藏為 `***`）
     - 如果顯示 `***`，需要點擊「Reissue」重新產生
   - **如果沒有 Token**：
     - 點擊「Issue」按鈕產生新的 Token

4. **複製 Token**
   - 點擊「Copy」按鈕
   - 或手動選取並複製
   - Token 很長，請完整複製

---

## 📸 視覺化指引

### 在 LINE Developers Console 中的位置：

```
LINE Developers Console
└── Provider 選擇器（頂部）
    └── Channels
        └── [點擊 Messaging API Channel]
            ├── Basic settings 標籤
            │   └── Channel secret（在這裡）
            │
            └── Messaging API 標籤
                └── Channel access token（在這裡）
```

---

## 🔍 詳細位置說明

### Channel Secret 位置

1. **進入 Channel 設定頁面**
2. **點擊「Basic settings」標籤**
3. **找到「Channel secret」區塊**
   - 位置：通常在頁面中間或下方
   - 顯示格式：一串英數字字串
   - 長度：約 30-50 字元

### Channel Access Token 位置

1. **進入 Channel 設定頁面**
2. **點擊「Messaging API」標籤**
3. **向下滾動找到「Channel access token」區塊**
   - 位置：在「Messaging API」標籤的下方
   - 顯示格式：很長的英數字字串
   - 長度：通常 200+ 字元

---

## ⚠️ 常見問題

### Q: 找不到 Channel？
A: 
- 確認您已選擇正確的 Provider
- 確認 Channel 類型是「Messaging API」
- 如果沒有，需要建立新的 Messaging API Channel

### Q: Channel secret 顯示為 `***`？
A: 
- 這是正常的，為了安全隱藏
- 如果需要查看，可能需要重新產生

### Q: Channel access token 顯示為 `***`？
A: 
- 點擊「Reissue」按鈕重新產生新的 Token
- 舊的 Token 會失效，請確保更新系統設定

### Q: 找不到「Messaging API」標籤？
A: 
- 確認您選擇的是 Messaging API Channel
- 不是其他類型的 Channel（如 LINE Login）

### Q: 有多個 Channel，不知道選哪個？
A: 
- 查看 Channel 名稱，選擇您要使用的官方帳號
- 或查看 Channel 的建立時間，選擇最近建立的

---

## 💡 小技巧

1. **使用瀏覽器搜尋功能**
   - 在頁面中按 `Cmd+F` (Mac) 或 `Ctrl+F` (Windows)
   - 搜尋「Channel secret」或「Channel access token」
   - 可以快速定位

2. **截圖備份**
   - 建議截圖保存，但注意不要分享給他人

3. **妥善保管**
   - 這些資訊很重要，請妥善保管
   - 不要分享給未授權的人員

---

## 🚀 取得後

取得這兩個資訊後，請告訴我：
1. Channel Access Token
2. Channel Secret

我會協助您更新系統設定。
