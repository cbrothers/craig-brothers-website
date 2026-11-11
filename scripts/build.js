import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const DIST = path.join(ROOT, 'dist');

const FILES_TO_COPY = [
  'index.html',
  'styles.css',
  '404.html',
  'favicon.svg',
  'favicon.png',
  'apple-touch-icon.png',
  'robots.txt',
  'sitemap.xml',
  'pgp-key.txt',
  '_headers',
  '_redirects',
];

const DIRS_TO_COPY = ['images', 'media'];
const RETIRED_IMAGES = [
  'gp-karry-dressage-autumn-2026.jpg',
  'logo-streetmail.png',
  'logo-autorevenue.jpg',
  'freya-26.jpg',
];
for (const retired of RETIRED_IMAGES) {
  const retiredPath = path.join(ROOT, 'images', retired);
  if (fs.existsSync(retiredPath)) {
    fs.rmSync(retiredPath, { force: true });
  }
}

const GUS_UPLOAD = 'C:/Users/craig.brothers/.gemini/antigravity/brain/79f408fa-4f5a-4fd2-bbec-36864640ce16/.user_uploaded/media_1794141853367_d3b6d41f.jpg';
const GUS_DEST = path.join(ROOT, 'images', 'gus-googly-eye.jpg');
if (fs.existsSync(GUS_UPLOAD) && !fs.existsSync(GUS_DEST)) {
  fs.copyFileSync(GUS_UPLOAD, GUS_DEST);
}

fs.mkdirSync(DIST, { recursive: true });

for (const retired of RETIRED_IMAGES) {
  const retiredDistPath = path.join(DIST, 'images', retired);
  if (fs.existsSync(retiredDistPath)) {
    fs.rmSync(retiredDistPath, { force: true });
  }
}

for (const file of FILES_TO_COPY) {
  const src = path.join(ROOT, file);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, path.join(DIST, file));
  }
}

for (const dir of DIRS_TO_COPY) {
  const srcDir = path.join(ROOT, dir);
  if (fs.existsSync(srcDir)) {
    fs.cpSync(srcDir, path.join(DIST, dir), { recursive: true, force: true });
  }
}

const mwPath = path.join(ROOT, 'functions', '_middleware.js');
if (fs.existsSync(mwPath)) {
  fs.writeFileSync(mwPath, fs.readFileSync(mwPath, 'utf8'));
}

console.log('Built static assets into ./dist');
