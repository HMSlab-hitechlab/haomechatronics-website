import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js';
import { getAuth, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js';
import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, getFirestore, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc, where, writeBatch } from 'https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js';

const config = window.LAB_CONFIG || {};
const app = initializeApp(config.firebase);
const auth = getAuth(app);
const db = getFirestore(app);
const $ = selector => document.querySelector(selector);
const toast = $('#toast');

const defaultMembers = [
  { id: 'member-1', name: 'PGS. TS. Trần Minh Hoàng', role: 'Giảng viên', specialty: 'Robot học & Điều khiển thông minh', email: 'hoang.tm@university.edu.vn', status: 'Đang hoạt động', color: '#f97316' },
  { id: 'member-2', name: 'ThS. Nguyễn Thu Hà', role: 'Nghiên cứu viên', specialty: 'Thị giác máy tính & AI', email: 'ha.nt@university.edu.vn', status: 'Đang hoạt động', color: '#60a5fa' },
  { id: 'member-3', name: 'Lê Quốc Bảo', role: 'Sinh viên', specialty: 'Robot tự hành & ROS', email: 'bao.lq@student.edu.vn', status: 'Đang hoạt động', color: '#fbbf24' },
  { id: 'member-4', name: 'Phạm Khánh Linh', role: 'Sinh viên', specialty: 'IoT công nghiệp & Hệ thống nhúng', email: 'linh.pk@student.edu.vn', status: 'Đang hoạt động', color: '#f472b6' },
  { id: 'member-5', name: 'Trần Đức Anh', role: 'Nghiên cứu viên', specialty: 'Digital Twin & Mô phỏng', email: 'anh.td@university.edu.vn', status: 'Tạm vắng', color: '#a78bfa' },
  { id: 'member-6', name: 'Vũ Minh Khoa', role: 'Sinh viên', specialty: 'Thiết kế cơ khí & CAD/CAE', email: 'khoa.vm@student.edu.vn', status: 'Đang hoạt động', color: '#2dd4bf' }
];

const defaultProjects = [
  { id: 'legacy-amr', title: 'Robot tự hành trong nhà', category: 'Robotics', description: 'Định vị, lập bản đồ và tránh vật cản theo thời gian thực.', status: 'published', legacy: true },
  { id: 'legacy-vision', title: 'Kiểm tra sản phẩm bằng AI', category: 'Computer Vision', description: 'Phát hiện sai hỏng tự động trên dây chuyền sản xuất.', status: 'published', legacy: true }
];

let currentUser = null;
let currentProfile = null;
let members = [...defaultMembers];
let activeFilter = 'Tất cả';
let publishedProjects = [];
let ownedProjects = [];
let adminProjects = [];
let unsubscribers = [];
let seedAttempted = false;

function approved() {
  return currentProfile?.status === 'approved';
}

function isAdmin() {
  return approved() && currentProfile?.role === 'admin';
}

function escapeHTML(value = '') {
  const div = document.createElement('div');
  div.textContent = value ?? '';
  return div.innerHTML;
}

function initials(name = '') {
  const clean = name.replace(/^(PGS\. TS\.|TS\.|ThS\.)\s*/i, '');
  const words = clean.trim().split(/\s+/).filter(Boolean);
  return ((words.at(-2)?.[0] || '') + (words.at(-1)?.[0] || 'U')).toUpperCase();
}

function safeColor(value) {
  return /^#[0-9a-f]{6}$/i.test(value || '') ? value : '#f97316';
}

function safePhoto(value = '') {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.href : '';
  } catch {
    return '';
  }
}

function avatarData(name) {
  const letter = initials(name).slice(0, 2);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" rx="40" fill="#172b36"/><text x="40" y="48" text-anchor="middle" font-family="Arial" font-size="24" font-weight="700" fill="white">${letter}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function notify(message, error = false) {
  toast.textContent = message;
  toast.classList.toggle('error', error);
  toast.classList.add('show');
  clearTimeout(notify.timer);
  notify.timer = setTimeout(() => toast.classList.remove('show'), 3200);
}

