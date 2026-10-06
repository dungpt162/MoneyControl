/**
 * MoneyControl - Backend Google Apps Script (gắn vào file Google Sheet)
 *
 * Cấu trúc sheet:
 *  - Mỗi tháng một tab tên "YYYY-MM" (vd 2026-10), dòng 1 là tiêu đề.
 *    Cột: id | ngay_gio | loai | so_tien | danh_muc | vi | ghi_chu | tao_luc | sua_luc
 *  - Tab "Config": cột loai | ten | icon | mau | gia_tri
 *      loai = danhmuc : ten, icon, mau
 *      loai = vi      : ten, icon, mau, gia_tri = số dư đầu kỳ
 *      loai = ngansach: ten = tên danh mục, gia_tri = ngân sách tháng
 *
 * Quy ước giao dịch "chuyen" (chuyển ví):
 *  - vi       = ví nguồn (tiền đi ra)
 *  - danh_muc = ví đích  (tiền đi vào)
 *
 * Xác thực: token bí mật lưu trong Script Properties, khóa "TOKEN".
 *
 * API (mọi request đều cần token):
 *  GET  ?action=ping|getTransactions|getConfig|getBalances&token=...&month=2026-10
 *  POST body JSON (Content-Type: text/plain): { token, action, ... }
 *    addTransaction    { tx }
 *    updateTransaction { tx, oldMonth? }   (tự chuyển tab nếu đổi sang tháng khác)
 *    deleteTransaction { id, month? }
 *    updateConfig      { config }
 *    batch             { ops: [ {action, ...}, ... ] }  (dùng cho hàng đợi offline)
 */

var HEADERS = ['id', 'ngay_gio', 'loai', 'so_tien', 'danh_muc', 'vi', 'ghi_chu', 'tao_luc', 'sua_luc'];
var CONFIG_HEADERS = ['loai', 'ten', 'icon', 'mau', 'gia_tri'];
var CONFIG_SHEET = 'Config';
var MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
var TYPES = ['thu', 'chi', 'chuyen'];

// ============================================================
// Điểm vào HTTP
// ============================================================

function doGet(e) {
  var p = (e && e.parameter) || {};
  return handle_(p.action, p, p.token);
}

function doPost(e) {
  var body;
  try {
    body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return json_({ ok: false, error: { code: 'BAD_JSON', message: 'Body không phải JSON hợp lệ.' } });
  }
  return handle_(body.action, body, body.token);
}

function handle_(action, params, token) {
  try {
    if (!checkToken_(token)) {
      return json_({ ok: false, error: { code: 'UNAUTHORIZED', message: 'Sai token hoặc chưa cấu hình token.' } });
    }
    var data = dispatch_(action, params);
    return json_({ ok: true, data: data });
  } catch (err) {
    var code = err && err.code ? err.code : 'SERVER_ERROR';
    return json_({ ok: false, error: { code: code, message: String(err && err.message ? err.message : err) } });
  }
}

/** Định tuyến action. Hành động ghi được bọc trong khóa để tránh ghi trùng. */
function dispatch_(action, p) {
  switch (action) {
    case 'ping':
      return { pong: true, time: new Date().toISOString() };
    case 'getTransactions':
      return { month: p.month, transactions: getTransactions_(p.month) };
    case 'getConfig':
      return getConfig_();
    case 'getBalances':
      return getBalances_();
    case 'addTransaction':
    case 'updateTransaction':
    case 'deleteTransaction':
    case 'updateConfig':
    case 'batch':
      return withLock_(function () { return writeAction_(action, p); });
    default:
      throw err_('UNKNOWN_ACTION', 'Action không hợp lệ: ' + action);
  }
}

function writeAction_(action, p) {
  switch (action) {
    case 'addTransaction':    return addTransaction_(p.tx);
    case 'updateTransaction': return updateTransaction_(p.tx, p.oldMonth);
    case 'deleteTransaction': return deleteTransaction_(p.id, p.month);
    case 'updateConfig':      return updateConfig_(p.config);
    case 'batch':
      // Mỗi thao tác có kết quả riêng để client biết thao tác nào lỗi.
      return (p.ops || []).map(function (op) {
        try {
          return { ok: true, data: writeAction_(op.action, op) };
        } catch (e) {
          return { ok: false, error: { code: e.code || 'SERVER_ERROR', message: String(e.message || e) } };
        }
      });
    default:
      throw err_('UNKNOWN_ACTION', 'Action ghi không hợp lệ: ' + action);
  }
}

