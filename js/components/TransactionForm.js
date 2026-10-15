// Form thêm/sửa giao dịch dạng bottom sheet. Thiết kế để nhập nhanh: mở là gõ số tiền ngay.
import { ref, computed, watch, onMounted } from '../../vendor/vue.esm-browser.prod.js';
import { store } from '../store.js';
import { saveTransaction, deleteTransaction, blankTx, refreshConfig, getAllLocal } from '../data.js';
import { parseQuickAmount, formatVND, uuid, toLocalIso, toInputValue, fromInputValue } from '../utils.js';

const LAST_WALLET_KEY = 'mc_last_wallet';

export default {
  name: 'TransactionForm',
  props: {
    tx: { type: Object, default: null },            // null = thêm mới
    initialType: { type: String, default: 'chi' },  // loại mặc định khi thêm mới
  },
  emits: ['close'],
  setup(props, { emit }) {
    const editing = !!props.tx;
    const base = props.tx ? { ...props.tx } : { ...blankTx(uuid()), loai: props.initialType };

    // Ví mặc định: ví dùng gần nhất, nếu không còn thì ví đầu tiên
    const lastWallet = localStorage.getItem(LAST_WALLET_KEY);
    const walletNames = store.config.wallets.map((w) => w.name);
    const defaultWallet = walletNames.includes(lastWallet) ? lastWallet : walletNames[0] || '';

    const loai = ref(base.loai);
    const amountText = ref(base.so_tien ? String(base.so_tien) : '');
    const category = ref(base.danh_muc);       // với "chuyen": ví đích
    const wallet = ref(base.vi || defaultWallet);
    const when = ref(toInputValue(base.ngay_gio));
    const note = ref(base.ghi_chu);
    const error = ref('');
    const amountEl = ref(null);

    const amount = computed(() => parseQuickAmount(amountText.value));
    const preview = computed(() => {
      if (!amountText.value.trim()) return 'Gõ nhanh: 45 (=45k), 50k, 1tr2, 30+15';
      return amount.value ? '= ' + formatVND(amount.value) : 'Số tiền chưa hợp lệ';
    });

    // Khi đổi loại giao dịch, danh mục/ví đích cũ không còn ý nghĩa
    function setType(t) {
      if (t === loai.value) return;
      loai.value = t;
      category.value = '';
    }

    async function save() {
      error.value = '';
      const v = amount.value;
      if (!v || v <= 0) { error.value = 'Hãy nhập số tiền hợp lệ.'; return; }
      if (!wallet.value) {
        error.value = store.loadError || 'Chưa có ví. Hãy kết nối ở Cài đặt, hoặc thêm ví trong tab Config của Sheet.';
        return;
      }
      if (!category.value) {
        error.value = loai.value === 'chuyen' ? 'Hãy chọn ví đích.' : 'Hãy chọn danh mục.';
        return;
      }
      if (loai.value === 'chuyen' && category.value === wallet.value) {
        error.value = 'Ví đích phải khác ví nguồn.';
        return;
      }
      if (!when.value) { error.value = 'Hãy chọn ngày giờ.'; return; }

      const now = toLocalIso();
      const tx = {
        id: base.id,
        ngay_gio: fromInputValue(when.value),
        loai: loai.value,
        so_tien: v,
        danh_muc: category.value,
        vi: wallet.value,
        ghi_chu: note.value.trim(),
        tao_luc: base.tao_luc,
        sua_luc: now,
      };
      localStorage.setItem(LAST_WALLET_KEY, wallet.value);
      await saveTransaction(tx, editing ? props.tx : null);
      emit('close');
    }

    async function remove() {
      if (!confirm('Xóa giao dịch này?')) return;
      await deleteTransaction(props.tx);
      emit('close');
    }

    // Gợi ý giao dịch hay dùng: gom theo (loại, danh mục, ví, ghi chú) trong 90 ngày gần nhất
    const suggestions = ref([]);
    async function loadSuggestions() {
      const since = toLocalIso(new Date(Date.now() - 90 * 86400000)).substring(0, 10);
      const groups = new Map();
      for (const t of await getAllLocal()) {   // đã sắp xếp mới -> cũ
        if (t.loai === 'chuyen' || t.ngay_gio.substring(0, 10) < since) continue;
        const key = [t.loai, t.danh_muc, t.vi, t.ghi_chu.trim().toLowerCase()].join('|');
        const g = groups.get(key);
        if (g) g.count++;
        else groups.set(key, { key, loai: t.loai, danh_muc: t.danh_muc, vi: t.vi, ghi_chu: t.ghi_chu.trim(), so_tien: t.so_tien, count: 1 });
      }
      const cats = store.config.categories, wallets = store.config.wallets.map((w) => w.name);
      suggestions.value = [...groups.values()]
        .filter((g) => g.count >= 2 && cats.some((c) => c.name === g.danh_muc) && wallets.includes(g.vi))
        .sort((a, b) => b.count - a.count)
        .slice(0, 6);
    }
    const iconOfCat = (name) => (store.config.categories.find((c) => c.name === name) || {}).icon || '📦';
    function applySuggestion(g) {
      loai.value = g.loai;
      category.value = g.danh_muc;
      wallet.value = g.vi;
      note.value = g.ghi_chu;
      amountText.value = String(g.so_tien);
      // Chọn sẵn số tiền để gõ đè ngay
      setTimeout(() => { if (amountEl.value) { amountEl.value.focus(); amountEl.value.select(); } });
    }

    // Chưa có ví (config chưa tải về): tải lại ngay và tự chọn ví mặc định khi có
    const noWallets = computed(() => !store.config.wallets.length);
    const reloading = ref(false);
    async function reloadConfig() {
      reloading.value = true;
      await refreshConfig();
      reloading.value = false;
    }
    watch(() => store.config.wallets.length, () => {
      const names = store.config.wallets.map((w) => w.name);
      if (!names.includes(wallet.value)) wallet.value = names.includes(lastWallet) ? lastWallet : names[0] || '';
    });

    onMounted(() => {
      if (!editing && amountEl.value) amountEl.value.focus();
      if (noWallets.value) reloadConfig();
      if (!editing) loadSuggestions();
    });

    return { store, suggestions, iconOfCat, applySuggestion, formatVND, noWallets, reloading, reloadConfig, editing, loai, amountText, category, wallet, when, note, error, amountEl, preview, setType, save, remove };
  },
  template: `
    <div class="sheet-backdrop" @click.self="$emit('close')">
      <form class="sheet" @submit.prevent="save">
        <div class="sheet-head">
          <strong>{{ editing ? 'Sửa giao dịch' : 'Thêm giao dịch' }}</strong>
          <button type="button" class="btn" @click="$emit('close')">Đóng</button>
        </div>

        <div v-if="noWallets" class="result err" style="margin:0 0 12px">
          {{ reloading ? 'Đang tải danh sách ví...' : (store.loadError || 'Chưa có ví nào. Kiểm tra tab Config trong Sheet hoặc phần Cài đặt.') }}
          <button type="button" class="btn" style="margin-top:8px" :disabled="reloading" @click="reloadConfig">Tải lại</button>
        </div>

        <div v-if="suggestions.length && !editing" class="field">
          <span>Hay dùng</span>
          <div class="chips">
            <button type="button" v-for="g in suggestions" :key="g.key" class="chip quick" @click="applySuggestion(g)">
              {{ iconOfCat(g.danh_muc) }} {{ g.ghi_chu || g.danh_muc }} <small>{{ formatVND(g.so_tien) }}</small>
            </button>
          </div>
        </div>

        <div class="seg">
          <button type="button" :class="{ on: loai === 'chi' }" @click="setType('chi')">Chi</button>
          <button type="button" :class="{ on: loai === 'thu' }" @click="setType('thu')">Thu</button>
          <button type="button" :class="{ on: loai === 'chuyen' }" @click="setType('chuyen')">Chuyển ví</button>
        </div>

        <label class="field">
          <span>Số tiền</span>
          <input ref="amountEl" class="input amount" v-model="amountText" type="text"
                 inputmode="text" enterkeyhint="done" autocomplete="off" placeholder="0">
          <p class="hint">{{ preview }}</p>
        </label>

        <div class="field" v-if="loai !== 'chuyen'">
          <span>Danh mục</span>
          <div class="chips">
            <button type="button" v-for="c in store.config.categories" :key="c.name" class="chip"
                    :class="{ on: category === c.name }" :style="{ '--c': c.color || '#6b7280' }"
                    @click="category = c.name">{{ c.icon }} {{ c.name }}</button>
          </div>
        </div>

        <label class="field">
          <span>{{ loai === 'chuyen' ? 'Từ ví' : 'Ví' }}</span>
          <select class="input" v-model="wallet">
            <option v-for="w in store.config.wallets" :key="w.name" :value="w.name">{{ w.icon }} {{ w.name }}</option>
          </select>
        </label>

        <label class="field" v-if="loai === 'chuyen'">
          <span>Đến ví</span>
          <select class="input" v-model="category">
            <option value="" disabled>Chọn ví đích</option>
            <option v-for="w in store.config.wallets" :key="w.name" :value="w.name">{{ w.icon }} {{ w.name }}</option>
          </select>
        </label>

        <label class="field">
          <span>Ngày giờ</span>
          <input class="input" type="datetime-local" v-model="when">
        </label>

        <label class="field">
          <span>Ghi chú</span>
          <input class="input" type="text" v-model="note" autocomplete="off" placeholder="Không bắt buộc">
        </label>

        <div v-if="error" class="result err">{{ error }}</div>

        <div class="row" style="margin-top:12px">
          <button v-if="editing" type="button" class="btn danger" @click="remove">Xóa</button>
          <button type="submit" class="btn primary">Lưu</button>
        </div>
      </form>
    </div>`,
};