function resetSubscriptions() {
  unsubscribers.forEach(unsubscribe => unsubscribe());
  unsubscribers = [];
  publishedProjects = [];
  ownedProjects = [];
  adminProjects = [];
}

function renderAccount() {
  const loggedIn = Boolean(currentUser);
  $('#homeLoginLink').classList.toggle('hidden', loggedIn);
  $('#headerAccount').classList.toggle('hidden', !loggedIn);
  if (!loggedIn) return;
  const name = currentProfile?.displayName || currentUser.displayName || 'Thành viên';
  $('#homeUserName').textContent = name;
  $('#homeUserRole').textContent = isAdmin() ? 'Quản trị viên' : approved() ? 'Thành viên đã duyệt' : 'Đang chờ duyệt';
  $('#homeUserAvatar').src = safePhoto(currentProfile?.photoURL || currentUser.photoURL) || avatarData(name);
}

function applyPermissions() {
  $('#addMemberBtn').classList.toggle('hidden', !isAdmin());
  $('#addProjectBtn').classList.toggle('hidden', !approved());
  document.querySelectorAll('.admin-project-status').forEach(item => item.classList.toggle('hidden', !isAdmin()));
  renderMembers();
  renderProjects();
}

function renderMembers() {
  const keyword = $('#memberSearch').value.trim().toLocaleLowerCase('vi');
  const filtered = members.filter(member => {
    const matchesFilter = activeFilter === 'Tất cả' || member.role === activeFilter;
    return matchesFilter && `${member.name} ${member.specialty} ${member.email}`.toLocaleLowerCase('vi').includes(keyword);
  });
  $('#memberCount').textContent = `${filtered.length} / ${members.length} THÀNH VIÊN`;
  $('#memberGrid').innerHTML = filtered.length ? filtered.map(member => `
    <article class="member-card" data-member-id="${escapeHTML(member.id)}">
      ${isAdmin() ? `<div class="card-actions"><button type="button" data-member-action="edit" title="Chỉnh sửa">✎</button><button type="button" data-member-action="delete" title="Xóa">×</button></div>` : ''}
      <div class="member-top"><div class="avatar" style="background:${safeColor(member.color)}">${initials(member.name)}</div><div><h3>${escapeHTML(member.name)}</h3><span class="role">${escapeHTML(member.role)}</span></div></div>
      <p class="specialty">${escapeHTML(member.specialty)}</p>
      <a class="email" href="mailto:${escapeHTML(member.email)}">${escapeHTML(member.email)}</a><br>
      <span class="status ${member.status === 'Tạm vắng' ? 'away' : ''}">${escapeHTML(member.status)}</span>
    </article>`).join('') : '<div class="empty-state"><b>Không tìm thấy thành viên</b>Hãy thử từ khóa hoặc bộ lọc khác.</div>';
}

async function saveMembers(message) {
  if (!isAdmin()) return notify('Chỉ admin được chỉnh sửa danh sách thành viên.', true);
  try {
    await setDoc(doc(db, 'siteContent', 'members'), { items: members, updatedAt: serverTimestamp(), updatedBy: currentUser.uid });
    notify(message);
  } catch (error) {
    notify(error.code === 'permission-denied' ? 'Chưa có quyền cập nhật thành viên. Hãy Publish firestore.rules mới.' : `Không thể lưu thành viên (${error.code}).`, true);
  }
}

function openMemberModal(member = null) {
  if (!isAdmin()) return;
  $('#memberForm').reset();
  $('#modalTitle').textContent = member ? 'Chỉnh sửa thành viên' : 'Thêm thành viên mới';
  $('#memberId').value = member?.id || '';
  $('#memberName').value = member?.name || '';
  $('#memberRole').value = member?.role || 'Sinh viên';
  $('#memberStatus').value = member?.status || 'Đang hoạt động';
  $('#memberSpecialty').value = member?.specialty || '';
  $('#memberEmail').value = member?.email || '';
  $('#memberColor').value = safeColor(member?.color);
  $('#memberModal').showModal();
}

