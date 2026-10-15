// Tính toán phân tích chi tiêu: tiến độ tháng, tốc độ chi, so sánh cùng kỳ tháng trước, cảnh báo ngân sách.
import { monthKey, daysInMonth } from './utils.js';

/**
 * Tiến độ của tháng đang xem.
 * Tháng hiện tại: day = hôm nay; tháng đã qua: day = cả tháng; tháng tương lai: day = 0.
 */
export function monthProgress(month) {
  const days = daysInMonth(month);
  const now = monthKey();
  let day = days, current = false;
  if (month === now) { day = new Date().getDate(); current = true; }
  else if (month > now) day = 0;
  return { day, days, current, ratio: day / days };
}

/** Tổng chi của các giao dịch trong ngày 1..day, gom theo danh mục. */
export function spentByCategory(txs, day = 31) {
  const map = {};
  for (const t of txs) {
    if (t.loai !== 'chi') continue;
    if (Number(t.ngay_gio.substring(8, 10)) > day) continue;
    map[t.danh_muc] = (map[t.danh_muc] || 0) + t.so_tien;
  }
  return map;
}

/**
 * Đánh giá nhịp chi so với ngân sách (chỉ có nghĩa với tháng hiện tại).
 * Trả về null nếu không cần cảnh báo, ngược lại { level: 'over'|'fast', text }.
 *  - over: đã vượt hạn mức
 *  - fast: chi nhanh hơn nhịp tháng (dùng % nhiều hơn % thời gian đã qua ít nhất 15 điểm,
 *          hoặc dự kiến cuối tháng vượt hạn mức)
 */
export function budgetPace(used, limit, progress, fmt) {
  if (!limit) return null;
  const pct = used / limit;
  if (pct > 1) return { level: 'over', text: `đã vượt ngân sách ${fmt(used - limit)}` };
  if (!progress.current || progress.day < 3) return null;
  const forecast = (used / progress.day) * progress.days;
  const usedPct = Math.round(pct * 100), timePct = Math.round(progress.ratio * 100);
  if (pct - progress.ratio >= 0.15 || (forecast > limit * 1.05 && pct >= 0.5)) {
    return { level: 'fast', text: `đã qua ${timePct}% tháng nhưng dùng ${usedPct}% ngân sách, dự kiến cuối tháng ${fmt(forecast)}` };
  }
  return null;
}

// ---------- Khoản định kỳ ----------

/**
 * Các khoản định kỳ đã đến hạn trong tháng hiện tại và chưa được xử lý.
 * recurring[i].last = tháng "YYYY-MM" gần nhất đã ghi nhận hoặc bỏ qua.
 * Chỉ nhắc cho tháng hiện tại (tháng đã lỡ không dồn lại).
 */
export function dueRecurring(recurring, now = new Date()) {
  const month = monthKey(now);
  const dim = daysInMonth(month);
  return (recurring || []).filter((r) => (r.last || '') < month && now.getDate() >= Math.min(r.day, dim));
}

/** Ngày giờ phát sinh của một khoản định kỳ trong tháng "YYYY-MM" (8:00, ngày bị chặn ở cuối tháng). */
export function recurringDate(r, month) {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m - 1, Math.min(r.day, daysInMonth(month)), 8, 0);
}
