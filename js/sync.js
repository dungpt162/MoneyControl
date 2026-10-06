// Đồng bộ hàng đợi thao tác lên Google Sheet (gửi theo lô bằng action "batch").
import { store, showToast } from './store.js';
import { api } from './api.js';
import { getQueue, removeOp } from './db.js';

const CHUNK = 20;
// Lỗi "vĩnh viễn": gửi lại cũng vô ích, bỏ thao tác khỏi hàng đợi để không kẹt các thao tác sau
const PERMANENT = ['BAD_TX', 'BAD_MONTH', 'NOT_FOUND', 'BAD_CONFIG'];

let running = false;

/** Cập nhật trạng thái hiển thị: synced / pending / syncing / error. */
export async function refreshSync() {
  const queue = await getQueue();
  store.sync.pending = queue.length;
  store.sync.ids = queue.map((i) => i.txId);
  if (store.sync.state === 'syncing') return;
  if (store.sync.error) store.sync.state = 'error';
  else store.sync.state = store.sync.pending > 0 ? 'pending' : 'synced';
}

/** Gửi toàn bộ hàng đợi. Trả về số thao tác đã gửi thành công. */
export async function flushQueue() {
  if (running) return 0;
  running = true;
  let sent = 0;
  try {
    let items = await getQueue();
    store.sync.error = '';
    if (items.length && store.online) store.sync.state = 'syncing';
    while (items.length && store.online) {
      const chunk = items.slice(0, CHUNK);
      const results = await api.batch(chunk.map((i) => i.op));
      for (let i = 0; i < chunk.length; i++) {
        const r = results[i];
        if (r.ok) {
          sent++;
        } else if (PERMANENT.includes(r.error.code)) {
          showToast('Một thay đổi bị từ chối: ' + r.error.message, 4000);
        } else {
          throw new Error(r.error.message); // lỗi tạm thời: giữ lại hàng đợi
        }
        await removeOp(chunk[i].seq);
      }
      items = await getQueue();
    }
    if (store.online) store.sync.last = Date.now();
  } catch (e) {
    store.sync.error = e.message; // sai token, mất mạng, ... -> giữ hàng đợi, thử lại sau
  } finally {
    running = false;
    store.sync.state = 'idle';
    await refreshSync();
  }
  return sent;
}
