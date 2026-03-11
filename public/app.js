// =========================================
// 作業完成通知系統 - 前端 JavaScript
// =========================================

// =========================================
// 老師 icon 圓形填充排列（每次刷新隨機）
// =========================================
function initRandomCircleLayout() {
  var container = document.querySelector('.teacher-buttons');
  if (!container) return;
  var wrappers = Array.from(container.querySelectorAll('.btn-wrapper'));
  if (!wrappers.length) return;

  var C = 300;          // 容器邊長 px
  var masterR = 138;    // 主圓半徑 px
  var cx = C / 2, cy = C / 2;
  var baseSize = 76;    // 基礎 icon 大小 px

  // 為每個 icon 隨機大小（±30%）
  var sizes = wrappers.map(function() {
    return Math.round(baseSize * (0.70 + Math.random() * 0.60));
  });

  // 圓形填充：拒絕採樣，找到不超出主圓且與已放置 icon 重疊最少的位置
  var placed = [];
  wrappers.forEach(function(wrapper, i) {
    var r = sizes[i] / 2;
    var bestX = 0, bestY = 0, bestScore = Infinity;

    for (var attempt = 0; attempt < 500; attempt++) {
      // 均勻隨機點在主圓內（√rand 讓分布均勻）
      var angle = Math.random() * Math.PI * 2;
      var maxDist = Math.max(0, masterR - r);
      var dist = Math.sqrt(Math.random()) * maxDist;
      var tx = Math.cos(angle) * dist;
      var ty = Math.sin(angle) * dist;

      // 計算與已放置 icon 的重疊程度（允許最多 20% 重疊以求填滿）
      var score = 0;
      placed.forEach(function(p) {
        var d = Math.sqrt((tx - p.x) * (tx - p.x) + (ty - p.y) * (ty - p.y));
        var minD = (r + p.r) * 0.80;
        if (d < minD) score += (minD - d);
      });

      if (score < bestScore) {
        bestScore = score;
        bestX = tx; bestY = ty;
        if (score === 0) break;
      }
    }

    placed.push({ x: bestX, y: bestY, r: r });

    // 套用位置與大小（inline style 覆蓋 CSS）
    var size = sizes[i];
    wrapper.style.position = 'absolute';
    wrapper.style.top    = (cy + bestY - r) + 'px';
    wrapper.style.left   = (cx + bestX - r) + 'px';
    wrapper.style.width  = size + 'px';
    wrapper.style.height = size + 'px';
    wrapper.style.margin = '0';
    wrapper.style.transform = 'none';
    wrapper.style.visibility = 'visible';

    var btn = wrapper.querySelector('.teacher-btn');
    if (btn) {
      btn.style.width  = size + 'px';
      btn.style.height = size + 'px';
      var emoji = btn.querySelector('.btn-emoji');
      var name  = btn.querySelector('.btn-name');
      if (emoji) emoji.style.fontSize = Math.round(size * 0.38) + 'px';
      if (name)  name.style.fontSize  = Math.round(size * 0.135) + 'px';
    }
  });
}

document.addEventListener('DOMContentLoaded', initRandomCircleLayout);

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

// --- 照片上傳 ---
var pendingPhotoUrl = '';

(function setupPhotoUpload() {
  var area = document.getElementById('photoUploadArea');
  var input = document.getElementById('photoInput');
  var placeholder = document.getElementById('photoPlaceholder');
  var preview = document.getElementById('photoPreview');
  var thumb = document.getElementById('photoThumb');
  var removeBtn = document.getElementById('photoRemove');
  var status = document.getElementById('photoStatus');

  if (!area) return;

  // 點擊上傳區域觸發 file input
  area.addEventListener('click', function(e) {
    if (e.target === removeBtn || removeBtn.contains(e.target)) return;
    input.click();
  });

  // 選擇檔案後轉 base64 並預覽
  input.addEventListener('change', async function() {
    var file = this.files[0];
    if (!file) return;

    // 大小限制 10MB
    if (file.size > 10 * 1024 * 1024) {
      status.textContent = '❌ 照片超過 10MB，請選擇較小的照片';
      status.className = 'photo-status error';
      input.value = '';
      return;
    }

    placeholder.style.display = 'none';
    preview.style.display = 'flex';
    status.textContent = '📷 ' + file.name + ' 已選取，提交時自動上傳';
    status.className = 'photo-status info';
    pendingPhotoUrl = '';

    if (isHeicFile(file)) {
      // HEIC 無法在 <img> 顯示，用占位圖示代替
      thumb.src = '';
      thumb.style.display = 'none';
      thumb.insertAdjacentHTML('afterend', '<div id="heicPlaceholder" style="font-size:3rem;text-align:center;padding:16px">📷<br><small style="font-size:0.7rem;color:#888">HEIC 格式（上傳後可在 Drive 檢視）</small></div>');
    } else {
      // JPEG / PNG：正常預覽
      document.getElementById('heicPlaceholder') && document.getElementById('heicPlaceholder').remove();
      thumb.style.display = '';
      var reader = new FileReader();
      reader.onload = function(evt) { thumb.src = evt.target.result; };
      reader.readAsDataURL(file);
    }
  });

  // 移除照片
  removeBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    input.value = '';
    thumb.src = '';
    thumb.style.display = '';
    var hp = document.getElementById('heicPlaceholder');
    if (hp) hp.remove();
    placeholder.style.display = 'flex';
    preview.style.display = 'none';
    status.textContent = '';
    status.className = 'photo-status';
    pendingPhotoUrl = '';
  });
})();

