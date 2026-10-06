// Bọc Chart.js (global `Chart` nạp từ vendor/chart.umd.js). Vẽ lại khi dữ liệu hoặc giao diện sáng/tối đổi.
import { ref, watch, onMounted, onBeforeUnmount, nextTick } from '../../vendor/vue.esm-browser.prod.js';
import { store } from '../store.js';

export default {
  name: 'ChartCanvas',
  props: {
    type: { type: String, required: true },
    data: { type: Object, required: true },
    options: { type: Object, default: () => ({}) },
    plugins: { type: Array, default: () => [] },   // vd plugin vẽ chữ ở giữa biểu đồ vành khuyên
  },
  setup(props) {
    const el = ref(null);
    let chart = null;
    const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

    function build() {
      if (chart) { chart.destroy(); chart = null; }
      if (!window.Chart || !el.value) return;
      // Màu chữ/đường kẻ theo giao diện hiện tại
      Chart.defaults.color = css('--muted');
      Chart.defaults.borderColor = css('--border');
      chart = new Chart(el.value, {
        type: props.type,
        // Bản sao thuần: Chart.js không nên giữ proxy reactive của Vue
        data: JSON.parse(JSON.stringify(props.data)),
        options: { responsive: true, maintainAspectRatio: false, ...props.options },
        plugins: props.plugins,
      });
    }

    onMounted(build);
    watch(() => [props.data, props.plugins, store.settings.theme], () => nextTick(() => setTimeout(build, 30)));
    onBeforeUnmount(() => { if (chart) chart.destroy(); });
    return { el };
  },
  template: `<div class="chartbox"><canvas ref="el"></canvas></div>`,
};
