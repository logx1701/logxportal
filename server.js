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

if (!MONGO_URI) { console.error("❌ MONGO_URI is missing!"); process.exit(1); }

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

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
  ratingCount: { type: Number, default: 0 },
  color: { type: String, default: '#4F46E5' },
  icon: { type: String, default: '?' },
  size: { type: String, default: '—' },
  downloads: { type: Number, default: 0 },
  downloadUrl: { type: String, default: null },
  uploadedBy: { type: String, default: 'system' },
  createdAt: { type: Date, default: Date.now }
});

const reviewSchema = new mongoose.Schema({
  appId: { type: mongoose.Schema.Types.ObjectId, ref: 'App', required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  userEmail: { type: String, required: true },
  rating: { type: Number, required: true, min: 1, max: 5 },
  comment: { type: String, default: '', maxlength: 500 },
  createdAt: { type: Date, default: Date.now }
});
reviewSchema.index({ appId: 1, userId: 1 }, { unique: true });

const User = mongoose.model('User', userSchema);
const App = mongoose.model('App', appSchema);
const Review = mongoose.model('Review', reviewSchema);

async function seedApps() {
  try {
    // These are REAL apps that link to their official download pages
    const realApps = [
      {
        name: 'YouTube',
        category: 'Entertainment',
        description: 'Watch videos, music, live streams, and more from creators around the world.',
        rating: 4.7,
        color: '#FF0000',
        icon: 'Y',
        size: 'Free',
        downloads: 5000000000,
        downloadUrl: 'https://play.google.com/store/apps/details?id=com.google.android.youtube'
      },
      {
        name: 'WhatsApp',
        category: 'Social',
        description: 'Simple, reliable, private messaging and calling for free, available all over the world.',
        rating: 4.6,
        color: '#25D366',
        icon: 'W',
        size: 'Free',
        downloads: 5000000000,
        downloadUrl: 'https://www.whatsapp.com/download'
      },
      {
        name: 'Google Chrome',
        category: 'Utilities',
        description: 'Fast, secure, and free web browser built for the modern web.',
        rating: 4.5,
        color: '#4285F4',
        icon: 'C',
        size: 'Free',
        downloads: 3000000000,
        downloadUrl: 'https://www.google.com/chrome/'
      },
      {
        name: 'Google Maps',
        category: 'Navigation',
        description: 'Navigate your world faster and easier with real-time GPS, traffic, and transit info.',
        rating: 4.8,
        color: '#34A853',
        icon: 'M',
        size: 'Free',
        downloads: 2000000000,
        downloadUrl: 'https://www.google.com/maps'
      },
      {
        name: 'Spotify',
        category: 'Music',
        description: 'Play millions of songs and podcasts for free. Discover new music every day.',
        rating: 4.7,
        color: '#1DB954',
        icon: 'S',
        size: 'Free',
        downloads: 1000000000,
        downloadUrl: 'https://www.spotify.com/download/'
      },
      {
        name: 'Instagram',
        category: 'Social',
        description: 'Share photos, videos, and stories with friends, and discover content you love.',
        rating: 4.5,
        color: '#E4405F',
        icon: 'I',
        size: 'Free',
        downloads: 2000000000,
        downloadUrl: 'https://www.instagram.com/'
      },
      {
        name: 'TikTok',
        category: 'Entertainment',
        description: 'Short-form videos, music, trends, and a world of creativity in your pocket.',
        rating: 4.4,
        color: '#000000',
        icon: 'T',
        size: 'Free',
        downloads: 3000000000,
        downloadUrl: 'https://www.tiktok.com/download'
      },
      {
        name: 'Netflix',
        category: 'Entertainment',
        description: 'Watch TV shows and movies anytime, anywhere. Plans from budget to premium.',
        rating: 4.3,
        color: '#E50914',
        icon: 'N',
        size: 'Free',
        downloads: 1000000000,
        downloadUrl: 'https://www.netflix.com/'
      },
      {
        name: 'Gmail',
        category: 'Productivity',
        description: 'Fast, secure email with smart features. The email service trusted by billions.',
        rating: 4.6,
        color: '#EA4335',
        icon: 'G',
        size: 'Free',
        downloads: 5000000000,
        downloadUrl: 'https://mail.google.com/'
      },
      {
        name: 'Telegram',
        category: 'Social',
        description: 'Fast, secure messaging with cloud sync, groups, and channels for everyone.',
        rating: 4.8,
        color: '#0088CC',
        icon: 'T',
        size: 'Free',
        downloads: 800000000,
        downloadUrl: 'https://telegram.org/'
      },
      {
        name: 'Discord',
        category: 'Social',
        description: 'Voice, video, and text chat for communities, gamers, and friends.',
        rating: 4.5,
        color: '#5865F2',
        icon: 'D',
        size: 'Free',
        downloads: 500000000,
        downloadUrl: 'https://discord.com/download'
      },
      {
        name: 'VLC Media Player',
        category: 'Media',
        description: 'Free and open-source media player that plays virtually any format.',
        rating: 4.9,
        color: '#FF8800',
        icon: 'V',
        size: '40 MB',
        downloads: 300000000,
        downloadUrl: 'https://www.videolan.org/vlc/'
      }
    ];

    // Add each app only if it doesn't already exist (by name)
    let addedCount = 0;
    for (const appData of realApps) {
      const exists = await App.findOne({ name: appData.name });
      if (!exists) {
        await App.create(appData);
        addedCount++;
      }
    }

    if (addedCount > 0) {
      console.log(`✅ Added ${addedCount} real apps to database`);
    } else {
      console.log('✅ All real apps already in database');
    }
  } catch (err) {
    console.error('Seed error:', err.message);
  }
}
setTimeout(seedApps, 3000);

/* ---------- Middleware ---------- */
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

/* ---------- Cloudinary + Multer ---------- */
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: { folder: 'logx_uploads', resource_type: 'auto' }
});
const upload = multer({ storage });

