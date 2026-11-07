import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const indexHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const notFoundHtml = fs.readFileSync(path.join(ROOT, '404.html'), 'utf8');
const headersFile = fs.readFileSync(path.join(ROOT, '_headers'), 'utf8');
const redirectsFile = fs.readFileSync(path.join(ROOT, '_redirects'), 'utf8');
const robotsTxt = fs.readFileSync(path.join(ROOT, 'robots.txt'), 'utf8');
const sitemapXml = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');
const wranglerJsonc = fs.readFileSync(path.join(ROOT, 'wrangler.jsonc'), 'utf8');
const middlewareJs = fs.readFileSync(path.join(ROOT, 'functions', '_middleware.js'), 'utf8');

describe('1. Required Project Files & Build Artifacts', () => {
  const requiredFiles = [
    'index.html',
    'styles.css',
    '404.html',
    'favicon.svg',
    'favicon.png',
    'apple-touch-icon.png',
    'robots.txt',
    'sitemap.xml',
    '_headers',
    '_redirects',
    'wrangler.jsonc',
    'package.json',
    'functions/_middleware.js',
    'scripts/build.js',
    'scripts/verify-deploy.js',
  ];

  for (const relPath of requiredFiles) {
    it(`has required file ${relPath}`, () => {
      const full = path.join(ROOT, relPath);
      assert.equal(fs.existsSync(full), true, `Missing ${relPath}`);
      assert.ok(fs.statSync(full).size > 0, `${relPath} is empty`);
    });
  }
});

describe('2. Content Integrity & Zero-Emdash Enforcement', () => {
  const textFiles = [
    'index.html',
    'styles.css',
    '404.html',
    '_headers',
    '_redirects',
    'robots.txt',
    'sitemap.xml',
    'wrangler.jsonc',
    'functions/_middleware.js',
    'scripts/build.js',
    'scripts/verify-deploy.js',
  ];

  for (const relPath of textFiles) {
    it(`contains zero emdashes in ${relPath}`, () => {
      const content = fs.readFileSync(path.join(ROOT, relPath), 'utf8');
      assert.equal(content.includes('\u2014'), false, `Found emdash character in ${relPath}`);
      assert.equal(content.includes('&mdash;'), false, `Found &mdash; entity in ${relPath}`);
      assert.equal(content.includes('&#8212;'), false, `Found &#8212; entity in ${relPath}`);
    });
  }

  it('includes all key personal, engineering, music, family, and community sections', () => {
    const requiredSnippets = [
      'Stephentown, NY',
      'Emerald Glen Equestrian Center',
      'Health &amp; Resilience',
      'May the 4th, 2011',
      'Dr. Sieburth',
      'Homelab &amp; Farm Telemetry',
      'Custom AI Agent &amp; MCP Ecosystem',
      'EVE Online SkillFarmManager (SFM)',
      'Artificial Integrity',
      'https://www.artificialintegritymusic.com',
      'The Silent Whistle',
      'https://www.thesilentwhistleband.com',
      'Brothers Blues / AI Unplugged',
      'https://www.brothersblues.com',
      'Karry\'s Tree of Life Horse Shoes',
      'https://www.facebook.com/karryshorseshoetrees',
      'Homeward Bound Dog Rescue',
      'https://app.embarkvet.com/pet/3d5d0bc4-583e-45fd-9288-20bb1fff1a48/about',
      '45.0%',
      '24.6%',
      '21.7%',
      '8.7%',
      'Chloe 2.0*',
      'Butterball Kennel',
      'Caesar Augustus',
      'The Babysitter',
      'Gardner\'s Coffee Shoppe',
      'Cinch \'em Up Stables',
    ];

    for (const snippet of requiredSnippets) {
      assert.ok(indexHtml.includes(snippet), `index.html missing expected content: ${snippet}`);
    }
  });

  it('omits excluded projects per Craig selection', () => {
    assert.equal(indexHtml.includes('Dealer Specialties'), false, 'Should not include Dealer Specialties');
    assert.equal(indexHtml.includes('Tyrian Lens'), false, 'Should not include Tyrian Lens');
    assert.equal(indexHtml.includes('Copperhead Blues'), false, 'Should not include Copperhead Blues');
  });
});

