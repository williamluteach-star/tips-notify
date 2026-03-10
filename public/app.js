// =========================================
// 作業完成通知系統 - 前端 JavaScript
// =========================================

// =========================================
// 老師登入 (sessionStorage 點名機制)
// =========================================
var TEACHERS = ['Doris', 'Peggy', '姿莉', 'Anita', 'Phoebe', '太陽', '米漿', '小熊', 'Henry', '郁涵'];
var DIRECTOR_NAME = '主任';

function getCurrentTeacher() {
  return sessionStorage.getItem('currentTeacher');
}

function setCurrentTeacher(name) {
  sessionStorage.setItem('currentTeacher', name);
  document.getElementById('operator').value = name;
  var icon = (name === DIRECTOR_NAME) ? '🔑' : '👩‍🏫';
  document.getElementById('teacherBadgeText').textContent = icon + ' ' + name;
  document.getElementById('loginOverlay').style.display = 'none';
}

function showLoginOverlay() {
  document.getElementById('loginOverlay').style.display = 'flex';
}

// 綁定老師按鈕
document.querySelectorAll('.teacher-btn').forEach(function(btn) {
  btn.addEventListener('click', function() {
    setCurrentTeacher(this.dataset.name);
  });
});

// 切換老師按鈕
document.getElementById('switchTeacher').addEventListener('click', function() {
  sessionStorage.removeItem('currentTeacher');
  showLoginOverlay();
});

// =========================================
// 主任登入 (密碼保護)
// =========================================
function showDirectorModal() {
  document.getElementById('directorModal').style.display = 'flex';
  document.getElementById('directorPassword').value = '';
  document.getElementById('directorError').style.display = 'none';
  setTimeout(function() { document.getElementById('directorPassword').focus(); }, 100);
}

function hideDirectorModal() {
  document.getElementById('directorModal').style.display = 'none';
}

document.getElementById('directorLoginBtn').addEventListener('click', showDirectorModal);
document.getElementById('directorCancel').addEventListener('click', hideDirectorModal);

document.getElementById('directorConfirm').addEventListener('click', async function() {
  var password = document.getElementById('directorPassword').value;
  if (!password) return;
  var btn = this;
  btn.disabled = true;
  btn.textContent = '驗證中...';

  try {
    var response = await fetch('/api/director-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: password })
    });
    var data = await response.json();

    if (data.success) {
      hideDirectorModal();
      setCurrentTeacher(DIRECTOR_NAME);
    } else {
      document.getElementById('directorError').style.display = 'block';
      document.getElementById('directorPassword').value = '';
      document.getElementById('directorPassword').focus();
    }
  } catch (e) {
    document.getElementById('directorError').style.display = 'block';
  } finally {
    btn.disabled = false;
    btn.textContent = '✓ 確認登入';
  }
});

document.getElementById('directorPassword').addEventListener('keydown', function(e) {
  if (e.key === 'Enter') document.getElementById('directorConfirm').click();
  if (e.key === 'Escape') hideDirectorModal();
});

// 初始化：檢查是否已登入
(function checkLogin() {
  var teacher = getCurrentTeacher();
  if (teacher && (TEACHERS.includes(teacher) || teacher === DIRECTOR_NAME)) {
    setCurrentTeacher(teacher);
  } else {
    showLoginOverlay();
  }
})();

// --- Tab 切換 ---
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const target = btn.dataset.tab;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + target).classList.add('active');

    if (target === 'records') loadRecentRecords();
    if (target === 'students') loadStudentList();
    if (target === 'pairing') loadPairingList();
    if (target === 'tools') checkServerStatus();
  });
});

// --- 工具函式 ---
function showMessage(elementId, text, type) {
  const el = document.getElementById(elementId);
  if (!el) return;
  el.textContent = text;
  el.className = 'message ' + (type || 'success');
  setTimeout(() => { el.textContent = ''; el.className = 'message'; }, 5000);
}

// --- 載入學生下拉選單 ---
async function loadStudentDropdown() {
  try {
    const res = await fetch('/api/students');
    const data = await res.json();
    const select = document.getElementById('studentName');
    while (select.options.length > 1) select.remove(1);
    if (data.students && data.students.length > 0) {
      data.students.forEach(function(s) {
        const opt = document.createElement('option');
        opt.value = s.studentName;
        opt.textContent = s.grade ? s.studentName + '（' + s.grade + '）' : s.studentName;
        opt.dataset.lineId = s.lineUserId || '';
        select.appendChild(opt);
      });
      document.getElementById('studentHint').textContent = '共 ' + data.students.length + ' 位學生';
    } else {
      document.getElementById('studentHint').textContent = '尚無學生資料，請先至「學生管理」新增';
    }
  } catch (e) {
    document.getElementById('studentHint').textContent = '無法載入學生列表';
  }
}

