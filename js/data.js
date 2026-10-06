// Tầng dữ liệu: kết hợp IndexedDB (hiện ngay) + Apps Script (đồng bộ nền).
// Quy trình ghi: cập nhật IndexedDB -> đưa thao tác vào hàng đợi -> hiện ngay -> gửi nền.
import { store, showToast } from './store.js';
import { api } from './api.js';
import { flushQueue, refreshSync } from './sync.js';
import * as db from './db.js';
import { toLocalIso, shiftMonth } from './utils.js';

const configured = () => !!(store.settings.url && store.settings.token);
const CONFIG_KEY = '__config'; // txId giả đánh dấu thao tác updateConfig trong hàng đợi

/** Đọc giao dịch tháng đang xem từ IndexedDB vào state. */
async function reloadLocal() {
  const list = await db.getTxByMonth(store.month);
  list.sort((a, b) => (a.ngay_gio < b.ngay_gio ? 1 : a.ngay_gio > b.ngay_gio ? -1 : 0));
  store.txs = list;
}

/** Khởi động: hiện dữ liệu cục bộ ngay, sau đó đồng bộ với Sheet. */
export async function initData() {
  window.addEventListener('online', () => syncNow());
  // Quay lại app (mở lại từ nền) -> đồng bộ; còn thao tác chờ gửi -> thử lại mỗi 30 giây
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') syncNow(); });
  setInterval(() => { if (store.sync.pending > 0 && store.online) syncNow(); }, 30000);
  try {
    const cached = await db.getMeta('config');
    if (cached) store.config = cached;
    store.balances = (await db.getMeta('balances')) || {};
    await reloadLocal();
    await refreshSync();
  } catch (e) {
    // IndexedDB không dùng được (vd chế độ riêng tư): vẫn tiếp tục để tải config từ Sheet
    console.warn('Không đọc được IndexedDB', e);
  }
  syncNow();
}

/** Gửi hàng đợi rồi tải lại config và tháng đang xem từ Sheet. */
export async function syncNow() {
  if (!configured() || !store.online) return refreshSync();
  await flushQueue();
  await Promise.all([refreshConfig(), loadMonth(), refreshBalances()]);
}

export async function refreshConfig() {
  const hasWallets = store.config.wallets.length > 0;
  if (!configured()) { if (!hasWallets) store.loadError = 'Chưa nhập URL Apps Script hoặc token. Hãy vào Cài đặt.'; return; }
  if (!store.online) { if (!hasWallets) store.loadError = 'Đang ngoại tuyến và chưa có danh sách ví lưu trên máy.'; return; }
  try {
    // Có thay đổi config chưa gửi lên thì giữ bản trên máy, đừng ghi đè bằng bản cũ từ server
    if ((await db.getQueue()).some((i) => i.txId === CONFIG_KEY)) return;
    const cfg = await api.getConfig();
    store.loadError = '';
    store.config = cfg;
    await db.setMeta('config', JSON.parse(JSON.stringify(cfg)));
  } catch (e) {
    store.loadError = e.message;
  }
}

/** Số dư từng ví do server tính (số dư đầu kỳ + mọi giao dịch qua các tab tháng). */
export async function refreshBalances() {
  if (!configured() || !store.online) return;
  try {
    const { balances } = await api.getBalances();
    store.balances = balances;
    await db.setMeta('balances', JSON.parse(JSON.stringify(balances)));
  } catch (e) {
    console.warn('Không tải được số dư', e);
  }
}

/** Lưu config (ví, danh mục, ngân sách): cập nhật ngay trên máy, gửi nền qua hàng đợi. */
export async function saveConfig(config) {
  store.config = config;
  await db.setMeta('config', JSON.parse(JSON.stringify(config)));
  await db.enqueue(CONFIG_KEY, { action: 'updateConfig', config: JSON.parse(JSON.stringify(config)) });
  await afterWrite();
}

/**
 * Xóa bản sao giao dịch trên máy và tải lại từ Sheet (khi nghi ngờ dữ liệu lệch).
 * Chỉ làm khi không còn thay đổi chờ gửi, tránh mất dữ liệu chưa đồng bộ.
 */
