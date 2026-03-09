# 如何下載 JSON 憑證

## 📍 下載 JSON 憑證的步驟

### 步驟 1：前往 Google Cloud Console

1. **開啟瀏覽器**
   - 前往：https://console.cloud.google.com/
   - 使用您的 Google 帳號登入

### 步驟 2：選擇或建立專案

1. **選擇專案**
   - 點擊頁面頂部的專案選擇器（顯示專案名稱的地方）
   - 如果已有專案，直接選擇
   - 如果沒有專案，點擊「New Project」建立一個

### 步驟 3：前往 Credentials 頁面

有兩種方式：

**方式一：從選單**
1. 點擊左側選單的「☰」（三條線圖示）
2. 選擇「APIs & Services」
3. 點擊「Credentials」

**方式二：直接網址**
- 前往：https://console.cloud.google.com/apis/credentials

### 步驟 4：建立服務帳號（如果還沒有）

如果您還沒有服務帳號，請先建立：

1. **建立服務帳號**
   - 在 Credentials 頁面，點擊頂部的「+ CREATE CREDENTIALS」
   - 選擇「Service account」

2. **填寫資訊**
   - **Service account name**：輸入名稱（例如：`homework-bot`）
   - **Service account ID**：會自動產生（可保持預設）
   - 點擊「Create and Continue」

3. **設定角色**（可選）
   - 選擇角色：**Editor**（測試用）
   - 點擊「Continue」
   - 點擊「Done」

### 步驟 5：下載 JSON 憑證

1. **找到服務帳號**
   - 在「Service accounts」列表中
   - 找到您剛建立的服務帳號（或已存在的服務帳號）
   - 點擊服務帳號的 **名稱** 或 **Email**

2. **前往 Keys 標籤**
   - 在服務帳號詳細頁面中
   - 點擊上方的「Keys」標籤

3. **建立新的金鑰**
   - 點擊「Add Key」按鈕
   - 選擇「Create new key」

4. **選擇 JSON 格式**
   - 會彈出一個對話框
   - 選擇「JSON」格式
   - 點擊「Create」按鈕

5. **下載檔案**
   - JSON 檔案會自動下載到您的電腦
   - 通常會下載到「下載」資料夾
   - 檔案名稱類似：`your-project-name-xxxxx.json`

---

## 📂 找到下載的檔案

### macOS
- 通常下載到：`~/Downloads/` 資料夾
- 檔案名稱：`your-project-name-xxxxx.json`

### 如何找到檔案
1. 打開 Finder
2. 前往「下載」資料夾
3. 找到最新的 JSON 檔案（通常檔案名稱包含您的專案名稱）

---

## 📝 JSON 檔案內容範例

下載的 JSON 檔案內容會類似這樣：

```json
{
  "type": "service_account",
  "project_id": "your-project-id",
  "private_key_id": "abc123...",
  "private_key": "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC...\n-----END PRIVATE KEY-----\n",
  "client_email": "homework-bot@your-project-id.iam.gserviceaccount.com",
  "client_id": "123456789...",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/..."
}
```

---

## ✅ 您需要從 JSON 檔案中取得的值

開啟 JSON 檔案後，您需要複製以下兩個值：

### 1. client_email
- 位置：JSON 檔案中的 `"client_email"` 欄位
- 範例：`homework-bot@your-project-id.iam.gserviceaccount.com`
- 這就是 **GOOGLE_SERVICE_ACCOUNT_EMAIL**

### 2. private_key
- 位置：JSON 檔案中的 `"private_key"` 欄位
- **重要**：需要完整複製，包括：
  - `-----BEGIN PRIVATE KEY-----`
  - 中間的所有內容
  - `-----END PRIVATE KEY-----`
- 這就是 **GOOGLE_PRIVATE_KEY**

---

## 🖼️ 視覺化指引

### 在 Google Cloud Console 中的位置：

```
Google Cloud Console
└── 專案選擇器（頂部）
    └── APIs & Services
        └── Credentials
            └── Service accounts（列表）
                └── [點擊服務帳號名稱]
                    └── Keys 標籤
                        └── Add Key
                            └── Create new key
                                └── 選擇 JSON
                                    └── Create（下載檔案）
```

---

## 💡 常見問題

### Q: 找不到 Credentials 頁面？
A: 確認您已選擇了專案（頂部的專案選擇器）

### Q: 找不到「Add Key」按鈕？
A: 確認您已點擊進入服務帳號的詳細頁面，並選擇了「Keys」標籤

### Q: 下載的檔案在哪裡？
A: 通常在下載資料夾，檔案名稱包含您的專案名稱

### Q: 可以重新下載嗎？
A: 可以，但建議刪除舊的金鑰並建立新的，以確保安全性

---

## 🚀 下一步

下載 JSON 檔案後：
1. 開啟 JSON 檔案（用文字編輯器）
2. 複製 `client_email` 的值
3. 複製 `private_key` 的值（完整內容）
4. 告訴我這兩個值，我會協助您完成設定