/* ---------- Auth ---------- */
function auth(required = true) {
  return (req, res, next) => {
    const h = req.headers.authorization || '';
    const token = h.startsWith('Bearer ') ? h.slice(7) : null;
    if (!token) {
      if (required) return res.status(401).json({ error: 'Authentication required' });
      return next();
    }
    try { req.user = jwt.verify(token, JWT_SECRET); next(); }
    catch {
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

    const existingUser = await User.findOne({ email: email.toLowerCase().trim() });
    if (existingUser) return res.status(409).json({ error: 'That email is already registered' });

    const hash = await bcrypt.hash(password, 12);
    const isFirst = (await User.countDocuments()) === 0;
    const user = await User.create({ email: email.toLowerCase().trim(), hash, role: isFirst ? 'admin' : 'user' });

    const token = jwt.sign({ id: user._id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: TOKEN_TTL });
    res.json({ token, user: { id: user._id, email: user.email, role: user.role } });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) return res.status(401).json({ error: 'Invalid email or password' });
    const ok = await bcrypt.compare(password, user.hash);
    if (!ok) return res.status(401).json({ error: 'Invalid email or password' });
    const token = jwt.sign({ id: user._id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: TOKEN_TTL });
    res.json({ token, user: { id: user._id, email: user.email, role: user.role } });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
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
    if (q) filter.$or = [
      { name: { $regex: q, $options: 'i' } },
      { description: { $regex: q, $options: 'i' } },
      { category: { $regex: q, $options: 'i' } }
    ];
    if (cat && cat !== 'All') filter.category = cat;
    const apps = await App.find(filter).sort({ downloads: -1 });
    const appsWithId = apps.map(a => { const o = a.toObject(); o.id = o._id.toString(); return o; });
    res.json(appsWithId);
  } catch (err) { res.status(500).json({ error: 'Failed to fetch apps' }); }
});

app.get('/api/categories', async (req, res) => {
  const cats = await App.distinct('category');
  res.json(['All', ...cats.sort()]);
});

app.get('/api/apps/:id', async (req, res) => {
  const a = await App.findById(req.params.id);
  if (!a) return res.status(404).json({ error: 'App not found' });
  res.json(a);
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
      downloadUrl: req.file ? req.file.path : null,
      uploadedBy: req.user.email,
    });
    res.status(201).json(newApp);
  } catch (err) { console.error("UPLOAD ERROR:", err); res.status(500).json({ error: 'Upload failed: ' + err.message }); }
});