function watchMembers() {
  if (!approved()) {
    members = [...defaultMembers];
    renderMembers();
    return;
  }
  const memberRef = doc(db, 'siteContent', 'members');
  unsubscribers.push(onSnapshot(memberRef, snapshot => {
    if (snapshot.exists() && Array.isArray(snapshot.data().items)) {
      members = snapshot.data().items;
      renderMembers();
    } else {
      members = [...defaultMembers];
      renderMembers();
      if (isAdmin()) setDoc(memberRef, { items: defaultMembers, updatedAt: serverTimestamp(), updatedBy: currentUser.uid }).catch(() => {});
    }
  }, error => {
    members = [...defaultMembers];
    renderMembers();
    if (error.code === 'permission-denied') notify('Hãy Publish firestore.rules mới để đồng bộ thành viên.', true);
  }));
}

function projectTimestamp(project) {
  return project.updatedAt?.toMillis?.() || project.createdAt?.toMillis?.() || 0;
}

function visibleProjects() {
  if (isAdmin()) return [...adminProjects].sort((a, b) => projectTimestamp(b) - projectTimestamp(a));
  const merged = new Map();
  [...publishedProjects, ...ownedProjects].forEach(project => merged.set(project.id, project));
  return [...merged.values()].sort((a, b) => projectTimestamp(b) - projectTimestamp(a));
}

function projectArt(category = '') {
  const labels = { Robotics: 'RB', 'Computer Vision': 'AI', Automation: 'AT', 'IoT & Embedded': 'IoT', 'Thiết kế Cơ điện tử': 'CAD', Khác: 'LAB' };
  return labels[category] || 'LAB';
}

function renderProjects() {
  const dynamic = visibleProjects();
  const projects = dynamic.length ? dynamic : defaultProjects;
  $('#projectShowcase').innerHTML = projects.map((project, index) => {
    const ownDraft = approved() && project.ownerUid === currentUser?.uid && project.status === 'draft';
    const canEdit = !project.legacy && (isAdmin() || ownDraft);
    const canDelete = !project.legacy && (isAdmin() || ownDraft);
    const owner = project.ownerName ? `<small class="project-owner">Thực hiện bởi ${escapeHTML(project.ownerName)}</small>` : '';
    const status = project.status === 'draft' ? '<span class="project-state draft">Chờ admin công bố</span>' : '<span class="project-state published">Đã công bố</span>';
    const adminPublish = isAdmin() && !project.legacy ? `<button type="button" data-project-action="publish">${project.status === 'published' ? 'Gỡ công bố' : 'Công bố'}</button>` : '';
    return `<article class="showcase-card project-managed-card" data-project-id="${escapeHTML(project.id)}">
      <div class="showcase-art dynamic-project-art"><div class="project-monogram">${escapeHTML(projectArt(project.category))}</div><span>${String(index + 1).padStart(2, '0')} — ${escapeHTML(project.category || 'Hitech Lab')}</span>${!project.legacy && (approved() || isAdmin()) ? status : ''}</div>
      <div class="showcase-copy"><h3>${escapeHTML(project.title)}</h3><p>${escapeHTML(project.description)}</p>${owner}
      ${canEdit || canDelete || adminPublish ? `<div class="project-card-actions">${canEdit ? '<button type="button" data-project-action="edit">Chỉnh sửa</button>' : ''}${adminPublish}${canDelete ? '<button class="danger" type="button" data-project-action="delete">Xóa</button>' : ''}</div>` : ''}</div>
    </article>`;
  }).join('');
}

