/**
 * Service worker: cache file tĩnh để mở được khi offline.
 *
 * CẬP NHẬT PHIÊN BẢN: mỗi lần deploy bản mới, tăng VERSION bên dưới.
 * Tên cache đổi -> cache cũ bị xóa khi activate -> điện thoại nhận file mới.
 */
const VERSION = 'v10';
const CACHE = 'moneycontrol-' + VERSION;

const ASSETS = [
  './',
  'index.html',
  'manifest.json',
  'css/style.css',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'vendor/vue.esm-browser.prod.js',
  'vendor/chart.umd.js',
  'js/main.js',
  'js/store.js',
  'js/api.js',
  'js/utils.js',
  'js/db.js',
  'js/data.js',
  'js/sync.js',
  'js/components/App.js',
  'js/components/TransactionForm.js',
  'js/components/ItemForm.js',
  'js/components/MonthBar.js',
  'js/components/DashboardView.js',
  'js/components/ChartCanvas.js',
  'js/components/TransactionsView.js',
  'js/components/ReportView.js',
  'js/components/BudgetView.js',
  'js/components/WalletsView.js',
  'js/components/SettingsView.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  // Không can thiệp: request ghi, và mọi request tới tên miền khác (Apps Script)
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;

  // Ưu tiên cache; không có thì tải mạng rồi lưu lại. Mở trang khi offline -> index.html
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => (req.mode === 'navigate' ? caches.match('index.html') : Response.error()));
    })
  );
});