app.post('/api/apps/:id/download', async (req, res) => {
  try {
    const a = await App.findById(req.params.id);
    if (!a) return res.status(404).json({ error: 'App not found' });
    a.downloads = (a.downloads || 0) + 1;
    await a.save();
    res.json({ ok: true, file: a.downloadUrl, name: a.name });
  } catch (err) { console.error("DOWNLOAD ERROR:", err); res.status(500).json({ error: 'Download failed: ' + err.message }); }
});

app.delete('/api/apps/:id', auth(true), requireAdmin, async (req, res) => {
  try {
    const a = await App.findById(req.params.id);
    if (!a) return res.status(404).json({ error: 'App not found' });
    if (a.downloadUrl && a.downloadUrl.includes('cloudinary')) {
      try {
        const parts = a.downloadUrl.split('/');
        const filename = parts[parts.length - 1];
        const publicId = 'logx_uploads/' + filename.split('.')[0];
        await cloudinary.uploader.destroy(publicId);
      } catch (e) { console.error('Cloudinary delete error:', e); }
    }
    // Also delete all reviews of this app
    await Review.deleteMany({ appId: a._id });
    await App.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: 'Delete failed' }); }
});

/* ============================================================
   REVIEW ROUTES
   ============================================================ */
app.get('/api/apps/:id/reviews', async (req, res) => {
  try {
    const reviews = await Review.find({ appId: req.params.id }).sort({ createdAt: -1 });
    const avg = reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0;
    res.json({ reviews, average: Math.round(avg * 10) / 10, count: reviews.length });
  } catch (err) { res.status(500).json({ error: 'Failed to load reviews' }); }
});

app.post('/api/apps/:id/reviews', auth(true), async (req, res) => {
  try {
    const { rating, comment } = req.body || {};
    const r = Number(rating);
    if (!r || r < 1 || r > 5) return res.status(400).json({ error: 'Rating must be between 1 and 5' });

    const appDoc = await App.findById(req.params.id);
    if (!appDoc) return res.status(404).json({ error: 'App not found' });

    let review = await Review.findOne({ appId: appDoc._id, userId: req.user.id });
    if (review) {
      review.rating = r;
      review.comment = String(comment || '').slice(0, 500);
      review.createdAt = Date.now();
      await review.save();
    } else {
      review = await Review.create({
        appId: appDoc._id,
        userId: req.user.id,
        userEmail: req.user.email,
        rating: r,
        comment: String(comment || '').slice(0, 500)
      });
    }

    // Recalculate app average
    const all = await Review.find({ appId: appDoc._id });
    const avg = all.reduce((s, x) => s + x.rating, 0) / all.length;
    appDoc.rating = Math.round(avg * 10) / 10;
    appDoc.ratingCount = all.length;
    await appDoc.save();

    res.json({ ok: true, review });
  } catch (err) { console.error('REVIEW ERROR:', err); res.status(500).json({ error: 'Failed to submit review' }); }
});

app.delete('/api/apps/:id/reviews/:reviewId', auth(true), async (req, res) => {
  try {
    const review = await Review.findById(req.params.reviewId);
    if (!review) return res.status(404).json({ error: 'Review not found' });
    if (review.userId.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Not allowed' });
    }
    await Review.findByIdAndDelete(req.params.reviewId);

    const appDoc = await App.findById(req.params.id);
    if (appDoc) {
      const all = await Review.find({ appId: appDoc._id });
      const avg = all.length ? all.reduce((s, r) => s + r.rating, 0) / all.length : 0;
      appDoc.rating = Math.round(avg * 10) / 10;
      appDoc.ratingCount = all.length;
      await appDoc.save();
    }
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: 'Failed to delete review' }); }
});

app.use((req, res) => res.status(404).json({ error: 'Not found' }));

app.listen(PORT, () => {
  console.log('\n  ╔══════════════════════════════════════╗');
  console.log('  ║   LOGX is running                    ║');
  console.log('  ║   → http://localhost:' + PORT + '            ║');
  console.log('  ╚══════════════════════════════════════╝\n');
});