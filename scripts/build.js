import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const DIST = path.join(ROOT, 'dist');

const FILES_TO_COPY = [
  'index.html',
  '404.html',
  'favicon.svg',
  'favicon.png',
  'apple-touch-icon.png',
  'robots.txt',
  'sitemap.xml',
  '_headers',
  '_redirects',
];

const DIRS_TO_COPY = ['images'];

if (fs.existsSync(DIST)) {
  fs.rmSync(DIST, { recursive: true, force: true });
}
fs.mkdirSync(DIST, { recursive: true });

for (const file of FILES_TO_COPY) {
  const src = path.join(ROOT, file);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, path.join(DIST, file));
  }
}

for (const dir of DIRS_TO_COPY) {
  const srcDir = path.join(ROOT, dir);
  if (fs.existsSync(srcDir)) {
    fs.cpSync(srcDir, path.join(DIST, dir), { recursive: true });
  }
}

console.log('Built static assets into ./dist');
