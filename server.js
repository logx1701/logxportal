const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
const TOKEN_TTL = '7d';

/* ---------- Storage setup ---------- */
const DATA_DIR = path.join(__dirname, 'data');
const UPLOAD_DIR = path.join(__dirname, 'uploads');
[DATA_DIR, UPLOAD_DIR].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });

const USERS_FILE = path.join(DATA_DIR, 'users.json');
const APPS_FILE = path.join(DATA_DIR, 'apps.json');

const readJSON = (f, fb) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return fb; } };
const writeJSON = (f, d) => fs.writeFileSync(f, JSON.stringify(d, null, 2));

if (!fs.existsSync(USERS_FILE)) writeJSON(USERS_FILE, []);
if (!fs.existsSync(APPS_FILE)) writeJSON(APPS_FILE, seedApps());

function seedApps() {
  const now = Date.now();
  return [
    // Example of a real permanent download link!
    { id: crypto.randomUUID(), name: 'PixelCraft', category: 'Photo Editor', description: 'Professional photo editing with AI-powered tools.', rating: 4.8, color: '#EF4444', icon: 'P', downloads: 12400, size: '24 MB', file: null, downloadUrl: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf', uploadedBy: 'system', createdAt: now },

    // The rest can stay as demos for now
    { id: crypto.randomUUID(), name: 'NoteFlow', category: 'Productivity', description: 'Beautiful notes with markdown and instant sync.', rating: 4.6, color: '#10B981', icon: 'N', downloads: 8300, size: '12 MB', file: null, downloadUrl: null, uploadedBy: 'system', createdAt: now },
    { id: crypto.randomUUID(), name: 'SoundWave', category: 'Music', description: 'Lossless music player with a 10-band EQ.', rating: 4.9, color: '#8B5CF6', icon: 'S', downloads: 22100, size: '38 MB', file: null, downloadUrl: null, uploadedBy: 'system', createdAt: now },
    { id: crypto.randomUUID(), name: 'CodeBox', category: 'Developer', description: 'A pocket IDE with syntax highlighting.', rating: 4.7, color: '#06B6D4', icon: 'C', downloads: 5400, size: '56 MB', file: null, downloadUrl: null, uploadedBy: 'system', createdAt: now },
  ];
}

/* ---------- Express middleware ---------- */
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOAD_DIR));

/* ---------- Multer (file uploads) ---------- */
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).slice(0, 10);
    cb(null, crypto.randomUUID() + ext);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 } // 100 MB
});

/* ---------- Auth helpers ---------- */
function auth(required = true) {
  return (req, res, next) => {
    const h = req.headers.authorization || '';
    const token = h.startsWith('Bearer ') ? h.slice(7) : null;
    if (!token) {
      if (required) return res.status(401).json({ error: 'Authentication required' });
      return next();
    }
    try {
      req.user = jwt.verify(token, JWT_SECRET);
      next();
    } catch {
      if (required) return res.status(401).json({ error: 'Invalid or expired session' });
      next();
    }
  };
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

/* ============================================================
   AUTH ROUTES
   ============================================================ */

// Register
app.post('/api/apps/:id/download', (req, res) => {
  const apps = readJSON(APPS_FILE, []);
  const app = apps.find(a => a.id === req.params.id);
  if (!app) return res.status(404).json({ error: 'App not found' });

  app.downloads = (app.downloads || 0) + 1;
  writeJSON(APPS_FILE, apps);

  // If it's a URL, send that. If it's an uploaded file, send that.
  let downloadLink = null;
  if (app.downloadUrl) {
    downloadLink = app.downloadUrl;
  } else if (app.file) {
    downloadLink = `/uploads/${app.file}`;
  }

  res.json({
    ok: true,
    file: downloadLink,
    name: app.name
  });
});

const hash = await bcrypt.hash(password, 12);
const isFirst = users.length === 0;
const user = {
  id: crypto.randomUUID(),
  email: normalized,
  hash,
  role: isFirst ? 'admin' : 'user',
  createdAt: Date.now()
};
users.push(user);
writeJSON(USERS_FILE, users);

const token = jwt.sign(
  { id: user.id, email: user.email, role: user.role },
  JWT_SECRET,
  { expiresIn: TOKEN_TTL }
);
res.json({ token, user: { id: user.id, email: user.email, role: user.role } });
  } catch (err) {
  console.error(err);
  res.status(500).json({ error: 'Server error' });
}
});

// Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    const users = readJSON(USERS_FILE, []);
    const user = users.find(u => u.email === email.toLowerCase().trim());
    if (!user) return res.status(401).json({ error: 'Invalid email or password' });

    const ok = await bcrypt.compare(password, user.hash);
    if (!ok) return res.status(401).json({ error: 'Invalid email or password' });

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: TOKEN_TTL }
    );
    res.json({ token, user: { id: user.id, email: user.email, role: user.role } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Current user
app.get('/api/auth/me', auth(true), (req, res) => {
  const users = readJSON(USERS_FILE, []);
  const user = users.find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ id: user.id, email: user.email, role: user.role });
});

/* ============================================================
   APP ROUTES
   ============================================================ */

// List apps (with optional search & category filter)
app.get('/api/apps', (req, res) => {
  const apps = readJSON(APPS_FILE, []);
  const q = (req.query.q || '').toLowerCase().trim();
  const cat = req.query.category;
  let out = apps;
  if (q) out = out.filter(a =>
    a.name.toLowerCase().includes(q) ||
    a.description.toLowerCase().includes(q) ||
    a.category.toLowerCase().includes(q)
  );
  if (cat && cat !== 'All') out = out.filter(a => a.category === cat);
  out.sort((a, b) => b.downloads - a.downloads);
  res.json(out);
});

// Categories list
app.get('/api/categories', (req, res) => {
  const apps = readJSON(APPS_FILE, []);
  const cats = [...new Set(apps.map(a => a.category))].sort();
  res.json(['All', ...cats]);
});

// Single app
app.get('/api/apps/:id', (req, res) => {
  const apps = readJSON(APPS_FILE, []);
  const app = apps.find(a => a.id === req.params.id);
  if (!app) return res.status(404).json({ error: 'App not found' });
  res.json(app);
});

// Upload new app (admin only)
app.post('/api/apps', auth(true), requireAdmin, upload.single('file'), (req, res) => {
  try {
    const { name, category, description, rating, color, icon, size } = req.body || {};
    if (!name || !category) {
      return res.status(400).json({ error: 'Name and category are required' });
    }

    const apps = readJSON(APPS_FILE, []);
    const newApp = {
      id: crypto.randomUUID(),
      name: String(name).slice(0, 80),
      category: String(category).slice(0, 40),
      description: String(description || '').slice(0, 500),
      rating: Math.min(5, Math.max(0, parseFloat(rating) || 0)),
      color: color || '#4F46E5',
      icon: (icon || name[0] || '?').toUpperCase().slice(0, 2),
      size: size || '—',
      downloads: 0,
      file: req.file ? req.file.filename : null,
      uploadedBy: req.user.email,
      createdAt: Date.now()
    };
    apps.push(newApp);
    writeJSON(APPS_FILE, apps);
    res.status(201).json(newApp);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// Increment download counter + return file URL
app.post('/api/apps/:id/download', (req, res) => {
  const apps = readJSON(APPS_FILE, []);
  const app = apps.find(a => a.id === req.params.id);
  if (!app) return res.status(404).json({ error: 'App not found' });
  app.downloads = (app.downloads || 0) + 1;
  writeJSON(APPS_FILE, apps);
  res.json({
    ok: true,
    file: app.file ? `/uploads/${app.file}` : null,
    name: app.name
  });
});

// Delete app (admin only)
app.delete('/api/apps/:id', auth(true), requireAdmin, (req, res) => {
  const apps = readJSON(APPS_FILE, []);
  const idx = apps.findIndex(a => a.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'App not found' });

  const [removed] = apps.splice(idx, 1);
  if (removed.file) {
    const p = path.join(UPLOAD_DIR, removed.file);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
  writeJSON(APPS_FILE, apps);
  res.json({ ok: true });
});

/* ---------- Fallback ---------- */
app.use((req, res) => res.status(404).json({ error: 'Not found' }));

app.listen(PORT, () => {
  console.log('\n  ╔══════════════════════════════════════╗');
  console.log('  ║   LOGX is running                    ║');
  console.log('  ║   → http://localhost:' + PORT + '            ║');
  console.log('  ╚══════════════════════════════════════╝\n');
  console.log('  First account you create becomes ADMIN.\n');
});