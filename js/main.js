// Điểm khởi tạo: tạo Vue app, đăng ký service worker, theo dõi trạng thái mạng.
import { createApp } from '../vendor/vue.esm-browser.prod.js';
import { store, applyTheme, showToast } from './store.js';
import { initData } from './data.js';
import App from './components/App.js';

applyTheme();
window.addEventListener('online', () => { store.online = true; });
window.addEventListener('offline', () => { store.online = false; });

// Nút "Cài app": trình duyệt gửi sự kiện này khi app đủ điều kiện cài lên màn hình chính
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); store.installEvent = e; });
window.addEventListener('appinstalled', () => { store.installEvent = null; });

createApp(App).mount('#app');
initData();

if ('serviceWorker' in navigator) {
  // Nếu trang đã được SW cũ điều khiển, khi bản mới kích hoạt thì tải lại để dùng file mới
  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return;
    reloading = true;
    showToast('Đã cập nhật phiên bản mới, đang tải lại...', 1500);
    setTimeout(() => location.reload(), 1200);
  });
  navigator.serviceWorker.register('sw.js').catch((e) => console.warn('Không đăng ký được service worker', e));
}
