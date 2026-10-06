// Hàm tiện ích: định dạng tiền, ngày, parse số tiền kiểu "50k", "1.5tr".

const vndFormat = new Intl.NumberFormat('vi-VN');

/** 1250000 -> "1.250.000 ₫" */
export function formatVND(n) {
  return vndFormat.format(Math.round(Number(n) || 0)) + ' ₫';
}

/**
 * Đổi chuỗi nhập nhanh sang số nguyên VND. Trả về null nếu không hợp lệ.
 *  "50k" -> 50000 | "1.5tr" / "1,5tr" -> 1500000 | "1tr2" -> 1200000
 *  "2tỷ" -> 2000000000 | "1.250.000" -> 1250000 | "50000" -> 50000
 */
export function parseMoney(input) {
  let s = String(input ?? '').toLowerCase().replace(/[\s₫đ]|vnd/g, '');
  if (!s) return null;

  const UNITS = { k: 1e3, ng: 1e3, tr: 1e6, m: 1e6, 'tỷ': 1e9, ty: 1e9, ti: 1e9, b: 1e9 };

  // Dạng "1tr2" = 1,2 triệu
  let m = s.match(/^(\d+)(tr|m|tỷ|ty)(\d+)$/);
  if (m) return Math.round(parseFloat(m[1] + '.' + m[3]) * UNITS[m[2]]);

  // Dạng số + đơn vị: dấu . hoặc , là dấu thập phân
  m = s.match(/^(\d+(?:[.,]\d+)?)(k|ng|tr|m|tỷ|ty|ti|b)$/);
  if (m) return Math.round(parseFloat(m[1].replace(',', '.')) * UNITS[m[2]]);

  // Số thuần: . và , là dấu phân cách hàng nghìn
  if (/^\d+([.,]\d{3})*$/.test(s)) return parseInt(s.replace(/[.,]/g, ''), 10);
  return null;
}

/** Như parseMoney nhưng cho phép dấu trừ (số dư đầu kỳ âm = đang nợ). Rỗng -> 0; sai -> null. */
export function parseSignedMoney(input) {
  const s = String(input ?? '').trim();
  if (!s) return 0;
  const neg = s.startsWith('-');
  const v = parseMoney(neg ? s.slice(1) : s);
  return v == null ? null : (neg ? -v : v);
}

/** Tạo id giao dịch ở client (UUID) để đồng bộ không bị trùng. */
export function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  // Dự phòng cho ngữ cảnh không an toàn (http thường ngoài localhost)
  return ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, (c) =>
    (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16));
}

const pad = (n) => String(n).padStart(2, '0');

/** Date -> ISO 8601 theo giờ địa phương kèm offset, vd "2026-10-06T12:30:00+07:00". */
export function toLocalIso(d = new Date()) {
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` +
    `${sign}${pad(Math.floor(Math.abs(off) / 60))}:${pad(Math.abs(off) % 60)}`;
}

/** Giá trị cho <input type="datetime-local">: lấy đúng giờ địa phương đã ghi trong chuỗi ISO. */
export const toInputValue = (iso) => iso.substring(0, 16);
export const fromInputValue = (v) => toLocalIso(new Date(v));

/** "2026-10" -> "Tháng 10/2026" */
export function monthLabel(key) {
  const [y, m] = key.split('-');
  return `Tháng ${Number(m)}/${y}`;
}

/** "2026-10-06T..." -> "Thứ Ba, 06/10" */
export function dayLabel(iso) {
  const [y, m, d] = iso.substring(0, 10).split('-').map(Number);
  const names = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
  return `${names[new Date(y, m - 1, d).getDay()]}, ${pad(d)}/${pad(m)}`;
}

/** "2026-10-06T12:30:00+07:00" -> "12:30" */
export const timeOf = (iso) => iso.substring(11, 16);

/** Khóa tháng "YYYY-MM" của một Date hoặc chuỗi ISO. */
export function monthKey(v = new Date()) {
  return typeof v === 'string' ? v.substring(0, 7) : `${v.getFullYear()}-${pad(v.getMonth() + 1)}`;
}

/** Cộng/trừ tháng cho khóa "YYYY-MM". */
export function shiftMonth(key, delta) {
  const [y, m] = key.split('-').map(Number);
  return monthKey(new Date(y, m - 1 + delta, 1));
}
