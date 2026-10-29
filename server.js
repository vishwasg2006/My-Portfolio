require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const { createStore, COLLECTIONS } = require('./lib/store');
const media = require('./lib/media');

const PORT = process.env.PORT || 3000;
const PROD = process.env.NODE_ENV === 'production';
let ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
if (!ADMIN_PASSWORD) {
  if (PROD) {
    console.error('ADMIN_PASSWORD is required in production. Set it in your host dashboard.');
    process.exit(1);
  }
  ADMIN_PASSWORD = 'admin123';
  console.warn('\n  ⚠  No ADMIN_PASSWORD set. Using dev password "admin123".\n');
}
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest();

// ---------- sanitizers (whitelist fields, force types, block javascript: URLs) ----------
const str = (v, max = 500) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const url = (v) => {
  v = str(v, 1000);
  if (!v) return '';
  if (!/^(https?:\/\/|\/uploads\/)/i.test(v) && !/^[a-z][a-z0-9+.-]*:/i.test(v)) v = 'https://' + v;
  return /^(https?:\/\/|\/uploads\/)/i.test(v) ? v : '';
};
const arr = (v, fn, max = 30) => (Array.isArray(v) ? v.map(fn).filter(Boolean).slice(0, max) : []);

const CLEAN = {
  profile: (b) => ({
    name: str(b.name, 80),
    role: str(b.role, 120),
    roles: arr(b.roles, (x) => str(x, 60), 8),
    tagline: str(b.tagline, 300),
    about: str(b.about, 4000),
    photo: url(b.photo),
    resume: url(b.resume),
    email: str(b.email, 120),
    location: str(b.location, 120),
    github: url(b.github),
    linkedin: url(b.linkedin),
    instagram: url(b.instagram),
  }),
  projects: (b) => ({
    title: str(b.title, 120),
    description: str(b.description, 3000),
    tech: arr(b.tech, (x) => str(x, 40), 20),
    image: url(b.image),
    gallery: arr(b.gallery, url, 12),
    github: url(b.github),
    demo: url(b.demo),
    featured: !!b.featured,
  }),
  certificates: (b) => ({
    title: str(b.title, 160),
    issuer: str(b.issuer, 120),
    date: str(b.date, 40),
    image: url(b.image),
    link: url(b.link),
  }),
  skills: (b) => ({
    name: str(b.name, 60),
    category: str(b.category, 60) || 'General',
    level: Math.max(0, Math.min(100, Math.round(Number(b.level)) || 0)),
  }),
};
const REQUIRED = { projects: 'title', certificates: 'title', skills: 'name' };

const mediaUrls = (o) => [o.image, o.photo, o.resume, ...(o.gallery || [])].filter(Boolean);
const dropUnused = (oldObj, newObj) => {
  const keep = new Set(mediaUrls(newObj || {}));
  mediaUrls(oldObj || {}).forEach((u) => !keep.has(u) && media.removeFile(u));
};

// ---------- tiny helpers ----------
const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const attempts = new Map(); // ip -> {n, reset}
function tooManyAttempts(ip) {
  const now = Date.now();
  const a = attempts.get(ip);
  if (!a || a.reset < now) return false;
  return a.n >= 8;
}
function noteFailure(ip) {
  const now = Date.now();
  const a = attempts.get(ip);
  if (!a || a.reset < now) attempts.set(ip, { n: 1, reset: now + 15 * 60 * 1000 });
  else a.n++;
}

