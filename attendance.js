import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js';
import { getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut } from 'https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js';
import { addDoc, collection, doc, getDoc, getFirestore, increment, onSnapshot, orderBy, query, serverTimestamp, setDoc, Timestamp, updateDoc, where, writeBatch } from 'https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js';

const config = window.LAB_CONFIG || {};
const firebaseReady = config.firebase && !Object.values(config.firebase).some(value => !value || String(value).includes('PASTE_'));
const zones = { robot: 'Khu Robot & MPS', design: 'Khu thiết kế CAD', electronics: 'Bàn điện tử & IoT', meeting: 'Bàn họp nhóm' };
const statusLabels = { reserved: 'Đã đặt', checkedIn: 'Đang sử dụng', completed: 'Hoàn thành', cancelled: 'Đã hủy', noShow: 'Vắng mặt' };
const NO_SHOW_LIMIT = 3;
const classLocations = { classroom: 'Phòng học / khu vực giảng dạy', wholeLab: 'Toàn bộ phòng Lab', robot: 'Khu Robot & MPS', design: 'Khu thiết kế CAD', electronics: 'Bàn điện tử & IoT', meeting: 'Bàn họp nhóm' };
const classSessions = { morning: { label: 'Ca sáng', start: '06:30', end: '11:30' }, afternoon: { label: 'Ca chiều', start: '12:30', end: '15:30' } };
const LOCK_HOURS = 24;
const CLOSING_HOUR = 22;
const $ = selector => document.querySelector(selector);
const toast = $('#toast');

let auth;
let db;
let currentUser;
let currentProfile;
let presences = [];
let accounts = [];
let bookings = [];
let classReports = [];
let accountFilter = 'all';
let authorizedUid = '';
let autoClosing = false;
let closingTimer;
let unsubscribers = [];

function notify(message, error = false) {
  toast.textContent = message;
  toast.classList.toggle('error', error);
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3200);
}

function updateClock() {
  const now = new Date();
  $('#liveTime').textContent = now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  $('#liveDate').textContent = now.toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
  if (currentUser && currentProfile?.status === 'approved') {
    renderMap();
    renderMyPresence();
    renderBookings();
  }
}

function domainAllowed(email = '') {
  return (config.allowedDomains || []).some(domain => email.toLowerCase().endsWith(`@${domain.toLowerCase()}`));
}

function isBootstrapAdmin(email = '') {
  return (config.adminEmails || []).some(admin => admin.toLowerCase() === email.toLowerCase());
}

function resetSubscriptions() {
  unsubscribers.forEach(unsubscribe => unsubscribe());
  unsubscribers = [];
  clearTimeout(closingTimer);
  authorizedUid = '';
  presences = [];
  bookings = [];
  classReports = [];
  accounts = [];
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
  $('#pendingAvatar').src = safePhoto(user.photoURL);
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
  return onSnapshot(doc(db, 'users', user.uid), snapshot => {
    if (!snapshot.exists()) return;
    currentProfile = { id: snapshot.id, ...snapshot.data() };
    if (currentProfile.status !== 'approved') return renderApproval(currentProfile, user);
    renderAuthorized(user, currentProfile);
  }, error => notify(`Không thể đọc trạng thái tài khoản (${error.code}).`, true));
}

function renderAuthorized(user, profile) {
  showOnly('#labApp');
  $('#userAvatar').src = safePhoto(user.photoURL);
  $('#userName').textContent = user.displayName || 'Thành viên';
  $('#userEmail').textContent = user.email;
  $('#userAccessLabel').textContent = profile.role === 'admin' ? 'QUẢN TRỊ VIÊN' : 'THÀNH VIÊN ĐÃ DUYỆT';
  $('#adminPanel').classList.toggle('hidden', profile.role !== 'admin');
  $('#classReviewPanel').classList.toggle('hidden', profile.role !== 'admin');
  renderAccountWarning(profile);
  if (authorizedUid === user.uid) return;
  authorizedUid = user.uid;
  initializeBookingDefaults();
  initializeClassReportDefaults();
  scheduleClosingReconciliation();
  watchPresence();
  watchBookings();
  watchAttendance();
  watchClassReports();
  if (profile.role === 'admin') watchAccounts();
}

function renderAccountWarning(profile = {}) {
  const warning = $('#accountWarning');
  const count = Number(profile.classReportWarningCount || 0);
  if (!count) {
    warning.classList.add('hidden');
    warning.textContent = '';
    return;
  }
  warning.textContent = `Cảnh báo tài khoản: ${profile.classReportWarning || 'Báo cáo lớp học của bạn đã bị admin xác định không chính xác.'} Tổng cộng ${count} lần cảnh báo.`;
  warning.classList.remove('hidden');
}

