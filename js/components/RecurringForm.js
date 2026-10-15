// Form thêm/sửa/xóa một khoản định kỳ (bottom sheet). Lưu trong config nên đồng bộ như ví/danh mục.
import { ref, computed } from '../../vendor/vue.esm-browser.prod.js';
import { store } from '../store.js';
import { saveConfig } from '../data.js';
import { parseQuickAmount, formatVND, uuid, monthKey, shiftMonth } from '../utils.js';

export default {
  name: 'RecurringForm',
  props: { item: { type: Object, default: null } },   // null = thêm mới
  emits: ['close'],
  setup(props, { emit }) {
    const editing = !!props.item;
    const it = props.item || {};
    const name = ref(it.name || '');
    const loai = ref(it.loai || 'chi');
    const amountText = ref(it.amount ? String(it.amount) : '');
    const category = ref(it.category || '');
    const wallet = ref(it.wallet || (store.config.wallets[0] || {}).name || '');
    const day = ref(it.day || new Date().getDate());
    const note = ref(it.note || '');
    const error = ref('');

    const amount = computed(() => parseQuickAmount(amountText.value));
    const preview = computed(() => (!amountText.value.trim() ? 'Gõ nhanh: 3tr, 500k, 45' : amount.value ? '= ' + formatVND(amount.value) : 'Số tiền chưa hợp lệ'));

    async function save() {
      error.value = '';
      const n = name.value.trim();
      const d = Math.floor(Number(day.value));
      if (!n) { error.value = 'Hãy nhập tên khoản.'; return; }
      if (!amount.value) { error.value = 'Hãy nhập số tiền hợp lệ.'; return; }
      if (!category.value) { error.value = 'Hãy chọn danh mục.'; return; }
      if (!wallet.value) { error.value = 'Hãy chọn ví.'; return; }
      if (!(d >= 1 && d <= 31)) { error.value = 'Ngày phải từ 1 đến 31.'; return; }

      const cfg = JSON.parse(JSON.stringify(store.config));
      // Khoản mới: nếu ngày trong tháng đã qua thì coi như tháng này bạn đã tự ghi, nhắc từ tháng sau
      const now = monthKey();
      const last = editing ? it.last : (d <= new Date().getDate() ? now : shiftMonth(now, -1));
      const next = { id: it.id || uuid(), name: n, loai: loai.value, amount: amount.value, category: category.value, wallet: wallet.value, day: d, note: note.value.trim(), last };
      if (editing) cfg.recurring[cfg.recurring.findIndex((x) => x.id === it.id)] = next;
      else cfg.recurring.push(next);
      await saveConfig(cfg);
      emit('close');
    }

    async function remove() {
      if (!confirm(`Xóa khoản định kỳ "${it.name}"?\nCác giao dịch đã ghi nhận trước đó không bị ảnh hưởng.`)) return;
      const cfg = JSON.parse(JSON.stringify(store.config));
      cfg.recurring = cfg.recurring.filter((x) => x.id !== it.id);
      await saveConfig(cfg);
      emit('close');
    }

    return { store, editing, name, loai, amountText, category, wallet, day, note, error, preview, save, remove };
  },
  template: `
    <div class="sheet-backdrop" @click.self="$emit('close')">
      <form class="sheet" @submit.prevent="save">
        <div class="sheet-head">
          <strong>{{ editing ? 'Sửa' : 'Thêm' }} khoản định kỳ</strong>
          <button type="button" class="btn" @click="$emit('close')">Đóng</button>
        </div>

        <label class="field">
          <span>Tên</span>
          <input class="input" v-model="name" autocomplete="off" placeholder="vd Tiền nhà, Internet, Lương">
        </label>

        <div class="seg">
          <button type="button" :class="{ on: loai === 'chi' }" @click="loai = 'chi'">Chi</button>
          <button type="button" :class="{ on: loai === 'thu' }" @click="loai = 'thu'">Thu</button>
        </div>

        <label class="field">
          <span>Số tiền</span>
          <input class="input amount" v-model="amountText" inputmode="text" autocomplete="off" placeholder="0">
          <p class="hint">{{ preview }}</p>
        </label>

        <div class="field">
          <span>Danh mục</span>
          <div class="chips">
            <button type="button" v-for="c in store.config.categories" :key="c.name" class="chip"
                    :class="{ on: category === c.name }" :style="{ '--c': c.color || '#6b7280' }"
                    @click="category = c.name">{{ c.icon }} {{ c.name }}</button>
          </div>
        </div>

        <label class="field">
          <span>Ví</span>
          <select class="input" v-model="wallet">
            <option v-for="w in store.config.wallets" :key="w.name" :value="w.name">{{ w.icon }} {{ w.name }}</option>
          </select>
        </label>

        <label class="field">
          <span>Ngày trong tháng</span>
          <input class="input" type="number" min="1" max="31" v-model="day">
          <p class="hint">Tháng ngắn hơn sẽ lấy ngày cuối tháng. Đến ngày này app sẽ nhắc bạn xác nhận (sửa được số tiền).</p>
        </label>

        <label class="field">
          <span>Ghi chú</span>
          <input class="input" v-model="note" autocomplete="off" placeholder="Không bắt buộc (mặc định lấy tên khoản)">
        </label>

        <div v-if="error" class="result err">{{ error }}</div>
        <div class="row" style="margin-top:12px">
          <button v-if="editing" type="button" class="btn danger" @click="remove">Xóa</button>
          <button type="submit" class="btn primary">Lưu</button>
        </div>
      </form>
    </div>`,
};
