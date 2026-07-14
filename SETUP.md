# Cấu hình đăng nhập Google và điểm danh

Website đã có đầy đủ giao diện và logic. Cần kết nối một dự án Firebase của phòng Lab trước khi sử dụng thật.

## 1. Tạo Firebase

1. Vào [Firebase Console](https://console.firebase.google.com/), tạo project và thêm **Web app**.
2. Mở **Authentication > Sign-in method**, bật nhà cung cấp **Google**.
3. Mở **Firestore Database**, tạo database ở Production mode.
4. Trong **Authentication > Settings > Authorized domains**, thêm `hmslab.store` và `hmslab-hitechlab.github.io` nếu dùng các địa chỉ này.

## 2. Điền cấu hình website

Mở `firebase-config.js`:

- Thay toàn bộ giá trị `PASTE_*` bằng `firebaseConfig` của Web app.
- Sửa `allowedDomains` thành tên miền Google Workspace for Education thực tế.
- Sửa `ADMIN_EMAIL@vlute.edu.vn` thành email Google của admin.

Mở `firestore.rules` và thay `ADMIN_EMAIL@vlute.edu.vn` bằng **chính xác cùng email admin**. Email này sẽ tự được tạo với quyền admin trong lần đăng nhập đầu tiên. Các email khác luôn bắt đầu ở trạng thái chờ duyệt.

## 3. Deploy luật bảo mật

Cài Firebase CLI, đăng nhập rồi chạy trong thư mục dự án:

```bash
npm install -g firebase-tools
firebase login
firebase use --add
firebase deploy --only firestore
```

Sau đó đưa các file website lên GitHub Pages. Đăng nhập admin trước, rồi người dùng đăng nhập để gửi yêu cầu phê duyệt.

## Lưu ý bảo mật

`firebase-config.js` được phép công khai trên GitHub; đây là mã nhận diện Web app, không phải mật khẩu. Quyền đọc/ghi dữ liệu nằm trong `firestore.rules`. Không thêm service-account JSON hoặc private key vào repository.
