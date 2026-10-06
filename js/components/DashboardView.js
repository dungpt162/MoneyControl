// Trang Tổng quan: thẻ KPI, chi theo danh mục (vành khuyên), thu/chi 6 tháng, ngân sách,
// giao dịch gần đây và số dư các ví. Dữ liệu theo tháng đang chọn trên header.
import { computed, onMounted, watch } from '../../vendor/vue.esm-browser.prod.js';
import { store } from '../store.js';
import { loadHistory } from '../data.js';
import { formatVND, shiftMonth } from '../utils.js';
import ChartCanvas from './ChartCanvas.js';

const FALLBACK = '#98a2b3';
const short = (v) => (v >= 1e6 ? +(v / 1e6).toFixed(1) + 'tr' : v >= 1e3 ? +(v / 1e3).toFixed(0) + 'k' : v);
const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

export default {
  name: 'DashboardView',
  components: { ChartCanvas },
  setup() {
    onMounted(() => loadHistory());
    watch(() => store.month, () => loadHistory());
    watch(() => store.txs, () => loadHistory());   // sau khi thêm/sửa/xóa hoặc đồng bộ

    const totals = computed(() => {
      let thu = 0, chi = 0;
      for (const t of store.txs) {
        if (t.loai === 'thu') thu += t.so_tien;
        else if (t.loai === 'chi') chi += t.so_tien;
      }
      return { thu, chi, diff: thu - chi };
    });

    // % thay đổi so với tháng trước (null nếu tháng trước chưa có dữ liệu)
    const prev = computed(() => store.history[shiftMonth(store.month, -1)]);
    function delta(cur, key) {
      const p = prev.value ? prev.value[key] : 0;
      if (!p) return null;
      const pct = Math.round(((cur - p) / p) * 100);
      return { pct: Math.abs(pct), up: pct >= 0 };
    }
    const deltas = computed(() => ({
      thu: delta(totals.value.thu, 'thu'),
      chi: delta(totals.value.chi, 'chi'),
      diff: (() => {
        if (!prev.value) return null;
        const pd = prev.value.thu - prev.value.chi;   // tiết kiệm của tháng trước
        if (!pd) return null;
        const pct = Math.round(((totals.value.diff - pd) / Math.abs(pd)) * 100);
        return { pct: Math.abs(pct), up: pct >= 0 };
      })(),
    }));

    const balanceOf = (w) => (w.name in store.balances ? store.balances[w.name] : w.opening || 0);
    const totalBalance = computed(() => store.config.wallets.reduce((s, w) => s + balanceOf(w), 0));

    const catOf = (name) => store.config.categories.find((c) => c.name === name) || {};

    // Chi theo danh mục: 5 danh mục lớn nhất + gộp phần còn lại thành "Khác"
    const byCategory = computed(() => {
      const map = {};
      for (const t of store.txs) if (t.loai === 'chi') map[t.danh_muc] = (map[t.danh_muc] || 0) + t.so_tien;
      const total = totals.value.chi || 1;
      const list = Object.entries(map).map(([name, amount]) => ({ name, amount, color: catOf(name).color || FALLBACK }))
        .sort((a, b) => b.amount - a.amount);
      if (list.length > 6) {
        const rest = list.splice(5).reduce((s, x) => s + x.amount, 0);
        list.push({ name: 'Khác', amount: rest, color: FALLBACK });
      }
      return list.map((x) => ({ ...x, pct: Math.round((x.amount / total) * 100) }));
    });
    const donutData = computed(() => ({
      labels: byCategory.value.map((c) => c.name),
      datasets: [{ data: byCategory.value.map((c) => c.amount), backgroundColor: byCategory.value.map((c) => c.color), borderWidth: 2, borderColor: css('--surface') || '#fff' }],
    }));
    const donutOptions = {
      cutout: '68%',
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => ` ${ctx.label}: ${formatVND(ctx.parsed)}` } } },
    };
    // Plugin vẽ tổng chi vào giữa vành khuyên
    const donutPlugins = computed(() => {
      const total = totals.value.chi;
      return [{
        id: 'centerText',
        afterDraw(chart) {
          const { ctx, chartArea: a } = chart;
          const x = (a.left + a.right) / 2, y = (a.top + a.bottom) / 2;
          ctx.save();
          ctx.textAlign = 'center';
          ctx.fillStyle = css('--text');
          ctx.font = '700 15px system-ui, sans-serif';
          ctx.fillText(formatVND(total), x, y);
          ctx.fillStyle = css('--muted');
          ctx.font = '12px system-ui, sans-serif';
          ctx.fillText('Tổng chi', x, y + 18);
          ctx.restore();
        },
      }];
    });

    // Thu/chi 6 tháng gần nhất
    const barData = computed(() => {
      const months = Array.from({ length: 6 }, (_, i) => shiftMonth(store.month, i - 5));
      return {
        labels: months.map((m) => 'Tháng ' + Number(m.split('-')[1])),
        datasets: [
          { label: 'Chi tiêu', data: months.map((m) => (store.history[m] || {}).chi || 0), backgroundColor: '#3b73f0', borderRadius: 4 },
          { label: 'Thu nhập', data: months.map((m) => (store.history[m] || {}).thu || 0), backgroundColor: '#22b573', borderRadius: 4 },
        ],
      };
    });
    const barOptions = {
      plugins: {
        legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8 } },
        tooltip: { callbacks: { label: (ctx) => ` ${ctx.dataset.label}: ${formatVND(ctx.parsed.y)}` } },
      },
      scales: { y: { beginAtZero: true, ticks: { callback: short } }, x: { grid: { display: false } } },
    };

    // Ngân sách: các danh mục đã đặt hạn mức, gần chạm/vượt lên trước
    const spent = computed(() => {
      const map = {};
      for (const t of store.txs) if (t.loai === 'chi') map[t.danh_muc] = (map[t.danh_muc] || 0) + t.so_tien;
      return map;
    });
    const budgets = computed(() => store.config.budgets
      .filter((b) => b.amount > 0)
      .map((b) => {
        const c = catOf(b.category);
        const used = spent.value[b.category] || 0;
        return { name: b.category, icon: c.icon || '📦', color: c.color || FALLBACK, used, limit: b.amount, pct: Math.round((used / b.amount) * 100) };
      })
      .sort((a, b) => b.pct - a.pct)
      .slice(0, 5));

    // Giao dịch gần đây
    const recent = computed(() => store.txs.slice(0, 6));
    const dateText = (iso) => `${iso.substring(8, 10)}/${iso.substring(5, 7)}/${iso.substring(0, 4)}`;
    const descOf = (t) => t.ghi_chu || (t.loai === 'chuyen' ? `${t.vi} → ${t.danh_muc}` : t.danh_muc);
    const iconOf = (t) => (t.loai === 'chuyen' ? '🔁' : catOf(t.danh_muc).icon || '📦');
    const colorOf = (t) => (t.loai === 'chuyen' ? FALLBACK : catOf(t.danh_muc).color || FALLBACK);
    const pillOf = (t) => (t.loai === 'chuyen' ? 'Chuyển ví' : t.danh_muc);
    const walletOf = (name) => store.config.wallets.find((w) => w.name === name) || {};
    const amountText = (t) => (t.loai === 'thu' ? '+ ' : t.loai === 'chi' ? '- ' : '') + formatVND(t.so_tien);
    const go = (tab) => { store.tab = tab; };

    return {
      store, totals, deltas, totalBalance, byCategory, donutData, donutOptions, donutPlugins, barData, barOptions,
      budgets, recent, balanceOf, dateText, descOf, iconOf, colorOf, pillOf, walletOf, amountText, formatVND, go,
    };
  },
  template: `
    <div>
      <div class="kpis">
        <div class="card kpi">
          <span class="kpi-ico" style="background:#e3f6ec">💵</span>
          <div>
            <small>Tổng thu nhập</small><b>{{ formatVND(totals.thu) }}</b>
            <span v-if="deltas.thu" class="delta" :class="deltas.thu.up ? 'good' : 'bad'">{{ deltas.thu.up ? '↑' : '↓' }} {{ deltas.thu.pct }}% so với tháng trước</span>
            <span v-else class="delta">Chưa có dữ liệu tháng trước</span>
          </div>
        </div>
        <div class="card kpi">
          <span class="kpi-ico" style="background:#fde8ea">💸</span>
          <div>
            <small>Tổng chi tiêu</small><b>{{ formatVND(totals.chi) }}</b>
            <span v-if="deltas.chi" class="delta" :class="deltas.chi.up ? 'bad' : 'good'">{{ deltas.chi.up ? '↑' : '↓' }} {{ deltas.chi.pct }}% so với tháng trước</span>
            <span v-else class="delta">Chưa có dữ liệu tháng trước</span>
          </div>
        </div>
        <div class="card kpi">
          <span class="kpi-ico" style="background:#e4ecfd">🐷</span>
          <div>
            <small>Tiết kiệm được</small><b :class="totals.diff < 0 ? 'exp' : ''">{{ formatVND(totals.diff) }}</b>
            <span v-if="deltas.diff" class="delta" :class="deltas.diff.up ? 'good' : 'bad'">{{ deltas.diff.up ? '↑' : '↓' }} {{ deltas.diff.pct }}% so với tháng trước</span>
            <span v-else class="delta">Thu trừ chi trong tháng</span>
          </div>
        </div>
        <div class="card kpi">
          <span class="kpi-ico" style="background:#efe7fb">👛</span>
          <div>
            <small>Tổng số dư các ví</small><b>{{ formatVND(totalBalance) }}</b>
            <span class="delta">{{ store.config.wallets.length }} ví</span>
          </div>
        </div>
      </div>

      <div class="dash">
        <section class="card a-donut">
          <div class="card-head"><h2>Chi tiêu theo danh mục</h2></div>
          <div v-if="!totals.chi" class="placeholder" style="padding:32px 0">Chưa có khoản chi trong tháng này.</div>
          <div v-else class="donut-wrap">
            <ChartCanvas type="doughnut" :data="donutData" :options="donutOptions" :plugins="donutPlugins" />
            <div class="legend">
              <div v-for="c in byCategory" :key="c.name" class="legend-row">
                <span class="dot" :style="{ background: c.color }"></span>
                <span class="legend-name">{{ c.name }}</span>
                <b>{{ formatVND(c.amount) }}</b>
                <span class="legend-pct">{{ c.pct }}%</span>
              </div>
            </div>
          </div>
        </section>

        <section class="card a-bars">
          <div class="card-head"><h2>Thu chi 6 tháng gần nhất</h2></div>
          <ChartCanvas type="bar" :data="barData" :options="barOptions" />
        </section>

        <section class="card a-budget">
          <div class="card-head"><h2>Ngân sách theo danh mục</h2><button class="link" @click="go('budget')">Xem tất cả →</button></div>
          <div v-if="!budgets.length" class="hint">Chưa đặt ngân sách nào. <button class="link" @click="go('budget')">Đặt ngân sách</button></div>
          <div v-for="b in budgets" :key="b.name" class="prog-row">
            <span class="mini-ico big" :style="{ background: b.color + '26' }">{{ b.icon }}</span>
            <div class="prog-main">
              <div class="prog-top"><b>{{ b.name }}</b><span class="prog-amt">{{ formatVND(b.used) }} / {{ formatVND(b.limit) }}</span><span :class="b.pct > 100 ? 'exp' : b.pct >= 80 ? 'warn' : ''">{{ b.pct }}%</span></div>
              <div class="bar"><div class="fill" :style="{ width: Math.min(b.pct, 100) + '%', background: b.pct > 100 ? 'var(--danger)' : b.color }"></div></div>
            </div>
          </div>
        </section>

        <section class="card a-recent">
          <div class="card-head"><h2>Giao dịch gần đây</h2><button class="link" @click="go('transactions')">Xem tất cả →</button></div>
          <div v-if="!recent.length" class="hint">Chưa có giao dịch trong tháng này.</div>
          <div v-else class="tbl-wrap">
            <table class="tbl">
              <thead><tr><th>Ngày</th><th>Mô tả</th><th class="hide-sm">Danh mục</th><th class="num">Số tiền</th><th class="hide-sm">Ví</th></tr></thead>
              <tbody>
                <tr v-for="t in recent" :key="t.id" @click="go('transactions')">
                  <td class="nowrap">{{ dateText(t.ngay_gio) }}</td>
                  <td><span class="desc"><span class="mini-ico" :style="{ background: colorOf(t) + '26' }">{{ iconOf(t) }}</span>{{ descOf(t) }}</span></td>
                  <td class="hide-sm"><span class="pill" :style="{ background: colorOf(t) + '26', color: colorOf(t) }">{{ pillOf(t) }}</span></td>
                  <td class="num nowrap" :class="t.loai === 'thu' ? 'inc' : t.loai === 'chi' ? 'exp' : ''"><b>{{ amountText(t) }}</b></td>
                  <td class="hide-sm nowrap">{{ walletOf(t.vi).icon }} {{ t.vi }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section class="card a-wallets">
          <div class="card-head"><h2>Số dư các ví</h2><button class="link" @click="go('wallets')">Quản lý →</button></div>
          <div v-if="!store.config.wallets.length" class="hint">Chưa có ví nào.</div>
          <div v-for="w in store.config.wallets" :key="w.name" class="prog-row">
            <span class="mini-ico big" :style="{ background: (w.color || '#98a2b3') + '26' }">{{ w.icon }}</span>
            <div class="prog-main"><div class="prog-top"><b>{{ w.name }}</b><span class="prog-amt"></span><b :class="balanceOf(w) < 0 ? 'exp' : ''">{{ formatVND(balanceOf(w)) }}</b></div></div>
          </div>
        </section>
      </div>
    </div>`,
};
