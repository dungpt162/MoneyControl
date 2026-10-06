// Gọi Google Apps Script Web App.
//
// CORS: web chạy ở tên miền Cloudflare, API ở script.google.com. POST gửi với
// Content-Type text/plain (request "đơn giản", không có preflight), body là JSON.
// Apps Script trả kết quả qua redirect 302 sang googleusercontent.com; fetch mặc định
// tự theo redirect nên không cần xử lý thêm, miễn là KHÔNG đặt header tùy biến.
import { store } from './store.js';

const TIMEOUT_MS = 30000;

/** Lỗi API có mã rõ ràng để giao diện hiển thị thông báo tiếng Việt. */
export class ApiError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const MESSAGES = {
  NO_CONFIG: 'Chưa nhập URL Apps Script hoặc token. Hãy vào Cài đặt.',
  NETWORK: 'Không kết nối được máy chủ. Kiểm tra mạng và URL Apps Script.',
  TIMEOUT: 'Máy chủ phản hồi quá lâu. Hãy thử lại.',
  BAD_RESPONSE: 'Máy chủ trả về dữ liệu không hợp lệ. Kiểm tra URL (phải kết thúc bằng /exec) và cài đặt triển khai "Anyone".',
  UNAUTHORIZED: 'Sai token. Kiểm tra lại token trong Cài đặt và Script Properties.',
  BUSY: 'Máy chủ đang bận, thử lại sau ít giây.',
  NOT_FOUND: 'Không tìm thấy dữ liệu trên Google Sheet.',
  BAD_MONTH: 'Tháng không hợp lệ.',
  BAD_TX: 'Giao dịch không hợp lệ.',
  BAD_CONFIG: 'Cấu hình không hợp lệ.',
  UNKNOWN_ACTION: 'Máy chủ chưa hỗ trợ thao tác này. Có thể bạn chưa tạo phiên bản deployment mới sau khi sửa Code.gs.',
};

function friendly(code, fallback) {
  return MESSAGES[code] || fallback || 'Đã xảy ra lỗi: ' + code;
}

async function request(action, params = {}, method = 'GET') {
  const { url, token } = store.settings;
  if (!url || !token) throw new ApiError('NO_CONFIG', MESSAGES.NO_CONFIG);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let res;
  try {
    if (method === 'GET') {
      const qs = new URLSearchParams({ action, token, ...params });
      res = await fetch(url + (url.includes('?') ? '&' : '?') + qs, { signal: ctrl.signal });
    } else {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action, token, ...params }),
        signal: ctrl.signal,
      });
    }
  } catch (e) {
    throw new ApiError(e.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK', friendly(e.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK'));
  } finally {
    clearTimeout(timer);
  }

  let json;
  try {
    json = await res.json();
  } catch (e) {
    throw new ApiError('BAD_RESPONSE', MESSAGES.BAD_RESPONSE);
  }
  if (!json.ok) {
    const err = json.error || {};
    throw new ApiError(err.code || 'SERVER_ERROR', friendly(err.code, err.message));
  }
  return json.data;
}

// ----- Các hàm API (đọc = GET, ghi = POST) -----
export const api = {
  ping: () => request('ping'),
  getConfig: () => request('getConfig'),
  getBalances: () => request('getBalances'),
  getTransactions: (month) => request('getTransactions', { month }),
  addTransaction: (tx) => request('addTransaction', { tx }, 'POST'),
  updateTransaction: (tx, oldMonth) => request('updateTransaction', { tx, oldMonth }, 'POST'),
  deleteTransaction: (id, month) => request('deleteTransaction', { id, month }, 'POST'),
  updateConfig: (config) => request('updateConfig', { config }, 'POST'),
  batch: (ops) => request('batch', { ops }, 'POST'),
};
