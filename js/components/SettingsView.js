// Màn hình Cài đặt: URL Apps Script, token, giao diện sáng/tối, kiểm tra kết nối.
import { ref, computed } from '../../vendor/vue.esm-browser.prod.js';
import { store, saveSettings, showToast } from '../store.js';
import { api } from '../api.js';
import { syncNow, resetLocal } from '../data.js';

export default {
  name: 'SettingsView',
  setup() {
    // Bản nháp để người dùng sửa; chỉ ghi vào store khi bấm Lưu
    const url = ref(store.settings.url);
    const token = ref(store.settings.token);
    const showToken = ref(false);
    const testing = ref(false);
    const result = ref(null); // { ok, text }

    function save() {
      saveSettings({ url: url.value.trim(), token: token.value.trim() });
      showToast('Đã lưu cài đặt');
    }

    function setTheme(e) {
      saveSettings({ theme: e.target.value });
    }

    async function test() {
      save();
      result.value = null;
      if (!/^https:\/\/script\.google\.com\/.+\/exec$/.test(store.settings.url)) {
        result.value = { ok: false, text: 'URL chưa đúng dạng https://script.google.com/macros/s/.../exec' };
        return;
      }
      testing.value = true;
      try {
        await api.ping();
        const cfg = await api.getConfig();
        result.value = {
          ok: true,
          text: `Kết nối thành công.\nĐọc được ${cfg.categories.length} danh mục và ${cfg.wallets.length} ví từ tab Config.`,
        };
        syncNow(); // nạp config và giao dịch về máy, gửi hàng đợi đang chờ (nếu có)
      } catch (e) {
        result.value = { ok: false, text: e.message };
      } finally {
        testing.value = false;
      }
    }

    // ----- Đồng bộ -----
    const syncText = computed(() => {
      const s = store.sync;
      if (!store.online) return 'Ngoại tuyến';
      return { synced: 'Đã đồng bộ', pending: 'Đang chờ gửi', syncing: 'Đang đồng bộ...', error: 'Lỗi đồng bộ' }[s.state] || s.state;
    });
    const lastText = computed(() => (store.sync.last ? new Date(store.sync.last).toLocaleString('vi-VN') : 'Chưa có'));
    const syncing = ref(false);
    async function syncClick() {
      syncing.value = true;
      await syncNow();
      syncing.value = false;
      showToast(store.sync.error || 'Đã đồng bộ xong');
    }
    async function reset() {
      if (!confirm('Xóa dữ liệu giao dịch trên máy và tải lại từ Google Sheet?')) return;
      try {
        await resetLocal();
        showToast('Đã tải lại dữ liệu từ Sheet');
      } catch (e) {
        showToast(e.message, 4000);
      }
    }

    // ----- Ứng dụng: cài lên màn hình chính, phiên bản đang chạy -----
    const version = ref('');
    caches.keys().then((ks) => { version.value = (ks.find((k) => k.startsWith('moneycontrol-')) || '').replace('moneycontrol-', ''); }).catch(() => {});
    async function install() {
      const e = store.installEvent;
      if (!e) return;
      e.prompt();
      await e.userChoice;
      store.installEvent = null;
    }

    return { store, saveSettings, url, token, showToken, testing, result, save, setTheme, test,
      syncText, lastText, syncing, syncClick, reset, version, install };
  },
  template: `
    <div class="grid2">
      <section class="card">
        <h2>Kết nối Google Sheets</h2>
        <label class="field">
          <span>URL Apps Script (Web app)</span>
          <input class="input" type="url" v-model="url" inputmode="url" autocomplete="off"
                 placeholder="https://script.google.com/macros/s/.../exec">
        </label>
        <label class="field">
          <span>Token</span>
          <div class="row">
            <input class="input" :type="showToken ? 'text' : 'password'" v-model="token" autocomplete="off">
            <button class="btn" style="flex:none" type="button" @click="showToken = !showToken">
              {{ showToken ? 'Ẩn' : 'Hiện' }}
            </button>
          </div>
          <p class="hint">Giống giá trị TOKEN trong Script Properties. Chỉ lưu trên thiết bị này.</p>
        </label>
        <div class="row">
          <button class="btn" @click="save">Lưu</button>
          <button class="btn primary" :disabled="testing" @click="test">
            {{ testing ? 'Đang kiểm tra...' : 'Lưu & kiểm tra kết nối' }}
          </button>
        </div>
        <div v-if="result" class="result" :class="result.ok ? 'ok' : 'err'">{{ result.text }}</div>
      </section>

      <section class="card">
        <h2>Đồng bộ</h2>
        <div class="kv"><span>Trạng thái</span><b>{{ syncText }}</b></div>
        <div class="kv"><span>Thay đổi chờ gửi</span><b>{{ store.sync.pending }}</b></div>
        <div class="kv"><span>Lần đồng bộ gần nhất</span><b>{{ lastText }}</b></div>
        <div v-if="store.sync.error" class="result err">{{ store.sync.error }}</div>
        <div class="row" style="margin-top:12px">
          <button class="btn primary" :disabled="syncing" @click="syncClick">{{ syncing ? 'Đang đồng bộ...' : 'Đồng bộ ngay' }}</button>
          <button class="btn" @click="reset">Tải lại từ Sheet</button>
        </div>
      </section>

      <section class="card">
        <h2>Giao diện</h2>
        <label class="field">
          <span>Tên hiển thị (lời chào ở trang Tổng quan)</span>
          <input class="input" :value="store.settings.name" @input="saveSettings({ name: $event.target.value })" maxlength="30" autocomplete="off" placeholder="vd Dũng">
        </label>
        <select class="input" :value="store.settings.theme" @change="setTheme">
          <option value="auto">Theo hệ thống</option>
          <option value="light">Sáng</option>
          <option value="dark">Tối</option>
        </select>
      </section>

      <section class="card">
        <h2>Ứng dụng</h2>
        <button v-if="store.installEvent" class="btn primary" style="width:100%;margin-bottom:12px" @click="install">Cài app lên màn hình chính</button>
        <div class="kv"><span>Phiên bản</span><b>{{ version || '...' }}</b></div>
      </section>
    </div>`,
};
