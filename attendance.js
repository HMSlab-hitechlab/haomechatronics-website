import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js';
import { getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut } from 'https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js';
import { addDoc, collection, doc, getDoc, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc, where } from 'https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js';

const config = window.LAB_CONFIG || {};
const firebaseReady = config.firebase && !Object.values(config.firebase).some(value => !value || String(value).includes('PASTE_'));
const zones = { robot: 'Khu Robot', design: 'Khu thiết kế', electronics: 'Bàn điện tử', meeting: 'Bàn họp' };
const $ = selector => document.querySelector(selector);
const toast = $('#toast');
let auth;
let db;
let currentUser;
let currentProfile;
let presences = [];
let accounts = [];
let accountFilter = 'all';
let authorizedUid = '';
let unsubscribers = [];

function notify(message, error = false) {
  toast.textContent = message;
  toast.classList.toggle('error', error);
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2800);
}

function updateClock() {
  const now = new Date();
  $('#liveTime').textContent = now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  $('#liveDate').textContent = now.toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
}

function domainAllowed(email = '') {
  const domains = config.allowedDomains || [];
  return domains.some(domain => email.toLowerCase().endsWith(`@${domain.toLowerCase()}`));
}

function isBootstrapAdmin(email = '') {
  return (config.adminEmails || []).some(admin => admin.toLowerCase() === email.toLowerCase());
}

function resetSubscriptions() {
  unsubscribers.forEach(unsubscribe => unsubscribe());
  unsubscribers = [];
  authorizedUid = '';
}

function showOnly(target) {
  ['#loginPanel', '#approvalPanel', '#labApp'].forEach(selector => $(selector).classList.toggle('hidden', selector !== target));
}

function renderApproval(profile, user) {
  showOnly('#approvalPanel');
  const rejected = profile.status === 'rejected';
  $('#approvalIcon').textContent = rejected ? '×' : '⌛';
  $('#approvalTitle').textContent = rejected ? 'Tài khoản đã bị từ chối' : 'Đang chờ phê duyệt';
  $('#approvalMessage').textContent = rejected ? 'Vui lòng liên hệ quản trị viên phòng Lab nếu bạn cho rằng đây là nhầm lẫn.' : 'Yêu cầu của bạn đã được gửi đến quản trị viên. Trang sẽ tự cập nhật khi được duyệt.';
  $('#pendingAvatar').src = user.photoURL || '';
  $('#pendingName').textContent = user.displayName || 'Thành viên';
  $('#pendingEmail').textContent = user.email;
}

async function ensureProfile(user) {
  const ref = doc(db, 'users', user.uid);
  const snapshot = await getDoc(ref);
  if (snapshot.exists()) {
    await updateDoc(ref, { displayName: user.displayName || '', photoURL: user.photoURL || '', lastLoginAt: serverTimestamp() });
    return snapshot.data();
  }
  const bootstrapAdmin = isBootstrapAdmin(user.email);
  const profile = {
    uid: user.uid,
    email: user.email.toLowerCase(),
    displayName: user.displayName || '',
    photoURL: user.photoURL || '',
    role: bootstrapAdmin ? 'admin' : 'user',
    status: bootstrapAdmin ? 'approved' : 'pending',
    createdAt: serverTimestamp(),
    lastLoginAt: serverTimestamp()
  };
  await setDoc(ref, profile);
  return profile;
}

function watchProfile(user) {
  const unsubscribe = onSnapshot(doc(db, 'users', user.uid), snapshot => {
    if (!snapshot.exists()) return;
    currentProfile = { id: snapshot.id, ...snapshot.data() };
    if (currentProfile.status !== 'approved') {
      renderApproval(currentProfile, user);
      return;
    }
    renderAuthorized(user, currentProfile);
  }, () => notify('Không thể đọc trạng thái tài khoản.', true));
  return unsubscribe;
}

function renderAuthorized(user, profile) {
  showOnly('#labApp');
  $('#userAvatar').src = user.photoURL || '';
  $('#userName').textContent = user.displayName || 'Thành viên';
  $('#userEmail').textContent = user.email;
  $('#userAccessLabel').textContent = profile.role === 'admin' ? 'QUẢN TRỊ VIÊN' : 'THÀNH VIÊN ĐÃ DUYỆT';
  $('#adminPanel').classList.toggle('hidden', profile.role !== 'admin');
  if (authorizedUid === user.uid) return;
  authorizedUid = user.uid;
  watchPresence();
  watchAttendance();
  if (profile.role === 'admin') watchAccounts();
}