async function uploadPendingPhoto() {
  var input = document.getElementById('photoInput');
  var status = document.getElementById('photoStatus');
  var file = input && input.files[0];
  if (!file) return '';

  status.textContent = '⏳ 上傳照片中...';
  status.className = 'photo-status info';

  try {
    // 讀取 base64（HEIC 用 ArrayBuffer 轉 base64；其他用 dataURL 切片）
    var base64 = await new Promise(function(resolve, reject) {
      var reader = new FileReader();
      if (isHeicFile(file)) {
        reader.onload = function(e) {
          var bytes = new Uint8Array(e.target.result);
          var bin = '';
          bytes.forEach(function(b) { bin += String.fromCharCode(b); });
          resolve(btoa(bin));
        };
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
      } else {
        reader.onload = function(e) { resolve(e.target.result.split(',')[1]); };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      }
    });

    var res = await fetch('/api/upload-photo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ base64: base64, mimeType: file.type, fileName: file.name }),
    });
    var data = await res.json();
    if (data.success && data.viewUrl) {
      status.textContent = '✅ 照片上傳成功';
      status.className = 'photo-status success';
      return data.viewUrl;
    } else {
      status.textContent = '⚠️ 照片上傳失敗，將跳過照片';
      status.className = 'photo-status error';
      return '';
    }
  } catch (e) {
    status.textContent = '⚠️ 照片上傳失敗（' + e.message + '），將跳過照片';
    status.className = 'photo-status error';
    return '';
  }
}

