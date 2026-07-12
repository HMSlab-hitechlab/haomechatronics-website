const MEMBER_KEY = 'hitech-lab-members-v1';
const ATTENDANCE_KEY = 'hitech-lab-attendance-v1';
const SESSION_KEY = 'hitech-lab-session-v1';

const defaultMembers = [
  { name: 'PGS. TS. Trần Minh Hoàng', role: 'Giảng viên', specialty: 'Robot học & Điều khiển thông minh', email: 'hoang.tm@university.edu.vn', color: '#00d6a3' },
  { name: 'ThS. Nguyễn Thu Hà', role: 'Nghiên cứu viên', specialty: 'Thị giác máy tính & AI', email: 'ha.nt@university.edu.vn', color: '#64b5f6' },
  { name: 'Lê Quốc Bảo', role: 'Sinh viên', specialty: 'Robot tự hành & ROS', email: 'bao.lq@student.edu.vn', color: '#ffd166' },
  { name: 'Phạm Khánh Linh', role: 'Sinh viên', specialty: 'IoT công nghiệp & Hệ thống nhúng', email: 'linh.pk@student.edu.vn', color: '#f497c0' }
];

let members = JSON.parse(localStorage.getItem(MEMBER_KEY) || 'null') || defaultMembers;
let records = JSON.parse(localStorage.getItem(ATTENDANCE_KEY) || '[]');
let signedInEmail = localStorage.getItem(SESSION_KEY) || '';
const toast = document.querySelector('#toast');

function initials(name) { const words = name.replace(/^(PGS\. TS\.|TS\.|ThS\.)\s*/i, '').trim().split(/\s+/); return ((words.at(-2)?.[0] || '') + (words.at(-1)?.[0] || '')).toUpperCase(); }
function escapeHTML(value) { const div = document.createElement('div'); div.textContent = value; return div.innerHTML; }
function dateKey(date = new Date()) { return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }
function currentMember() { return members.find(member => member.email.toLowerCase() === signedInEmail.toLowerCase()); }
function lastAction(email) { return records.filter(record => record.email === email).sort((a, b) => b.timestamp - a.timestamp)[0]; }
function notify(message) { toast.textContent = message; toast.classList.add('show'); setTimeout(() => toast.classList.remove('show'), 2200); }

function updateClock() {
  const now = new Date();
  document.querySelector('#liveTime').textContent = now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  document.querySelector('#liveDate').textContent = now.toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
}

function render() {
  const member = currentMember();
  document.querySelector('#loginPanel').classList.toggle('hidden', Boolean(member));
  document.querySelector('#checkinPanel').classList.toggle('hidden', !member);
  if (member) {
    document.querySelector('#attendanceName').textContent = member.name;
    document.querySelector('#attendanceRole').textContent = `${member.role} · ${member.specialty}`;
    const avatar = document.querySelector('#attendanceAvatar'); avatar.textContent = initials(member.name); avatar.style.background = member.color;
    const inside = lastAction(member.email)?.type === 'in';
    document.querySelector('#presenceStatus').textContent = inside ? 'Đang có mặt tại Lab' : 'Chưa vào Lab';
    document.querySelector('.presence-card').classList.toggle('active', inside);
    document.querySelector('#checkInBtn').disabled = inside;
    document.querySelector('#checkOutBtn').disabled = !inside;
  }
  const today = records.filter(record => record.date === dateKey()).sort((a, b) => b.timestamp - a.timestamp);
  document.querySelector('#todayCount').textContent = `${today.length} lượt`;
  document.querySelector('#attendanceList').innerHTML = today.length ? today.map(record => `<div class="log-item"><span class="log-dot ${record.type === 'out' ? 'out' : ''}"></span><div><strong>${escapeHTML(record.name)}</strong><small>${record.type === 'in' ? 'Check-in · Vào Lab' : 'Check-out · Rời Lab'}</small></div><time>${new Date(record.timestamp).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</time></div>`).join('') : '<div class="empty-log">Chưa có hoạt động điểm danh.</div>';
}

document.querySelector('#loginForm').addEventListener('submit', event => {
  event.preventDefault();
  const email = document.querySelector('#loginEmail').value.trim().toLowerCase();
  const member = members.find(item => item.email.toLowerCase() === email);
  if (!member || document.querySelector('#loginPin').value !== '2026') return notify('Email hoặc mã PIN không chính xác');
  signedInEmail = member.email; localStorage.setItem(SESSION_KEY, signedInEmail); event.target.reset(); render(); notify(`Xin chào ${member.name}!`);
});

document.querySelector('#logoutBtn').addEventListener('click', () => { signedInEmail = ''; localStorage.removeItem(SESSION_KEY); render(); });
function record(type) { const member = currentMember(); if (!member) return; const now = new Date(); records.push({ id: Date.now(), email: member.email, name: member.name, type, timestamp: now.getTime(), date: dateKey(now) }); localStorage.setItem(ATTENDANCE_KEY, JSON.stringify(records)); render(); notify(type === 'in' ? 'Check-in thành công!' : 'Check-out thành công!'); }
document.querySelector('#checkInBtn').addEventListener('click', () => record('in'));
document.querySelector('#checkOutBtn').addEventListener('click', () => record('out'));
updateClock(); setInterval(updateClock, 30000); render();