async function seedProjectsIfNeeded() {
  if (!isAdmin() || seedAttempted) return;
  seedAttempted = true;
  try {
    const snapshot = await getDocs(collection(db, 'projects'));
    if (!snapshot.empty) return;
    const batch = writeBatch(db);
    defaultProjects.forEach(project => {
      const ref = doc(collection(db, 'projects'));
      batch.set(ref, { title: project.title, category: project.category, description: project.description, status: 'published', ownerUid: currentUser.uid, ownerEmail: currentUser.email, ownerName: currentProfile.displayName || currentUser.displayName || 'Admin', createdAt: serverTimestamp(), updatedAt: serverTimestamp(), publishedAt: serverTimestamp() });
    });
    await batch.commit();
  } catch (error) {
    if (error.code === 'permission-denied') notify('Hãy Publish firestore.rules mới để quản lý dự án.', true);
  }
}

function watchProjects() {
  if (isAdmin()) {
    unsubscribers.push(onSnapshot(query(collection(db, 'projects'), orderBy('createdAt', 'desc')), snapshot => {
      adminProjects = snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
      renderProjects();
    }, error => notify(`Không thể tải dự án (${error.code}).`, true)));
    seedProjectsIfNeeded();
    return;
  }
  unsubscribers.push(onSnapshot(query(collection(db, 'projects'), where('status', '==', 'published')), snapshot => {
    publishedProjects = snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
    renderProjects();
  }, error => {
    renderProjects();
    if (error.code === 'permission-denied') notify('Hãy Publish firestore.rules mới để tải dự án.', true);
  }));
  if (approved()) {
    unsubscribers.push(onSnapshot(query(collection(db, 'projects'), where('ownerUid', '==', currentUser.uid)), snapshot => {
      ownedProjects = snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
      renderProjects();
    }, error => notify(`Không thể tải dự án của bạn (${error.code}).`, true)));
  }
}

function findProject(id) {
  return [...adminProjects, ...ownedProjects, ...publishedProjects].find(project => project.id === id);
}

function openProjectModal(project = null) {
  if (!approved()) return notify('Bạn cần đăng nhập bằng tài khoản đã được duyệt.', true);
  const ownDraft = project?.ownerUid === currentUser.uid && project?.status === 'draft';
  if (project && !isAdmin() && !ownDraft) return notify('Bạn chỉ được sửa dự án nháp của chính mình.', true);
  $('#projectForm').reset();
  $('#projectModalTitle').textContent = project ? 'Chỉnh sửa dự án' : 'Đăng dự án mới';
  $('#projectId').value = project?.id || '';
  $('#projectTitle').value = project?.title || '';
  $('#projectCategory').value = project?.category || 'Robotics';
  $('#projectDescription').value = project?.description || '';
  $('#projectStatus').value = project?.status || 'draft';
  $('#projectFormNote').textContent = isAdmin() ? 'Admin có thể lưu nháp hoặc công bố dự án ngay.' : 'Dự án sẽ ở trạng thái chờ admin công bố.';
  $('#projectModal').showModal();
}

