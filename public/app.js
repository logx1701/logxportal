/* =========================================================
   LOGX — frontend
   ========================================================= */

const API = ''; // same origin
let token = localStorage.getItem('logx_token') || null;
let currentUser = null;
let allApps = [];

/* ---------- Helpers ---------- */
const $ = id => document.getElementById(id);

function showToast(msg, isError = false) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.toggle('err', isError);
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 2600);
}

async function api(path, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  if (token) headers.Authorization = 'Bearer ' + token;
  if (opts.body && !(opts.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }
  const res = await fetch(API + path, { ...opts, headers });
  let data = null;
  try { data = await res.json(); } catch { }
  if (!res.ok) throw new Error((data && data.error) || ('HTTP ' + res.status));
  return data;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

/* =========================================================
   AUTH
   ========================================================= */
let authMode = 'login';

function openAuth(mode) {
  authMode = mode;
  $('authError').textContent = '';
  $('email').value = '';
  $('password').value = '';
  $('confirm').value = '';

  if (mode === 'signup') {
    $('authTitle').textContent = 'Create Account';
    $('authSubmit').textContent = 'Sign Up';
    $('confirm').style.display = 'block';
    $('authSwitch').innerHTML = `Already have an account? <a onclick="openAuth('login')">Sign in</a>`;
  } else {
    $('authTitle').textContent = 'Sign In';
    $('authSubmit').textContent = 'Sign In';
    $('confirm').style.display = 'none';
    $('authSwitch').innerHTML = `No account? <a onclick="openAuth('signup')">Create one</a>`;
  }
  $('authModal').classList.add('show');
  setTimeout(() => $('email').focus(), 100);
}

function closeAuth() { $('authModal').classList.remove('show'); }

async function handleAuth() {
  const email = $('email').value.trim();
  const password = $('password').value;
  const confirm = $('confirm').value;
  const err = $('authError');
  err.textContent = '';

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { err.textContent = 'Enter a valid email.'; return; }
  if (password.length < 8) { err.textContent = 'Password must be at least 8 characters.'; return; }
  if (authMode === 'signup' && password !== confirm) { err.textContent = 'Passwords do not match.'; return; }

  $('authSubmit').disabled = true;
  $('authSubmit').textContent = 'Please wait…';

  try {
    const path = authMode === 'signup' ? '/api/auth/register' : '/api/auth/login';
    const data = await api(path, {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
    token = data.token;
    currentUser = data.user;
    localStorage.setItem('logx_token', token);
    closeAuth();
    renderUserArea();
    showToast(authMode === 'signup' ? 'Account created! Welcome to LOGX.' : 'Signed in successfully.');
  } catch (e) {
    err.textContent = e.message;
  } finally {
    $('authSubmit').disabled = false;
    $('authSubmit').textContent = authMode === 'signup' ? 'Sign Up' : 'Sign In';
  }
}

function logout() {
  token = null;
  currentUser = null;
  localStorage.removeItem('logx_token');
  renderUserArea();
  showToast('Signed out.');
}

async function restoreSession() {
  if (!token) { renderUserArea(); return; }
  try {
    currentUser = await api('/api/auth/me');
  } catch {
    token = null;
    localStorage.removeItem('logx_token');
  }
  renderUserArea();
}

function renderUserArea() {
  const el = $('userArea');
  if (!currentUser) {
    el.innerHTML = `
      <a onclick="openAuth('login')">Sign In</a>
      <button class="btn btn-primary" onclick="openAuth('signup')" style="margin-left:8px">Create Account</button>
    `;
    return;
  }
  const admin = currentUser.role === 'admin';
  el.innerHTML = `
    <div class="user-chip">
      <span>Hi, <strong>${escapeHtml(currentUser.email.split('@')[0])}</strong></span>
      ${admin ? '<span class="badge">Admin</span>' : ''}
      ${admin ? '<button class="btn btn-outline" onclick="openUpload()">Upload App</button>' : ''}
      <button class="btn btn-outline" onclick="logout()">Sign Out</button>
    </div>
  `;
}

/* =========================================================
   APPS
   ========================================================= */
async function loadApps() {
  const q = $('search')?.value || '';
  const cat = $('categoryFilter')?.value || 'All';
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (cat && cat !== 'All') params.set('category', cat);

  try {
    allApps = await api('/api/apps?' + params.toString());
    renderGrid(allApps);
  } catch (e) {
    $('grid').innerHTML = `<div class="empty">Failed to load apps: ${escapeHtml(e.message)}</div>`;
  }
}

async function loadCategories() {
  try {
    const cats = await api('/api/categories');
    $('categoryFilter').innerHTML = cats
      .map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`)
      .join('');
  } catch { }
}

function renderGrid(apps) {
  const grid = $('grid');
  if (!apps.length) {
    grid.innerHTML = `<div class="empty">No apps found.</div>`;
    return;
  }
  const isAdmin = currentUser?.role === 'admin';

  grid.innerHTML = apps.map(a => `
    <div class="app-card" onclick="openDetail('${a.id}')">
      <div class="app-icon" style="background:${escapeHtml(a.color)}">${escapeHtml(a.icon)}</div>
      <h3>${escapeHtml(a.name)}</h3>
      <div class="cat">${escapeHtml(a.category)}</div>
      <div class="desc">${escapeHtml(a.description)}</div>
      <div class="actions">
        <span class="rating">★ ${a.rating.toFixed(1)}</span>
        <button class="dl-btn" onclick="event.stopPropagation(); downloadApp('${a.id}')">Download</button>
      </div>
      ${isAdmin ? `<button class="btn-danger" style="margin-top:12px;padding:6px;border-radius:8px;cursor:pointer;border:1px solid #3a1a1a;background:transparent;color:#EF4444" onclick="event.stopPropagation(); deleteApp('${a.id}')">Delete</button>` : ''}
    </div>
  `).join('');
}

async function downloadApp(id) {
  try {
    const r = await api('/api/apps/' + id + '/download', { method: 'POST' });
    if (r.file) {
      const a = document.createElement('a');
      a.href = r.file;
      a.download = '';
      document.body.appendChild(a);
      a.click();
      a.remove();
      showToast(`Downloading ${r.name}…`);
    } else {
      showToast(`${r.name} — demo app (no file attached)`);
    }
    loadApps();
  } catch (e) {
    showToast(e.message, true);
  }
}

async function deleteApp(id) {
  if (!confirm('Delete this app permanently?')) return;
  try {
    await api('/api/apps/' + id, { method: 'DELETE' });
    showToast('App deleted.');
    loadApps();
  } catch (e) {
    showToast(e.message, true);
  }
}

function scrollToApps() {
  $('apps').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ---------- Detail modal ---------- */
function openDetail(id) {
  const a = allApps.find(x => x.id === id);
  if (!a) return;
  $('detailBody').innerHTML = `
    <div class="detail-head">
      <div class="app-icon" style="background:${escapeHtml(a.color)}">${escapeHtml(a.icon)}</div>
      <div>
        <h2>${escapeHtml(a.name)}</h2>
        <div class="detail-meta">${escapeHtml(a.category)} · ★ ${a.rating.toFixed(1)}</div>
      </div>
    </div>
    <div class="detail-stats">
      <div>Downloads <b>${a.downloads.toLocaleString()}</b></div>
      <div>Size <b>${escapeHtml(a.size)}</b></div>
      <div>Uploaded by <b>${escapeHtml((a.uploadedBy || '').split('@')[0])}</b></div>
    </div>
    <div class="detail-body"><p>${escapeHtml(a.description)}</p></div>
    <button class="btn btn-primary wide" onclick="downloadApp('${a.id}')">Download Now</button>
  `;
  $('detailModal').classList.add('show');
}
function closeDetail() { $('detailModal').classList.remove('show'); }

/* ---------- Upload modal ---------- */
function openUpload() {
  $('uploadError').textContent = '';
  ['upName', 'upCategory', 'upRating', 'upDesc'].forEach(id => $(id).value = '');
  $('upFile').value = '';
  $('uploadModal').classList.add('show');
}
function closeUpload() { $('uploadModal').classList.remove('show'); }

async function submitUpload() {
  const err = $('uploadError');
  err.textContent = '';

  const name = $('upName').value.trim();
  const category = $('upCategory').value.trim();
  if (!name || !category) { err.textContent = 'Name and category are required.'; return; }

  const fd = new FormData();
  fd.append('name', name);
  fd.append('category', category);
  fd.append('description', $('upDesc').value.trim());
  fd.append('rating', $('upRating').value || '0');
  fd.append('color', $('upColor').value);
  fd.append('icon', name[0].toUpperCase());
  const f = $('upFile').files[0];
  if (f) fd.append('file', f);

  try {
    await api('/api/apps', { method: 'POST', body: fd });
    closeUpload();
    showToast('App uploaded successfully!');
    await loadCategories();
    loadApps();
  } catch (e) {
    err.textContent = e.message;
  }
}

/* =========================================================
   INIT
   ========================================================= */
document.addEventListener('click', e => {
  if (e.target.classList.contains('modal-bg')) {
    e.target.classList.remove('show');
  }
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') document.querySelectorAll('.modal-bg.show').forEach(m => m.classList.remove('show'));
  if (e.key === 'Enter' && $('authModal').classList.contains('show')) handleAuth();
});

(async function init() {
  await restoreSession();
  await loadCategories();
  await loadApps();
})();