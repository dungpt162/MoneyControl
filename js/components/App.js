// Khung ứng dụng: sidebar (máy tính) / thanh tab dưới (điện thoại), header, vùng nội dung. Không dùng router.
import { computed, onMounted, onBeforeUnmount } from '../../vendor/vue.esm-browser.prod.js';
import { store, showToast, saveSettings } from '../store.js';
import { syncNow, setMonth } from '../data.js';
import { formatVND, shiftMonth } from '../utils.js';
import DashboardView from './DashboardView.js';
import TransactionsView from './TransactionsView.js';
import ReportView from './ReportView.js';
import BudgetView from './BudgetView.js';
import WalletsView from './WalletsView.js';
import SettingsView from './SettingsView.js';

// short = nhãn ngắn cho thanh tab điện thoại; label = nhãn đầy đủ cho sidebar
const TABS = [
  { id: 'dashboard', label: 'Tổng quan', short: 'Tổng quan', icon: '🏠', title: 'Tổng quan' },
  { id: 'transactions', label: 'Giao dịch', short: 'Giao dịch', icon: '🧾', title: 'Giao dịch' },
  { id: 'report', label: 'Báo cáo', short: 'Báo cáo', icon: '📊', title: 'Báo cáo tháng' },
  { id: 'budget', label: 'Ngân sách', short: 'Ngân sách', icon: '🎯', title: 'Ngân sách' },
  { id: 'wallets', label: 'Ví & danh mục', short: 'Ví', icon: '👛', title: 'Ví & danh mục' },
  { id: 'settings', label: 'Cài đặt', short: 'Cài đặt', icon: '⚙️', title: 'Cài đặt' },
];
const MONTH_TABS = ['dashboard', 'transactions', 'report', 'budget'];

