// Thẻ nhắc các khoản định kỳ đã đến hạn trong tháng: ghi nhận (sửa được số tiền) hoặc bỏ qua tháng này.
import { reactive, computed } from '../../vendor/vue.esm-browser.prod.js';
import { store, showToast } from '../store.js';
import { saveTransaction, saveConfig } from '../data.js';
import { dueRecurring, recurringDate } from '../insights.js';
import { formatVND, parseQuickAmount, uuid, toLocalIso, monthKey } from '../utils.js';

export default {
  name: 'DueRecurring',
  setup() {
    const due = computed(() => dueRecurring(store.config.recurring));
    const amounts = reactive({});   // id -> số tiền đang gõ (mặc định = số tiền khai báo)
    const text = (r) => (r.id in amounts ? amounts[r.id] : String(r.amount));
    const iconOf = (r) => (store.config.categories.find((c) => c.name === r.category) || {}).icon || '🔁';

    async function markDone(r) {
      const cfg = JSON.parse(JSON.stringify(store.config));
      const item = cfg.recurring.find((x) => x.id === r.id);
      if (item) item.last = monthKey();
      await saveConfig(cfg);
    }

    async function confirmItem(r) {
      const v = parseQuickAmount(text(r));
      if (!v) { showToast('Số tiền chưa hợp lệ.'); return; }
      const now = toLocalIso();
      await saveTransaction({
        id: uuid(), ngay_gio: toLocalIso(recurringDate(r, monthKey())), loai: r.loai, so_tien: v,
        danh_muc: r.category, vi: r.wallet, ghi_chu: r.note || r.name, tao_luc: now, sua_luc: now,
      });
      await markDone(r);
      showToast(`Đã ghi nhận "${r.name}".`);
    }

    async function skip(r) {
      await markDone(r);
      showToast(`Đã bỏ qua "${r.name}" tháng này.`);
    }

    return { due, amounts, text, iconOf, confirmItem, skip, formatVND, parseQuickAmount };
  },
  template: `
    <section v-if="due.length" class="card due">
      <h2>🔔 Khoản định kỳ đến hạn</h2>
      <div v-for="r in due" :key="r.id" class="due-row">
        <div class="due-main">
          <b>{{ iconOf(r) }} {{ r.name }}</b>
          <small>Ngày {{ r.day }} · {{ r.loai === 'thu' ? 'Thu' : 'Chi' }} · {{ r.wallet }}</small>
        </div>
        <input class="input due-amt" :value="text(r)" @input="amounts[r.id] = $event.target.value" inputmode="text" aria-label="Số tiền">
        <div class="due-act">
          <button class="btn primary" @click="confirmItem(r)">Ghi nhận</button>
          <button class="btn" @click="skip(r)">Bỏ qua</button>
        </div>
        <small class="hint due-prev">{{ parseQuickAmount(text(r)) ? '= ' + formatVND(parseQuickAmount(text(r))) : 'Số tiền chưa hợp lệ' }}</small>
      </div>
    </section>`,
};