async function main() {
  const store = await createStore();
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));
  app.use((req, res, next) => {
    res.set({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin' });
    next();
  });

  const auth = (req, res, next) => {
    const t = (req.get('authorization') || '').replace(/^Bearer /, '');
    try {
      jwt.verify(t, JWT_SECRET);
      next();
    } catch {
      res.status(401).json({ error: 'Please log in again.' });
    }
  };

  // ---------- public ----------
  app.get('/healthz', (req, res) => res.send('ok'));

  app.get(
    '/api/portfolio',
    ah(async (req, res) => {
      const [profile, projects, certificates, skills] = await Promise.all([
        store.getProfile(),
        store.list('projects'),
        store.list('certificates'),
        store.list('skills'),
      ]);
      res.set('Cache-Control', 'no-cache');
      res.json({ profile, projects, certificates, skills });
    })
  );

  // Home page with per-profile title/description/image so link previews (WhatsApp, LinkedIn) look right.
  const indexHtml = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
  app.get(
    '/',
    ah(async (req, res) => {
      const p = await store.getProfile();
      const origin = `${req.protocol}://${req.get('host')}`;
      const abs = (u) => (u ? (u.startsWith('/') ? origin + u : u) : '');
      const html = indexHtml
        .replace(/{{TITLE}}/g, esc(`${p.name} — ${p.role}`))
        .replace(/{{DESC}}/g, esc(p.tagline || p.about.slice(0, 160)))
        .replace(/{{OG_IMAGE}}/g, esc(abs(p.photo)));
      res.set('Cache-Control', 'no-cache').type('html').send(html);
    })
  );

  // ---------- auth ----------
  app.post('/api/login', (req, res) => {
    const ip = req.ip;
    if (tooManyAttempts(ip)) return res.status(429).json({ error: 'Too many attempts. Try again in 15 minutes.' });
    const ok = crypto.timingSafeEqual(sha(req.body?.password ?? ''), sha(ADMIN_PASSWORD));
    if (!ok) {
      noteFailure(ip);
      return res.status(401).json({ error: 'Wrong password.' });
    }
    attempts.delete(ip);
    res.json({ token: jwt.sign({ admin: true }, JWT_SECRET, { expiresIn: '30d' }) });
  });

  app.get('/api/status', auth, (req, res) => res.json({ db: store.kind, media: media.mode, production: PROD }));

  // ---------- uploads ----------
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024, files: 1 } });
  app.post(
    '/api/upload',
    auth,
    upload.single('file'),
    ah(async (req, res) => {
      if (!req.file) return res.status(400).json({ error: 'No file received.' });
      const r = await media.saveFile(req.file.buffer);
      res.json({ url: r.url });
    })
  );

  // ---------- profile ----------
  app.put(
    '/api/profile',
    auth,
    ah(async (req, res) => {
      const clean = CLEAN.profile(req.body || {});
      if (!clean.name) return res.status(400).json({ error: 'Name is required.' });
      const old = await store.getProfile();
      const saved = await store.setProfile(clean);
      dropUnused(old, saved);
      res.json(saved);
    })
  );

  // ---------- collections ----------
  app.param('col', (req, res, next, col) =>
    COLLECTIONS.includes(col) ? next() : res.status(404).json({ error: 'Not found' })
  );

  app.put(
    '/api/:col/reorder',
    auth,
    ah(async (req, res) => {
      const ids = arr(req.body?.ids, (x) => str(x, 80), 500);
      await store.reorder(req.params.col, ids);
      res.json({ ok: true });
    })
  );

  app.post(
    '/api/:col',
    auth,
    ah(async (req, res) => {
      const { col } = req.params;
      const clean = CLEAN[col](req.body || {});
      if (!clean[REQUIRED[col]]) return res.status(400).json({ error: `${REQUIRED[col]} is required.` });
      res.status(201).json(await store.create(col, clean));
    })
  );

  app.put(
    '/api/:col/:id',
    auth,
    ah(async (req, res) => {
      const { col, id } = req.params;
      const clean = CLEAN[col](req.body || {});
      if (!clean[REQUIRED[col]]) return res.status(400).json({ error: `${REQUIRED[col]} is required.` });
      const old = await store.get(col, id);
      const saved = await store.update(col, id, clean);
      if (!saved) return res.status(404).json({ error: 'Not found' });
      dropUnused(old, saved);
      res.json(saved);
    })
  );

  app.delete(
    '/api/:col/:id',
    auth,
    ah(async (req, res) => {
      const removed = await store.remove(req.params.col, req.params.id);
      if (!removed) return res.status(404).json({ error: 'Not found' });
      dropUnused(removed, null);
      res.json({ ok: true });
    })
  );

  // ---------- static ----------
  app.use('/uploads', express.static(media.UPLOAD_DIR, { maxAge: '30d', immutable: true }));
  app.get(['/admin', '/admin/'], (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin', 'index.html')));
  app.use(express.static(path.join(__dirname, 'public'), { index: false }));

  // ---------- errors ----------
  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));
  app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
      const msg = err.code === 'LIMIT_FILE_SIZE' ? 'File too large (max 15 MB).' : err.message;
      return res.status(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ error: msg });
    }
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Bad JSON.' });
    if (err.status && err.status < 500) return res.status(err.status).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: 'Server error.' });
  });

  app.listen(PORT, () =>
    console.log(`Portfolio running → http://localhost:${PORT}  (admin: /admin)  db=${store.kind} media=${media.mode}`)
  );
}

main().catch((e) => {
  console.error('Failed to start:', e);
  process.exit(1);
});
