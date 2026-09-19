const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_do_not_use_in_prod';
const TOKEN_TTL = '7d';
const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
  console.error("❌ MONGO_URI is missing! Add it to your environment variables.");
  process.exit(1);
}

/* ---------- Connect to MongoDB ---------- */
mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ Connected to MongoDB'))
  .catch(err => console.error('❌ MongoDB connection error:', err));

/* ---------- Schemas ---------- */
const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  hash: { type: String, required: true },
  role: { type: String, default: 'user' },
  createdAt: { type: Date, default: Date.now }
});

const appSchema = new mongoose.Schema({
  name: { type: String, required: true },
  category: { type: String, required: true },
  description: { type: String, default: '' },
  rating: { type: Number, default: 0 },
  color: { type: String, default: '#4F46E5' },
  icon: { type: String, default: '?' },
  size: { type: String, default: '—' },
  downloads: { type: Number, default: 0 },
  file: { type: String, default: null },
  downloadUrl: { type: String, default: null },
  uploadedBy: { type: String, default: 'system' },
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
const App = mongoose.model('App', appSchema);

/* ---------- Seed initial apps if database is empty ---------- */
async function seedApps() {
  const count = await App.countDocuments();
  if (count > 0) return; // Already has apps, don't seed.

  const demoApps = [
    { name: 'PixelCraft', category: 'Photo Editor', description: 'Professional photo editing with AI-powered tools.', rating: 4.8, color: '#EF4444', icon: 'P', downloads: 12400, size: '24 MB' },
    { name: 'NoteFlow', category: 'Productivity', description: 'Beautiful notes with markdown and instant sync.', rating: 4.6, color: '#10B981', icon: 'N', downloads: 8300, size: '12 MB' },
    { name: 'SoundWave', category: 'Music', description: 'Lossless music player with a 10-band EQ.', rating: 4.9, color: '#8B5CF6', icon: 'S', downloads: 22100, size: '38 MB' },
    { name: 'CodeBox', category: 'Developer', description: 'A pocket IDE with syntax highlighting.', rating: 4.7, color: '#06B6D4', icon: 'C', downloads: 5400, size: '56 MB' },
    { name: 'FitTrack', category: 'Health', description: 'Track workouts, sleep, and nutrition.', rating: 4.5, color: '#F59E0B', icon: 'F', downloads: 9100, size: '18 MB' },
    { name: 'GameHub', category: 'Games', description: 'Curated indie games in one launcher.', rating: 4.4, color: '#EC4899', icon: 'G', downloads: 18200, size: '72 MB' },
    { name: 'ChatZen', category: 'Social', description: 'End-to-end encrypted messaging.', rating: 4.6, color: '#3B82F6', icon: 'Z', downloads: 31200, size: '31 MB' },
    { name: 'Weatherly', category: 'Utilities', description: 'Hyper-local forecasts with radar.', rating: 4.7, color: '#14B8A6', icon: 'W', downloads: 6700, size: '9 MB' }
  ];

  await App.insertMany(demoApps);
  console.log('✅ Seeded 8 demo apps into MongoDB');
}
seedApps();

/* ---------- Express middleware ---------- */
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

/* ---------- Multer (file uploads) ---------- */
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).slice(0, 10);
    cb(null, crypto.randomUUID() + ext);
  }
});
const upload = multer({ storage, limits: { fileSize: 100 * 1024 * 1024 } });

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
  if (!req.user || req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
  next();
}

/* ============================================================
   AUTH ROUTES
   ============================================================ */

app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Invalid email address' });
    if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

    const existingUser = await User.findOne({ email });
    if (existingUser) return res.status(409).json({ error: 'That email is already registered' });

    const hash = await bcrypt.hash(password, 12);
    const isFirst = (await User.countDocuments()) === 0;
    const user = await User.create({ email, hash, role: isFirst ? 'admin' : 'user' });

    const token = jwt.sign({ id: user._id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: TOKEN_TTL });
    res.json({ token, user: { id: user._id, email: user.email, role: user.role } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ error: 'Invalid email or password' });

    const ok = await bcrypt.compare(password, user.hash);
    if (!ok) return res.status(401).json({ error: 'Invalid email or password' });

    const token = jwt.sign({ id: user._id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: TOKEN_TTL });
    res.json({ token, user: { id: user._id, email: user.email, role: user.role } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/auth/me', auth(true), async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ id: user._id, email: user.email, role: user.role });
});

/* ============================================================
   APP ROUTES
   ============================================================ */

app.get('/api/apps', async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    const cat = req.query.category;
    let filter = {};

    if (q) {
      filter.$or = [
        { name: { $regex: q, $options: 'i' } },
        { description: { $regex: q, $options: 'i' } },
        { category: { $regex: q, $options: 'i' } }
      ];
    }
    if (cat && cat !== 'All') filter.category = cat;

    const apps = await App.find(filter).sort({ downloads: -1 });
    res.json(apps);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch apps' });
  }
});

app.get('/api/categories', async (req, res) => {
  const cats = await App.distinct('category');
  res.json(['All', ...cats.sort()]);
});

app.get('/api/apps/:id', async (req, res) => {
  const app = await App.findById(req.params.id);
  if (!app) return res.status(404).json({ error: 'App not found' });
  res.json(app);
});

app.post('/api/apps', auth(true), requireAdmin, upload.single('file'), async (req, res) => {
  try {
    const { name, category, description, rating, color, icon, size } = req.body || {};
    if (!name || !category) return res.status(400).json({ error: 'Name and category are required' });

    const newApp = await App.create({
      name: String(name).slice(0, 80),
      category: String(category).slice(0, 40),
      description: String(description || '').slice(0, 500),
      rating: Math.min(5, Math.max(0, parseFloat(rating) || 0)),
      color: color || '#4F46E5',
      icon: (icon || name[0] || '?').toUpperCase().slice(0, 2),
      size: size || '—',
      file: req.file ? req.file.filename : null,
      uploadedBy: req.user.email,
    });
    res.status(201).json(newApp);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Upload failed' });
  }
});

app.post('/api/apps/:id/download', async (req, res) => {
  try {
    const app = await App.findById(req.params.id);
    if (!app) return res.status(404).json({ error: 'App not found' });

    app.downloads = (app.downloads || 0) + 1;
    await app.save();

    let downloadLink = null;
    if (app.downloadUrl) downloadLink = app.downloadUrl;
    else if (app.file) downloadLink = `/uploads/${app.file}`;

    res.json({ ok: true, file: downloadLink, name: app.name });
  } catch (err) {
    res.status(500).json({ error: 'Download failed' });
  }
});

app.delete('/api/apps/:id', auth(true), requireAdmin, async (req, res) => {
  try {
    const app = await App.findById(req.params.id);
    if (!app) return res.status(404).json({ error: 'App not found' });

    if (app.file) {
      const p = path.join(__dirname, 'uploads', app.file);
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }
    await App.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Delete failed' });
  }
});

app.use((req, res) => res.status(404).json({ error: 'Not found' }));

app.listen(PORT, () => {
  console.log('\n  ╔══════════════════════════════════════╗');
  console.log('  ║   LOGX is running                    ║');
  console.log('  ║   → http://localhost:' + PORT + '            ║');
  console.log('  ╚══════════════════════════════════════╝\n');
});