// ============================================================
// Tiện ích chung
// ============================================================

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function err_(code, message) {
  var e = new Error(message);
  e.code = code;
  return e;
}

function checkToken_(token) {
  var saved = PropertiesService.getScriptProperties().getProperty('TOKEN');
  if (!saved || typeof token !== 'string' || token.length !== saved.length) return false;
  // So sánh toàn bộ ký tự (không thoát sớm)
  var diff = 0;
  for (var i = 0; i < saved.length; i++) diff |= saved.charCodeAt(i) ^ token.charCodeAt(i);
  return diff === 0;
}

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw err_('BUSY', 'Máy chủ đang bận, hãy thử lại sau.');
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

function ss_() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

function checkMonth_(month) {
  if (typeof month !== 'string' || !MONTH_RE.test(month)) {
    throw err_('BAD_MONTH', 'Tháng phải có dạng YYYY-MM (vd 2026-10).');
  }
}

/** Lấy "YYYY-MM" từ chuỗi ISO. Dùng 7 ký tự đầu để giữ đúng tháng theo giờ địa phương của client. */
function monthOf_(iso) {
  var m = String(iso || '').substring(0, 7);
  checkMonth_(m);
  return m;
}

function isMonthSheet_(sheet) {
  return MONTH_RE.test(sheet.getName());
}

function nowIso_() {
  return new Date().toISOString();
}

// ============================================================
// Sheet tháng
// ============================================================

/** Lấy tab tháng; nếu chưa có và create=true thì tạo mới kèm dòng tiêu đề. */
function monthSheet_(month, create) {
  checkMonth_(month);
  var sheet = ss_().getSheetByName(month);
  if (!sheet && create) {
    sheet = ss_().insertSheet(month);
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold');
    sheet.setFrozenRows(1);
    // Cột văn bản thuần để Sheets không tự đổi id/ngày thành kiểu khác
    [1, 2, 3, 5, 6, 7, 8, 9].forEach(function (c) {
      sheet.getRange(2, c, sheet.getMaxRows() - 1, 1).setNumberFormat('@');
    });
    sheet.getRange(2, 4, sheet.getMaxRows() - 1, 1).setNumberFormat('0');
  }
  return sheet;
}

function rowToTx_(r) {
  return {
    id: String(r[0]),
    ngay_gio: dateToStr_(r[1]),
    loai: String(r[2]),
    so_tien: Number(r[3]),
    danh_muc: String(r[4]),
    vi: String(r[5]),
    ghi_chu: String(r[6]),
    tao_luc: dateToStr_(r[7]),
    sua_luc: dateToStr_(r[8])
  };
}

function txToRow_(t) {
  return [t.id, t.ngay_gio, t.loai, t.so_tien, t.danh_muc, t.vi, t.ghi_chu, t.tao_luc, t.sua_luc];
}

function dateToStr_(v) {
  return v instanceof Date ? v.toISOString() : String(v);
}

function normalizeTx_(tx) {
  if (!tx || typeof tx !== 'object') throw err_('BAD_TX', 'Thiếu dữ liệu giao dịch.');
  var t = {
    id: String(tx.id || ''),
    ngay_gio: String(tx.ngay_gio || ''),
    loai: String(tx.loai || ''),
    so_tien: Number(tx.so_tien),
    danh_muc: String(tx.danh_muc == null ? '' : tx.danh_muc),
    vi: String(tx.vi == null ? '' : tx.vi),
    ghi_chu: String(tx.ghi_chu == null ? '' : tx.ghi_chu),
    tao_luc: String(tx.tao_luc || nowIso_()),
    sua_luc: String(tx.sua_luc || nowIso_())
  };
  if (!t.id) throw err_('BAD_TX', 'Giao dịch thiếu id.');
  if (TYPES.indexOf(t.loai) < 0) throw err_('BAD_TX', 'loai phải là thu, chi hoặc chuyen.');
  if (!isFinite(t.so_tien) || Math.floor(t.so_tien) !== t.so_tien || t.so_tien <= 0) {
    throw err_('BAD_TX', 'so_tien phải là số nguyên dương (VND).');
  }
  if (!t.vi) throw err_('BAD_TX', 'Thiếu ví.');
  if (t.loai === 'chuyen' && !t.danh_muc) throw err_('BAD_TX', 'Chuyển ví cần ví đích (đặt trong danh_muc).');
  monthOf_(t.ngay_gio); // kiểm tra định dạng ngày
  return t;
}