document.getElementById('studentName').addEventListener('change', function() {
  const selected = this.options[this.selectedIndex];
  const lineId = selected ? selected.dataset.lineId : '';
  const hint = document.getElementById('studentHint');
  if (!this.value) {
    hint.textContent = '';
    hint.style.color = '';
  } else if (!lineId) {
    hint.textContent = '⚠️ 尚未設定家長 LINE ID，無法發送通知';
    hint.style.color = '#e67e22';
  } else {
    hint.textContent = '✅ 已設定 LINE ID，可發送通知';
    hint.style.color = '#27ae60';
  }
});

// --- 單筆記錄作業 ---
document.getElementById('homeworkForm').addEventListener('submit', async function(e) {
  e.preventDefault();
  const btn = e.target.querySelector('button[type=submit]');
  btn.disabled = true;
  btn.textContent = '處理中...';

  const payload = {
    studentName: document.getElementById('studentName').value,
    homeworkItem: document.getElementById('homeworkItem').value,
    completedTime: document.getElementById('completedTime').value || null,
    operator: document.getElementById('operator').value,
    notes: document.getElementById('notes').value,
  };

  try {
    const res = await fetch('/api/homework', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (data.success) {
      showMessage('formMessage', '✅ ' + data.message, 'success');
      document.getElementById('homeworkItem').value = '';
      document.getElementById('notes').value = '';
    } else {
      showMessage('formMessage', '❌ ' + (data.error || '發生錯誤'), 'error');
    }
  } catch (err) {
    showMessage('formMessage', '❌ 網路錯誤：' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<span class="btn-icon">✓</span> 記錄並發送通知';
  }
});

// --- 批量記錄 ---
document.getElementById('batchSubmit').addEventListener('click', async function() {
  const raw = document.getElementById('batchInput').value.trim();
  if (!raw) { showMessage('batchMessage', '請先輸入資料', 'error'); return; }

  const lines = raw.split('\n').filter(function(l) { return l.trim(); });
  const records = lines.map(function(line) {
    const parts = line.split(',').map(function(p) { return p.trim(); });
    return { studentName: parts[0] || '', homeworkItem: parts[1] || '', completedTime: parts[2] || null, operator: parts[3] || getCurrentTeacher() || '' };
  }).filter(function(r) { return r.studentName && r.homeworkItem; });

  if (records.length === 0) { showMessage('batchMessage', '格式錯誤，至少需要「學生姓名,作業項目」', 'error'); return; }

  this.disabled = true;
  showMessage('batchMessage', '處理中（' + records.length + ' 筆）...', 'info');

  try {
    const res = await fetch('/api/homework/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ records: records }),
    });
    const data = await res.json();
    if (data.success) {
      showMessage('batchMessage', '✅ ' + data.message, 'success');
      document.getElementById('batchInput').value = '';
    } else {
      showMessage('batchMessage', '❌ ' + (data.error || '發生錯誤'), 'error');
    }
  } catch (err) {
    showMessage('batchMessage', '❌ 網路錯誤：' + err.message, 'error');
  } finally {
    this.disabled = false;
  }
});

// --- 最近記錄 ---
var allRecords = [];

async function loadRecentRecords() {
  const container = document.getElementById('recentRecords');
  container.innerHTML = '<div class="loading">載入中...</div>';
  try {
    const res = await fetch('/api/recent-records?limit=50');
    const data = await res.json();
    allRecords = data.records || [];
    renderRecords(allRecords);
  } catch (e) {
    container.innerHTML = '<div class="empty">無法載入記錄</div>';
  }
}

function renderRecords(records) {
  const container = document.getElementById('recentRecords');
  if (!records || records.length === 0) {
    container.innerHTML = '<div class="empty">目前沒有作業記錄</div>';
    return;
  }
  let rows = '';
  records.forEach(function(r) {
    const statusClass = r['通知狀態'] === '已通知' ? 'badge-success' : 'badge-warning';
    rows += '<tr>' +
      '<td><strong>' + (r['學生姓名'] || '-') + '</strong></td>' +
      '<td>' + (r['作業項目'] || '-') + '</td>' +
      '<td>' + (r['完成時間'] || r['時間戳記'] || '-') + '</td>' +
      '<td>' + (r['操作人員'] || '-') + '</td>' +
      '<td><span class="badge ' + statusClass + '">' + (r['通知狀態'] || '待通知') + '</span></td>' +
      '</tr>';
  });
  container.innerHTML = '<table class="data-table"><thead><tr><th>學生</th><th>作業項目</th><th>完成時間</th><th>操作人員</th><th>通知狀態</th></tr></thead><tbody>' + rows + '</tbody></table><p class="record-count">共 ' + records.length + ' 筆記錄</p>';
}

document.getElementById('refreshRecords').addEventListener('click', loadRecentRecords);

document.getElementById('recordSearch').addEventListener('input', function() {
  const q = this.value.toLowerCase();
  if (!q) { renderRecords(allRecords); return; }
  const filtered = allRecords.filter(function(r) {
    return (r['學生姓名'] || '').toLowerCase().includes(q) || (r['作業項目'] || '').toLowerCase().includes(q);
  });
  renderRecords(filtered);
});

// --- 學生管理 ---
async function loadStudentList() {
  const container = document.getElementById('studentList');
  container.innerHTML = '<div class="loading">載入中...</div>';
  try {
    const res = await fetch('/api/students');
    const data = await res.json();
    const students = data.students || [];
    if (students.length === 0) { container.innerHTML = '<div class="empty">尚無學生資料</div>'; return; }
    let rows = '';
    students.forEach(function(s) {
      const lineBadge = s.lineUserId
        ? '<span class="badge badge-success">✅ 已設定</span>'
        : '<span class="badge badge-warning">⚠️ 未設定</span>';
      rows += '<tr><td><strong>' + s.studentName + '</strong></td><td>' + (s.grade || '-') + '</td><td>' + (s.parentName || '-') + '</td><td>' + (s.phone || '-') + '</td><td>' + lineBadge + '</td></tr>';
    });
    container.innerHTML = '<table class="data-table"><thead><tr><th>姓名</th><th>年級</th><th>家長</th><th>電話</th><th>LINE ID</th></tr></thead><tbody>' + rows + '</tbody></table><p class="record-count">共 ' + students.length + ' 位學生</p>';
  } catch (e) {
    container.innerHTML = '<div class="empty">無法載入學生名單</div>';
  }
}

document.getElementById('refreshStudents').addEventListener('click', loadStudentList);

document.getElementById('studentForm').addEventListener('submit', async function(e) {
  e.preventDefault();
  const btn = e.target.querySelector('button[type=submit]');
  btn.disabled = true;

  const payload = {
    studentName: document.getElementById('newStudentName').value.trim(),
    grade: document.getElementById('newGrade').value.trim(),
    parentName: document.getElementById('newParentName').value.trim(),
    phone: document.getElementById('newPhone').value.trim(),
    lineUserId: document.getElementById('newLineUserId').value.trim(),
    notes: document.getElementById('newNotes').value.trim(),
  };

  try {
    const res = await fetch('/api/students', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (data.success) {
      showMessage('studentFormMessage', '✅ ' + data.message, 'success');
      e.target.reset();
      loadStudentList();
      loadStudentDropdown();
    } else {
      showMessage('studentFormMessage', '❌ ' + (data.error || '發生錯誤'), 'error');
    }
  } catch (err) {
    showMessage('studentFormMessage', '❌ 網路錯誤：' + err.message, 'error');
  } finally {
    btn.disabled = false;
  }
});

// --- 家長配對 ---
async function loadPairingList() {
  const container = document.getElementById('pairingList');
  const stats = document.getElementById('pairingStats');
  container.innerHTML = '<div class="loading">載入中...</div>';

  try {
    const [pairRes, studentRes] = await Promise.all([
      fetch('/api/pending-userids'),
      fetch('/api/students'),
    ]);
    const pairData = await pairRes.json();
    const studentData = await studentRes.json();

    const userIds = pairData.userIds || [];
    const students = studentData.students || [];
    const unpaired = userIds.filter(function(u) { return (u.pairedStudents || []).length === 0; });
    const paired = userIds.filter(function(u) { return (u.pairedStudents || []).length > 0; });

    // 統計
    stats.innerHTML =
      '<div class="pairing-stats-row">' +
      '<span class="stat-item stat-warn">⚠️ 未配對：' + unpaired.length + ' 人</span>' +
      '<span class="stat-item stat-ok">✅ 已配對：' + paired.length + ' 人</span>' +
      '<span class="stat-item">共抓到：' + userIds.length + ' 個 User ID</span>' +
      '</div>';

    if (userIds.length === 0) {
      container.innerHTML = '<div class="empty">尚無家長 User ID 記錄<br><small>等家長加好友或傳訊後，User ID 會自動出現在這裡</small></div>';
      return;
    }

    // 建立學生選單選項
    var studentOpts = '<option value="">-- 選擇學生 --</option>';
    students.forEach(function(s) { studentOpts += '<option value="' + s.studentName + '">' + s.studentName + (s.grade ? '（' + s.grade + '）' : '') + '</option>'; });

    var rows = '';
    userIds.forEach(function(u, idx) {
      const pairedStudents = u.pairedStudents || [];
      const isPaired = pairedStudents.length > 0;
      const rowClass = isPaired ? 'paired-row' : 'unpaired-row';
      const timeStr = u.lastSeen ? new Date(u.lastSeen).toLocaleString('zh-TW') : '-';

      // 已配對學生的 badges（每個有獨立刪除按鈕）
      var badges = '';
      pairedStudents.forEach(function(name) {
        badges +=
          '<div class="pair-inline" style="margin-bottom:4px;">' +
          '<span class="badge badge-success">✅ ' + name + '</span>' +
          '<button class="btn btn-sm btn-danger delete-student-btn" ' +
            'data-uid="' + u.userId + '" data-student="' + name + '" ' +
            'title="移除 ' + name + ' 的配對">🗑️</button>' +
          '</div>';
      });

      // 新增孩子的下拉選單（無論是否已配對都顯示）
      var addMore =
        '<div class="pair-inline" style="margin-top:' + (isPaired ? '6px' : '0') + ';">' +
        '<select id="pairSel_' + idx + '" class="pair-select">' + studentOpts + '</select>' +
        '<button class="btn btn-sm btn-primary pair-btn" data-uid="' + u.userId + '" data-idx="' + idx + '">' +
          (isPaired ? '再加一位' : '配對') +
        '</button>' +
        '</div>';

      rows +=
        '<tr class="' + rowClass + '">' +
        '<td class="uid-cell"><code>' + u.userId + '</code></td>' +
        '<td>' + (u.lastAction || '-') + '</td>' +
        '<td class="msg-cell">' + (u.lastMessage || '-') + '</td>' +
        '<td>' + timeStr + '</td>' +
        '<td>' + badges + addMore + '</td>' +
        '</tr>';
    });

    container.innerHTML =
      '<div class="table-scroll">' +
      '<table class="data-table">' +
      '<thead><tr><th>User ID</th><th>動作</th><th>最後訊息</th><th>時間</th><th>配對狀態</th></tr></thead>' +
      '<tbody>' + rows + '</tbody>' +
      '</table></div>';

    // 綁定配對按鈕（新增 / 再加一位）
    container.querySelectorAll('.pair-btn').forEach(function(btn) {
      btn.addEventListener('click', async function() {
        const uid = this.dataset.uid;
        const idx = this.dataset.idx;
        const sel = document.getElementById('pairSel_' + idx);
        const studentName = sel ? sel.value : '';
        if (!studentName) { alert('請先選擇學生'); return; }

        this.disabled = true;
        this.textContent = '配對中...';
        try {
          const res = await fetch('/api/pair-userid', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: uid, studentName: studentName }),
          });
          const data = await res.json();
          alert(data.message || (data.success ? '✅ 配對成功！' : '❌ 失敗'));
          loadPairingList();
          loadStudentDropdown();
          loadStudentList();
        } catch (e) {
          alert('❌ 網路錯誤：' + e.message);
          this.disabled = false;
          this.textContent = '配對';
        }
      });
    });

    // 綁定單個學生刪除按鈕（精準刪除 userId + studentName）
    container.querySelectorAll('.delete-student-btn').forEach(function(btn) {
      btn.addEventListener('click', async function() {
        const uid = this.dataset.uid;
        const student = this.dataset.student;
        if (!confirm('確定要移除「' + student + '」的配對嗎？\n\nUser ID: ' + uid)) return;
        this.disabled = true;
        this.textContent = '⏳';
        try {
          const res = await fetch(
            '/api/pair-userid/' + encodeURIComponent(uid) + '/' + encodeURIComponent(student),
            { method: 'DELETE' }
          );
          const data = await res.json();
          if (data.success) {
            loadPairingList();
            loadStudentDropdown();
            loadStudentList();
          } else {
            alert('❌ 刪除失敗：' + (data.error || '未知錯誤'));
            this.disabled = false;
            this.textContent = '🗑️';
          }
        } catch (e) {
          alert('❌ 網路錯誤：' + e.message);
          this.disabled = false;
          this.textContent = '🗑️';
        }
      });
    });

  } catch (e) {
    container.innerHTML = '<div class="empty">無法載入，請確認伺服器正在執行</div>';
  }
}