async function saveProject(event) {
  event.preventDefault();
  if (!currentUser) return notify('Bạn cần đăng nhập trước khi lưu dự án.', true);
  if (!approved()) return notify('Tài khoản chưa được admin phê duyệt nên chưa thể đăng dự án.', true);
  const id = $('#projectId').value;
  const existing = id ? findProject(id) : null;
  const status = isAdmin() ? $('#projectStatus').value : 'draft';
  const content = { title: $('#projectTitle').value.trim(), category: $('#projectCategory').value, description: $('#projectDescription').value.trim(), updatedAt: serverTimestamp() };
  const submitButton = $('#projectSubmitBtn');
  const originalLabel = submitButton.textContent;
  submitButton.disabled = true;
  submitButton.textContent = 'Đang lưu vào Firebase...';
  try {
    if (existing) {
      const ownDraft = existing.ownerUid === currentUser.uid && existing.status === 'draft';
      if (!isAdmin() && !ownDraft) throw Object.assign(new Error('Forbidden'), { code: 'permission-denied' });
      await updateDoc(doc(db, 'projects', id), isAdmin() ? { ...content, status, publishedAt: status === 'published' ? serverTimestamp() : null } : content);
      notify('Đã cập nhật dự án.');
    } else {
      await addDoc(collection(db, 'projects'), { ...content, status, ownerUid: currentUser.uid, ownerEmail: currentUser.email, ownerName: currentProfile.displayName || currentUser.displayName || 'Thành viên', createdAt: serverTimestamp(), publishedAt: status === 'published' ? serverTimestamp() : null });
      notify(isAdmin() && status === 'published' ? 'Đã đăng và công bố dự án.' : 'Đã gửi dự án cho admin duyệt.');
    }
    $('#projectModal').close();
  } catch (error) {
    console.error('Firebase project save failed', error);
    const message = error.code === 'permission-denied'
      ? 'Firebase đã kết nối nhưng Rules chưa cho phép lưu. Vào Firestore Database → Rules, dán file firestore.rules mới và nhấn Publish.'
      : error.code === 'unavailable'
        ? 'Không thể kết nối Firebase. Hãy kiểm tra mạng rồi thử lại.'
        : `Không thể lưu dự án lên Firebase (${error.code || 'unknown'}).`;
    $('#projectFormNote').textContent = message;
    notify(message, true);
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = originalLabel;
  }
}

async function projectAction(action, project) {
  if (!project) return;
  try {
    if (action === 'edit') return openProjectModal(project);
    if (action === 'publish' && isAdmin()) {
      const publishing = project.status !== 'published';
      await updateDoc(doc(db, 'projects', project.id), { status: publishing ? 'published' : 'draft', publishedAt: publishing ? serverTimestamp() : null, updatedAt: serverTimestamp() });
      return notify(publishing ? 'Đã công bố dự án.' : 'Đã gỡ công bố dự án.');
    }
    const ownDraft = project.ownerUid === currentUser?.uid && project.status === 'draft';
    if (action === 'delete' && (isAdmin() || ownDraft) && confirm(`Xóa dự án “${project.title}”?`)) {
      await deleteDoc(doc(db, 'projects', project.id));
      notify('Đã xóa dự án.');
    }
  } catch (error) {
    notify(`Không thể cập nhật dự án (${error.code}).`, true);
  }
}

$('#homeLogoutBtn').addEventListener('click', () => signOut(auth));
$('#addMemberBtn').addEventListener('click', () => openMemberModal());
$('#addProjectBtn').addEventListener('click', () => openProjectModal());
$('#memberSearch').addEventListener('input', renderMembers);
document.querySelectorAll('.filter').forEach(button => button.addEventListener('click', () => {
  document.querySelector('.filter.active')?.classList.remove('active');
  button.classList.add('active');
  activeFilter = button.dataset.filter;
  renderMembers();
}));

$('#memberGrid').addEventListener('click', event => {
  const button = event.target.closest('[data-member-action]');
  const card = event.target.closest('[data-member-id]');
  if (!button || !card || !isAdmin()) return;
  const member = members.find(item => String(item.id) === card.dataset.memberId);
  if (!member) return;
  if (button.dataset.memberAction === 'edit') openMemberModal(member);
  if (button.dataset.memberAction === 'delete' && confirm(`Xóa thành viên “${member.name}”?`)) {
    members = members.filter(item => item.id !== member.id);
    saveMembers('Đã xóa thành viên.');
  }
});

$('#memberForm').addEventListener('submit', event => {
  event.preventDefault();
  if (!isAdmin()) return;
  const id = $('#memberId').value;
  const data = { id: id || `member-${Date.now()}`, name: $('#memberName').value.trim(), role: $('#memberRole').value, status: $('#memberStatus').value, specialty: $('#memberSpecialty').value.trim(), email: $('#memberEmail').value.trim(), color: safeColor($('#memberColor').value) };
  members = id ? members.map(member => String(member.id) === id ? data : member) : [data, ...members];
  $('#memberModal').close();
  saveMembers(id ? 'Đã cập nhật thành viên.' : 'Đã thêm thành viên.');
});