function watchPresence() {
  unsubscribers.push(onSnapshot(collection(db, 'presence'), snapshot => {
    presences = snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
    renderMap();
    renderMyPresence();
  }, () => notify('Không thể tải sơ đồ phòng Lab.', true)));
}

function renderMap() {
  const online = presences.filter(item => item.inside);
  $('#onlineCount').textContent = `${online.length} người`;
  document.querySelectorAll('.lab-zone').forEach(zone => {
    const people = online.filter(item => item.zone === zone.dataset.zone);
    zone.classList.toggle('occupied', people.length > 0);
    zone.querySelector('.zone-people').innerHTML = people.map(person => `<img src="${escapeText(safePhoto(person.photoURL))}" alt="${escapeText(person.displayName || 'Thành viên')}" title="${escapeText(person.displayName || 'Thành viên')}">`).join('');
  });
}

function renderMyPresence() {
  const mine = presences.find(item => item.id === currentUser?.uid);
  const inside = Boolean(mine?.inside);
  $('.presence-card').classList.toggle('active', inside);
  $('#presenceStatus').textContent = inside ? 'Đang có mặt tại Lab' : 'Chưa vào Lab';
  $('#presenceZone').textContent = inside ? zones[mine.zone] || '' : '';
  $('#zoneSelect').value = inside ? mine.zone : $('#zoneSelect').value;
  $('#zoneSelect').disabled = inside;
  $('#checkInBtn').disabled = inside;
  $('#checkOutBtn').disabled = !inside;
}

function watchAttendance() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const q = query(collection(db, 'attendance'), where('timestamp', '>=', today), orderBy('timestamp', 'desc'));
  unsubscribers.push(onSnapshot(q, snapshot => {
    const records = snapshot.docs.map(item => item.data());
    $('#todayCount').textContent = `${records.length} lượt`;
    $('#attendanceList').innerHTML = records.length ? records.map(record => {
      const time = record.timestamp?.toDate?.().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) || '--:--';
      const action = record.type === 'in' ? `Check-in · ${zones[record.zone] || 'Vào Lab'}` : 'Check-out · Rời Lab';
      return `<div class="log-item"><span class="log-dot ${record.type === 'out' ? 'out' : ''}"></span><div><strong>${escapeText(record.displayName)}</strong><small>${escapeText(action)}</small></div><time>${time}</time></div>`;
    }).join('') : '<div class="empty-log">Chưa có hoạt động điểm danh.</div>';
  }, error => notify(error.code === 'failed-precondition' ? 'Firestore đang tạo chỉ mục. Xem hướng dẫn SETUP.md.' : 'Không thể tải lịch sử điểm danh.', true)));
}

function escapeText(value = '') {
  const node = document.createElement('div');
  node.textContent = value;
  return node.innerHTML;
}

function safePhoto(value = '') {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.href : '';
  } catch {
    return '';
  }
}

function watchAccounts() {
  unsubscribers.push(onSnapshot(collection(db, 'users'), snapshot => {
    accounts = snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
    const pending = accounts.filter(account => account.status === 'pending').length;
    $('#requestCount').textContent = `${pending} chờ duyệt`;
    renderAccounts();
  }, () => notify('Không thể tải danh sách tài khoản.', true)));
}

function renderAccounts() {
  const visible = accountFilter === 'all' ? accounts : accounts.filter(account => account.status === accountFilter);
  $('#accountList').innerHTML = visible.length ? [...visible].sort((a, b) => Number(b.status === 'pending') - Number(a.status === 'pending')).map(account => `
      <article class="account-row" data-uid="${account.id}">
        <img src="${escapeText(safePhoto(account.photoURL))}" alt=""><div class="account-info"><strong>${escapeText(account.displayName || 'Chưa có tên')}</strong><small>${escapeText(account.email)}</small></div>
        <span class="account-status ${account.status}">${{ pending: 'Chờ duyệt', approved: 'Đã duyệt', rejected: 'Từ chối' }[account.status] || account.status}</span>
        <div class="account-actions">${account.role === 'admin' ? '<b>ADMIN</b>' : `<button data-action="approve" type="button">Cho phép</button><button data-action="reject" type="button">Từ chối</button>`}</div>
      </article>`).join('') : '<div class="empty-log">Không có tài khoản trong nhóm này.</div>';
}

