// Post-deploy smoke verification script for www.craigbrothers.com & stage.craigbrothers.com
// Usage:
//   node scripts/verify-deploy.js                          (verifies both stage and prod)
//   node scripts/verify-deploy.js https://stage.craigbrothers.com

const DEFAULT_TARGETS = [
  'https://stage.craigbrothers.com',
  'https://www.craigbrothers.com',
];

const targets = process.argv.slice(2).length > 0 ? process.argv.slice(2) : DEFAULT_TARGETS;

async function verifyTarget(baseUrl) {
  const cleanBase = baseUrl.replace(/\/+$/, '');
  const isStage = cleanBase.includes('stage.craigbrothers.com');
  console.log(`\nVerifying deployment target: ${cleanBase}`);

  // 1. Verify /__health endpoint
  const healthRes = await fetch(`${cleanBase}/__health`, { redirect: 'manual' });
  if (healthRes.status !== 200) {
    throw new Error(`[${cleanBase}] /__health returned HTTP ${healthRes.status}`);
  }
  const healthJson = await healthRes.json();
  if (healthJson.status !== 'ok') {
    throw new Error(`[${cleanBase}] /__health payload invalid: ${JSON.stringify(healthJson)}`);
  }
  console.log(`  [PASS] /__health -> 200 OK (${healthJson.environment})`);

  // 2. Verify homepage response and security headers
  const homeRes = await fetch(`${cleanBase}/`);
  if (homeRes.status !== 200) {
    throw new Error(`[${cleanBase}] / returned HTTP ${homeRes.status}`);
  }
  const html = await homeRes.text();
  if (!html.includes('Craig Brothers') || !html.includes('Stephentown')) {
    throw new Error(`[${cleanBase}] / HTML did not contain expected brand text`);
  }

  const requiredHeaders = [
    'x-frame-options',
    'x-content-type-options',
    'referrer-policy',
    'strict-transport-security',
    'content-security-policy',
  ];
  for (const h of requiredHeaders) {
    if (!homeRes.headers.get(h)) {
      throw new Error(`[${cleanBase}] Missing required security header: ${h}`);
    }
  }
  console.log('  [PASS] / -> 200 OK + security headers present');

  // 3. Verify staging vs production indexing rules
  const robotsTag = homeRes.headers.get('x-robots-tag') || '';
  if (isStage) {
    if (!robotsTag.includes('noindex')) {
      throw new Error(`[${cleanBase}] Expected X-Robots-Tag: noindex on staging`);
    }
    const robotsTxt = await (await fetch(`${cleanBase}/robots.txt`)).text();
    if (!robotsTxt.includes('Disallow: /')) {
      throw new Error(`[${cleanBase}] Expected Disallow: / in staging robots.txt`);
    }
    console.log('  [PASS] Staging noindex + Disallow: / verified');
  } else {
    if (robotsTag.includes('noindex')) {
      throw new Error(`[${cleanBase}] Unexpected X-Robots-Tag: noindex on production`);
    }
    console.log('  [PASS] Production indexability verified');
  }

  // 4. Verify legacy Google Sites redirect (/karry -> /#karry)
  const redirectRes = await fetch(`${cleanBase}/karry`, { redirect: 'manual' });
  if (redirectRes.status !== 301) {
    throw new Error(`[${cleanBase}] Expected 301 on /karry, got ${redirectRes.status}`);
  }
  const location = redirectRes.headers.get('location') || '';
  if (!location.endsWith('/#karry')) {
    throw new Error(`[${cleanBase}] Expected /karry redirect to end with /#karry, got ${location}`);
  }
  console.log(`  [PASS] Legacy redirect /karry -> ${location} (301)`);
}

for (const target of targets) {
  await verifyTarget(target);
}
console.log('\nAll deployment checks passed.');