function localDateKey(date = new Date()) {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function sameLocalDay(a, b = new Date()) {
  return localDateKey(a) === localDateKey(b);
}

function closingTime(date = new Date()) {
  const cutoff = new Date(date);
  cutoff.setHours(CLOSING_HOUR, 0, 0, 0);
  return cutoff;
}

function scheduleClosingReconciliation() {
  clearTimeout(closingTimer);
  const now = new Date();
  const cutoff = closingTime(now);
  if (now >= cutoff) return;
  closingTimer = setTimeout(() => {
    renderMap();
    renderMyPresence();
    reconcileOwnPresence();
  }, cutoff.getTime() - now.getTime() + 1000);
}

function timestampDate(value) {
  return value?.toDate?.() || (value instanceof Date ? value : null);
}

function presenceIsActive(item, now = new Date()) {
  if (!item?.inside || now >= closingTime(now)) return false;
  const updated = timestampDate(item.updatedAt);
  return Boolean(updated && sameLocalDay(updated, now));
}

function watchPresence() {
  unsubscribers.push(onSnapshot(collection(db, 'presence'), snapshot => {
    presences = snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
    renderMap();
    renderMyPresence();
    reconcileOwnPresence();
  }, error => notify(`Không thể tải trạng thái Lab (${error.code}).`, true)));
}

async function reconcileOwnPresence() {
  const mine = presences.find(item => item.id === currentUser?.uid);
  if (!mine?.inside || presenceIsActive(mine) || autoClosing) return;
  autoClosing = true;
  try {
    await setDoc(doc(db, 'presence', currentUser.uid), { inside: false, zone: '', bookingId: '', updatedAt: serverTimestamp() }, { merge: true });
    await addDoc(collection(db, 'attendance'), {
      uid: currentUser.uid,
      email: currentUser.email,
      displayName: currentUser.displayName || 'Thành viên',
      photoURL: currentUser.photoURL || '',
      inside: false,
      zone: '',
      bookingId: mine.bookingId || '',
      type: 'auto-out',
      timestamp: serverTimestamp()
    });
    if (mine.bookingId) await updateDoc(doc(db, 'bookings', mine.bookingId), { status: 'completed', checkedOutAt: serverTimestamp(), updatedAt: serverTimestamp() });
  } catch (error) {
    console.warn('Automatic checkout failed', error);
  } finally {
    autoClosing = false;
  }
}

function renderMap() {
  const now = new Date();
  const online = presences.filter(item => presenceIsActive(item, now));
  const todayBookings = bookings.filter(booking => {
    const start = timestampDate(booking.startAt);
    return start && sameLocalDay(start, now) && bookingEffectiveStatus(booking, now) !== 'cancelled';
  }).sort((a, b) => timestampDate(a.startAt) - timestampDate(b.startAt));
  const todayClasses = classReports.filter(report => {
    const start = timestampDate(report.startAt);
    return start && sameLocalDay(start, now) && ['pending', 'confirmed'].includes(report.status);
  }).sort((a, b) => timestampDate(a.startAt) - timestampDate(b.startAt));
  $('#onlineCount').textContent = `${online.length} người đang ở Lab`;
  $('#todayBookingCount').textContent = todayClasses.length ? `${todayClasses.length} ca học · ${todayBookings.length} lịch đặt` : `${todayBookings.length} lịch hôm nay`;
  document.querySelectorAll('.lab-zone').forEach(zone => {
    const people = online.filter(item => item.zone === zone.dataset.zone);
    const reservations = todayBookings.filter(item => item.zone === zone.dataset.zone);
    const classBlocks = todayClasses.filter(report => classReportBlocksZone(report, zone.dataset.zone));
    zone.classList.toggle('occupied', people.length > 0);
    zone.classList.toggle('booked', reservations.length > 0);
    zone.classList.toggle('class-blocked', classBlocks.length > 0);
    const classMarkup = classBlocks.map(report => `<span class="zone-booking class-session ${escapeText(report.status)}"><span class="zone-booking-avatar">L</span><span class="zone-booking-info"><b>Có lớp học${report.status === 'pending' ? ' · chờ xác minh' : ''}</b><small>${formatTime(report.startAt)}–${formatTime(report.endAt)}</small></span></span>`).join('');
    const bookingMarkup = reservations.map(booking => {
      const name = booking.displayName || booking.email || 'Thành viên';
      const photo = safePhoto(booking.photoURL);
      const initial = name.trim().charAt(0).toUpperCase() || 'U';
      const status = bookingEffectiveStatus(booking, now);
      const shortStatus = { reserved: 'Đã đặt', checkedIn: 'Đang dùng', completed: 'Hoàn thành', noShow: 'Vắng' }[status] || status;
      const avatar = photo ? `<img src="${escapeText(photo)}" alt="">` : escapeText(initial);
      return `<span class="zone-booking ${status}" title="${escapeText(name)} · ${formatTime(booking.startAt)}–${formatTime(booking.endAt)}"><span class="zone-booking-avatar">${avatar}</span><span class="zone-booking-info"><b>${escapeText(name)}</b><small>${formatTime(booking.startAt)}–${formatTime(booking.endAt)} · ${escapeText(shortStatus)}</small></span></span>`;
    }).join('');
    zone.querySelector('.zone-bookings').innerHTML = classMarkup || bookingMarkup ? classMarkup + bookingMarkup : '<span class="zone-bookings-empty">Chưa có lịch hôm nay</span>';
    zone.querySelector('.zone-people').innerHTML = people.map(person => `<img src="${escapeText(safePhoto(person.photoURL))}" alt="${escapeText(person.displayName || 'Thành viên')}" title="${escapeText(person.displayName || 'Thành viên')}">`).join('');
  });
}

function renderMyPresence() {
  const mine = presences.find(item => item.id === currentUser?.uid);
  const inside = presenceIsActive(mine);
  $('.presence-card').classList.toggle('active', inside);
  $('#presenceStatus').textContent = inside ? 'Đang có mặt tại Lab' : 'Chưa vào Lab';
  $('#presenceZone').textContent = inside ? zones[mine.zone] || '' : '';
  $('#summaryPresence').textContent = inside ? 'Đang check-in' : 'Chưa check-in';
  $('#summaryPresenceMeta').textContent = inside ? zones[mine.zone] || 'Trong phòng Lab' : 'Ngoài phòng Lab';
  $('#checkOutBtn').disabled = !inside;
  updateCheckinAvailability();
}

function watchBookings() {
  unsubscribers.push(onSnapshot(query(collection(db, 'bookings'), orderBy('startAt', 'desc')), snapshot => {
    bookings = snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
    renderBookings();
    renderMap();
  }, error => notify(error.code === 'failed-precondition' ? 'Cần deploy Firestore index cho lịch đặt chỗ.' : `Không thể tải lịch đặt chỗ (${error.code}).`, true)));
}

function bookingEffectiveStatus(booking, now = new Date()) {
  if (booking.status !== 'reserved') return booking.status;
  const end = timestampDate(booking.endAt);
  return end && end < now ? 'noShow' : 'reserved';
}

function myBookings() {
  return bookings.filter(booking => booking.uid === currentUser?.uid);
}

function policyState(now = new Date()) {
  const missed = myBookings().filter(booking => bookingEffectiveStatus(booking, now) === 'noShow').sort((a, b) => timestampDate(b.endAt) - timestampDate(a.endAt));
  if (missed.length < NO_SHOW_LIMIT) return { missed: missed.length, locked: false, lockedUntil: null };
  const latestMiss = timestampDate(missed[0].endAt);
  const lockedUntil = new Date(latestMiss.getTime() + LOCK_HOURS * 3600000);
  return { missed: missed.length, locked: lockedUntil > now, lockedUntil };
}

function renderPolicy() {
  const policy = policyState();
  $('#summaryPolicyMeta').textContent = `${policy.missed} lần vắng mặt`;
  $('#policySummary').classList.toggle('warning', policy.locked);
  $('#bookingSubmitBtn').disabled = policy.locked;
  if (policy.locked) {
    const until = policy.lockedUntil.toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
    $('#summaryPolicy').textContent = 'Tạm khóa 24 giờ';
    $('#policyAlert').textContent = `Tài khoản đã có ít nhất ${NO_SHOW_LIMIT} lịch không check-in. Quyền đặt chỗ tạm khóa đến ${until}.`;
    $('#policyAlert').classList.remove('hidden');
  } else {
    $('#summaryPolicy').textContent = 'Đang hoạt động';
    $('#policyAlert').classList.add('hidden');
  }
}

function renderBookings() {
  if (!currentUser) return;
  const now = new Date();
  const mine = myBookings().sort((a, b) => timestampDate(a.startAt) - timestampDate(b.startAt));
  const today = mine.filter(booking => sameLocalDay(timestampDate(booking.startAt), now) && !['cancelled', 'noShow'].includes(bookingEffectiveStatus(booking, now)));
  const next = mine.find(booking => timestampDate(booking.endAt) > now && ['reserved', 'checkedIn'].includes(bookingEffectiveStatus(booking, now)));
  $('#summaryBookings').textContent = `${today.length} lượt đặt`;
  $('#summaryNextBooking').textContent = next ? `${formatDate(next.startAt)} · ${formatTime(next.startAt)} · ${zones[next.zone]}` : 'Chưa có lịch sắp tới';
  const visible = mine.filter(booking => timestampDate(booking.endAt) > new Date(now.getTime() - 7 * 86400000)).slice(0, 10);
  $('#bookingList').innerHTML = visible.length ? visible.map(booking => {
    const status = bookingEffectiveStatus(booking, now);
    const cancellable = status === 'reserved' && timestampDate(booking.startAt) > now;
    return `<article class="booking-item" data-booking-id="${booking.id}"><div class="booking-item-head"><strong>${escapeText(zones[booking.zone] || booking.zone)}</strong><time>${formatDate(booking.startAt)}</time></div><p>${formatTime(booking.startAt)}–${formatTime(booking.endAt)} · ${booking.durationHours} giờ</p><div class="booking-item-footer"><span class="booking-status ${status}">${statusLabels[status] || status}</span>${cancellable ? '<button class="cancel-booking" type="button">Hủy lịch</button>' : ''}</div></article>`;
  }).join('') : '<div class="empty-log">Chưa có lịch đặt chỗ.</div>';
  renderPolicy();
  updateCheckinAvailability();
}

function nextReservation(now = new Date()) {
  return myBookings().filter(booking => bookingEffectiveStatus(booking, now) === 'reserved' && timestampDate(booking.endAt) > now).sort((a, b) => timestampDate(a.startAt) - timestampDate(b.startAt))[0];
}

function updateCheckinAvailability() {
  if (!currentUser) return;
  const now = new Date();
  const presence = presences.find(item => item.id === currentUser.uid);
  const inside = presenceIsActive(presence, now);
  const eligible = eligibleBooking(null, now);
  const upcoming = eligible || nextReservation(now);
  const zone = inside ? presence.zone : upcoming?.zone || '';
  $('#zoneSelect').value = zone;
  $('#zoneSelect').disabled = true;
  document.querySelectorAll('.lab-zone').forEach(item => item.classList.toggle('selected', Boolean(zone) && item.dataset.zone === zone));
  if (inside) {
    $('#bookingCheckinHint').textContent = `Đang sử dụng ${zones[zone] || 'phòng Lab'}.`;
    $('#bookingCheckinHint').classList.add('ready');
    $('#mapHelp').textContent = `Vị trí hiện tại: ${zones[zone] || 'phòng Lab'}.`;
  } else if (eligible) {
    $('#bookingCheckinHint').textContent = `Lịch ${formatTime(eligible.startAt)}–${formatTime(eligible.endAt)} tại ${zones[eligible.zone]} đã sẵn sàng check-in.`;
    $('#bookingCheckinHint').classList.add('ready');
    $('#mapHelp').textContent = `Vị trí đã đặt: ${zones[eligible.zone]}.`;
  } else if (upcoming) {
    $('#bookingCheckinHint').textContent = `Đã đặt ${zones[upcoming.zone]} ngày ${formatDate(upcoming.startAt)}, ${formatTime(upcoming.startAt)}–${formatTime(upcoming.endAt)}. Check-in mở trước 30 phút.`;
    $('#bookingCheckinHint').classList.remove('ready');
    $('#mapHelp').textContent = `Lịch sắp tới: ${zones[upcoming.zone]} · ${formatDate(upcoming.startAt)} ${formatTime(upcoming.startAt)}.`;
  } else {
    $('#bookingCheckinHint').textContent = 'Hãy đặt một vị trí trước khi check-in.';
    $('#bookingCheckinHint').classList.remove('ready');
    $('#mapHelp').textContent = 'Sơ đồ gồm bốn vị trí có thể đặt trước trong phòng Lab.';
  }
  $('#checkInBtn').disabled = inside || !eligible || now >= closingTime(now);
}

function initializeBookingDefaults() {
  const now = new Date();
  const max = new Date(now.getTime() + 30 * 86400000);
  let selected = new Date(now);
  selected.setMinutes(selected.getMinutes() < 30 ? 30 : 60, 0, 0);
  if (selected.getHours() >= 21) {
    selected.setDate(selected.getDate() + 1);
    selected.setHours(8, 0, 0, 0);
  }
  $('#bookingDate').min = localDateKey(now);
  $('#bookingDate').max = localDateKey(max);
  $('#bookingDate').value = localDateKey(selected);
  $('#bookingStart').value = selected.toTimeString().slice(0, 5);
}

function bookingDatesFromForm() {
  const date = $('#bookingDate').value;
  const time = $('#bookingStart').value;
  const durationHours = Number($('#bookingDuration').value);
  const start = new Date(`${date}T${time}:00`);
  const end = new Date(start.getTime() + durationHours * 3600000);
  return { start, end, durationHours };
}

function overlapsExisting(zone, start, end) {
  return bookings.some(booking => {
    if (booking.zone !== zone || !['reserved', 'checkedIn'].includes(bookingEffectiveStatus(booking))) return false;
    const otherStart = timestampDate(booking.startAt);
    const otherEnd = timestampDate(booking.endAt);
    return start < otherEnd && end > otherStart;
  });
}

function classReportBlocksZone(report, zone) {
  return ['classroom', 'wholeLab', zone].includes(report.location);
}

function overlapsClassReport(zone, start, end) {
  return classReports.some(report => {
    if (!['pending', 'confirmed'].includes(report.status) || !classReportBlocksZone(report, zone)) return false;
    const classStart = timestampDate(report.startAt);
    const classEnd = timestampDate(report.endAt);
    return classStart && classEnd && start < classEnd && end > classStart;
  });
}

function updateBookingZoneAvailability() {
  const { start, end } = bookingDatesFromForm();
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return;
  document.querySelectorAll('[data-booking-zone]').forEach(button => {
    const blocked = overlapsClassReport(button.dataset.bookingZone, start, end);
    button.disabled = blocked;
    button.classList.toggle('class-blocked', blocked);
    button.title = blocked ? 'Khu vực có lớp học trong thời gian này' : '';
    if (blocked && $('#bookingZone').value === button.dataset.bookingZone) {
      $('#bookingZone').value = '';
      button.classList.remove('selected');
    }
  });
}

async function createBooking(event) {
  event.preventDefault();
  const policy = policyState();
  if (policy.locked) return notify('Quyền đặt chỗ đang tạm khóa do nhiều lần không check-in.', true);
  const zone = $('#bookingZone').value;
  const { start, end, durationHours } = bookingDatesFromForm();
  const now = new Date();
  if (!zone || Number.isNaN(start.getTime())) return notify('Vui lòng nhập đầy đủ thông tin lịch.', true);
  if (start < now) return notify('Thời gian bắt đầu phải ở tương lai.', true);
  if (start.getHours() < 7 || end > closingTime(start)) return notify('Lịch sử dụng phải nằm trong khung 07:00–22:00.', true);
  if (overlapsClassReport(zone, start, end)) return notify('Không thể đặt chỗ: khu vực này đang được báo có lớp học.', true);
  if (overlapsExisting(zone, start, end)) return notify('Khu vực này đã có người đặt trong khung giờ đã chọn.', true);
  try {
    await addDoc(collection(db, 'bookings'), {
      uid: currentUser.uid,
      email: currentUser.email,
      displayName: currentUser.displayName || 'Thành viên',
      photoURL: currentUser.photoURL || '',
      zone,
      date: localDateKey(start),
      startAt: Timestamp.fromDate(start),
      endAt: Timestamp.fromDate(end),
      durationHours,
      status: 'reserved',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    notify(`Đã đặt ${zones[zone]} từ ${formatTime(start)} đến ${formatTime(end)}.`);
    $('#bookingZone').value = '';
    document.querySelectorAll('[data-booking-zone]').forEach(button => button.classList.remove('selected'));
  } catch (error) {
    const message = error.code === 'permission-denied'
      ? 'Không có quyền tạo lịch. Hãy Publish bản firestore.rules mới có mục bookings.'
      : `Không thể đặt chỗ (${error.code || 'unknown'}). Vui lòng thử lại.`;
    notify(message, true);
  }
}

async function cancelBooking(id) {
  const booking = bookings.find(item => item.id === id && item.uid === currentUser.uid);
  if (!booking || bookingEffectiveStatus(booking) !== 'reserved' || timestampDate(booking.startAt) <= new Date()) return;
  try {
    await updateDoc(doc(db, 'bookings', id), { status: 'cancelled', cancelledAt: serverTimestamp(), updatedAt: serverTimestamp() });
    notify('Đã hủy lịch đặt chỗ.');
  } catch (error) {
    notify(`Không thể hủy lịch (${error.code}).`, true);
  }
}

function eligibleBooking(zone = null, now = new Date()) {
  return myBookings().find(booking => {
    if ((zone && booking.zone !== zone) || bookingEffectiveStatus(booking, now) !== 'reserved') return false;
    const start = timestampDate(booking.startAt);
    const end = timestampDate(booking.endAt);
    return now >= new Date(start.getTime() - 30 * 60000) && now < end;
  });
}

function watchAttendance() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const q = query(collection(db, 'attendance'), where('timestamp', '>=', today), orderBy('timestamp', 'desc'));
  unsubscribers.push(onSnapshot(q, snapshot => {
    const records = snapshot.docs.map(item => item.data());
    $('#todayCount').textContent = `${records.length} lượt`;
    $('#attendanceList').innerHTML = records.length ? records.map(record => {
      const time = formatTime(record.timestamp);
      const labels = { in: `Check-in · ${zones[record.zone] || 'Vào Lab'}`, out: 'Check-out · Kết thúc phiên', 'auto-out': 'Tự động kết thúc · 22:00' };
      return `<div class="log-item"><span class="log-dot ${record.type !== 'in' ? 'out' : ''}"></span><div><strong>${escapeText(record.displayName)}</strong><small>${escapeText(labels[record.type] || record.type)}</small></div><time>${time}</time></div>`;
    }).join('') : '<div class="empty-log">Chưa có hoạt động.</div>';
  }, error => notify(error.code === 'failed-precondition' ? 'Firestore đang tạo chỉ mục nhật ký.' : `Không thể tải nhật ký (${error.code}).`, true)));
}

function watchClassReports() {
  unsubscribers.push(onSnapshot(collection(db, 'classReports'), snapshot => {
    classReports = snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
    renderClassReports();
    renderMap();
    updateBookingZoneAvailability();
  }, error => notify(`Không thể tải báo cáo lớp học (${error.code}). Hãy Publish firestore.rules mới.`, true)));
}

function classReportStatusLabel(status) {
  return { pending: 'Có lớp · chờ xác minh', confirmed: 'Đã xác nhận', rejected: 'Báo cáo sai' }[status] || status;
}

function renderClassReports() {
  const now = new Date();
  const cutoff = new Date(now.getTime() - 7 * 86400000);
  const visible = classReports.filter(item => {
    const end = timestampDate(item.endAt);
    return end && end > cutoff && (['pending', 'confirmed'].includes(item.status) || item.reporterUid === currentUser?.uid);
  }).sort((a, b) => timestampDate(a.startAt) - timestampDate(b.startAt));
  const blockingUpcoming = classReports.filter(item => ['pending', 'confirmed'].includes(item.status) && timestampDate(item.endAt) > now);
  const activeCount = blockingUpcoming.filter(item => timestampDate(item.startAt) <= now).length;
  $('#classLiveCount').textContent = activeCount ? `${activeCount} đang học` : `${blockingUpcoming.length} lịch`;
  $('#classReportList').innerHTML = visible.length ? visible.map(item => {
    const own = item.reporterUid === currentUser?.uid;
    const active = ['pending', 'confirmed'].includes(item.status) && timestampDate(item.startAt) <= now && timestampDate(item.endAt) > now;
    return `<article class="class-report-item ${escapeText(item.status)}${active ? ' active' : ''}"><div class="class-report-head"><strong>${escapeText(classLocations[item.location] || item.location)}</strong><span class="class-report-status ${escapeText(item.status)}">${active ? 'Đang có lớp' : escapeText(classReportStatusLabel(item.status))}</span></div><p><b>${formatDate(item.startAt)}</b> · ${formatTime(item.startAt)}–${formatTime(item.endAt)}</p>${item.note ? `<small>${escapeText(item.note)}</small>` : ''}<footer>Báo bởi ${escapeText(own ? 'bạn' : item.reporterName || item.reporterEmail || 'Thành viên')}</footer></article>`;
  }).join('') : '<div class="empty-log">Chưa có báo cáo lớp học.</div>';

  if (currentProfile?.role !== 'admin') return;
  const pending = classReports.filter(item => item.status === 'pending').sort((a, b) => timestampDate(a.startAt) - timestampDate(b.startAt));
  $('#classReviewCount').textContent = `${pending.length} chờ duyệt`;
  $('#classReviewList').innerHTML = pending.length ? pending.map(item => `<article class="class-review-item" data-report-id="${item.id}" data-reporter-uid="${escapeText(item.reporterUid)}"><div><strong>${escapeText(classLocations[item.location] || item.location)}</strong><p>${formatDate(item.startAt)} · ${formatTime(item.startAt)}–${formatTime(item.endAt)}</p><small>${escapeText(item.reporterName || item.reporterEmail || 'Thành viên')}${item.note ? ` · ${escapeText(item.note)}` : ''}</small></div><div class="class-review-actions"><button data-review="confirm" type="button">Thông tin đúng</button><button data-review="reject" type="button">Báo sai · cảnh báo</button></div></article>`).join('') : '<div class="empty-log">Không có báo cáo chờ duyệt.</div>';
}

function initializeClassReportDefaults() {
  const now = new Date();
  const max = new Date(now.getTime() + 30 * 86400000);
  $('#classDate').min = localDateKey(now);
  $('#classDate').max = localDateKey(max);
  $('#classDate').value = localDateKey(now);
}

async function createClassReport(event) {
  event.preventDefault();
  const date = $('#classDate').value;
  const session = document.querySelector('input[name="classSession"]:checked')?.value;
  const sessionInfo = classSessions[session];
  const start = new Date(`${date}T${sessionInfo?.start || ''}:00`);
  const end = new Date(`${date}T${sessionInfo?.end || ''}:00`);
  const location = $('#classLocation').value;
  const note = $('#classNote').value.trim();
  if (!classLocations[location] || !sessionInfo || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return notify('Vui lòng nhập đầy đủ thông tin lớp học.', true);
  if (end <= new Date()) return notify('Thời gian lớp học đã kết thúc.', true);
  try {
    await addDoc(collection(db, 'classReports'), {
      reporterUid: currentUser.uid,
      reporterEmail: currentUser.email,
      reporterName: currentUser.displayName || 'Thành viên',
      reporterPhotoURL: currentUser.photoURL || '',
      location,
      session,
      date,
      startAt: Timestamp.fromDate(start),
      endAt: Timestamp.fromDate(end),
      note,
      status: 'pending',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    $('#classNote').value = '';
    $('#classReportModal').close();
    notify('Đã gửi báo cáo. Admin sẽ kiểm tra trước khi công bố.');
  } catch (error) {
    notify(error.code === 'permission-denied' ? 'Chưa có quyền gửi báo cáo. Hãy Publish file firestore.rules mới.' : `Không thể gửi báo cáo (${error.code || 'unknown'}).`, true);
  }
}

async function reviewClassReport(reportId, decision) {
  const report = classReports.find(item => item.id === reportId && item.status === 'pending');
  if (!report || currentProfile?.role !== 'admin') return;
  if (decision === 'reject' && !window.confirm('Xác nhận báo cáo này là sai và ghi cảnh báo vào tài khoản người gửi?')) return;
  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'classReports', reportId), {
      status: decision === 'confirm' ? 'confirmed' : 'rejected',
      reviewedAt: serverTimestamp(),
      reviewedBy: currentUser.uid,
      updatedAt: serverTimestamp()
    });
    if (decision === 'reject') {
      batch.update(doc(db, 'users', report.reporterUid), {
        classReportWarningCount: increment(1),
        classReportWarning: `Báo cáo lớp học ngày ${formatDate(report.startAt)} tại ${classLocations[report.location] || report.location} không chính xác.`,
        classReportWarnedAt: serverTimestamp(),
        classReportWarnedBy: currentUser.uid
      });
    }
    await batch.commit();
    notify(decision === 'confirm' ? 'Đã xác nhận và công bố lịch lớp học.' : 'Đã từ chối báo cáo và cảnh báo người gửi.');
  } catch (error) {
    notify(`Không thể duyệt báo cáo (${error.code || 'unknown'}).`, true);
  }
}

function watchAccounts() {
  unsubscribers.push(onSnapshot(collection(db, 'users'), snapshot => {
    accounts = snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
    $('#requestCount').textContent = `${accounts.filter(account => account.status === 'pending').length} chờ duyệt`;
    renderAccounts();
  }, error => notify(`Không thể tải danh sách tài khoản (${error.code}).`, true)));
}

function renderAccounts() {
  const visible = accountFilter === 'all' ? accounts : accounts.filter(account => account.status === accountFilter);
  $('#accountList').innerHTML = visible.length ? [...visible].sort((a, b) => Number(b.status === 'pending') - Number(a.status === 'pending')).map(account => `
    <article class="account-row" data-uid="${account.id}"><img src="${escapeText(safePhoto(account.photoURL))}" alt=""><div class="account-info"><strong>${escapeText(account.displayName || 'Chưa có tên')}</strong><small>${escapeText(account.email)}</small></div><span class="account-status ${account.status}">${{ pending: 'Chờ duyệt', approved: 'Đã duyệt', rejected: 'Từ chối' }[account.status] || account.status}</span><div class="account-actions">${account.role === 'admin' ? '<b>ADMIN</b>' : '<button data-action="approve" type="button">Cho phép</button><button data-action="reject" type="button">Từ chối</button>'}</div></article>`).join('') : '<div class="empty-log">Không có tài khoản trong nhóm này.</div>';
}

async function updateAccount(uid, status) {
  try {
    await updateDoc(doc(db, 'users', uid), { status, reviewedAt: serverTimestamp(), reviewedBy: currentUser.uid });
    notify(status === 'approved' ? 'Đã cấp quyền truy cập.' : 'Đã từ chối tài khoản.');
  } catch (error) {
    notify(`Không thể cập nhật tài khoản (${error.code}).`, true);
  }
}

async function recordAttendance(type) {
  if (!currentUser || currentProfile?.status !== 'approved') return;
  const now = new Date();
  if (type === 'in' && now >= closingTime(now)) return notify('Phòng Lab đã kết thúc phiên làm việc lúc 22:00.', true);
  const mine = presences.find(item => item.id === currentUser.uid);
  const booking = type === 'in' ? eligibleBooking(null, now) : bookings.find(item => item.id === mine?.bookingId);
  if (type === 'in' && !booking) return notify('Chưa có lịch đặt chỗ đang hiệu lực. Check-in mở trước giờ bắt đầu 30 phút.', true);
  const zone = type === 'in' ? booking.zone : mine?.zone || '';
  const data = { uid: currentUser.uid, email: currentUser.email, displayName: currentUser.displayName || 'Thành viên', photoURL: currentUser.photoURL || '', inside: type === 'in', zone: type === 'in' ? zone : '', bookingId: type === 'in' ? booking?.id || '' : '', updatedAt: serverTimestamp() };
  try {
    await setDoc(doc(db, 'presence', currentUser.uid), data, { merge: true });
    await addDoc(collection(db, 'attendance'), { ...data, type, timestamp: serverTimestamp() });
    if (booking) await updateDoc(doc(db, 'bookings', booking.id), type === 'in' ? { status: 'checkedIn', checkedInAt: serverTimestamp(), updatedAt: serverTimestamp() } : { status: 'completed', checkedOutAt: serverTimestamp(), updatedAt: serverTimestamp() });
    notify(type === 'in' ? `Đã check-in tại ${zones[zone]}.` : 'Đã kết thúc phiên làm việc.');
  } catch (error) {
    notify(`Không thể ghi nhận phiên làm việc (${error.code}).`, true);
  }
}

function escapeText(value = '') {
  const node = document.createElement('div');
  node.textContent = value ?? '';
  return node.innerHTML;
}

function safePhoto(value = '') {
  try { const url = new URL(value); return url.protocol === 'https:' ? url.href : ''; } catch { return ''; }
}

function formatDate(value) {
  const date = timestampDate(value) || value;
  return date instanceof Date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '--/--/----';
}

function formatTime(value) {
  const date = timestampDate(value) || value;
  return date instanceof Date && !Number.isNaN(date.getTime()) ? date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '--:--';
}

$('#googleLoginBtn').addEventListener('click', async () => {
  if (!firebaseReady) return notify('Firebase chưa được cấu hình.', true);
  const provider = new GoogleAuthProvider();
  if (config.allowedDomains?.[0]) provider.setCustomParameters({ hd: config.allowedDomains[0], prompt: 'select_account' });
  try { await signInWithPopup(auth, provider); } catch (error) { if (error.code !== 'auth/popup-closed-by-user') notify(`Không thể đăng nhập Google (${error.code}).`, true); }
});

['#logoutBtn', '#pendingLogoutBtn'].forEach(selector => $(selector).addEventListener('click', () => signOut(auth)));
$('#bookingForm').addEventListener('submit', createBooking);
$('#classReportForm').addEventListener('submit', createClassReport);
$('#openClassReportBtn').addEventListener('click', () => {
  initializeClassReportDefaults();
  $('#classReportModal').showModal();
});
$('#closeClassReportBtn').addEventListener('click', () => $('#classReportModal').close());
$('#classReportModal').addEventListener('click', event => {
  if (event.target === $('#classReportModal')) $('#classReportModal').close();
});
$('#classReviewList').addEventListener('click', event => {
  const button = event.target.closest('[data-review]');
  const item = event.target.closest('[data-report-id]');
  if (button && item) reviewClassReport(item.dataset.reportId, button.dataset.review);
});
$('#bookingZonePicker').addEventListener('click', event => {
  const button = event.target.closest('[data-booking-zone]');
  if (!button || button.disabled) return;
  $('#bookingZone').value = button.dataset.bookingZone;
  document.querySelectorAll('[data-booking-zone]').forEach(item => item.classList.toggle('selected', item === button));
});
['#bookingDate', '#bookingStart', '#bookingDuration'].forEach(selector => $(selector).addEventListener('change', updateBookingZoneAvailability));
$('#bookingList').addEventListener('click', event => { const item = event.target.closest('[data-booking-id]'); if (item && event.target.closest('.cancel-booking')) cancelBooking(item.dataset.bookingId); });
$('#checkInBtn').addEventListener('click', () => recordAttendance('in'));
$('#checkOutBtn').addEventListener('click', () => recordAttendance('out'));
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
$('#domainHint').textContent = config.allowedDomains?.length ? `Tên miền được phép: ${config.allowedDomains.join(', ')}.` : 'Chưa cấu hình tên miền giáo dục.';

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
      notify('Tài khoản không thuộc tên miền giáo dục được phép.', true);
      await signOut(auth);
      return;
    }
    try {
      await ensureProfile(user);
      unsubscribers.push(watchProfile(user));
    } catch (error) {
      notify(`Không thể tạo hồ sơ (${error.code}). Kiểm tra Firestore Rules.`, true);
      await signOut(auth);
    }
  });
}
