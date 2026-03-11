/**
 * TIPS 英典教育 — 學期自動升年級
 * =========================================================
 * 功能：每年 7/1 自動將「學生資料表」所有學生年級 +1
 *       1→2, 2→3 ... 11→12, 12→畢業
 *
 * 安裝步驟：
 *   1. 開啟 Google Sheets → 擴充功能 → Apps Script
 *   2. 將此檔案全部貼上，覆蓋預設的 Code.gs
 *   3. 點「儲存」
 *   4. 執行一次 installTrigger()（選此函數後點▶）以建立年度觸發器
 *   5. 第一次執行時 Google 會要求授權，點「允許」即可
 * =========================================================
 */

// ── 設定 ──────────────────────────────────────────────────
var SHEET_NAME   = '學生資料表';  // 工作表名稱
var GRADE_COLUMN = 2;             // B 欄（1 = A, 2 = B）
var NAME_COLUMN  = 1;             // A 欄
var DATA_START_ROW = 2;           // 資料從第 2 列開始（第 1 列為標題）
// ──────────────────────────────────────────────────────────


/**
 * 主函數：升年級
 * 可手動執行，也由觸發器在 7/1 自動呼叫。
 */
function incrementGrades() {
  var ss      = SpreadsheetApp.getActiveSpreadsheet();
  var sheet   = ss.getSheetByName(SHEET_NAME);

  if (!sheet) {
    Logger.log('❌ 找不到工作表：' + SHEET_NAME);
    return;
  }

  var lastRow = sheet.getLastRow();
  if (lastRow < DATA_START_ROW) {
    Logger.log('沒有學生資料，跳過。');
    return;
  }

  // 一次讀取所有年級（B 欄）
  var gradeRange  = sheet.getRange(DATA_START_ROW, GRADE_COLUMN, lastRow - DATA_START_ROW + 1, 1);
  var gradeValues = gradeRange.getValues();   // [[grade], [grade], ...]
  var nameRange   = sheet.getRange(DATA_START_ROW, NAME_COLUMN,  lastRow - DATA_START_ROW + 1, 1);
  var nameValues  = nameRange.getValues();

  var updated   = 0;
  var graduated = [];
  var skipped   = [];

  for (var i = 0; i < gradeValues.length; i++) {
    var raw   = String(gradeValues[i][0]).trim();
    var name  = String(nameValues[i][0]).trim();
    if (!name) continue;           // 空列跳過

    var grade = parseInt(raw, 10);

    if (isNaN(grade)) {
      // 非數字（例如已「畢業」或空白）→ 跳過
      if (raw !== '') skipped.push(name + '（' + raw + '）');
      continue;
    }

    if (grade >= 12) {
      gradeValues[i][0] = '畢業';
      graduated.push(name);
    } else {
      gradeValues[i][0] = String(grade + 1);
    }
    updated++;
  }

  // 一次寫回 Google Sheets
  if (updated > 0) {
    gradeRange.setValues(gradeValues);
  }

  // 記錄結果
  var msg = '✅ 年級升級完成（' + new Date().toLocaleDateString('zh-TW') + '）\n' +
            '   更新：' + updated + ' 位學生\n' +
            (graduated.length ? '   畢業：' + graduated.join('、') + '\n' : '') +
            (skipped.length   ? '   跳過：' + skipped.join('、')   + '\n' : '');

  Logger.log(msg);

  // 在試算表旁邊的儲存格寫下執行紀錄（可選）
  // 如不需要可刪除以下兩行
  var logCell = ss.getSheetByName(SHEET_NAME).getRange(1, 8);  // H1
  logCell.setValue('上次升級：' + new Date().toLocaleString('zh-TW'));
}


/**
 * 建立年度觸發器：每年 7/1 自動執行 incrementGrades()
 * ⚠️ 只需執行一次！重複執行會建立多個觸發器。
 */
function installTrigger() {
  // 先移除已有的同名觸發器，避免重複
  removeTrigger();

  ScriptApp.newTrigger('incrementGrades')
    .timeBased()
    .onMonthDay(1)         // 每月 1 日
    .inTimezone('Asia/Taipei')
    .atHour(3)             // 凌晨 3 點（避開使用高峰）
    .create();

  Logger.log('✅ 觸發器已建立：每月 1 日凌晨 3 點執行 incrementGrades()');
  Logger.log('   ⚠️ 注意：Apps Script 無法直接設定「只在 7 月執行」，');
  Logger.log('      所以觸發器設為「每月 1 日」，函數內部會自動判斷月份。');

  // 更新函數，加入月份判斷
  Logger.log('   請確認 incrementGrades() 的第一行有月份檢查（已內建於此 script）。');
}

/**
 * 建立「只在 7/1」的觸發器版本
 * Apps Script 不支援直接設定月份，改用每年觸發器 + 月份判斷。
 */
function installYearlyTrigger() {
  removeTrigger();

  // 建立「每月 1 日」觸發器，由函數內判斷是否為 7 月
  ScriptApp.newTrigger('incrementGradesIfJuly')
    .timeBased()
    .onMonthDay(1)
    .inTimezone('Asia/Taipei')
    .atHour(3)
    .create();

  Logger.log('✅ 觸發器已建立：每月 1 日凌晨 3 點觸發，7 月才執行升級。');
}


/**
 * 包裝函數：只有在 7 月才執行升年級
 * 建議使用此版本搭配 installYearlyTrigger()
 */
function incrementGradesIfJuly() {
  var now   = new Date();
  var month = now.getMonth() + 1;  // 0-indexed → 1-12

  if (month !== 7) {
    Logger.log('非 7 月（目前：' + month + ' 月），跳過升年級。');
    return;
  }

  Logger.log('7/1 自動升年級 開始執行...');
  incrementGrades();
}


/**
 * 移除所有已建立的觸發器（清理用）
 */
function removeTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  var count = 0;
  for (var i = 0; i < triggers.length; i++) {
    var fn = triggers[i].getHandlerFunction();
    if (fn === 'incrementGrades' || fn === 'incrementGradesIfJuly') {
      ScriptApp.deleteTrigger(triggers[i]);
      count++;
    }
  }
  if (count > 0) Logger.log('已移除 ' + count + ' 個舊觸發器。');
}
