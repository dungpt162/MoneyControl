// Form thêm/sửa/xóa một ví hoặc một danh mục (bottom sheet).
// Tên không đổi được sau khi tạo vì giao dịch cũ tham chiếu theo tên.
import { ref, computed } from '../../vendor/vue.esm-browser.prod.js';
import { store } from '../store.js';
import { saveConfig } from '../data.js';
import { parseSignedMoney, formatVND } from '../utils.js';

const ICONS = {
  category: ['🍜', '☕', '🛒', '🚌', '⛽', '🏠', '💡', '📱', '🎮', '🎬', '🛍️', '👕', '💊', '🏥', '📚', '🎁', '✈️', '🐶', '💰', '💼', '🎓', '🔧', '📦'],
  wallet: ['💵', '🏦', '💳', '👛', '🐷', '📈', '🪙', '💰', '🏧', '📱', '🏠', '🎯'],
};
const COLORS = ['#ef4444', '#f97316', '#f59e0b', '#84cc16', '#22c55e', '#10b981', '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6', '#ec4899', '#6b7280'];

export default {
  name: 'ItemForm',
  props: {
    kind: { type: String, required: true },       // 'wallet' | 'category'
    item: { type: Object, default: null },        // null = thêm mới
  },
  emits: ['close'],
  setup(props, { emit }) {
    const isWallet = props.kind === 'wallet';
    const editing = !!props.item;
    const name = ref(props.item ? props.item.name : '');
    const icon = ref(props.item ? props.item.icon : ICONS[props.kind][0]);
    const color = ref(props.item && props.item.color ? props.item.color : COLORS[4]);
    const opening = ref(props.item && props.item.opening ? String(props.item.opening) : '');
    const error = ref('');

    const openingValue = computed(() => parseSignedMoney(opening.value));
    const openingPreview = computed(() =>
      openingValue.value == null ? 'Số tiền chưa hợp lệ' : '= ' + formatVND(openingValue.value));

    const cloneConfig = () => JSON.parse(JSON.stringify(store.config));

    async function save() {
      error.value = '';
      const n = name.value.trim();
      if (!n) { error.value = 'Hãy nhập tên.'; return; }
      const cfg = cloneConfig();
      // Tên phải duy nhất trong cùng loại (không phân biệt hoa thường)
      const list = isWallet ? cfg.wallets : cfg.categories;
      const clash = list.some((x) => x.name.toLowerCase() === n.toLowerCase() && (!editing || x.name !== props.item.name));
      if (clash) { error.value = 'Tên này đã tồn tại.'; return; }
      if (isWallet && openingValue.value == null) { error.value = 'Số dư đầu kỳ chưa hợp lệ.'; return; }

      const next = { name: n, icon: icon.value.trim() || ICONS[props.kind][0], color: color.value };
      if (isWallet) next.opening = openingValue.value;
      if (editing) list[list.findIndex((x) => x.name === props.item.name)] = next;
      else list.push(next);
      await saveConfig(cfg);
      emit('close');
    }

    async function remove() {
      const msg = isWallet
        ? `Xóa ví "${props.item.name}"?\nCác giao dịch cũ vẫn còn trong Sheet nhưng ví này sẽ không còn trong danh sách.`
        : `Xóa danh mục "${props.item.name}"?\nCác giao dịch cũ vẫn còn trong Sheet; ngân sách của danh mục này cũng bị xóa.`;
      if (!confirm(msg)) return;
      const cfg = cloneConfig();
      if (isWallet) cfg.wallets = cfg.wallets.filter((x) => x.name !== props.item.name);
      else {
        cfg.categories = cfg.categories.filter((x) => x.name !== props.item.name);
        cfg.budgets = cfg.budgets.filter((b) => b.category !== props.item.name);
      }
      await saveConfig(cfg);
      emit('close');
    }

    return { isWallet, editing, name, icon, color, opening, openingPreview, error, icons: ICONS[props.kind], COLORS, save, remove };
  },
  template: `
    <div class="sheet-backdrop" @click.self="$emit('close')">
      <form class="sheet" @submit.prevent="save">
        <div class="sheet-head">
          <strong>{{ editing ? 'Sửa' : 'Thêm' }} {{ isWallet ? 'ví' : 'danh mục' }}</strong>
          <button type="button" class="btn" @click="$emit('close')">Đóng</button>
        </div>

        <label class="field">
          <span>Tên</span>
          <input class="input" v-model="name" :disabled="editing" autocomplete="off"
                 :placeholder="isWallet ? 'vd Techcombank' : 'vd Cà phê'">
          <p v-if="editing" class="hint">Tên không đổi được vì giao dịch cũ đang dùng tên này.</p>
        </label>

        <div class="field">
          <span>Icon</span>
          <div class="emoji-grid">
            <button type="button" v-for="e in icons" :key="e" class="emoji" :class="{ on: icon === e }" @click="icon = e">{{ e }}</button>
          </div>
          <input class="input" v-model="icon" maxlength="4" style="margin-top:8px" placeholder="Hoặc gõ/dán emoji khác">
        </div>

        <div class="field">
          <span>Màu</span>
          <div class="swatches">
            <button type="button" v-for="c in COLORS" :key="c" class="swatch" :class="{ on: color === c }"
                    :style="{ background: c }" :aria-label="c" @click="color = c"></button>
          </div>
        </div>

        <label class="field" v-if="isWallet">
          <span>Số dư đầu kỳ</span>
          <input class="input" v-model="opening" inputmode="text" autocomplete="off" placeholder="0 (gõ -500k nếu đang nợ)">
          <p class="hint">{{ openingPreview }}</p>
        </label>

        <div v-if="error" class="result err">{{ error }}</div>
        <div class="row" style="margin-top:12px">
          <button v-if="editing" type="button" class="btn danger" @click="remove">Xóa</button>
          <button type="submit" class="btn primary">Lưu</button>
        </div>
      </form>
    </div>`,
};