document.querySelectorAll('.close-modal,.cancel-modal').forEach(button => button.addEventListener('click', () => $('#memberModal').close()));
$('#memberModal').addEventListener('click', event => { if (event.target === $('#memberModal')) $('#memberModal').close(); });
document.querySelectorAll('.close-project-modal,.cancel-project-modal').forEach(button => button.addEventListener('click', () => $('#projectModal').close()));
$('#projectModal').addEventListener('click', event => { if (event.target === $('#projectModal')) $('#projectModal').close(); });
$('#projectForm').addEventListener('submit', saveProject);
$('#projectShowcase').addEventListener('click', event => {
  const button = event.target.closest('[data-project-action]');
  const card = event.target.closest('[data-project-id]');
  if (button && card) projectAction(button.dataset.projectAction, findProject(card.dataset.projectId));
});

$('.menu-toggle').addEventListener('click', event => {
  $('.nav-links').classList.toggle('open');
  event.currentTarget.setAttribute('aria-expanded', $('.nav-links').classList.contains('open'));
});
document.querySelectorAll('.nav-links a').forEach(link => link.addEventListener('click', () => $('.nav-links').classList.remove('open')));

const observer = new IntersectionObserver(entries => entries.forEach(entry => {
  if (entry.isIntersecting) entry.target.classList.add('visible');
}), { threshold: .08 });
document.querySelectorAll('.reveal').forEach(element => observer.observe(element));

const progressBar = $('#studioProgress');
const studioCursor = $('#studioCursor');
const mainHeader = $('#mainHeader');
const media = $('.studio-media');
function updateScrollEffects() {
  const scrollable = document.documentElement.scrollHeight - innerHeight;
  progressBar.style.transform = `scaleX(${scrollable > 0 ? Math.min(1, scrollY / scrollable) : 0})`;
  mainHeader.classList.toggle('scrolled', scrollY > 24);
}
addEventListener('scroll', updateScrollEffects, { passive: true });
updateScrollEffects();

if (matchMedia('(pointer: fine)').matches) {
  addEventListener('pointermove', event => {
    studioCursor.style.left = `${event.clientX}px`;
    studioCursor.style.top = `${event.clientY}px`;
    studioCursor.classList.add('active');
  });
  document.querySelectorAll('a, button, input, select, textarea').forEach(element => {
    element.addEventListener('pointerenter', () => studioCursor.classList.add('link'));
    element.addEventListener('pointerleave', () => studioCursor.classList.remove('link'));
  });
  media?.addEventListener('pointermove', event => {
    const box = media.getBoundingClientRect();
    const x = (event.clientX - box.left) / box.width;
    const y = (event.clientY - box.top) / box.height;
    document.documentElement.style.setProperty('--tilt-y', `${(x - .5) * 4}deg`);
    document.documentElement.style.setProperty('--tilt-x', `${(.5 - y) * 4}deg`);
    document.documentElement.style.setProperty('--light-x', `${x * 100}%`);
    document.documentElement.style.setProperty('--light-y', `${y * 100}%`);
  });
  media?.addEventListener('pointerleave', () => {
    document.documentElement.style.setProperty('--tilt-x', '0deg');
    document.documentElement.style.setProperty('--tilt-y', '0deg');
  });
}

renderMembers();
renderProjects();
onAuthStateChanged(auth, async user => {
  resetSubscriptions();
  currentUser = user;
  currentProfile = null;
  if (user) {
    try {
      const snapshot = await getDoc(doc(db, 'users', user.uid));
      currentProfile = snapshot.exists() ? snapshot.data() : null;
    } catch (error) {
      notify(`Không thể tải thông tin tài khoản (${error.code}).`, true);
    }
  }
  renderAccount();
  applyPermissions();
  watchMembers();
  watchProjects();
});
