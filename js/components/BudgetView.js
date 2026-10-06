// Màn hình Ngân sách: hạn mức chi theo danh mục, thanh tiến độ, cảnh báo ở 80% và khi vượt.
// Hạn mức áp dụng cho mọi tháng; số đã chi tính theo tháng đang xem.
import { ref, computed } from '../../vendor/vue.esm-browser.prod.js';
import { store } from '../store.js';
import { saveConfig } from '../data.js';
import { formatVND, parseMoney } from '../utils.js';
import MonthBar from './MonthBar.js';

export default {
  name: 'BudgetView',
  components: { MonthBar },
  setup() {
    const spent = computed(() => {
      const map = {};
      for (const t of store.txs) if (t.loai === 'chi') map[t.danh_muc] = (map[t.danh_muc] || 0) + t.so_tien;
      return map;
    });

    // Mỗi danh mục: hạn mức (0 = chưa đặt), đã chi, % và trạng thái
    const rows = computed(() => store.config.categories.map((c) => {
      const b = store.config.budgets.find((x) => x.category === c.name);
      const limit = b ? b.amount : 0;
      const used = spent.value[c.name] || 0;
      const pct = limit ? Math.round((used / limit) * 100) : 0;
      const status = !limit ? 'none' : pct > 100 ? 'over' : pct >= 80 ? 'warn' : 'ok';
      return { ...c, limit, used, pct, status, left: limit - used };
    }).sort((a, b) => (b.limit > 0) - (a.limit > 0) || b.pct - a.pct));

    const alerts = computed(() => rows.value.filter((r) => r.status === 'over' || r.status === 'warn'));

    // ----- Sửa hạn mức -----
    const editing = ref(null);   // dòng đang sửa
    const text = ref('');
    const error = ref('');
    function edit(r) {
      editing.value = r;
      text.value = r.limit ? String(r.limit) : '';
      error.value = '';
    }
    async function save() {
      const raw = text.value.trim();
      const amount = raw === '' ? 0 : parseMoney(raw);
      if (amount == null) { error.value = 'Số tiền chưa hợp lệ. Ví dụ: 2tr, 500k.'; return; }
      const cfg = JSON.parse(JSON.stringify(store.config));
      cfg.budgets = cfg.budgets.filter((b) => b.category !== editing.value.name);
      if (amount > 0) cfg.budgets.push({ category: editing.value.name, amount });
      editing.value = null;
      await saveConfig(cfg);
    }

    return { rows, alerts, editing, text, error, edit, save, formatVND };
  },
  template: `
    <div>
      <MonthBar />

      <div v-for="a in alerts" :key="a.name" class="result" :class="a.status === 'over' ? 'err' : 'warnbox'" style="margin:0 0 8px">
        {{ a.icon }} {{ a.name }}:
        {{ a.status === 'over' ? 'đã vượt ngân sách ' + formatVND(-a.left) : 'đã dùng ' + a.pct + '%, còn ' + formatVND(a.left) }}
      </div>

      <div class="cards">
      <button v-for="r in rows" :key="r.name" class="card budget" @click="edit(r)">
        <div class="budget-head">
          <span>{{ r.icon }} <b>{{ r.name }}</b></span>
          <span v-if="r.limit" :class="'st-' + r.status">{{ r.pct }}%</span>
          <span v-else class="hint" style="margin:0">Chưa đặt · bấm để đặt</span>
        </div>
        <template v-if="r.limit">
          <div class="bar"><div class="fill" :class="'f-' + r.status" :style="{ width: Math.min(r.pct, 100) + '%' }"></div></div>
          <div class="budget-foot">
            <span>{{ formatVND(r.used) }} / {{ formatVND(r.limit) }}</span>
            <span :class="'st-' + r.status">{{ r.left >= 0 ? 'Còn ' + formatVND(r.left) : 'Vượt ' + formatVND(-r.left) }}</span>
          </div>
        </template>
        <div v-else-if="r.used" class="budget-foot"><span>Đã chi {{ formatVND(r.used) }}</span></div>
      </button>
      </div>
      <div v-if="!rows.length" class="placeholder">Chưa có danh mục. Hãy thêm ở tab Ví.</div>

      <div v-if="editing" class="sheet-backdrop" @click.self="editing = null">
        <form class="sheet" @submit.prevent="save">
          <div class="sheet-head">
            <strong>Ngân sách: {{ editing.icon }} {{ editing.name }}</strong>
            <button type="button" class="btn" @click="editing = null">Đóng</button>
          </div>
          <label class="field">
            <span>Hạn mức mỗi tháng</span>
            <input class="input amount" v-model="text" inputmode="text" autocomplete="off" placeholder="vd 2tr" autofocus>
            <p class="hint">Để trống hoặc 0 để bỏ ngân sách.</p>
          </label>
          <div v-if="error" class="result err">{{ error }}</div>
          <button type="submit" class="btn primary" style="width:100%;margin-top:12px">Lưu</button>
        </form>
      </div>
    </div>`,
};
