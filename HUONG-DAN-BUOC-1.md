# Bước 1 – Tạo Google Sheet và triển khai Apps Script

## A. Tạo Sheet và dán code
1. Vào https://sheets.new để tạo Google Sheet mới, đặt tên `MoneyControl`.
2. Menu **Tiện ích mở rộng (Extensions) → Apps Script**.
3. Xóa code mẫu trong `Code.gs`, dán toàn bộ nội dung file `apps-script/Code.gs`. Bấm **Lưu** (Ctrl+S).

## B. Đặt token bí mật
1. Trong Apps Script, bấm biểu tượng **Cài đặt dự án** (bánh răng bên trái).
2. Cuộn xuống **Thuộc tính tập lệnh (Script properties) → Thêm thuộc tính tập lệnh**.
3. Thuộc tính: `TOKEN`, Giá trị: một chuỗi dài ngẫu nhiên (vd 32 ký tự, tự tạo bằng trình quản lý mật khẩu). Lưu lại.
   Token này sẽ nhập vào màn hình Cài đặt của app, không ghi trong code.

## C. Khởi tạo tab
1. Quay lại **Trình chỉnh sửa**, chọn hàm `setup` ở thanh trên, bấm **Chạy**.
2. Lần đầu Google yêu cầu cấp quyền: **Xem xét quyền** → chọn tài khoản → **Nâng cao** → **Đi tới ... (không an toàn)** → **Cho phép**. (Bình thường với script của chính bạn.)
3. Kiểm tra Sheet: có tab `Config` (danh mục và ví mẫu) và tab tháng hiện tại (`2026-10`).

## D. Triển khai Web app
1. Bấm **Triển khai (Deploy) → Tùy chọn triển khai mới (New deployment)**.
2. Biểu tượng bánh răng → chọn **Ứng dụng web (Web app)**.
3. Cấu hình:
   - **Execute as / Thực thi với tư cách**: *Me (tài khoản của bạn)*
   - **Who has access / Ai có quyền truy cập**: *Anyone (Bất kỳ ai)*
4. Bấm **Triển khai**, sao chép **URL ứng dụng web** (dạng `https://script.google.com/macros/s/AKfy.../exec`).

> Vì "Anyone" nên URL ai có cũng gọi được, nhưng mọi request đều bị từ chối nếu sai token. Đừng chia sẻ URL lẫn token.

> **Quan trọng:** mỗi lần sửa `Code.gs`, thay đổi chỉ có hiệu lực sau khi tạo **phiên bản mới**:
> **Triển khai → Quản lý bản triển khai → biểu tượng bút chì → Phiên bản: Phiên bản mới → Triển khai**.
> URL giữ nguyên. (Nếu chọn "Tùy chọn triển khai mới" thì sẽ ra URL khác.)

## E. Chạy thử API
Thay `URL` và `TOKEN` bằng giá trị của bạn. Dùng PowerShell:

```powershell
$URL = "https://script.google.com/macros/s/XXXX/exec"
$TOKEN = "token-cua-ban"

# 1. Ping (kỳ vọng ok = true)
Invoke-RestMethod "$URL?action=ping&token=$TOKEN"

# 2. Sai token (kỳ vọng error UNAUTHORIZED)
Invoke-RestMethod "$URL?action=ping&token=sai"

# 3. Lấy Config
Invoke-RestMethod "$URL?action=getConfig&token=$TOKEN" | ConvertTo-Json -Depth 5

# 4. Thêm giao dịch (POST, text/plain giống như frontend sẽ gửi)
$id = [guid]::NewGuid().ToString()
$body = @{
  token = $TOKEN; action = "addTransaction"
  tx = @{ id = $id; ngay_gio = "2026-10-06T12:30:00+07:00"; loai = "chi"; so_tien = 50000
          danh_muc = "Ăn uống"; vi = "Tiền mặt"; ghi_chu = "Bún bò" }
} | ConvertTo-Json -Depth 5
Invoke-RestMethod -Method Post -Uri $URL -ContentType "text/plain;charset=utf-8" -Body ([Text.Encoding]::UTF8.GetBytes($body))

# 5. Lấy giao dịch tháng
Invoke-RestMethod "$URL?action=getTransactions&token=$TOKEN&month=2026-10" | ConvertTo-Json -Depth 5

# 6. Sửa: đổi ngày sang tháng 11 -> giao dịch chuyển từ tab 2026-10 sang tab 2026-11
$body = @{
  token = $TOKEN; action = "updateTransaction"; oldMonth = "2026-10"
  tx = @{ id = $id; ngay_gio = "2026-11-01T08:00:00+07:00"; loai = "chi"; so_tien = 55000
          danh_muc = "Ăn uống"; vi = "Tiền mặt"; ghi_chu = "Bún bò (sửa)" }
} | ConvertTo-Json -Depth 5
Invoke-RestMethod -Method Post -Uri $URL -ContentType "text/plain;charset=utf-8" -Body ([Text.Encoding]::UTF8.GetBytes($body))

# 7. Xóa
$body = @{ token = $TOKEN; action = "deleteTransaction"; id = $id } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri $URL -ContentType "text/plain;charset=utf-8" -Body ([Text.Encoding]::UTF8.GetBytes($body))

# 8. Số dư ví
Invoke-RestMethod "$URL?action=getBalances&token=$TOKEN" | ConvertTo-Json
```

Cách kiểm tra nhanh hơn: dán `URL?action=ping&token=TOKEN` vào trình duyệt, sẽ thấy `{"ok":true,...}`.

## Quy ước dữ liệu cần nhớ
- Mọi phản hồi dạng `{ ok: true, data: ... }` hoặc `{ ok: false, error: { code, message } }`. Mã lỗi: `UNAUTHORIZED`, `BAD_TX`, `BAD_MONTH`, `NOT_FOUND`, `BUSY`, `UNKNOWN_ACTION`...
- `ngay_gio` gửi dạng ISO 8601 theo giờ địa phương có offset (vd `2026-10-06T12:30:00+07:00`); tháng của giao dịch lấy từ 7 ký tự đầu.
- Giao dịch `chuyen`: `vi` = ví nguồn, `danh_muc` = ví đích.
- `addTransaction` an toàn khi gửi lặp (trùng id thì ghi đè), nên hàng đợi offline gửi lại không bị trùng. Có thêm action `batch` để đẩy cả hàng đợi trong một request.
- Tab `Config` có cột `loai | ten | icon | mau | gia_tri` với loai = `danhmuc`, `vi` (gia_tri = số dư đầu kỳ) hoặc `ngansach` (gia_tri = hạn mức tháng). Bạn không cần sửa tay, app sẽ ghi qua `updateConfig`.

Khi chạy thử xong thì báo tôi, tôi sẽ làm **Bước 2** (khung dự án, vendor, màn hình Cài đặt, kết nối thử API). Hãy gửi tôi kết quả bước 1, nhất là lỗi nếu có.
