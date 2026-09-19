const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_do_not_use_in_prod';
const TOKEN_TTL = '7d';
const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
  console.error("❌ MONGO_URI is missing!");
  process.exit(1);
}

/* ---------- Cloudinary Config ---------- */
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

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
  downloadUrl: { type: String, default: null },
  uploadedBy: { type: String, default: 'system' },
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
const App = mongoose.model('App', appSchema);

/* ---------- Seed initial apps if database is empty ---------- */
async function seedApps() {
  try {
    const count = await App.countDocuments();
    if (count > 0) return;

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
  } catch (err) {
    console.error('Seed error (might be waiting for DB connection):', err.message);
  }
}
// Wait 2 seconds to ensure DB is connected before seeding
setTimeout(seedApps, 2000);

/* ---------- Express middleware ---------- */
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

/* ---------- Multer + Cloudinary Storage ---------- */
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'logx_uploads',
    resource_type: 'auto'
    // We removed the 'allowed_formats' restriction so any file works!
  }
});
const upload = multer({ storage: storage });

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

    // THE MAGIC FIX: Add an 'id' field that matches MongoDB's '_id'
    // This makes BOTH old and new frontend code work perfectly.
    const appsWithId = apps.map(app => {
      const obj = app.toObject();
      obj.id = obj._id.toString();
      return obj;
    });

    res.json(appsWithId);
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
      downloadUrl: req.file ? req.file.path : null, // Cloudinary URL
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

    res.json({ ok: true, file: app.downloadUrl, name: app.name });
  } catch (err) {
    console.error("DOWNLOAD ERROR:", err);
    res.status(500).json({ error: 'Download failed: ' + err.message });
  }
});

app.delete('/api/apps/:id', auth(true), requireAdmin, async (req, res) => {
  try {
    const app = await App.findById(req.params.id);
    if (!app) return res.status(404).json({ error: 'App not found' });

    // Delete from Cloudinary if it has a public_id (stored in downloadUrl)
    if (app.downloadUrl && app.downloadUrl.includes('cloudinary')) {
      try {
        const publicId = app.downloadUrl.split('/').slice(-2).join('/').split('.')[0];
        await cloudinary.uploader.destroy(publicId);
      } catch (e) { console.error('Cloudinary delete error:', e); }
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