const STORAGE_KEY = 'hitech-lab-members-v1';

const defaultMembers = [
  { id: 1, name: 'PGS. TS. Trần Minh Hoàng', role: 'Giảng viên', specialty: 'Robot học & Điều khiển thông minh', email: 'hoang.tm@university.edu.vn', status: 'Đang hoạt động', color: '#00d6a3' },
  { id: 2, name: 'ThS. Nguyễn Thu Hà', role: 'Nghiên cứu viên', specialty: 'Thị giác máy tính & AI', email: 'ha.nt@university.edu.vn', status: 'Đang hoạt động', color: '#64b5f6' },
  { id: 3, name: 'Lê Quốc Bảo', role: 'Sinh viên', specialty: 'Robot tự hành & ROS', email: 'bao.lq@student.edu.vn', status: 'Đang hoạt động', color: '#ffd166' },
  { id: 4, name: 'Phạm Khánh Linh', role: 'Sinh viên', specialty: 'IoT công nghiệp & Hệ thống nhúng', email: 'linh.pk@student.edu.vn', status: 'Đang hoạt động', color: '#f497c0' },
  { id: 5, name: 'Trần Đức Anh', role: 'Nghiên cứu viên', specialty: 'Digital Twin & Mô phỏng', email: 'anh.td@university.edu.vn', status: 'Tạm vắng', color: '#b39ddb' },
  { id: 6, name: 'Vũ Minh Khoa', role: 'Sinh viên', specialty: 'Thiết kế cơ khí & CAD/CAE', email: 'khoa.vm@student.edu.vn', status: 'Đang hoạt động', color: '#80cbc4' }
];

let members = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null') || defaultMembers;
let activeFilter = 'Tất cả';

const grid = document.querySelector('#memberGrid');
const search = document.querySelector('#memberSearch');
const modal = document.querySelector('#memberModal');
const form = document.querySelector('#memberForm');
const toast = document.querySelector('#toast');

function initials(name) {
  const clean = name.replace(/^(PGS\. TS\.|TS\.|ThS\.)\s*/i, '');
  const words = clean.trim().split(/\s+/);
  return ((words.at(-2)?.[0] || '') + (words.at(-1)?.[0] || '')).toUpperCase();
}

function escapeHTML(value) {
  const div = document.createElement('div');
  div.textContent = value;
  return div.innerHTML;
}

function renderMembers() {
  const keyword = search.value.trim().toLocaleLowerCase('vi');
  const filtered = members.filter(member => {
    const matchesFilter = activeFilter === 'Tất cả' || member.role === activeFilter;
    const haystack = `${member.name} ${member.specialty} ${member.email}`.toLocaleLowerCase('vi');
    return matchesFilter && haystack.includes(keyword);
  });

  document.querySelector('#memberCount').textContent = `${filtered.length} / ${members.length} THÀNH VIÊN`;
  grid.innerHTML = filtered.length ? filtered.map(member => `
    <article class="member-card">
      <div class="card-actions">
        <button type="button" data-action="edit" data-id="${member.id}" title="Chỉnh sửa">✎</button>
        <button type="button" data-action="delete" data-id="${member.id}" title="Xóa">×</button>
      </div>
      <div class="member-top">
        <div class="avatar" style="background:${member.color}">${initials(member.name)}</div>
        <div><h3>${escapeHTML(member.name)}</h3><span class="role">${escapeHTML(member.role)}</span></div>
      </div>
      <p class="specialty">${escapeHTML(member.specialty)}</p>
      <a class="email" href="mailto:${escapeHTML(member.email)}">${escapeHTML(member.email)}</a><br>
      <span class="status ${member.status === 'Tạm vắng' ? 'away' : ''}">${escapeHTML(member.status)}</span>
    </article>`).join('') : '<div class="empty-state"><b>Không tìm thấy thành viên</b>Hãy thử từ khóa hoặc bộ lọc khác.</div>';
}

