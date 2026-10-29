// Storage layer: MySQL when MYSQL_URL is set, otherwise a local JSON file (dev only).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const COLLECTIONS = ['projects', 'certificates', 'skills'];

const DEFAULT_PROFILE = {
  name: 'Vishwas',
  role: 'Full-Stack Developer',
  roles: ['Full-Stack Developer', 'Web Developer', 'Problem Solver'],
  tagline: 'I build fast, clean web apps from idea to deployment.',
  about:
    'ISE student at East Point College of Engineering, Bengaluru. I enjoy building full-stack products end to end. Edit this text anytime from /admin.',
  photo: '',
  resume: '',
  email: '',
  location: 'Bengaluru, India',
  github: '',
  linkedin: '',
  instagram: '',
};

const byOrder = (a, b) =>
  (a.order ?? 1e9) - (b.order ?? 1e9) || (b.createdAt || 0) - (a.createdAt || 0);

// Projects/certificates: new items go to the top. Skills: new items go to the end.
const nextOrder = (col, items) => {
  const orders = items.map((x) => x.order ?? 0);
  return col === 'skills' ? Math.max(-1, ...orders) + 1 : Math.min(0, ...orders) - 1;
};

/* ------------------------------------------------------------------ JSON file */
function jsonStore(dir) {
  const file = path.join(dir, 'db.json');
  let db;
  const save = () => {
    fs.mkdirSync(dir, { recursive: true });
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
    fs.renameSync(tmp, file);
  };
  try {
    db = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    db = { profile: { ...DEFAULT_PROFILE }, projects: [], certificates: [], skills: [] };
    save();
  }
  for (const c of COLLECTIONS) db[c] = db[c] || [];

  return {
    kind: 'json',
    async getProfile() {
      return { ...DEFAULT_PROFILE, ...db.profile };
    },
    async setProfile(p) {
      db.profile = p;
      save();
      return this.getProfile();
    },
    async list(col) {
      return [...db[col]].sort(byOrder);
    },
    async get(col, id) {
      return db[col].find((x) => x.id === id) || null;
    },
    async create(col, doc) {
      const item = { ...doc, id: crypto.randomUUID(), createdAt: Date.now(), order: nextOrder(col, db[col]) };
      db[col].push(item);
      save();
      return item;
    },
    async update(col, id, patch) {
      const i = db[col].findIndex((x) => x.id === id);
      if (i < 0) return null;
      db[col][i] = { ...db[col][i], ...patch, id, createdAt: db[col][i].createdAt, order: db[col][i].order };
      save();
      return db[col][i];
    },
    async remove(col, id) {
      const item = db[col].find((x) => x.id === id);
      if (!item) return null;
      db[col] = db[col].filter((x) => x.id !== id);
      save();
      return item;
    },
    async reorder(col, ids) {
      ids.forEach((id, idx) => {
        const it = db[col].find((x) => x.id === id);
        if (it) it.order = idx;
      });
      save();
    },
  };
}