export async function resetLocal() {
  if (store.sync.pending > 0) throw new Error(`Còn ${store.sync.pending} thay đổi chưa gửi lên Sheet. Hãy đồng bộ xong trước.`);
  if (!store.online) throw new Error('Cần có mạng để tải lại dữ liệu.');
  await db.clearTx();
  await reloadLocal();
  await syncNow();
}

/** Đổi tháng đang xem. */
export async function setMonth(month) {
  store.month = month;
  await reloadLocal();
  await loadMonth();
}

const fetchedAt = {}; // thời điểm tải gần nhất của từng tháng (để không tải lại liên tục)

/** Tải một tháng từ Sheet và gộp vào IndexedDB (giữ các thay đổi chưa đồng bộ). */
async function fetchMonth(month) {
  const { transactions } = await api.getTransactions(month);
  const pending = new Set((await db.getQueue()).map((i) => i.txId));
  await db.replaceMonth(month, transactions, pending);
  fetchedAt[month] = Date.now();
}

/**
 * Thống kê thu/chi của n tháng kết thúc ở endMonth cho trang Tổng quan.
 * Hiện ngay số liệu đã có trên máy, rồi tải các tháng còn thiếu/cũ (2 phút) từ Sheet song song.
 */
export async function loadHistory(endMonth = store.month, n = 6) {
  const months = Array.from({ length: n }, (_, i) => shiftMonth(endMonth, i - (n - 1)));
  const compute = async () => {
    const next = { ...store.history };
    for (const m of months) {
      let thu = 0, chi = 0;
      for (const t of await db.getTxByMonth(m)) {
        if (t.loai === 'thu') thu += t.so_tien;
        else if (t.loai === 'chi') chi += t.so_tien;
      }
      next[m] = { thu, chi };
    }
    store.history = next;
  };
  try {
    await compute();
    if (!configured() || !store.online) return;
    const stale = months.filter((m) => m !== store.month && !(fetchedAt[m] > Date.now() - 120000));
    if (!stale.length) return;
    await Promise.all(stale.map((m) => fetchMonth(m).catch(() => {})));
    await compute();
  } catch (e) {
    console.warn('Không tải được thống kê các tháng', e);
  }
}

/** Tải tháng đang xem từ Sheet và gộp vào dữ liệu cục bộ (giữ các thay đổi chưa đồng bộ). */
export async function loadMonth() {
  const month = store.month;
  store.loadError = '';
  if (!configured() || !store.online) return;
  store.loading = true;
  try {
    await fetchMonth(month);
    if (store.month === month) await reloadLocal();
    store.sync.last = Date.now();
  } catch (e) {
    store.loadError = e.message;
  } finally {
    store.loading = false;
  }
}

/** Sau khi ghi: hiện ngay, rồi gửi nền và tải lại kết quả từ server. */
async function afterWrite() {
  await reloadLocal();
  await refreshSync();
  if (!configured()) {
    showToast('Đã lưu trên máy. Hãy nhập URL và token trong Cài đặt để đồng bộ.', 4000);
    return;
  }
  flushQueue().then((sent) => { if (sent) Promise.all([loadMonth(), refreshBalances(), refreshConfig()]); });
}

/**
 * Thêm hoặc sửa giao dịch.
 * @param tx    giao dịch mới (đủ trường theo Sheet)
 * @param oldTx giao dịch trước khi sửa (null nếu thêm mới); dùng để biết tab tháng cũ khi đổi ngày
 */
export async function saveTransaction(tx, oldTx = null) {
  await db.putTx(tx);
  const op = oldTx
    ? { action: 'updateTransaction', tx, oldMonth: oldTx.ngay_gio.substring(0, 7) }
    : { action: 'addTransaction', tx };
  await db.enqueue(tx.id, op);
  await afterWrite();
}

export async function deleteTransaction(tx) {
  await db.deleteTx(tx.id);
  await db.enqueue(tx.id, { action: 'deleteTransaction', id: tx.id, month: tx.ngay_gio.substring(0, 7) });
  await afterWrite();
}

/** Tạo giao dịch trống với mặc định hợp lý (ngày giờ hiện tại). */
export function blankTx(id) {
  const now = toLocalIso();
  return { id, ngay_gio: now, loai: 'chi', so_tien: 0, danh_muc: '', vi: '', ghi_chu: '', tao_luc: now, sua_luc: now };
}
