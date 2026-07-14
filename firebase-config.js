// Firebase Web config không phải là khóa bí mật. Quyền truy cập được bảo vệ bởi firestore.rules.
// Cấu hình Web app của project haomechatronicslab.
window.LAB_CONFIG = {
  firebase: {
    apiKey: 'AIzaSyBCKoVTO5yCWh4CA8UJNGGDZaSns42vdNI',
    authDomain: 'haomechatronicslab.firebaseapp.com',
    projectId: 'haomechatronicslab',
    storageBucket: 'haomechatronicslab.firebasestorage.app',
    messagingSenderId: '268530035350',
    appId: '1:268530035350:web:13bc5a75673dcd8508b0b7',
    measurementId: 'G-F8KL7EB4Q6'
  },
  // Sửa đúng tên miền email Google Workspace for Education của trường/phòng Lab.
  allowedDomains: ['st.vlute.edu.vn'],
  // Sửa đúng email Google của bạn. Phải giống ADMIN_EMAIL trong firestore.rules.
  adminEmails: ['25902004@st.vlute.edu.vn']
};