// --- 單筆記錄作業 ---
document.getElementById('homeworkForm').addEventListener('submit', async function(e) {
  e.preventDefault();
  const btn = e.target.querySelector('button[type=submit]');
  btn.disabled = true;
  btn.textContent = '處理中...';

  // 先上傳照片（若有）
  var photoUrl = '';
  var photoInput = document.getElementById('photoInput');
  if (photoInput && photoInput.files && photoInput.files[0]) {
    photoUrl = await uploadPendingPhoto();
  }

  const payload = {
    studentName: document.getElementById('studentName').value,
    homeworkItem: document.getElementById('homeworkItem').value,
    completedTime: document.getElementById('completedTime').value || null,
    operator: document.getElementById('operator').value,
    notes: document.getElementById('notes').value,
    photoUrl: photoUrl || '',
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
      // 清除照片
      document.getElementById('photoInput').value = '';
      var t = document.getElementById('photoThumb');
      t.src = ''; t.style.display = '';
      var hp = document.getElementById('heicPlaceholder');
      if (hp) hp.remove();
      document.getElementById('photoPlaceholder').style.display = 'flex';
      document.getElementById('photoPreview').style.display = 'none';
      document.getElementById('photoStatus').textContent = '';
      pendingPhotoUrl = '';
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

// =========================================
// 批量照片上傳
// =========================================
var batchPhotoFiles = []; // { file, studentName, homeworkItem }
var batchStudentList = []; // 從 API 取得的學生名單（供比對）

// 載入批量照片的學生清單（從已載入的 dropdown 取）
function getBatchStudentOptions(selected) {
  var sel = document.getElementById('studentName');
  var opts = '<option value="">-- 選擇學生 --</option>';
  for (var i = 1; i < sel.options.length; i++) {
    var name = sel.options[i].value;
    var checked = name === selected ? ' selected' : '';
    opts += '<option value="' + name + '"' + checked + '>' + name + '</option>';
  }
  return opts;
}

// 從檔名推測學生名字（嘗試在已知學生名單中找最長符合）
function guessStudentFromFilename(filename) {
  var sel = document.getElementById('studentName');
  var names = [];
  for (var i = 1; i < sel.options.length; i++) {
    names.push(sel.options[i].value);
  }
  // 找出在檔名中出現的學生名（取最長的那個）
  var matched = names.filter(function(n) { return filename.includes(n); });
  matched.sort(function(a, b) { return b.length - a.length; }); // 最長優先
  return matched[0] || '';
}

function renderBatchPhotoTable() {
  var tbody = document.getElementById('batchPhotoTbody');
  var list = document.getElementById('batchPhotoList');
  if (!batchPhotoFiles.length) { list.style.display = 'none'; return; }
  list.style.display = 'block';

  tbody.innerHTML = batchPhotoFiles.map(function(item, idx) {
    // HEIC 無法在瀏覽器預覽，顯示占位符
    var thumbHtml = item.isHeic
      ? '<div style="width:60px;height:60px;border-radius:6px;background:#f0f0f0;display:flex;align-items:center;justify-content:center;font-size:1.6rem;">📷</div>'
      : '<img src="' + (item.preview || '') + '" style="width:60px;height:60px;object-fit:cover;border-radius:6px;">';
    return '<tr id="batchRow_' + idx + '">' +
      '<td>' + thumbHtml + '</td>' +
      '<td style="font-size:0.82rem;word-break:break-all">' + item.file.name + '</td>' +
      '<td><select class="batch-student-sel" data-idx="' + idx + '">' + getBatchStudentOptions(item.studentName) + '</select></td>' +
      '<td><input type="text" class="batch-hw-input" data-idx="' + idx + '" value="' + (item.homeworkItem || '') + '" placeholder="作業項目（選填）" style="width:130px"></td>' +
      '<td><button type="button" class="btn btn-sm btn-danger batch-remove-btn" data-idx="' + idx + '">✕</button></td>' +
      '</tr>';
  }).join('');

  // 綁定事件
  tbody.querySelectorAll('.batch-student-sel').forEach(function(sel) {
    sel.addEventListener('change', function() {
      batchPhotoFiles[parseInt(this.dataset.idx)].studentName = this.value;
    });
  });
  tbody.querySelectorAll('.batch-hw-input').forEach(function(inp) {
    inp.addEventListener('input', function() {
      batchPhotoFiles[parseInt(this.dataset.idx)].homeworkItem = this.value;
    });
  });
  tbody.querySelectorAll('.batch-remove-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      batchPhotoFiles.splice(parseInt(this.dataset.idx), 1);
      renderBatchPhotoTable();
    });
  });
}

document.getElementById('batchPhotoSelectBtn').addEventListener('click', function() {
  document.getElementById('batchPhotoInput').click();
});

// 判斷是否為 HEIC/HEIF 格式
function isHeicFile(file) {
  var t = (file.type || '').toLowerCase();
  var n = (file.name || '').toLowerCase();
  return t === 'image/heic' || t === 'image/heif' ||
    n.endsWith('.heic') || n.endsWith('.heif');
}

document.getElementById('batchPhotoInput').addEventListener('change', async function() {
  var files = Array.from(this.files);
  if (!files.length) return;

  // 讀取每個檔案的預覽 + 推測學生名
  var newItems = await Promise.all(files.map(function(file) {
    return new Promise(function(resolve) {
      if (isHeicFile(file)) {
        // HEIC/HEIF：瀏覽器無法顯示預覽，改讀 binary base64 供上傳用
        var binReader = new FileReader();
        binReader.onload = function(e) {
          var raw = e.target.result; // ArrayBuffer
          var bytes = new Uint8Array(raw);
          var bin = '';
          bytes.forEach(function(b) { bin += String.fromCharCode(b); });
          var b64 = btoa(bin);
          resolve({
            file: file,
            preview: '',           // 無法預覽
            rawBase64: b64,        // 供上傳用
            isHeic: true,
            studentName: guessStudentFromFilename(file.name),
            homeworkItem: '',
            status: 'pending',
          });
        };
        binReader.readAsArrayBuffer(file);
      } else {
        // JPEG / PNG 等：正常讀 dataURL
        var reader = new FileReader();
        reader.onload = function(e) {
          resolve({
            file: file,
            preview: e.target.result,
            rawBase64: null,
            isHeic: false,
            studentName: guessStudentFromFilename(file.name),
            homeworkItem: '',
            status: 'pending',
          });
        };
        reader.readAsDataURL(file);
      }
    });
  }));

  batchPhotoFiles = batchPhotoFiles.concat(newItems);
  renderBatchPhotoTable();
  this.value = ''; // 允許重複選同一檔案
});