describe('3. Image Inventory & Priority Rules (92 Scraped Photos)', () => {
  const imageFiles = fs.readdirSync(path.join(ROOT, 'images')).sort();

  it('has all 92 scraped images in images/', () => {
    assert.equal(imageFiles.length, 92, `Expected 92 images in images/, found ${imageFiles.length}`);
  });

  it('references every image in images/ within index.html or 404.html and every referenced image exists', () => {
    const combinedHtml = indexHtml + '\n' + notFoundHtml;
    for (const file of imageFiles) {
      assert.ok(
        combinedHtml.includes(`/images/${file}`),
        `Image /images/${file} is not referenced in index.html or 404.html`
      );
    }

    const refMatches = [...combinedHtml.matchAll(/src="\/images\/([^"]+)"/g)].map((m) => m[1]);
    assert.ok(refMatches.length >= 92, 'Expected at least 92 image src references');
    for (const ref of refMatches) {
      assert.ok(
        fs.existsSync(path.join(ROOT, 'images', ref)),
        `Referenced image /images/${ref} does not exist on disk`
      );
    }
  });

  it('enforces width, height, alt, and fetchpriority/lazy loading rules on all <img> tags', () => {
    const imgTags = [...indexHtml.matchAll(/<img\b[^>]*>/g)].map((m) => m[0]);
    assert.ok(imgTags.length >= 92, 'Expected at least 92 <img> tags in index.html');

    let highPriorityCount = 0;
    for (const tag of imgTags) {
      assert.match(tag, /\bwidth="\d+"/, `Missing width attribute on ${tag}`);
      assert.match(tag, /\bheight="\d+"/, `Missing height attribute on ${tag}`);
      assert.match(tag, /\balt="[^"]*"/, `Missing alt attribute on ${tag}`);

      const isHigh = tag.includes('fetchpriority="high"');
      const isLow = tag.includes('fetchpriority="low"');
      const isLazy = tag.includes('loading="lazy"');

      if (isHigh) {
        highPriorityCount++;
        assert.equal(isLazy, false, `LCP image must not combine fetchpriority="high" with loading="lazy": ${tag}`);
      }

      // Standard below-the-fold lazy images should not have fetchpriority="low" except the hero secondary badge
      if (isLow && !tag.includes('banner-home.jpg')) {
        assert.fail(`Unexpected fetchpriority="low" on standard below-the-fold image: ${tag}`);
      }
    }

    assert.equal(highPriorityCount, 1, `Expected exactly 1 fetchpriority="high" LCP image in index.html, found ${highPriorityCount}`);
  });
});

describe('4. HTML Semantics, Accessibility & Native Lightbox Dialog', () => {
  it('uses a single <h1> in index.html and 404.html', () => {
    const indexH1s = [...indexHtml.matchAll(/<h1\b/g)];
    const notFoundH1s = [...notFoundHtml.matchAll(/<h1\b/g)];
    assert.equal(indexH1s.length, 1, 'index.html must have exactly one <h1>');
    assert.equal(notFoundH1s.length, 1, '404.html must have exactly one <h1>');
  });

  it('has no inline onclick handlers', () => {
    assert.equal(/\bonclick=/i.test(indexHtml), false, 'index.html must not use inline onclick handlers');
    assert.equal(/\bonclick=/i.test(notFoundHtml), false, '404.html must not use inline onclick handlers');
  });

  it('implements native <dialog closedby="any"> with mandatory closedBy feature detection fallback', () => {
    assert.match(indexHtml, /<dialog\s+id="lightboxDialog"\s+closedby="any"\s+aria-labelledby="lightboxTitle">/);
    assert.ok(indexHtml.includes(".showModal()"), 'Must open lightbox via .showModal()');
    assert.ok(indexHtml.includes("!('closedBy' in HTMLDialogElement.prototype)"), 'Must include mandatory closedBy fallback check');
  });

  it('securely opens all external target="_blank" links with rel="noopener noreferrer"', () => {
    const blankLinks = [...indexHtml.matchAll(/<a\b[^>]*target="_blank"[^>]*>/g)].map((m) => m[0]);
    assert.ok(blankLinks.length > 0, 'Expected external links with target="_blank"');
    for (const link of blankLinks) {
      assert.match(link, /rel="noopener noreferrer"/, `External link missing rel="noopener noreferrer": ${link}`);
    }
  });
});

