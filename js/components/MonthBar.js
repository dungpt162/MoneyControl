// Thanh chuyển tháng trước/sau dùng chung cho Báo cáo và Ngân sách.
import { store } from '../store.js';
import { setMonth } from '../data.js';
import { monthLabel, shiftMonth } from '../utils.js';

export default {
  name: 'MonthBar',
  setup: () => ({ store, setMonth, monthLabel, shiftMonth }),
  template: `
    <div class="monthbar m-only">
      <button class="btn" @click="setMonth(shiftMonth(store.month, -1))" aria-label="Tháng trước">‹</button>
      <strong>{{ monthLabel(store.month) }}</strong>
      <button class="btn" @click="setMonth(shiftMonth(store.month, 1))" aria-label="Tháng sau">›</button>
    </div>`,
};