/* ------------------------------------------------------------------ MySQL */
// Works with MySQL 5.7+/8, MariaDB, TiDB, Aiven, PlanetScale-style hosts.
// Content is stored as JSON text so you never need to migrate columns when you add a field.
function mysqlConfig(urlStr) {
  const u = new URL(urlStr);
  const cfg = {
    host: u.hostname,
    port: Number(u.port) || 3306,
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: decodeURIComponent(u.pathname.replace(/^\//, '')) || 'portfolio',
    charset: 'utf8mb4',
  };
  const ssl = process.env.MYSQL_SSL || u.searchParams.get('ssl');
  if (ssl && !/^(false|0|off)$/i.test(ssl)) cfg.ssl = { minVersion: 'TLSv1.2', rejectUnauthorized: true };
  return cfg;
}

async function mysqlStore(urlStr) {
  const mysql = require('mysql2/promise');
  const cfg = mysqlConfig(urlStr);

  // Convenience for local MySQL/XAMPP: create the database if it doesn't exist yet.
  try {
    const { database, ...noDb } = cfg;
    const c = await mysql.createConnection(noDb);
    await c.query(`CREATE DATABASE IF NOT EXISTS \`${database.replace(/`/g, '')}\` CHARACTER SET utf8mb4`);
    await c.end();
  } catch {
    /* hosted DBs usually forbid this and already have the database, that's fine */
  }

  const pool = mysql.createPool({ ...cfg, waitForConnections: true, connectionLimit: 5, enableKeepAlive: true });
  await pool.query(
    'CREATE TABLE IF NOT EXISTS profile (id TINYINT PRIMARY KEY, data LONGTEXT NOT NULL) CHARACTER SET utf8mb4'
  );
  await pool.query(
    `CREATE TABLE IF NOT EXISTS items (
       id VARCHAR(36) PRIMARY KEY,
       col VARCHAR(20) NOT NULL,
       ord INT NOT NULL DEFAULT 0,
       created_at BIGINT NOT NULL,
       data LONGTEXT NOT NULL,
       INDEX idx_col_ord (col, ord)
     ) CHARACTER SET utf8mb4`
  );

  const hydrate = (r) => ({ ...JSON.parse(r.data), id: r.id, createdAt: Number(r.created_at), order: r.ord });
  const rows = async (col) => (await pool.query('SELECT * FROM items WHERE col = ?', [col]))[0];

  return {
    kind: 'mysql',
    async getProfile() {
      const [r] = (await pool.query('SELECT data FROM profile WHERE id = 1'))[0];
      if (!r) {
        await pool.query('INSERT IGNORE INTO profile (id, data) VALUES (1, ?)', [JSON.stringify(DEFAULT_PROFILE)]);
        return { ...DEFAULT_PROFILE };
      }
      return { ...DEFAULT_PROFILE, ...JSON.parse(r.data) };
    },
    async setProfile(p) {
      await pool.query('REPLACE INTO profile (id, data) VALUES (1, ?)', [JSON.stringify(p)]);
      return this.getProfile();
    },
    async list(col) {
      return (await rows(col)).map(hydrate).sort(byOrder);
    },
    async get(col, id) {
      const [r] = (await pool.query('SELECT * FROM items WHERE col = ? AND id = ?', [col, id]))[0];
      return r ? hydrate(r) : null;
    },
    async create(col, doc) {
      const existing = (await rows(col)).map(hydrate);
      const item = { ...doc, id: crypto.randomUUID(), createdAt: Date.now(), order: nextOrder(col, existing) };
      const { id, createdAt, order, ...data } = item;
      await pool.query('INSERT INTO items (id, col, ord, created_at, data) VALUES (?, ?, ?, ?, ?)', [
        id, col, order, createdAt, JSON.stringify(data),
      ]);
      return item;
    },
    async update(col, id, patch) {
      const old = await this.get(col, id);
      if (!old) return null;
      const { id: _i, createdAt: _c, order: _o, ...data } = { ...old, ...patch };
      await pool.query('UPDATE items SET data = ? WHERE col = ? AND id = ?', [JSON.stringify(data), col, id]);
      return { ...data, id, createdAt: old.createdAt, order: old.order };
    },
    async remove(col, id) {
      const old = await this.get(col, id);
      if (!old) return null;
      await pool.query('DELETE FROM items WHERE col = ? AND id = ?', [col, id]);
      return old;
    },
    async reorder(col, ids) {
      for (let i = 0; i < ids.length; i++) {
        await pool.query('UPDATE items SET ord = ? WHERE col = ? AND id = ?', [i, col, ids[i]]);
      }
    },
  };
}

async function createStore() {
  if (process.env.MYSQL_URL) return mysqlStore(process.env.MYSQL_URL);
  const dir = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
  return jsonStore(dir);
}

module.exports = { createStore, COLLECTIONS, DEFAULT_PROFILE };
