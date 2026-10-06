# Bước 7 – Deploy lên Cloudflare Pages (miễn phí)

Dự án chỉ gồm file tĩnh, **không có bước build**. Cloudflare Pages tự cấp HTTPS (bắt buộc để cài PWA và chạy service worker).

Trước khi bắt đầu: có tài khoản Cloudflare miễn phí (https://dash.cloudflare.com/sign-up).

---

## Cách 1: Kéo thả thư mục (nhanh nhất)

1. Đăng nhập Cloudflare → **Workers & Pages** → **Create** (Tạo).
2. Chọn tab/mục **Pages** → **Upload assets** (Tải lên tài sản).
   > Giao diện Cloudflare hay thay đổi. Nếu màn hình mặc định là Workers, tìm dòng "Looking to deploy Pages? **Get started**" ở cuối trang.
3. Đặt **Project name**, ví dụ `moneycontrol`. Link sẽ là `https://moneycontrol.pages.dev`. Bấm **Create project**.
4. Kéo thả **thư mục `D:\Projects\MoneyControl`** vào ô tải lên.
   - `index.html` phải nằm ở gốc của thứ được upload. Nếu thấy `index.html` nằm trong một thư mục con thì bạn đã kéo nhầm cấp.
   - Không cần xóa `apps-script/` hay các file `.md`; chúng không chứa thông tin bí mật.
5. Bấm **Deploy site**. Sau vài giây có link `https://<tên>.pages.dev`.

**Cập nhật về sau:** vào project → **Deployments** → **Create new deployment** → kéo thả lại thư mục. (Nhớ tăng `VERSION` trong `sw.js`, xem mục "Cập nhật phiên bản" bên dưới.)

> Lưu ý: project tạo bằng kéo thả **không đổi sang kết nối GitHub được**. Muốn dùng GitHub thì tạo project mới theo cách 2.

---

## Cách 2: Kết nối GitHub (tự cập nhật mỗi lần push)

Repo: https://github.com/dungpt162/MoneyControl (nhánh `main`).

1. **Workers & Pages** → **Create** → **Pages** → **Connect to Git**.
2. Cho phép Cloudflare truy cập GitHub (chỉ cần chọn repo `MoneyControl`) → chọn repo → **Begin setup**.
3. Cấu hình build:
   | Mục | Giá trị |
   |---|---|
   | Project name | `moneycontrol` |
   | Production branch | `main` |
   | Framework preset | **None** |
   | Build command | **để trống** |
   | Build output directory | `/` (hoặc để trống) |
   | Root directory | để trống |
   > Nếu Cloudflare bắt buộc nhập lệnh build, hãy xem lại: dự án không có `package.json`, nên để trống là đúng. Không điền `npm run build`.
4. Bấm **Save and Deploy**. Lần đầu mất khoảng 1 phút, kết quả là `https://moneycontrol.pages.dev`.
5. Từ giờ, mỗi lần `git push` lên `main`, Cloudflare tự deploy bản mới. Nhánh khác sẽ có link xem thử riêng (Preview).

---

## Cập nhật phiên bản (quan trọng)

Service worker lưu file trong cache theo tên phiên bản. Mỗi lần deploy bản có thay đổi:

1. Mở `sw.js`, tăng `VERSION` (ví dụ `'v10'` → `'v11'`).
2. Nếu thêm file `.js` mới, thêm tên file vào danh sách `ASSETS` trong `sw.js`.
3. Push hoặc upload lại.

Lần mở app tiếp theo, trình duyệt phát hiện `sw.js` đổi, tải file mới và tự tải lại trang một lần. Kiểm tra bằng dòng **Phiên bản** trong **Cài đặt → Ứng dụng**.

---

## Mở trên điện thoại và thêm vào màn hình chính

1. Mở link `https://<tên>.pages.dev` trên điện thoại.
2. Vào **Cài đặt** của app, nhập **URL Apps Script** và **Token**, bấm **Lưu & kiểm tra kết nối**. (Gõ token bằng cách dán từ ghi chú hoặc trình quản lý mật khẩu, tránh gõ tay.)
3. Thêm vào màn hình chính:
   - **Android (Chrome):** menu ⋮ → **Cài đặt ứng dụng** (hoặc **Thêm vào Màn hình chính**). Cũng có nút **Cài app lên màn hình chính** trong Cài đặt → Ứng dụng của app.
   - **iPhone (Safari):** nút **Chia sẻ** ⬆️ → **Thêm vào MH chính** → **Thêm**. (Phải dùng Safari.)
4. Mở app từ biểu tượng ngoài màn hình chính: app chạy toàn màn hình như ứng dụng thường.
5. Thử offline: bật chế độ máy bay, mở app (vẫn vào được), thêm một giao dịch (hiện ⏳). Tắt chế độ máy bay: giao dịch tự lên Sheet.

> URL Apps Script và token chỉ lưu trên từng thiết bị. Mỗi thiết bị (máy tính, điện thoại) nhập một lần. Dữ liệu cùng nằm trong một Google Sheet nên hai thiết bị tự khớp nhau sau khi đồng bộ.

---

## Lỗi thường gặp

| Triệu chứng | Cách xử lý |
|---|---|
| Không thấy bản mới sau khi deploy | Chưa tăng `VERSION` trong `sw.js`. Tăng rồi deploy lại. Trên máy tính có thể Ctrl+F5 hoặc F12 → Application → Service Workers → Unregister. |
| Nút cài app không hiện | Cần HTTPS (link `pages.dev` đã có sẵn) và đã mở trang ít nhất một lần. iPhone không có nút này, dùng Chia sẻ → Thêm vào MH chính. |
| "Dữ liệu không hợp lệ" khi kết nối | URL Apps Script phải kết thúc bằng `/exec`, và deployment phải đặt **Who has access: Anyone**. |
| "Sai token" | Token trong app phải trùng giá trị `TOKEN` trong Script Properties của Apps Script. |
| Sửa `Code.gs` mà không có tác dụng | Cần tạo phiên bản deployment mới (Triển khai → Quản lý bản triển khai → Chỉnh sửa → Phiên bản mới). |
| Trang trắng sau deploy | Mở F12 → Console. Thường do thiếu file trong thư mục `vendor/` (đã được commit sẵn trong repo). |

## Tùy chọn
- **Tên miền riêng:** project → **Custom domains** → thêm tên miền của bạn.
- **Giới hạn người truy cập:** link `pages.dev` ai biết đều mở được giao diện, nhưng không đọc được dữ liệu nếu không có URL Apps Script và token. Nếu muốn khóa cả giao diện, dùng **Cloudflare Access** (miễn phí cho tối đa 50 người dùng).
