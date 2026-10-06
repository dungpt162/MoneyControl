// Màn hình Ví & danh mục: số dư từng ví, thêm/sửa/xóa ví và danh mục.
import { ref, computed } from '../../vendor/vue.esm-browser.prod.js';
import { store } from '../store.js';
import { refreshBalances } from '../data.js';
import { formatVND } from '../utils.js';
import ItemForm from './ItemForm.js';

export default {
  name: 'WalletsView',
  components: { ItemForm },
  setup() {
    const section = ref('wallet');      // 'wallet' | 'category'
    const form = ref(null);             // { kind, item } khi đang mở form

    // Số dư = giá trị server tính; ví mới chưa có trong kết quả thì lấy số dư đầu kỳ
    const balanceOf = (w) => (w.name in store.balances ? store.balances[w.name] : w.opening || 0);
    const total = computed(() => store.config.wallets.reduce((s, w) => s + balanceOf(w), 0));

    const open = (kind, item = null) => { form.value = { kind, item }; };
    const close = () => { form.value = null; };

    return { store, section, form, balanceOf, total, formatVND, open, close, refreshBalances };
  },
  template: `
    <div>
      <div class="seg">
        <button :class="{ on: section === 'wallet' }" @click="section = 'wallet'">Ví</button>
        <button :class="{ on: section === 'category' }" @click="section = 'category'">Danh mục</button>
      </div>

      <template v-if="section === 'wallet'">
        <div class="card" style="text-align:center">
          <small style="color:var(--muted)">Tổng số dư</small>
          <div style="font-size:24px;font-weight:700" :class="total >= 0 ? 'inc' : 'exp'">{{ formatVND(total) }}</div>
          <button class="btn" style="margin-top:8px" @click="refreshBalances">⟳ Cập nhật số dư</button>
        </div>

        <div class="cards">
        <button v-for="w in store.config.wallets" :key="w.name" class="txrow" @click="open('wallet', w)">
          <span class="txicon" :style="{ background: (w.color || '#6b7280') + '33' }">{{ w.icon }}</span>
          <span class="txmain">
            <span class="txtitle">{{ w.name }}</span>
            <span class="txsub">Đầu kỳ: {{ formatVND(w.opening) }}</span>
          </span>
          <span class="txamt" :class="balanceOf(w) >= 0 ? 'thu' : 'chi'">{{ formatVND(balanceOf(w)) }}</span>
        </button>
        </div>
        <div v-if="!store.config.wallets.length" class="placeholder">Chưa có ví nào.</div>
        <button class="btn primary" style="width:100%;margin-top:8px" @click="open('wallet')">＋ Thêm ví</button>
      </template>

      <template v-else>
        <div class="cards">
        <button v-for="c in store.config.categories" :key="c.name" class="txrow" @click="open('category', c)">
          <span class="txicon" :style="{ background: (c.color || '#6b7280') + '33' }">{{ c.icon }}</span>
          <span class="txmain"><span class="txtitle">{{ c.name }}</span></span>
          <span class="dot" :style="{ background: c.color }"></span>
        </button>
        </div>
        <div v-if="!store.config.categories.length" class="placeholder">Chưa có danh mục nào.</div>
        <button class="btn primary" style="width:100%;margin-top:8px" @click="open('category')">＋ Thêm danh mục</button>
      </template>

      <ItemForm v-if="form" :kind="form.kind" :item="form.item" @close="close" />
    </div>`,
};
