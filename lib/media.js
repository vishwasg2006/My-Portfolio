// File storage: Cloudinary when configured, otherwise local disk (DATA_DIR/uploads).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');

const useCloud = !!(process.env.CLOUDINARY_URL || process.env.CLOUDINARY_CLOUD_NAME);
let cloudinary = null;
if (useCloud) {
  cloudinary = require('cloudinary').v2;
  if (process.env.CLOUDINARY_URL) {
    cloudinary.config({ secure: true });
  } else {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
      secure: true,
    });
  }
}

const EXT = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'application/pdf': '.pdf',
};

// Trust the file's bytes, not the client-supplied mime type.
function sniff(b) {
  if (b.length < 12) return null;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b[0] === 0x89 && b.toString('ascii', 1, 4) === 'PNG') return 'image/png';
  if (b.toString('ascii', 0, 4) === 'GIF8') return 'image/gif';
  if (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  if (b.toString('ascii', 0, 4) === '%PDF') return 'application/pdf';
  return null;
}

async function saveFile(buffer) {
  const mime = sniff(buffer);
  if (!mime) {
    const err = new Error('Unsupported file. Use JPG, PNG, WebP, GIF or PDF.');
    err.status = 400;
    throw err;
  }
  const ext = EXT[mime];
  const name = crypto.randomBytes(12).toString('hex');

  if (useCloud) {
    const isPdf = mime === 'application/pdf';
    const opts = isPdf
      ? { folder: 'portfolio', resource_type: 'raw', public_id: name + ext }
      : { folder: 'portfolio', resource_type: 'image', public_id: name };
    const res = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(opts, (e, r) => (e ? reject(e) : resolve(r)));
      stream.end(buffer);
    });
    return { url: res.secure_url, mime };
  }

  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  fs.writeFileSync(path.join(UPLOAD_DIR, name + ext), buffer);
  return { url: '/uploads/' + name + ext, mime };
}

// Best-effort cleanup of local files (Cloudinary files are left alone).
function removeFile(url) {
  if (typeof url !== 'string' || !url.startsWith('/uploads/')) return;
  const file = path.join(UPLOAD_DIR, path.basename(url));
  fs.unlink(file, () => {});
}

module.exports = { saveFile, removeFile, UPLOAD_DIR, mode: useCloud ? 'cloudinary' : 'local' };
