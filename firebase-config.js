// Firebase Web config không phải là khóa bí mật. Quyền truy cập được bảo vệ bởi firestore.rules.
// Thay các giá trị PASTE_* bằng cấu hình lấy từ Firebase Console > Project settings > Your apps.
window.LAB_CONFIG = {
  firebase: {
    apiKey: 'PASTE_API_KEY',
    authDomain: 'PASTE_PROJECT_ID.firebaseapp.com',
    projectId: 'PASTE_PROJECT_ID',
    storageBucket: 'PASTE_PROJECT_ID.firebasestorage.app',
    messagingSenderId: 'PASTE_MESSAGING_SENDER_ID',
    appId: 'PASTE_APP_ID'
  },
  // Sửa đúng tên miền email Google Workspace for Education của trường/phòng Lab.
  allowedDomains: ['vlute.edu.vn'],
  // Sửa đúng email Google của bạn. Phải giống ADMIN_EMAIL trong firestore.rules.
  adminEmails: ['ADMIN_EMAIL@vlute.edu.vn']
};
