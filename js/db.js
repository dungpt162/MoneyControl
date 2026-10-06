// IndexedDB: bản sao giao dịch trên thiết bị + hàng đợi thao tác chờ đồng bộ + cache config.
//
// Kho dữ liệu:
//  - tx    : giao dịch (key = id), có thêm trường nội bộ "_m" = tháng "YYYY-MM" để truy vấn theo tháng
//  - queue : thao tác chờ gửi lên Sheet { seq (tự tăng), txId, op }, giữ đúng thứ tự thực hiện
//  - meta  : cặp key/value (vd cache config)
const DB_NAME = 'moneycontrol';
const DB_VERSION = 1;

let dbPromise;
function open() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        db.createObjectStore('tx', { keyPath: 'id' }).createIndex('month', '_m');
        db.createObjectStore('queue', { keyPath: 'seq', autoIncrement: true });
        db.createObjectStore('meta');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

/** Chạy fn(store) trong một transaction; trả về kết quả của request cuối cùng sau khi transaction hoàn tất. */
async function withStore(name, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(name, mode);
    const r = fn(t.objectStore(name));
    t.oncomplete = () => resolve(r && r.result);
    t.onerror = t.onabort = () => reject(t.error);
  });
}

const monthOf = (tx) => tx.ngay_gio.substring(0, 7);

/** Bỏ trường nội bộ trước khi gửi lên server. */
export function clean(tx) {
  const { _m, ...rest } = tx;
  return rest;
}

// ----- Giao dịch -----
export const getTxByMonth = (month) => withStore('tx', 'readonly', (s) => s.index('month').getAll(month));
export const putTx = (tx) => withStore('tx', 'readwrite', (s) => s.put({ ...clean(tx), _m: monthOf(tx) }));
export const clearTx = () => withStore('tx', 'readwrite', (s) => s.clear());
export const deleteTx =(id) => withStore('tx', 'readwrite', (s) => s.delete(id));

/**
 * Thay dữ liệu một tháng bằng bản từ server, nhưng GIỮ NGUYÊN những giao dịch đang có thao tác
 * chờ đồng bộ (pendingIds) để không ghi đè thay đổi chưa gửi.
 */
export async function replaceMonth(month, serverList, pendingIds) {
  const local = await getTxByMonth(month);
  const serverIds = new Set(serverList.map((t) => t.id));
  await withStore('tx', 'readwrite', (s) => {
    local.forEach((t) => { if (!pendingIds.has(t.id) && !serverIds.has(t.id)) s.delete(t.id); });
    serverList.forEach((t) => { if (!pendingIds.has(t.id)) s.put({ ...t, _m: month }); });
  });
}

// ----- Hàng đợi -----
export const enqueue = (txId, op) => withStore('queue', 'readwrite', (s) => s.add({ txId, op }));
export const getQueue = () => withStore('queue', 'readonly', (s) => s.getAll());
export const removeOp = (seq) => withStore('queue', 'readwrite', (s) => s.delete(seq));
export const countQueue = () => withStore('queue', 'readonly', (s) => s.count());

// ----- Meta -----
export const getMeta = (key) => withStore('meta', 'readonly', (s) => s.get(key));
export const setMeta = (key, value) => withStore('meta', 'readwrite', (s) => s.put(value, key));