document.getElementById('refreshPairing').addEventListener('click', loadPairingList);

// 手動配對表單
async function loadManualPairStudents() {
  try {
    const res = await fetch('/api/students');
    const data = await res.json();
    const sel = document.getElementById('manualStudent');
    while (sel.options.length > 1) sel.remove(1);
    (data.students || []).forEach(function(s) {
      const opt = document.createElement('option');
      opt.value = s.studentName;
      opt.textContent = s.studentName + (s.grade ? '（' + s.grade + '）' : '');
      sel.appendChild(opt);
    });
  } catch (e) {}
}

document.getElementById('manualPairForm').addEventListener('submit', async function(e) {
  e.preventDefault();
  const btn = e.target.querySelector('button[type=submit]');
  btn.disabled = true;
  const userId = document.getElementById('manualUserId').value.trim();
  const studentName = document.getElementById('manualStudent').value;
  try {
    const res = await fetch('/api/pair-userid', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, studentName }),
    });
    const data = await res.json();
    showMessage('manualPairMessage', data.message || (data.success ? '✅ 配對成功' : '❌ ' + data.error), data.success ? 'success' : 'error');
    if (data.success) {
      e.target.reset();
      loadPairingList();
      loadStudentDropdown();
      loadStudentList();
    }
  } catch (err) {
    showMessage('manualPairMessage', '❌ 網路錯誤：' + err.message, 'error');
  } finally {
    btn.disabled = false;
  }
});

