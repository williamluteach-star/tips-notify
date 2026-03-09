# Google Sheets 設定步驟

## 📋 您需要完成的步驟

### 第一步：建立 Google Cloud 專案（如果還沒有）

1. **前往 Google Cloud Console**
   - 網址：https://console.cloud.google.com/
   - 使用您的 Google 帳號登入

2. **建立或選擇專案**
   - 點擊頂部的專案選擇器
   - 如果已有專案，直接選擇
   - 如果沒有，點擊「New Project」
   - 輸入專案名稱（例如：`homework-notification`）
   - 點擊「Create」

---

### 第二步：啟用 Google Sheets API

1. **前往 API Library**
   - 在左側選單選擇「APIs & Services」>「Library」
   - 或直接前往：https://console.cloud.google.com/apis/library

2. **搜尋並啟用 API**
   - 在搜尋框輸入「Google Sheets API」
   - 點擊「Google Sheets API」
   - 點擊「Enable」按鈕啟用

---

### 第三步：建立服務帳號

1. **前往 Credentials 頁面**
   - 在左側選單選擇「APIs & Services」>「Credentials」
   - 或直接前往：https://console.cloud.google.com/apis/credentials

2. **建立服務帳號**
   - 點擊頂部的「+ CREATE CREDENTIALS」
   - 選擇「Service account」

3. **填寫服務帳號資訊**
   - **Service account name**：輸入名稱（例如：`homework-bot`）
   - **Service account ID**：會自動產生（可保持預設）
   - 點擊「Create and Continue」

4. **設定角色**（可選，測試用）
   - 在「Grant this service account access to project」中
   - 選擇角色：**Editor** 或 **Owner**（僅測試用，生產環境建議更嚴格）
   - 點擊「Continue」
   - 點擊「Done」

---

### 第四步：下載 JSON 憑證

1. **找到服務帳號**
   - 在服務帳號列表中，點擊剛建立的服務帳號（名稱或 email）

2. **建立金鑰**
   - 點擊「Keys」標籤
   - 點擊「Add Key」>「Create new key」
   - 選擇「JSON」格式
   - 點擊「Create」
   - JSON 檔案會自動下載到您的電腦

3. **開啟 JSON 檔案**
   - 找到下載的 JSON 檔案（通常在「下載」資料夾）
   - 用文字編輯器開啟（例如：TextEdit、VS Code）

---

### 第五步：從 JSON 取得所需資訊

開啟 JSON 檔案後，您會看到類似這樣的內容：

```json
{
  "type": "service_account",
  "project_id": "your-project-id",
  "private_key_id": "...",
  "private_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n",
  "client_email": "homework-bot@your-project.iam.gserviceaccount.com",
  "client_id": "...",
  ...
}
```

**您需要複製兩個值：**

1. **client_email**（服務帳號 Email）
   - 例如：`homework-bot@your-project.iam.gserviceaccount.com`
   - 完整複製這個值

2. **private_key**（私鑰）
   - 這是多行的值，包含 `-----BEGIN PRIVATE KEY-----` 和 `-----END PRIVATE KEY-----`
   - **重要**：需要完整複製，包括 BEGIN 和 END 標記
   - 保持所有換行符號（\n）

---

### 第六步：建立 Google Sheets

1. **建立新的試算表**
   - 前往：https://sheets.google.com/
   - 點擊「空白」建立新的試算表
   - 或使用快捷鍵：https://sheets.google.com/create

2. **命名試算表**
   - 點擊左上角的「未命名的試算表」
   - 輸入名稱（例如：`作業通知系統`）

3. **取得 Sheets ID**
   - 查看網址列
   - 網址格式：`https://docs.google.com/spreadsheets/d/XXXXX/edit`
   - **XXXXX** 就是您的 Sheets ID
   - 複製這個 ID

---

### 第七步：建立工作表

在試算表中建立以下工作表：

#### 工作表 1：學生資料表
1. 如果預設有「工作表1」，重新命名為「學生資料表」
2. 在第一行（A1-F1）輸入標題：
   ```
   A1: 學生姓名
   B1: 年級
   C1: 家長LINE ID
   D1: 家長姓名
   E1: 聯絡電話
   F1: 備註
   ```

#### 工作表 2：作業記錄表
1. 點擊左下角「+」新增工作表
2. 命名為「作業記錄表」
3. 在第一行（A1-G1）輸入標題：
   ```
   A1: 時間戳記
   B1: 學生姓名
   C1: 作業項目
   D1: 完成時間
   E1: 操作人員
   F1: 通知狀態
   G1: 備註
   ```

#### 工作表 3：作業模板表（可選）
1. 點擊左下角「+」新增工作表
2. 命名為「作業模板表」
3. 在第一行（A1-D1）輸入標題：
   ```
   A1: 作業類別
   B1: 作業名稱
   C1: 適用年級
   D1: 預設訊息模板
   ```

---

### 第八步：授予服務帳號權限

1. **開啟共用設定**
   - 在 Google Sheets 中，點擊右上角的「共用」按鈕

2. **新增服務帳號**
   - 在「新增使用者和群組」欄位中
   - 輸入服務帳號的 email（步驟五的 `client_email`）
   - 例如：`homework-bot@your-project.iam.gserviceaccount.com`

3. **設定權限**
   - 在權限下拉選單中選擇「編輯者」
   - 點擊「傳送」或「完成」

---

## ✅ 完成後請提供以下資訊

設定完成後，請告訴我：

1. **GOOGLE_SHEETS_ID**：從網址中取得的 Sheets ID
2. **GOOGLE_SERVICE_ACCOUNT_EMAIL**：JSON 檔案中的 `client_email`
3. **GOOGLE_PRIVATE_KEY**：JSON 檔案中的 `private_key`（完整內容，包含 BEGIN/END 標記）

我會協助您：
- 更新 .env 檔案
- 測試 Google Sheets 連線
- 完成整個系統設定

---

## 💡 小提醒

- **安全性**：JSON 憑證檔案請妥善保管，不要分享給他人
- **權限**：服務帳號只需要「編輯者」權限即可
- **測試**：完成設定後，我們會執行連線測試確認一切正常