function saveMembers(message) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(members));
  renderMembers();
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2200);
}

function openMemberModal(member = null) {
  form.reset();
  document.querySelector('#modalTitle').textContent = member ? 'Chỉnh sửa thành viên' : 'Thêm thành viên mới';
  document.querySelector('#memberId').value = member?.id || '';
  document.querySelector('#memberName').value = member?.name || '';
  document.querySelector('#memberRole').value = member?.role || 'Sinh viên';
  document.querySelector('#memberStatus').value = member?.status || 'Đang hoạt động';
  document.querySelector('#memberSpecialty').value = member?.specialty || '';
  document.querySelector('#memberEmail').value = member?.email || '';
  document.querySelector('#memberColor').value = member?.color || '#00d6a3';
  modal.showModal();
  setTimeout(() => document.querySelector('#memberName').focus(), 50);
}

document.querySelector('#addMemberBtn').addEventListener('click', () => openMemberModal());
document.querySelectorAll('.close-modal,.cancel-modal').forEach(btn => btn.addEventListener('click', () => modal.close()));
modal.addEventListener('click', event => { if (event.target === modal) modal.close(); });
search.addEventListener('input', renderMembers);

document.querySelectorAll('.filter').forEach(button => button.addEventListener('click', () => {
  document.querySelector('.filter.active').classList.remove('active');
  button.classList.add('active');
  activeFilter = button.dataset.filter;
  renderMembers();
}));

grid.addEventListener('click', event => {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const id = Number(button.dataset.id);
  const member = members.find(item => item.id === id);
  if (button.dataset.action === 'edit') openMemberModal(member);
  if (button.dataset.action === 'delete' && confirm(`Xóa thành viên “${member.name}”?`)) {
    members = members.filter(item => item.id !== id);
    saveMembers('Đã xóa thành viên');
  }
});

form.addEventListener('submit', event => {
  event.preventDefault();
  const id = Number(document.querySelector('#memberId').value);
  const data = {
    id: id || Date.now(),
    name: document.querySelector('#memberName').value.trim(),
    role: document.querySelector('#memberRole').value,
    status: document.querySelector('#memberStatus').value,
    specialty: document.querySelector('#memberSpecialty').value.trim(),
    email: document.querySelector('#memberEmail').value.trim(),
    color: document.querySelector('#memberColor').value
  };
  if (id) members = members.map(member => member.id === id ? data : member);
  else members.unshift(data);
  modal.close();
  saveMembers(id ? 'Đã cập nhật thành viên' : 'Đã thêm thành viên mới');
});

document.querySelector('.menu-toggle').addEventListener('click', event => {
  const nav = document.querySelector('.nav-links');
  nav.classList.toggle('open');
  event.currentTarget.setAttribute('aria-expanded', nav.classList.contains('open'));
});
document.querySelectorAll('.nav-links a').forEach(link => link.addEventListener('click', () => document.querySelector('.nav-links').classList.remove('open')));

const observer = new IntersectionObserver(entries => entries.forEach(entry => {
  if (entry.isIntersecting) entry.target.classList.add('visible');
}), { threshold: .08 });
document.querySelectorAll('.reveal').forEach(element => observer.observe(element));

document.querySelector('#newsletter').addEventListener('submit', event => {
  event.preventDefault();
  event.target.reset();
  toast.textContent = 'Cảm ơn bạn đã đăng ký!';
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2200);
});

renderMembers();

// Attendance: local demo for a static GitHub Pages website.
const ATTENDANCE_KEY = 'hitech-lab-attendance-v1';
const SESSION_KEY = 'hitech-lab-session-v1';
let attendanceRecords = JSON.parse(localStorage.getItem(ATTENDANCE_KEY) || '[]');
let signedInEmail = localStorage.getItem(SESSION_KEY) || '';