// --- 發送每日摘要 ---
document.getElementById('sendSummary').addEventListener('click', async function() {
  this.disabled = true;
  showMessage('actionMessage', '發送中...', 'info');
  try {
    const res = await fetch('/api/daily-summary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const data = await res.json();
    showMessage('actionMessage', data.success ? '✅ ' + data.message : '❌ ' + (data.error || '發生錯誤'), data.success ? 'success' : 'error');
  } catch (err) {
    showMessage('actionMessage', '❌ 網路錯誤：' + err.message, 'error');
  } finally {
    this.disabled = false;
  }
});

// --- 系統資訊 ---
async function checkServerStatus() {
  try {
    const res = await fetch('/health');
    const data = await res.json();
    document.getElementById('serverStatus').innerHTML = '<span class="badge badge-success">✅ 運行中</span>';
    document.getElementById('currentTime').textContent = new Date(data.timestamp).toLocaleString('zh-TW');
  } catch (e) {
    document.getElementById('serverStatus').innerHTML = '<span class="badge badge-warning">❌ 無法連接</span>';
  }
  document.getElementById('webhookUrl').textContent = window.location.origin + '/webhook';

  // 載入 LINE Bot 資訊
  loadBotInfo();
}

async function loadBotInfo() {
  try {
    const res = await fetch('/api/bot-info');
    const d = await res.json();
    if (!d.success) return;

    // 更新 QR code（以防 ID 有變）
    document.getElementById('lineQrCode').src = d.qrCodeUrl;
    document.getElementById('lineBasicId').textContent = d.basicId;
    document.getElementById('lineAddUrl').href = d.addFriendUrl;
    document.getElementById('lineAddUrl').textContent = d.addFriendUrl.replace('https://', '') + ' ↗';

    // 帳號名稱
    document.getElementById('lineDisplayName').textContent = d.displayName || '（需 LINE API 連線取得）';

    // 追蹤人數
    if (typeof d.followersCount === 'number') {
      document.getElementById('lineFollowersCount').textContent = d.followersCount.toLocaleString() + ' 人';
    } else {
      document.getElementById('lineFollowersCount').textContent = '（需 LINE API 連線取得）';
    }

    // 頭像：固定使用本地 logo.png，不被 LINE API 覆蓋
    // (如需改回 LINE API 頭像，取消下方註解)
    // if (d.pictureUrl) {
    //   document.getElementById('lineBotPic').src = d.pictureUrl;
    // }
    document.getElementById('lineBotPic').src = '/logo.png';
    document.getElementById('lineBotAvatar').style.display = 'block';
  } catch (e) {
    // 靜默失敗，保留預設值
  }
}

// 複製帳號 ID
document.getElementById('copyLineId').addEventListener('click', function() {
  const id = document.getElementById('lineBasicId').textContent;
  navigator.clipboard.writeText(id).then(function() {
    const btn = document.getElementById('copyLineId');
    btn.textContent = '✅ 已複製！';
    setTimeout(function() { btn.textContent = '📋 複製帳號 ID'; }, 2000);
  });
});

// --- 頁面初始化 ---
(function init() {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  document.getElementById('completedTime').value = now.toISOString().slice(0, 16);
  loadStudentDropdown();
  loadManualPairStudents();
  // 頁面一開始就先載入 LINE bot 資訊（不等切換到 tools tab）
  loadBotInfo();
})();
