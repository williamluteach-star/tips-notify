const { google } = require('googleapis');
const { Readable } = require('stream');
require('dotenv').config();

class DriveService {
  constructor() {
    this.drive = null;
    this.folderId = null;
  }

  async init() {
    if (this.drive) return;
    if (!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY) {
      console.warn('[Drive] Google 服務帳號未設定，跳過初始化');
      return;
    }
    try {
      const auth = new google.auth.GoogleAuth({
        credentials: {
          client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
          private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\n/g, '\n'),
        },
        scopes: [
          'https://www.googleapis.com/auth/spreadsheets',
          'https://www.googleapis.com/auth/drive.file',
        ],
      });
      this.drive = google.drive({ version: 'v3', auth });
      console.log('[Drive] Google Drive 初始化成功');
    } catch (error) {
      console.error('[Drive] 初始化失敗:', error.message);
    }
  }

  async ensureFolder() {
    if (this.folderId) return this.folderId;
    await this.init();
    if (!this.drive) return null;

    // 優先使用環境變數指定的資料夾
    if (process.env.GOOGLE_DRIVE_FOLDER_ID) {
      this.folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
      console.log('[Drive] 使用指定資料夾：', this.folderId);
      return this.folderId;
    }

    try {
      // 查找已存在的 "作業照片" 資料夾
      const res = await this.drive.files.list({
        q: "name='作業照片' and mimeType='application/vnd.google-apps.folder' and trashed=false",
        fields: 'files(id, name)',
        spaces: 'drive',
      });
      if (res.data.files.length > 0) {
        this.folderId = res.data.files[0].id;
      } else {
        // 建立新資料夾
        const folder = await this.drive.files.create({
          resource: { name: '作業照片', mimeType: 'application/vnd.google-apps.folder' },
          fields: 'id',
        });
        this.folderId = folder.data.id;
        // 設定任何人可檢視
        await this.drive.permissions.create({
          fileId: this.folderId,
          resource: { role: 'reader', type: 'anyone' },
        });
        console.log('[Drive] 建立 "作業照片" 資料夾：', this.folderId);
      }
      return this.folderId;
    } catch (error) {
      console.error('[Drive] 建立資料夾失敗:', error.message);
      return null;
    }
  }

  /**
   * 上傳照片（接受 base64 字串）
   * @param {string} base64Data  - base64 編碼的圖片資料
   * @param {string} mimeType    - 'image/jpeg' | 'image/png' | 'image/heic' 等
   * @param {string} originalName - 原始檔名（用於命名）
   * @returns {{ viewUrl, shareUrl, fileId }}
   */
  async uploadPhoto(base64Data, mimeType, originalName) {
    await this.init();
    if (!this.drive) throw new Error('Google Drive 未初始化');

    const folderId = await this.ensureFolder();
    const ext = (originalName || 'photo').split('.').pop().toLowerCase() || 'jpg';
    const timestamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
    const fileName = `作業照片_${timestamp}.${ext}`;

    // base64 → Buffer → Readable stream
    const buffer = Buffer.from(base64Data, 'base64');
    const stream = Readable.from(buffer);

    const res = await this.drive.files.create({
      resource: {
        name: fileName,
        parents: folderId ? [folderId] : [],
      },
      media: { mimeType, body: stream },
      fields: 'id, name',
    });

    const fileId = res.data.id;

    // 設定任何人可以用連結檢視
    await this.drive.permissions.create({
      fileId,
      resource: { role: 'reader', type: 'anyone' },
    });

    console.log(`[Drive] 上傳完成：${fileName}（${fileId}）`);
    return {
      fileId,
      fileName,
      viewUrl: `https://drive.google.com/uc?export=view&id=${fileId}`,
      shareUrl: `https://drive.google.com/file/d/${fileId}/view`,
    };
  }
}

module.exports = new DriveService();