async function updateAccount(uid, status) {
  try {
    await updateDoc(doc(db, 'users', uid), { status, reviewedAt: serverTimestamp(), reviewedBy: currentUser.uid });
    notify(status === 'approved' ? 'Đã cho phép tài khoản đăng nhập.' : 'Đã từ chối tài khoản.');
  } catch (error) {
    notify('Bạn không có quyền thực hiện thao tác này.', true);
  }
}

async function recordAttendance(type) {
  if (!currentUser || currentProfile?.status !== 'approved') return;
  const zone = $('#zoneSelect').value;
  if (type === 'in' && !zone) return notify('Hãy chọn vị trí trên sơ đồ trước khi check-in.', true);
  const presenceRef = doc(db, 'presence', currentUser.uid);
  const data = { uid: currentUser.uid, email: currentUser.email, displayName: currentUser.displayName || 'Thành viên', photoURL: currentUser.photoURL || '', inside: type === 'in', zone: type === 'in' ? zone : '', updatedAt: serverTimestamp() };
  try {
    await setDoc(presenceRef, data, { merge: true });
    await addDoc(collection(db, 'attendance'), { ...data, type, timestamp: serverTimestamp() });
    notify(type === 'in' ? `Đã check-in tại ${zones[zone]}.` : 'Đã check-out khỏi Lab.');
  } catch (error) {
    notify('Không thể ghi nhận điểm danh. Vui lòng thử lại.', true);
  }
}

$('#googleLoginBtn').addEventListener('click', async () => {
  if (!firebaseReady) return notify('Firebase chưa được cấu hình.', true);
  const provider = new GoogleAuthProvider();
  if (config.allowedDomains?.[0]) provider.setCustomParameters({ hd: config.allowedDomains[0], prompt: 'select_account' });
  try { await signInWithPopup(auth, provider); } catch (error) { if (error.code !== 'auth/popup-closed-by-user') notify('Không thể đăng nhập Google. Vui lòng thử lại.', true); }
});

['#logoutBtn', '#pendingLogoutBtn'].forEach(selector => $(selector).addEventListener('click', () => signOut(auth)));
$('#checkInBtn').addEventListener('click', () => recordAttendance('in'));
$('#checkOutBtn').addEventListener('click', () => recordAttendance('out'));
$('#labMap').addEventListener('click', event => {
  const zone = event.target.closest('.lab-zone');
  if (!zone || $('#zoneSelect').disabled) return;
  $('#zoneSelect').value = zone.dataset.zone;
  document.querySelectorAll('.lab-zone').forEach(item => item.classList.toggle('selected', item === zone));
});
$('#zoneSelect').addEventListener('change', event => document.querySelectorAll('.lab-zone').forEach(item => item.classList.toggle('selected', item.dataset.zone === event.target.value)));
$('#accountList').addEventListener('click', event => {
  const action = event.target.closest('[data-action]');
  const row = event.target.closest('[data-uid]');
  if (action && row) updateAccount(row.dataset.uid, action.dataset.action === 'approve' ? 'approved' : 'rejected');
});
document.querySelectorAll('.account-filter').forEach(button => button.addEventListener('click', () => {
  document.querySelector('.account-filter.active').classList.remove('active');
  button.classList.add('active');
  accountFilter = button.dataset.status;
  renderAccounts();
}));

updateClock();
setInterval(updateClock, 30000);
$('#domainHint').textContent = config.allowedDomains?.length ? `Chỉ chấp nhận: ${config.allowedDomains.join(', ')}. Tài khoản mới cần admin phê duyệt.` : 'Cấu hình tên miền giáo dục trong firebase-config.js.';

if (!firebaseReady) {
  $('#setupNotice').classList.remove('hidden');
  $('#setupNotice').innerHTML = '<strong>Cần cấu hình Firebase trước khi sử dụng.</strong><span>Mở file <code>SETUP.md</code> và làm theo hướng dẫn.</span>';
} else {
  const app = initializeApp(config.firebase);
  auth = getAuth(app);
  db = getFirestore(app);
  onAuthStateChanged(auth, async user => {
    resetSubscriptions();
    currentUser = user;
    currentProfile = null;
    if (!user) return showOnly('#loginPanel');
    if (!domainAllowed(user.email)) {
      notify('Tài khoản này không thuộc tên miền giáo dục được phép.', true);
      await signOut(auth);
      return;
    }
    try {
      await ensureProfile(user);
      unsubscribers.push(watchProfile(user));
    } catch (error) {
      notify('Không thể tạo hồ sơ. Kiểm tra Firebase Rules và email admin.', true);
      await signOut(auth);
    }
  });
}
