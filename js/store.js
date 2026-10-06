// State dùng chung cho toàn app (Vue reactive), không cần Pinia/Vuex.
import { reactive } from '../vendor/vue.esm-browser.prod.js';
import { monthKey } from './utils.js';

const SETTINGS_KEY = 'mc_settings';

function loadSettings() {
  const defaults = { url: '', token: '', theme: 'auto', name: '' };
  try {
    return { ...defaults, ...(JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}) };
  } catch (e) {
    return defaults;
  }
}

export const store = reactive({
  // URL Apps Script + token + giao diện: lưu trong thiết bị (localStorage), không nằm trong code
  settings: loadSettings(),
  tab: 'dashboard',      // màn hình đang mở
  history: {},           // thống kê thu/chi theo tháng { 'YYYY-MM': { thu, chi } } cho trang Tổng quan
  online: navigator.onLine,
  toast: '',             // thông báo ngắn ở cuối màn hình

  month: monthKey(),     // tháng đang xem "YYYY-MM"
  txs: [],               // giao dịch của tháng đang xem (đã sắp xếp mới -> cũ)
  config: { categories: [], wallets: [], budgets: [] },
  balances: {},          // số dư từng ví { tênVí: số } do server tính, có cache trên máy
  loading: false,
  loadError: '',         // lỗi khi tải dữ liệu từ Sheet (không chặn xem dữ liệu cục bộ)
  // Trạng thái đồng bộ: synced | pending | syncing | error
  // ids = id các giao dịch còn thao tác chờ gửi; last = lần đồng bộ thành công gần nhất (ms)
  sync: { state: 'synced', pending: 0, error: '', ids: [], last: 0 },
  installEvent: null,    // sự kiện beforeinstallprompt để hiện nút "Cài app"
});

/** Lưu cài đặt xuống thiết bị và áp dụng giao diện. */
export function saveSettings(patch) {
  Object.assign(store.settings, patch);
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(store.settings));
  applyTheme();
}

/** auto = theo hệ thống (bỏ thuộc tính data-theme để CSS media query quyết định). */
export function applyTheme() {
  const t = store.settings.theme;
  const root = document.documentElement;
  if (t === 'light' || t === 'dark') root.setAttribute('data-theme', t);
  else root.removeAttribute('data-theme');
}

let toastTimer;
export function showToast(msg, ms = 2500) {
  store.toast = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { store.toast = ''; }, ms);
}
