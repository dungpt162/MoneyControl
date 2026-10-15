// Màn hình Giao dịch: chọn tháng, tìm kiếm/lọc, danh sách theo ngày, nút thêm.
import { ref, computed, watch, onMounted, onBeforeUnmount } from '../../vendor/vue.esm-browser.prod.js';
import { store } from '../store.js';
import { setMonth, loadMonth, getAllLocal, loadAllMonths } from '../data.js';
import { formatVND, monthLabel, shiftMonth, dayLabel, timeOf } from '../utils.js';
import TransactionForm from './TransactionForm.js';
import DueRecurring from './DueRecurring.js';

const PAGE = 300; // số giao dịch hiển thị mỗi lần (tìm xuyên tháng có thể rất nhiều)

export default {
  name: 'TransactionsView',
  components: { TransactionForm, DueRecurring },
  setup() {
    const keyword = ref('');
    const fCategory = ref('');
    const fWallet = ref('');
    const formOpen = ref(false);
    const editingTx = ref(null);
    const newType = ref('chi');
    const limit = ref(PAGE);

    // Tìm trong mọi tháng: lấy bản sao trên máy, đồng thời tải các tháng còn thiếu từ Sheet
    const allMode = ref(false);
    const allTxs = ref([]);
    const allLoading = ref(false);
    const refreshAll = async () => { allTxs.value = await getAllLocal(); };
    watch(allMode, async (on) => {
      if (!on) return;
      await refreshAll();
      allLoading.value = true;
      try { await loadAllMonths(); } catch (e) { store.loadError = e.message; }
      await refreshAll();
      allLoading.value = false;
    });
    watch(() => store.txs, () => { if (allMode.value) refreshAll(); });   // sau khi thêm/sửa/xóa
    watch([keyword, fCategory, fWallet, allMode], () => { limit.value = PAGE; });
    const source = computed(() => (allMode.value ? allTxs.value : store.txs));

    const norm = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');

    // Lọc theo từ khóa (ghi chú, danh mục, ví, số tiền), danh mục, ví
    const filtered = computed(() => {
      const k = norm(keyword.value.trim());
      return source.value.filter((t) => {
        if (fCategory.value && t.danh_muc !== fCategory.value) return false;
        if (fWallet.value && t.vi !== fWallet.value && !(t.loai === 'chuyen' && t.danh_muc === fWallet.value)) return false;
        if (!k) return true;
        return norm(`${t.ghi_chu} ${t.danh_muc} ${t.vi} ${t.so_tien}`).includes(k);
      });
    });

    // Gom theo ngày (danh sách đã sắp xếp mới -> cũ)
    const groups = computed(() => {
      const map = new Map();
      for (const t of filtered.value.slice(0, limit.value)) {
        const key = t.ngay_gio.substring(0, 10);
        if (!map.has(key)) map.set(key, { key, label: dayLabel(t.ngay_gio, allMode.value), items: [], thu: 0, chi: 0 });
        const g = map.get(key);
        g.items.push(t);
        if (t.loai === 'thu') g.thu += t.so_tien;
        else if (t.loai === 'chi') g.chi += t.so_tien;
      }
      return [...map.values()];
    });

    const totals = computed(() => {
      let thu = 0, chi = 0;
      for (const t of filtered.value) {
        if (t.loai === 'thu') thu += t.so_tien;
        else if (t.loai === 'chi') chi += t.so_tien;
      }
      return { thu, chi, diff: thu - chi };
    });

    const catOf = (name) => store.config.categories.find((c) => c.name === name);
    const iconOf = (t) => (t.loai === 'chuyen' ? '🔁' : (catOf(t.danh_muc) || {}).icon || '📦');
    const colorOf = (t) => (t.loai === 'chuyen' ? '#6b7280' : (catOf(t.danh_muc) || {}).color || '#6b7280');
    const titleOf = (t) => (t.loai === 'chuyen' ? `${t.vi} → ${t.danh_muc}` : t.danh_muc);
    // ⏳ = giao dịch còn thay đổi chưa gửi lên Sheet
    const pendingIds = computed(() => new Set(store.sync.ids));
    const subOf = (t) => [pendingIds.value.has(t.id) ? '⏳' : '', timeOf(t.ngay_gio), t.loai === 'chuyen' ? '' : t.vi, t.ghi_chu].filter(Boolean).join(' · ');
    const amountText = (t) => (t.loai === 'thu' ? '+' : t.loai === 'chi' ? '-' : '') + formatVND(t.so_tien);

    const openNew = () => { editingTx.value = null; newType.value = 'chi'; formOpen.value = true; };
    const openEdit = (t) => { editingTx.value = t; formOpen.value = true; };
    const closeForm = () => { formOpen.value = false; };

    // Phím tắt N: thêm giao dịch mới (khi không đang gõ và không có hộp thoại)
    function onKey(e) {
      if (e.key.toLowerCase() !== 'n' || e.ctrlKey || e.metaKey || e.altKey) return;
      if (formOpen.value || document.querySelector('.sheet-backdrop')) return;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
      e.preventDefault();
      openNew();
    }
    onMounted(() => {
      document.addEventListener('keydown', onKey);
      // Mở từ phím tắt trên màn hình chính (?add=chi|thu)
      if (store.addRequest) {
        editingTx.value = null; newType.value = store.addRequest; formOpen.value = true;
        store.addRequest = '';
      }
    });
    onBeforeUnmount(() => document.removeEventListener('keydown', onKey));

    return {
      store, keyword, fCategory, fWallet, formOpen, editingTx, newType, filtered, groups, totals,
      allMode, allLoading, limit, PAGE,
      formatVND, monthLabel, setMonth, loadMonth, shiftMonth,
      iconOf, colorOf, titleOf, subOf, amountText, openNew, openEdit, closeForm,
    };
  },
  template: `
    <div>
      <div class="monthbar">
        <button class="btn m-nav" @click="setMonth(shiftMonth(store.month, -1))" aria-label="Tháng trước">‹</button>
        <strong class="m-nav">{{ monthLabel(store.month) }}</strong>
        <button class="btn m-nav" @click="setMonth(shiftMonth(store.month, 1))" aria-label="Tháng sau">›</button>
        <button class="btn" @click="loadMonth" :disabled="store.loading" aria-label="Tải lại">⟳</button>
        <button class="btn primary desk-only" @click="openNew">＋ Thêm giao dịch <kbd>N</kbd></button>
      </div>

      <div class="tx-layout">
      <aside class="tx-side">
      <div class="summary card">
        <div><small>Thu</small><b class="inc">{{ formatVND(totals.thu) }}</b></div>
        <div><small>Chi</small><b class="exp">{{ formatVND(totals.chi) }}</b></div>
        <div><small>Chênh lệch</small><b :class="totals.diff >= 0 ? 'inc' : 'exp'">{{ formatVND(totals.diff) }}</b></div>
      </div>

      <div class="filters">
      <label class="check"><input type="checkbox" v-model="allMode"> Tìm trong tất cả các tháng</label>
      <input class="input" type="search" v-model="keyword" placeholder="Tìm theo ghi chú, danh mục, số tiền...">
      <div class="row">
        <select class="input" v-model="fCategory">
          <option value="">Mọi danh mục</option>
          <option v-for="c in store.config.categories" :key="c.name" :value="c.name">{{ c.icon }} {{ c.name }}</option>
        </select>
        <select class="input" v-model="fWallet">
          <option value="">Mọi ví</option>
          <option v-for="w in store.config.wallets" :key="w.name" :value="w.name">{{ w.icon }} {{ w.name }}</option>
        </select>
      </div>
      </div>
      </aside>

      <div class="tx-list">
      <DueRecurring />
      <div v-if="store.loadError" class="result err" style="margin-bottom:12px">{{ store.loadError }}</div>
      <div v-if="allMode" class="hint" style="margin:0 0 8px">
        {{ allLoading ? 'Đang tải các tháng từ Sheet...' : 'Đang xem tất cả các tháng' }} · {{ filtered.length }} giao dịch
      </div>

      <div v-if="!groups.length" class="placeholder">
        <div class="big">🧾</div>
        {{ store.loading ? 'Đang tải...' : (keyword || fCategory || fWallet ? 'Không có giao dịch khớp bộ lọc.' : (allMode ? 'Chưa có giao dịch nào.' : 'Chưa có giao dịch nào trong tháng này.')) }}
      </div>

      <section v-for="g in groups" :key="g.key" class="day">
        <h3>
          <span>{{ g.label }}</span>
          <span class="day-sum">
            <span v-if="g.thu" class="inc">+{{ formatVND(g.thu) }}</span>
            <span v-if="g.chi" class="exp">-{{ formatVND(g.chi) }}</span>
          </span>
        </h3>
        <button v-for="t in g.items" :key="t.id" class="txrow" @click="openEdit(t)">
          <span class="txicon" :style="{ background: colorOf(t) + '33' }">{{ iconOf(t) }}</span>
          <span class="txmain">
            <span class="txtitle">{{ titleOf(t) }}</span>
            <span class="txsub">{{ subOf(t) }}</span>
          </span>
          <span class="txamt" :class="t.loai">{{ amountText(t) }}</span>
        </button>
      </section>
      <button v-if="filtered.length > limit" class="btn" style="width:100%;margin-top:8px" @click="limit += PAGE">
        Hiện thêm ({{ filtered.length - limit }} giao dịch nữa)
      </button>
      </div>
      </div>

      <button class="fab" @click="openNew" aria-label="Thêm giao dịch">＋</button>
      <TransactionForm v-if="formOpen" :tx="editingTx" :initial-type="newType" @close="closeForm" />
    </div>`,
};