/** Tìm dòng chứa id trong một tab. Trả về số dòng (1-based) hoặc 0. */
function findRow_(sheet, id) {
  var last = sheet.getLastRow();
  if (last < 2) return 0;
  var ids = sheet.getRange(2, 1, last - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === id) return i + 2;
  }
  return 0;
}

/** Tìm giao dịch theo id: ưu tiên tab gợi ý (hint), sau đó quét mọi tab tháng. */
function locate_(id, hintMonth) {
  var sheet, row;
  if (hintMonth && MONTH_RE.test(hintMonth)) {
    sheet = ss_().getSheetByName(hintMonth);
    if (sheet) {
      row = findRow_(sheet, id);
      if (row) return { sheet: sheet, row: row };
    }
  }
  var sheets = ss_().getSheets();
  for (var i = 0; i < sheets.length; i++) {
    if (!isMonthSheet_(sheets[i])) continue;
    row = findRow_(sheets[i], id);
    if (row) return { sheet: sheets[i], row: row };
  }
  return null;
}

// ============================================================
// Giao dịch
// ============================================================

function getTransactions_(month) {
  var sheet = monthSheet_(month, false); // đọc thì không tạo tab mới
  if (!sheet || sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, HEADERS.length).getValues()
    .filter(function (r) { return r[0] !== ''; })
    .map(rowToTx_);
}

/** Thêm giao dịch. Idempotent: nếu id đã tồn tại thì ghi đè (an toàn khi client gửi lại hàng đợi). */
function addTransaction_(tx) {
  var t = normalizeTx_(tx);
  var existing = locate_(t.id, monthOf_(t.ngay_gio));
  if (existing) return updateTransaction_(t, existing.sheet.getName());
  var sheet = monthSheet_(monthOf_(t.ngay_gio), true);
  sheet.appendRow(txToRow_(t));
  return { transaction: t };
}

/** Sửa giao dịch. Nếu đổi sang tháng khác: xóa ở tab cũ, thêm vào tab mới. */
function updateTransaction_(tx, oldMonth) {
  var t = normalizeTx_(tx);
  var found = locate_(t.id, oldMonth || monthOf_(t.ngay_gio));
  if (!found) throw err_('NOT_FOUND', 'Không tìm thấy giao dịch để sửa (id: ' + t.id + ').');
  var current = rowToTx_(found.sheet.getRange(found.row, 1, 1, HEADERS.length).getValues()[0]);
  t.tao_luc = current.tao_luc || t.tao_luc; // giữ nguyên thời điểm tạo
  t.sua_luc = nowIso_();
  var newMonth = monthOf_(t.ngay_gio);
  if (found.sheet.getName() === newMonth) {
    found.sheet.getRange(found.row, 1, 1, HEADERS.length).setValues([txToRow_(t)]);
  } else {
    found.sheet.deleteRow(found.row);
    monthSheet_(newMonth, true).appendRow(txToRow_(t));
  }
  return { transaction: t };
}

function deleteTransaction_(id, month) {
  if (!id) throw err_('BAD_TX', 'Thiếu id.');
  var found = locate_(String(id), month);
  // Xóa giao dịch không tồn tại coi như thành công (idempotent)
  if (found) found.sheet.deleteRow(found.row);
  return { id: String(id), deleted: !!found };
}

// ============================================================
// Config (danh mục, ví, ngân sách)
// ============================================================

function configSheet_() {
  var sheet = ss_().getSheetByName(CONFIG_SHEET);
  if (!sheet) {
    sheet = ss_().insertSheet(CONFIG_SHEET);
    sheet.getRange(1, 1, 1, CONFIG_HEADERS.length).setValues([CONFIG_HEADERS]).setFontWeight('bold');
    sheet.setFrozenRows(1);
    var defaults = [
      ['danhmuc', 'Ăn uống', '🍜', '#ef4444', ''],
      ['danhmuc', 'Đi lại', '🚌', '#3b82f6', ''],
      ['danhmuc', 'Nhà ở', '🏠', '#8b5cf6', ''],
      ['danhmuc', 'Mua sắm', '🛍️', '#ec4899', ''],
      ['danhmuc', 'Giải trí', '🎮', '#f59e0b', ''],
      ['danhmuc', 'Sức khỏe', '💊', '#10b981', ''],
      ['danhmuc', 'Lương', '💰', '#22c55e', ''],
      ['danhmuc', 'Khác', '📦', '#6b7280', ''],
      ['vi', 'Tiền mặt', '💵', '#22c55e', 0],
      ['vi', 'Ngân hàng', '🏦', '#3b82f6', 0]
    ];
    sheet.getRange(2, 1, defaults.length, CONFIG_HEADERS.length).setValues(defaults);
  }
  return sheet;
}

