# Cấu hình đăng nhập Google và điểm danh

Website đã có đầy đủ giao diện và logic. Cần kết nối một dự án Firebase của phòng Lab trước khi sử dụng thật.

## 1. Tạo Firebase

1. Vào [Firebase Console](https://console.firebase.google.com/), tạo project và thêm **Web app**.
2. Mở **Authentication > Sign-in method**, bật nhà cung cấp **Google**.
3. Mở **Firestore Database**, tạo database ở Production mode.
4. Trong **Authentication > Settings > Authorized domains**, thêm `hmslab.store` và `hmslab-hitechlab.github.io` nếu dùng các địa chỉ này.

## 2. Điền cấu hình website

Mở `firebase-config.js`:

- Firebase Web config của project `haomechatronicslab` đã được điền trong `firebase-config.js`.
- Tên miền Google Workspace for Education hiện được đặt là `st.vlute.edu.vn`.
- Email admin hiện được đặt là `25902004@st.vlute.edu.vn`.

Email `25902004@st.vlute.edu.vn` trong `firestore.rules` sẽ tự được tạo với quyền admin trong lần đăng nhập đầu tiên. Các email khác luôn bắt đầu ở trạng thái chờ duyệt.

## 3. Deploy luật bảo mật

Cài Firebase CLI, đăng nhập rồi chạy trong thư mục dự án:

```bash
npm install -g firebase-tools
firebase login
firebase use --add
firebase deploy --only firestore
```

Sau đó đưa các file website lên GitHub Pages. Đăng nhập admin trước, rồi người dùng đăng nhập để gửi yêu cầu phê duyệt.

Mỗi khi file `firestore.rules` được cập nhật (ví dụ thêm tính năng đặt chỗ), cần chạy lại `firebase deploy --only firestore:rules` hoặc dán nội dung file vào tab **Firestore Database > Rules** và nhấn **Publish**.

## 4. Ảnh đại diện thành viên

Admin có thể chọn ảnh trực tiếp từ máy khi chỉnh thành viên. Trình duyệt tự thu nhỏ ảnh còn tối đa 256 px, chuyển sang WebP và giới hạn ảnh đã nén dưới 40 KB trước khi lưu cùng hồ sơ trên Firestore. File ảnh gốc lớn hơn 3 MB sẽ bị từ chối. Cách này hoạt động trên gói Spark và không yêu cầu bật Firebase Storage.

## Lưu ý bảo mật

`firebase-config.js` được phép công khai trên GitHub; đây là mã nhận diện Web app, không phải mật khẩu. Quyền đọc/ghi dữ liệu nằm trong `firestore.rules`. Không thêm service-account JSON hoặc private key vào repository.