describe('5. Cloudflare Worker Edge Middleware, Redirects & GA4 Tag', () => {
  it('configures GA4 Measurement ID G-W8W15JLP5W directly in head without consent banner', () => {
    assert.ok(indexHtml.includes('https://www.googletagmanager.com/gtag/js?id=G-W8W15JLP5W'), 'Missing gtag.js script for G-W8W15JLP5W');
    assert.ok(indexHtml.includes("gtag('config', 'G-W8W15JLP5W')"), 'Missing gtag config call for G-W8W15JLP5W');
    assert.equal(indexHtml.includes('cookieBanner'), false, 'Should not include cookie consent banner');
  });

  it('configures legacy Google Sites redirects in both _redirects and functions/_middleware.js', () => {
    for (const route of ['/home', '/me', '/karry', '/freya', '/kora', '/gus']) {
      assert.ok(redirectsFile.includes(route), `_redirects missing ${route}`);
      assert.ok(middlewareJs.includes(`'${route}'`), `functions/_middleware.js missing ${route}`);
    }
  });

  it('configures Cloudflare Worker routes (stage.craigbrothers.com only pre-launch), KV binding, and security headers', () => {
    assert.ok(wranglerJsonc.includes('stage.craigbrothers.com'));
    assert.equal(wranglerJsonc.includes('"www.craigbrothers.com"'), false, 'Production www route should not be in wrangler.jsonc before prod launch');
    assert.equal(wranglerJsonc.includes('"craigbrothers.com"'), false, 'Production apex route should not be in wrangler.jsonc before prod launch');
    assert.ok(wranglerJsonc.includes('8042e1b5ee4b42279489114046987cf6'));
    assert.ok(middlewareJs.includes('/__health'));
    assert.ok(middlewareJs.includes('__cb_studio_override'));
    assert.ok(headersFile.includes('Strict-Transport-Security'));
    assert.ok(robotsTxt.includes('https://www.craigbrothers.com/sitemap.xml'));
    assert.ok(sitemapXml.includes('https://www.craigbrothers.com/'));
  });
});

describe('6. Worker Middleware Functional Simulation', () => {
  it('handles /__health, legacy 301 redirects, staging noindex, and scanner 403 bans', async () => {
    const workerModule = await import('../functions/_middleware.js');
    const worker = workerModule.default;

    const bans = new Map();
    const mockEnv = {
      STUDIO_OVERRIDE_KEY: 'super_secret_override_key_12345',
      SECURITY_BANS: {
        async get(k) { return bans.get(k) || null; },
        async put(k, v) { bans.set(k, v); },
        async delete(k) { bans.delete(k); },
      },
      ASSETS: {
        async fetch() {
          return new Response('<html><body>Craig Brothers</body></html>', {
            status: 200,
            headers: { 'Content-Type': 'text/html' },
          });
        },
      },
    };
    const mockCtx = { waitUntil() {} };

    // 1. /__health on stage
    const healthRes = await worker.fetch(new Request('https://stage.craigbrothers.com/__health'), mockEnv, mockCtx);
    assert.equal(healthRes.status, 200);
    assert.equal(healthRes.headers.get('X-Robots-Tag'), 'noindex, nofollow');
    const healthBody = await healthRes.json();
    assert.equal(healthBody.status, 'ok');
    assert.equal(healthBody.environment, 'staging');

    // 2. Legacy route redirect /freya -> /#freya
    const legacyRes = await worker.fetch(new Request('https://www.craigbrothers.com/freya'), mockEnv, mockCtx);
    assert.equal(legacyRes.status, 301);
    assert.equal(legacyRes.headers.get('Location'), 'https://www.craigbrothers.com/#freya');

    // 3. Apex redirect craigbrothers.com -> www.craigbrothers.com
    const apexRes = await worker.fetch(new Request('https://craigbrothers.com/'), mockEnv, mockCtx);
    assert.equal(apexRes.status, 301);
    assert.equal(apexRes.headers.get('Location'), 'https://www.craigbrothers.com/');

    // 4. Exploit probe triggers 403 and bans IP
    const probeReq = new Request('https://www.craigbrothers.com/.env', {
      headers: { 'CF-Connecting-IP': '198.51.100.77' },
    });
    const probeRes = await worker.fetch(probeReq, mockEnv, mockCtx);
    assert.equal(probeRes.status, 403);
    assert.equal(bans.has('ban:198.51.100.77'), true);

    // 5. Subsequent normal request from banned IP gets 403
    const followUpReq = new Request('https://www.craigbrothers.com/', {
      headers: { 'CF-Connecting-IP': '198.51.100.77' },
    });
    const followUpRes = await worker.fetch(followUpReq, mockEnv, mockCtx);
    assert.equal(followUpRes.status, 403);
  });
});

