// Màn hình Báo cáo tháng: tổng thu/chi, biểu đồ tròn theo danh mục, biểu đồ cột chi theo ngày.
// Giao dịch "chuyển ví" không tính vào thu/chi.
import { computed } from '../../vendor/vue.esm-browser.prod.js';
import { store } from '../store.js';
import { formatVND } from '../utils.js';
import MonthBar from './MonthBar.js';
import ChartCanvas from './ChartCanvas.js';

const FALLBACK = '#6b7280';
// Rút gọn nhãn trục: 50000 -> "50k", 2500000 -> "2.5tr"
const short = (v) => (v >= 1e6 ? +(v / 1e6).toFixed(1) + 'tr' : v >= 1e3 ? +(v / 1e3).toFixed(0) + 'k' : v);

export default {
  name: 'ReportView',
  components: { MonthBar, ChartCanvas },
  setup() {
    const totals = computed(() => {
      let thu = 0, chi = 0;
      for (const t of store.txs) {
        if (t.loai === 'thu') thu += t.so_tien;
        else if (t.loai === 'chi') chi += t.so_tien;
      }
      return { thu, chi, diff: thu - chi };
    });

    // Chi theo danh mục, lớn -> nhỏ
    const byCategory = computed(() => {
      const map = {};
      for (const t of store.txs) if (t.loai === 'chi') map[t.danh_muc] = (map[t.danh_muc] || 0) + t.so_tien;
      const total = totals.value.chi || 1;
      return Object.entries(map)
        .map(([name, amount]) => {
          const c = store.config.categories.find((x) => x.name === name) || {};
          return { name, amount, icon: c.icon || '📦', color: c.color || FALLBACK, pct: Math.round((amount / total) * 100) };
        })
        .sort((a, b) => b.amount - a.amount);
    });

    const pieData = computed(() => ({
      labels: byCategory.value.map((c) => c.name),
      datasets: [{ data: byCategory.value.map((c) => c.amount), backgroundColor: byCategory.value.map((c) => c.color), borderWidth: 1 }],
    }));
    const pieOptions = {
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => ` ${ctx.label}: ${formatVND(ctx.parsed)}` } } },
    };

    // Chi theo từng ngày trong tháng
    const barData = computed(() => {
      const [y, m] = store.month.split('-').map(Number);
      const days = new Date(y, m, 0).getDate();
      const sums = new Array(days).fill(0);
      for (const t of store.txs) if (t.loai === 'chi') sums[Number(t.ngay_gio.substring(8, 10)) - 1] += t.so_tien;
      return {
        labels: sums.map((_, i) => String(i + 1)),
        datasets: [{ label: 'Chi', data: sums, backgroundColor: '#ef4444', borderRadius: 3 }],
      };
    });
    const barOptions = {
      plugins: { legend: { display: false }, tooltip: { callbacks: { title: (i) => 'Ngày ' + i[0].label, label: (ctx) => ' ' + formatVND(ctx.parsed.y) } } },
      scales: { y: { beginAtZero: true, ticks: { callback: short } }, x: { grid: { display: false } } },
    };

    return { store, totals, byCategory, pieData, pieOptions, barData, barOptions, formatVND };
  },
  template: `
    <div>
      <MonthBar />

      <div class="summary card">
        <div><small>Tổng thu</small><b class="inc">{{ formatVND(totals.thu) }}</b></div>
        <div><small>Tổng chi</small><b class="exp">{{ formatVND(totals.chi) }}</b></div>
        <div><small>Chênh lệch</small><b :class="totals.diff >= 0 ? 'inc' : 'exp'">{{ formatVND(totals.diff) }}</b></div>
      </div>

      <div v-if="!totals.chi" class="placeholder">
        <div class="big">📊</div>
        {{ store.loading ? 'Đang tải...' : 'Chưa có khoản chi nào trong tháng này.' }}
      </div>

      <div v-else class="grid2">
        <section class="card">
          <h2>Chi theo danh mục</h2>
          <ChartCanvas type="pie" :data="pieData" :options="pieOptions" />
          <div class="legend">
            <div v-for="c in byCategory" :key="c.name" class="legend-row">
              <span class="dot" :style="{ background: c.color }"></span>
              <span class="legend-name">{{ c.icon }} {{ c.name }}</span>
              <span class="legend-pct">{{ c.pct }}%</span>
              <b>{{ formatVND(c.amount) }}</b>
            </div>
          </div>
        </section>

        <section class="card">
          <h2>Chi theo ngày</h2>
          <ChartCanvas type="bar" :data="barData" :options="barOptions" />
        </section>
      </div>
    </div>`,
};
