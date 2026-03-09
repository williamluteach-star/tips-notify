/**
 * 從 LINE API 撈出所有追蹤者的 User ID
 * 執行方式：node scripts/fetch-all-followers.js
 */

require('dotenv').config();
const https = require('https');
const fs = require('fs');
const path = require('path');

const TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;

if (!TOKEN || TOKEN === 'your_line_channel_access_token') {
  console.error('❌ 請先在 .env 設定 LINE_CHANNEL_ACCESS_TOKEN');
  process.exit(1);
}

// 呼叫 LINE Followers API（一次最多 1000 筆，有 next 就繼續撈）
function fetchFollowers(next) {
  return new Promise((resolve, reject) => {
    let url = 'https://api.line.me/v2/bot/followers/ids?limit=1000';
    if (next) url += '&start=' + encodeURIComponent(next);

    const options = {
      hostname: 'api.line.me',
      path: url.replace('https://api.line.me', ''),
      method: 'GET',
      headers: {
        Authorization: 'Bearer ' + TOKEN,
      },
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch (e) {
          reject(new Error('解析失敗：' + body));
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

// 取得個別使用者的顯示名稱（選用）
function fetchProfile(userId) {
  return new Promise((resolve) => {
    const options = {
      hostname: 'api.line.me',
      path: '/v2/bot/profile/' + userId,
      method: 'GET',
      headers: { Authorization: 'Bearer ' + TOKEN },
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          const d = JSON.parse(body);
          resolve({ userId, displayName: d.displayName || '(無法取得)', pictureUrl: d.pictureUrl || '' });
        } catch (e) {
          resolve({ userId, displayName: '(無法取得)' });
        }
      });
    });
    req.on('error', () => resolve({ userId, displayName: '(無法取得)' }));
    req.end();
  });
}

async function main() {
  console.log('========================================');
  console.log('   撈取所有家長 LINE User ID');
  console.log('========================================\n');

  // 1. 撈所有 follower User ID
  const allUserIds = [];
  let nextToken = null;
  let page = 1;

  do {
    process.stdout.write(`第 ${page} 頁撈取中...`);
    const result = await fetchFollowers(nextToken);

    if (result.status !== 200) {
      console.log('\n❌ API 錯誤 ' + result.status + '：');
      console.log(JSON.stringify(result.data, null, 2));

      if (result.status === 403) {
        console.log('\n⚠️  注意：LINE Followers API 需要「已驗證」的 LINE 官方帳號才能使用。');
        console.log('   若您的帳號為一般帳號，請改用「廣播訊息」方式取得 User ID（見下方說明）。');
      }
      process.exit(1);
    }

    const ids = result.data.userIds || [];
    allUserIds.push(...ids);
    nextToken = result.data.next || null;
    console.log(` 取得 ${ids.length} 筆（累計 ${allUserIds.length}）`);
    page++;
  } while (nextToken);

  if (allUserIds.length === 0) {
    console.log('\n尚無追蹤者，或帳號未開放此 API。');
    return;
  }

  console.log(`\n✅ 共找到 ${allUserIds.length} 位追蹤者\n`);

  // 2. 取得每位使用者的顯示名稱
  console.log('正在取得使用者名稱（每筆間隔 50ms 避免 rate limit）...');
  const profiles = [];
  for (let i = 0; i < allUserIds.length; i++) {
    const profile = await fetchProfile(allUserIds[i]);
    profiles.push(profile);
    process.stdout.write(`\r取得中 ${i + 1} / ${allUserIds.length}`);
    if (i < allUserIds.length - 1) await new Promise(r => setTimeout(r, 50));
  }
  console.log('\n');

  // 3. 顯示結果
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  profiles.forEach((p, i) => {
    console.log(`${i + 1}. ${p.displayName}`);
    console.log(`   User ID: ${p.userId}`);
  });
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // 4. 存成 CSV
  const csvPath = path.join(__dirname, '..', 'followers.csv');
  const csvLines = ['User ID,LINE顯示名稱'];
  profiles.forEach(p => {
    csvLines.push(`"${p.userId}","${p.displayName.replace(/"/g, '""')}"`);
  });
  fs.writeFileSync(csvPath, '\uFEFF' + csvLines.join('\n'), 'utf-8'); // BOM for Excel

  console.log(`\n📄 已儲存至：followers.csv（共 ${profiles.length} 筆）`);
  console.log('💡 接下來：打開 http://localhost:3000 → 「家長配對」Tab → 手動配對每位家長對應的學生');
}

main().catch(err => {
  console.error('\n❌ 執行錯誤：', err.message);
  process.exit(1);
});