const loginPanel = document.querySelector('#loginPanel');
const checkinPanel = document.querySelector('#checkinPanel');
const attendanceList = document.querySelector('#attendanceList');

function localDateKey(date = new Date()) {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function updateClock() {
  const now = new Date();
  document.querySelector('#liveTime').textContent = now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  document.querySelector('#liveDate').textContent = now.toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
}

function currentAttendanceMember() {
  return members.find(member => member.email.toLowerCase() === signedInEmail.toLowerCase());
}

function lastMemberAction(email) {
  return attendanceRecords.filter(record => record.email === email).sort((a, b) => b.timestamp - a.timestamp)[0];
}

function renderAttendance() {
  const member = currentAttendanceMember();
  loginPanel.classList.toggle('hidden', Boolean(member));
  checkinPanel.classList.toggle('hidden', !member);

  if (member) {
    document.querySelector('#attendanceName').textContent = member.name;
    document.querySelector('#attendanceRole').textContent = `${member.role} · ${member.specialty}`;
    const avatar = document.querySelector('#attendanceAvatar');
    avatar.textContent = initials(member.name);
    avatar.style.background = member.color;
    const lastAction = lastMemberAction(member.email);
    const isInside = lastAction?.type === 'in';
    document.querySelector('#presenceStatus').textContent = isInside ? 'Đang có mặt tại Lab' : 'Chưa vào Lab';
    document.querySelector('.presence-card').classList.toggle('active', isInside);
    document.querySelector('#checkInBtn').disabled = isInside;
    document.querySelector('#checkOutBtn').disabled = !isInside;
  }

  const today = localDateKey();
  const todayRecords = attendanceRecords.filter(record => record.date === today).sort((a, b) => b.timestamp - a.timestamp);
  document.querySelector('#todayCount').textContent = `${todayRecords.length} lượt`;
  attendanceList.innerHTML = todayRecords.length ? todayRecords.map(record => `
    <div class="log-item">
      <span class="log-dot ${record.type === 'out' ? 'out' : ''}"></span>
      <div><strong>${escapeHTML(record.name)}</strong><small>${record.type === 'in' ? 'Check-in · Vào Lab' : 'Check-out · Rời Lab'}</small></div>
      <time>${new Date(record.timestamp).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</time>
    </div>`).join('') : '<div class="empty-log">Chưa có hoạt động điểm danh.</div>';
}

document.querySelector('#loginForm').addEventListener('submit', event => {
  event.preventDefault();
  const email = document.querySelector('#loginEmail').value.trim().toLowerCase();
  const pin = document.querySelector('#loginPin').value;
  const member = members.find(item => item.email.toLowerCase() === email);
  if (!member || pin !== '2026') {
    toast.textContent = 'Email hoặc mã PIN không chính xác';
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2200);
    return;
  }
  signedInEmail = member.email;
  localStorage.setItem(SESSION_KEY, signedInEmail);
  event.target.reset();
  renderAttendance();
  toast.textContent = `Xin chào ${member.name}!`;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2200);
});

document.querySelector('#logoutBtn').addEventListener('click', () => {
  signedInEmail = '';
  localStorage.removeItem(SESSION_KEY);
  renderAttendance();
});

function recordAttendance(type) {
  const member = currentAttendanceMember();
  if (!member) return;
  const now = new Date();
  attendanceRecords.push({ id: Date.now(), email: member.email, name: member.name, type, timestamp: now.getTime(), date: localDateKey(now) });
  localStorage.setItem(ATTENDANCE_KEY, JSON.stringify(attendanceRecords));
  renderAttendance();
  toast.textContent = type === 'in' ? 'Check-in thành công!' : 'Check-out thành công!';
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2200);
}

document.querySelector('#checkInBtn').addEventListener('click', () => recordAttendance('in'));
document.querySelector('#checkOutBtn').addEventListener('click', () => recordAttendance('out'));

updateClock();
setInterval(updateClock, 30000);
renderAttendance();