document.getElementById('batchPhotoClear').addEventListener('click', function() {
  batchPhotoFiles = [];
  renderBatchPhotoTable();
  document.getElementById('batchPhotoMessage').textContent = '';
});

document.getElementById('batchPhotoSubmit').addEventListener('click', async function() {
  if (!batchPhotoFiles.length) return;

  var operator = document.getElementById('operator').value || getCurrentTeacher() || '系統';
  var btn = this;
  btn.disabled = true;

  var msgEl = document.getElementById('batchPhotoMessage');
  var successCount = 0;
  var errors = []; // 收集每筆錯誤

  for (var i = 0; i < batchPhotoFiles.length; i++) {
    var item = batchPhotoFiles[i];
    if (!item.studentName) {
      msgEl.textContent = '⚠️ 第 ' + (i+1) + ' 張照片尚未選擇學生，請確認後再提交';
      msgEl.className = 'message error';
      btn.disabled = false;
      return;
    }
    msgEl.textContent = '⏳ 處理第 ' + (i+1) + '/' + batchPhotoFiles.length + ' 張（' + item.studentName + '）...';
    msgEl.className = 'message info';

    try {
      // 1. 上傳照片到 Drive（HEIC 用檔案原始 base64；其他格式從 preview 取）
      var base64, mimeType;
      if (item.rawBase64) {
        // HEIC/HEIF：從 FileReader 直接讀取的 binary base64
        base64 = item.rawBase64;
        mimeType = item.file.type || 'image/heic';
      } else {
        base64 = item.preview.split(',')[1];
        mimeType = item.file.type || 'image/jpeg';
      }

      var uploadErr = '';
      var photoUrl = '';
      var uploadRes = await fetch('/api/upload-photo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base64: base64, mimeType: mimeType, fileName: item.file.name }),
      });
      var uploadData = await uploadRes.json();
      if (uploadData.success && uploadData.viewUrl) {
        photoUrl = uploadData.viewUrl;
      } else {
        uploadErr = uploadData.error || '照片上傳失敗';
        console.warn('[batch-photo] Drive 上傳失敗（' + item.studentName + '）:', uploadErr);
      }

      // 2. 記錄作業（即使 Drive 上傳失敗，仍嘗試記錄作業）
      var hwItem = item.homeworkItem || '作業照片';
      var hwRes = await fetch('/api/homework', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentName: item.studentName,
          homeworkItem: hwItem,
          operator: operator,
          photoUrl: photoUrl,
        }),
      });
      var hwData = await hwRes.json();
      if (hwData.success) {
        successCount++;
        if (uploadErr) {
          errors.push('⚠️ ' + item.studentName + '：作業記錄成功，但照片未上傳（' + uploadErr + '）');
        }
      } else {
        var hwErr = hwData.error || '作業記錄失敗';
        errors.push('❌ ' + item.studentName + '：' + hwErr + (uploadErr ? '；照片：' + uploadErr : ''));
      }
    } catch (e) {
      errors.push('❌ ' + item.studentName + '：' + e.message);
    }
  }

  // 顯示結果
  if (errors.length === 0) {
    msgEl.textContent = '✅ 完成！' + successCount + ' 筆全部成功';
    msgEl.className = 'message success';
  } else {
    var errText = successCount + ' 筆成功，' + errors.length + ' 筆有問題：\n' + errors.join('\n');
    msgEl.textContent = errText;
    msgEl.className = 'message error';
    msgEl.style.whiteSpace = 'pre-wrap';
  }

  batchPhotoFiles = [];
  renderBatchPhotoTable();
  btn.disabled = false;
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

// --- 學期升級 ---
document.getElementById('incrementGradeBtn').addEventListener('click', async function() {
  if (!confirm('確定要執行學期升級嗎？\n\n所有學生年級將 +1（1→2, 2→3...），12年級學生將標記為「畢業」。\n\n此操作會直接修改 Google Sheets，請確認後再執行。')) return;
  this.disabled = true;
  showMessage('actionMessage', '⏳ 年級升級中...', 'info');
  try {
    var res = await fetch('/api/students/increment-grade', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
    var data = await res.json();
    showMessage('actionMessage', data.success ? '✅ ' + data.message : '❌ ' + (data.error || '發生錯誤'), data.success ? 'success' : 'error');
  } catch (err) {
    showMessage('actionMessage', '❌ 網路錯誤：' + err.message, 'error');
  } finally {
    this.disabled = false;
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
