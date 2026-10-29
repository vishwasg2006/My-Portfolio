# Portfolio + Admin Panel (Node.js + MySQL)

Public one-page portfolio (EMCEEON "Spark" ember theme) at `/`, private admin at `/admin`. Edit text, photos, projects, certificates, skills and résumé from your phone or laptop. No VS Code, no redeploy.

**Stack:** HTML/CSS/vanilla JS (frontend) · Node.js + Express (backend) · MySQL (`mysql2`) · Cloudinary (photos/PDF) · JWT admin login.

## 1. Run locally (2 minutes)

```powershell
cd portfolio-cms
npm install
copy .env.example .env
npm run dev
```

- Site: http://localhost:3000
- Admin: http://localhost:3000/admin (dev password `admin123`, or what you set in `.env`)

With no `MYSQL_URL` set, data is saved in a local `data/` folder (fine for a quick look).

### Local MySQL (XAMPP / MySQL Workbench)

Start MySQL, then in `.env` set:

```
MYSQL_URL=mysql://root:@localhost:3306/portfolio
```

(`root:` + empty password is the XAMPP default; use `root:yourpassword@` otherwise.) The `portfolio` database and tables are created automatically on first run. Reference schema is in `schema.sql`.

## 2. Make it live (free)

Render wipes local files on every deploy and doesn't host MySQL, so you need a cloud MySQL + Cloudinary.

**Cloud MySQL** (free tiers change, check current offers): [TiDB Cloud](https://tidbcloud.com) (serverless, MySQL-compatible) or [Aiven](https://aiven.io) (free MySQL plan). Create a database, then copy host, port, user, password. Build the URL:

```
mysql://USER:PASSWORD@HOST:PORT/DATABASE
```

If your password has special characters (`@ : / #`), URL-encode them. Cloud hosts need TLS, so also set `MYSQL_SSL=true`.

**Cloudinary** (photos/PDF): https://cloudinary.com → sign up → Dashboard → API Keys → copy the **API environment variable** (`cloudinary://KEY:SECRET@CLOUD`).

**Render** (hosts the site):
1. Push this folder to GitHub
   ```powershell
   git init
   git add .
   git commit -m "portfolio"
   git branch -M main
   git remote add origin https://github.com/<you>/<repo>.git
   git push -u origin main
   ```
2. https://render.com → New → Web Service → pick the repo
3. Build command `npm install`, Start command `npm start`
4. Environment variables:

| Name | Value |
|---|---|
| `NODE_ENV` | `production` |
| `ADMIN_PASSWORD` | a long password only you know |
| `JWT_SECRET` | any long random string |
| `MYSQL_URL` | `mysql://USER:PASSWORD@HOST:PORT/DATABASE` |
| `MYSQL_SSL` | `true` (for cloud MySQL) |
| `CLOUDINARY_URL` | from Cloudinary |

(`render.yaml` is included if you prefer Blueprint deploy.)

Done. Share `https://<your-app>.onrender.com`. Admin is `https://<your-app>.onrender.com/admin`.

## Using the admin on your phone

Open `/admin` → log in → use the bottom tabs (Profile, Projects, Certificates, Skills). Add or edit items, tap **Choose / take photo** to upload from camera or gallery (photos are shrunk automatically before upload). Use ↑ ↓ to reorder. Changes show on the public site instantly. Tip: browser menu → "Add to Home screen".

If the admin shows an orange warning about temporary storage, `MYSQL_URL` / `CLOUDINARY_URL` are missing on your host.

## Notes

- Render's free plan may put the site to sleep when idle, so the first visit can take up to a minute. A free uptime pinger (e.g. UptimeRobot) hitting `/healthz` every 10 min keeps it awake.
- Sections with no content (Skills, Projects, Certificates) are hidden on the public site automatically.
- Link previews (WhatsApp/LinkedIn) use your name, tagline and profile photo.
- Login is rate-limited; uploads accept only JPG/PNG/WebP/GIF/PDF (checked by file contents), max 15 MB.

## Structure

```
server.js          API + auth + static hosting
lib/store.js       MySQL (or local JSON) storage
lib/media.js       Cloudinary (or local uploads)
schema.sql         tables (auto-created, for reference)
public/            site (index.html, style.css, app.js)
public/admin/      admin panel
```