function getConfig_() {
  var sheet = configSheet_();
  var cfg = { categories: [], wallets: [], budgets: [] };
  if (sheet.getLastRow() < 2) return cfg;
  sheet.getRange(2, 1, sheet.getLastRow() - 1, CONFIG_HEADERS.length).getValues().forEach(function (r) {
    var kind = String(r[0]);
    if (kind === 'danhmuc') {
      cfg.categories.push({ name: String(r[1]), icon: String(r[2]), color: String(r[3]) });
    } else if (kind === 'vi') {
      cfg.wallets.push({ name: String(r[1]), icon: String(r[2]), color: String(r[3]), opening: Number(r[4]) || 0 });
    } else if (kind === 'ngansach') {
      cfg.budgets.push({ category: String(r[1]), amount: Number(r[4]) || 0 });
    }
  });
  return cfg;
}

/** Ghi đè toàn bộ Config bằng dữ liệu client gửi lên. */
function updateConfig_(config) {
  if (!config || typeof config !== 'object') throw err_('BAD_CONFIG', 'Thiếu dữ liệu config.');
  var rows = [];
  (config.categories || []).forEach(function (c) {
    if (!c.name) throw err_('BAD_CONFIG', 'Danh mục thiếu tên.');
    rows.push(['danhmuc', c.name, c.icon || '', c.color || '', '']);
  });
  (config.wallets || []).forEach(function (w) {
    if (!w.name) throw err_('BAD_CONFIG', 'Ví thiếu tên.');
    rows.push(['vi', w.name, w.icon || '', w.color || '', Math.round(Number(w.opening) || 0)]);
  });
  (config.budgets || []).forEach(function (b) {
    if (!b.category) throw err_('BAD_CONFIG', 'Ngân sách thiếu tên danh mục.');
    rows.push(['ngansach', b.category, '', '', Math.round(Number(b.amount) || 0)]);
  });
  var sheet = configSheet_();
  if (sheet.getLastRow() > 1) sheet.getRange(2, 1, sheet.getLastRow() - 1, CONFIG_HEADERS.length).clearContent();
  if (rows.length) sheet.getRange(2, 1, rows.length, CONFIG_HEADERS.length).setValues(rows);
  return getConfig_();
}

// ============================================================
// Số dư ví = số dư đầu kỳ + mọi giao dịch qua các tab tháng
// ============================================================

function getBalances_() {
  var balances = {};
  getConfig_().wallets.forEach(function (w) { balances[w.name] = w.opening; });
  ss_().getSheets().forEach(function (sheet) {
    if (!isMonthSheet_(sheet) || sheet.getLastRow() < 2) return;
    sheet.getRange(2, 1, sheet.getLastRow() - 1, HEADERS.length).getValues().forEach(function (r) {
      if (r[0] === '') return;
      var t = rowToTx_(r);
      if (t.loai === 'thu') add_(balances, t.vi, t.so_tien);
      else if (t.loai === 'chi') add_(balances, t.vi, -t.so_tien);
      else if (t.loai === 'chuyen') {
        add_(balances, t.vi, -t.so_tien);
        add_(balances, t.danh_muc, t.so_tien);
      }
    });
  });
  return { balances: balances };
}

function add_(obj, key, amount) {
  obj[key] = (obj[key] || 0) + amount;
}

// ============================================================
// Chạy tay trong trình soạn thảo (không phải API)
// ============================================================

/** Chạy một lần: tạo tab Config (kèm dữ liệu mẫu) và tab của tháng hiện tại. */
function setup() {
  configSheet_();
  var m = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM');
  monthSheet_(m, true);
  Logger.log('Đã tạo tab Config và tab ' + m + '. Token đã đặt: ' +
    !!PropertiesService.getScriptProperties().getProperty('TOKEN'));
}