export default {
  name: 'App',
  components: { DashboardView, TransactionsView, ReportView, BudgetView, WalletsView, SettingsView },
  setup() {
    const views = {
      dashboard: 'DashboardView', transactions: 'TransactionsView', report: 'ReportView',
      budget: 'BudgetView', wallets: 'WalletsView', settings: 'SettingsView',
    };
    // Nhãn trạng thái: ngoại tuyến > đồng bộ (đã đồng bộ / đang chờ / đang gửi / lỗi)
    const status = computed(() => {
      const s = store.sync;
      if (!store.online) return { text: 'Ngoại tuyến' + (s.pending ? ` · chờ ${s.pending}` : ''), cls: 'offline' };
      if (s.state === 'syncing') return { text: 'Đang đồng bộ...', cls: '' };
      if (s.state === 'error') return { text: 'Lỗi đồng bộ' + (s.pending ? ` · chờ ${s.pending}` : ''), cls: 'error' };
      if (s.state === 'pending') return { text: `Đang chờ · ${s.pending}`, cls: 'offline' };
      return { text: 'Đã đồng bộ', cls: 'ok' };
    });
    // Bấm vào nhãn: thử đồng bộ lại; nếu đang lỗi thì hiện nguyên nhân
    function onStatusClick() {
      if (store.sync.error) showToast(store.sync.error, 4000);
      syncNow();
    }

    // Nút đổi nhanh giao diện: theo hệ thống -> sáng -> tối
    const THEMES = { auto: ['light', '🌓', 'Theo hệ thống'], light: ['dark', '☀️', 'Sáng'], dark: ['auto', '🌙', 'Tối'] };
    const themeInfo = computed(() => THEMES[store.settings.theme] || THEMES.auto);
    const cycleTheme = () => saveSettings({ theme: themeInfo.value[0] });

    const busy = computed(() => store.loading || store.sync.state === 'syncing');
    const current = computed(() => TABS.find((t) => t.id === store.tab));
    const name = computed(() => (store.settings.name || '').trim());
    const avatar = computed(() => (name.value[0] || '₫').toUpperCase());

    // Chọn tháng ở header (hiện trên máy tính cho các màn hình theo tháng)
    const showMonth = computed(() => MONTH_TABS.includes(store.tab));
    const monthText = computed(() => { const [y, m] = store.month.split('-'); return `Tháng ${Number(m)}, ${y}`; });
    const shift = (d) => setMonth(shiftMonth(store.month, d));
    function onPick(e) { if (/^\d{4}-\d{2}$/.test(e.target.value)) setMonth(e.target.value); }
    function openPicker(e) { try { e.target.showPicker(); } catch (err) { /* trình duyệt không hỗ trợ */ } }

    // Tổng số dư hiển thị ở sidebar
    const totalBalance = computed(() => store.config.wallets
      .reduce((s, w) => s + (w.name in store.balances ? store.balances[w.name] : w.opening || 0), 0));

    // Phím tắt (khi không đang gõ và không có hộp thoại): 1-6 chuyển màn hình; Esc đóng hộp thoại
    function onKey(e) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const modal = document.querySelector('.sheet-backdrop');
      if (e.key === 'Escape' && modal) { modal.click(); return; }
      if (modal || ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
      const i = Number(e.key);
      if (i >= 1 && i <= TABS.length) store.tab = TABS[i - 1].id;
    }
    onMounted(() => document.addEventListener('keydown', onKey));
    onBeforeUnmount(() => document.removeEventListener('keydown', onKey));

    return {
      store, TABS, views, status, onStatusClick, themeInfo, cycleTheme, busy, current, name, avatar,
      showMonth, monthText, shift, onPick, openPicker, totalBalance, formatVND,
    };
  },
  template: `
    <div class="app">
      <header class="app-header">
        <div class="head-title">
          <h1 v-if="store.tab === 'dashboard'">Xin chào{{ name ? ', ' + name : '' }} 👋</h1>
          <h1 v-else>{{ current.title }}</h1>
          <p v-if="store.tab === 'dashboard'" class="sub">Cùng xem lại tình hình chi tiêu của bạn trong tháng này nhé!</p>
        </div>
        <div class="head-actions">
          <div v-if="showMonth" class="mpick">
            <button class="mp-btn" @click="shift(-1)" aria-label="Tháng trước">‹</button>
            <label class="mp-label">📅 {{ monthText }}
              <input type="month" :value="store.month" @change="onPick" @click="openPicker" aria-label="Chọn tháng">
            </label>
            <button class="mp-btn" @click="shift(1)" aria-label="Tháng sau">›</button>
          </div>
          <button class="icon-btn" :title="'Giao diện: ' + themeInfo[2]" @click="cycleTheme">{{ themeInfo[1] }}</button>
          <button class="badge" :class="status.cls" @click="onStatusClick">{{ status.text }}</button>
          <button class="avatar" title="Cài đặt" @click="store.tab = 'settings'">{{ avatar }}</button>
        </div>
        <div v-if="busy" class="loadbar"></div>
      </header>
      <main class="app-main">
        <div class="page" :key="store.tab"><component :is="views[store.tab]" /></div>
      </main>
      <nav class="tabbar">
        <div class="brand">
          <span class="logo">₫</span>
          <span><b>MoneyControl</b><small>Quản lý tài chính cá nhân</small></span>
        </div>
        <div class="menu">
          <button v-for="t in TABS" :key="t.id" class="tab" :class="{ active: store.tab === t.id }"
                  @click="store.tab = t.id">
            <span class="ico">{{ t.icon }}</span>
            <span class="l-short">{{ t.short }}</span><span class="l-long">{{ t.label }}</span>
          </button>
        </div>
        <div class="side-foot">
          <div class="side-card">
            <small>Tổng số dư</small>
            <b>{{ formatVND(totalBalance) }}</b>
          </div>
          <div class="shortcuts">
            <kbd>1</kbd>–<kbd>6</kbd> chuyển màn hình<br>
            <kbd>N</kbd> thêm giao dịch · <kbd>Esc</kbd> đóng
          </div>
        </div>
      </nav>
      <div v-if="store.toast" class="toast">{{ store.toast }}</div>
    </div>`,
};
