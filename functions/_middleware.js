// Cloudflare Edge Security & Honeypot Middleware (v1.2)
// Protects www.craigbrothers.com and stage.craigbrothers.com against automated vulnerability scanners,
// handles legacy Google Sites route redirects, and enforces staging noindex headers.

const BAN_TTL_SECONDS = 86400; // 24-hour ban
const OVERRIDE_COOKIE_NAME = '__cb_studio_override';
const APEX_HOSTNAME = 'craigbrothers.com';
const WWW_HOSTNAME = 'www.craigbrothers.com';
const STAGE_HOSTNAME = 'stage.craigbrothers.com';

// Legacy Google Sites & trailing-slash route redirects
const LEGACY_REDIRECTS = new Map([
  ['/home', '/'],
  ['/home/', '/'],
  ['/me/', '/me'],
  ['/engineering/', '/engineering'],
  ['/music/', '/music'],
  ['/karry/', '/karry'],
  ['/freya/', '/freya'],
  ['/kora/', '/kora'],
  ['/gus/', '/gus'],
  ['/friends/', '/friends'],
]);

// Clean section paths served with 200 OK and section-specific SEO metadata
const SECTION_SEO_ROUTES = new Map([
  [
    '/me',
    {
      sectionId: 'me',
      title: 'About Craig Brothers | Health, Resilience & Life in Stephentown, NY',
      description:
        'Background, health and resilience journey, and life at Emerald Glen in Stephentown, NY for Craig Brothers, Director of Systems Engineering and musician.',
      image: 'https://www.craigbrothers.com/images/me-03.jpg',
      imageAlt: 'Craig Brothers portrait in Stephentown, NY',
    },
  ],
  [
    '/engineering',
    {
      sectionId: 'engineering',
      title: 'Engineering & AI | Craig Brothers - Director of Systems Engineering',
      description:
        '30+ years of enterprise systems engineering, Career Telemetry Scrubber (1999 to present), AI agent orchestration, ArtCraft 13-app Rust suite, and homelab infrastructure.',
      image: 'https://www.craigbrothers.com/images/me-01.jpg',
      imageAlt: 'Craig Brothers systems engineering and homelab architecture',
    },
  ],
  [
    '/music',
    {
      sectionId: 'music',
      title: 'Music & Studio | Craig Brothers - Artificial Integrity, The Silent Whistle & More',
      description:
        'Human songwriting and AI-assisted sonic architecture by Craig Brothers: Artificial Integrity, The Silent Whistle, Copperhead Blues, and Brothers Blues.',
      image: 'https://www.craigbrothers.com/images/me-02.jpg',
      imageAlt: 'Craig Brothers music and studio projects',
    },
  ],
  [
    '/karry',
    {
      sectionId: 'karry',
      title: 'Karry Brothers & Emerald Glen Equestrian Center | Craig Brothers',
      description:
        'Meet Karry Brothers, owner and head trainer at Emerald Glen Equestrian Center in Stephentown, NY, and explore photos from around the farm and dressage ring.',
      image: 'https://www.craigbrothers.com/images/gp-karry-dressage-01.jpg',
      imageAlt: 'Karry Brothers riding Gus in the dressage ring',
    },
  ],
  [
    '/freya',
    {
      sectionId: 'freya',
      title: 'Freya - Our Shooting Star | Craig Brothers',
      description:
        'Photos, Embark DNA results, and stories of Freya, our border collie mix rescued via Homeward Bound Dog Rescue in Stephentown, NY.',
      image: 'https://www.craigbrothers.com/images/home-01.jpg',
      imageAlt: 'Freya - Our shooting Star',
    },
  ],
  [
    '/kora',
    {
      sectionId: 'kora',
      title: 'Kora (Chloe 2.0) & Remembering Chloe and Maya | Craig Brothers',
      description:
        'Meet Kora, our Jack Russell Terrier from Butterball Kennel, and a tribute to Chloe and Maya at Emerald Glen in Stephentown, NY.',
      image: 'https://www.craigbrothers.com/images/home-02.jpg',
      imageAlt: 'Kora - Jack Russell Terrier at Emerald Glen',
    },
  ],
  [
    '/gus',
    {
      sectionId: 'gus',
      title: 'Gus (Fuerst Glance) & Emerald Glen | Craig Brothers',
      description:
        'Meet Gus (Fuerst Glance), our Westfalen gelding by Fuerst Romancier at Emerald Glen Equestrian Center in Stephentown, NY.',
      image: 'https://www.craigbrothers.com/images/home-03.jpg',
      imageAlt: 'Gus at Emerald Glen Equestrian Center',
    },
  ],
  [
    '/friends',
    {
      sectionId: 'friends',
      title: 'Friends, Neighbors & Community | Craig Brothers',
      description:
        'Regional businesses, rescue organizations, and community partners around Stephentown, NY and the Berkshires.',
      image: 'https://www.craigbrothers.com/images/me-03.jpg',
      imageAlt: 'Craig Brothers community and friends in Stephentown, NY',
    },
  ],
]);

function injectSectionSeoHtml(rawHtml, pathname, meta) {
  if (typeof rawHtml !== 'string' || !meta) return rawHtml;
  const canonicalUrl = `https://${WWW_HOSTNAME}${pathname}`;
  let html = rawHtml;
  html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${meta.title}</title>`);
  html = html.replace(
    /<meta\s+name="description"\s+content="[^"]*">/i,
    `<meta name="description" content="${meta.description}">`
  );
  html = html.replace(
    /<link\s+rel="canonical"\s+href="[^"]*">/i,
    `<link rel="canonical" href="${canonicalUrl}">`
  );
  html = html.replace(
    /<meta\s+property="og:title"\s+content="[^"]*">/i,
    `<meta property="og:title" content="${meta.title}">`
  );
  html = html.replace(
    /<meta\s+property="og:description"\s+content="[^"]*">/i,
    `<meta property="og:description" content="${meta.description}">`
  );
  html = html.replace(
    /<meta\s+property="og:url"\s+content="[^"]*">/i,
    `<meta property="og:url" content="${canonicalUrl}">`
  );
  html = html.replace(
    /<meta\s+property="og:image"\s+content="[^"]*">/i,
    `<meta property="og:image" content="${meta.image}">`
  );
  html = html.replace(
    /<meta\s+property="og:image:alt"\s+content="[^"]*">/i,
    `<meta property="og:image:alt" content="${meta.imageAlt}">`
  );
  html = html.replace(
    /<meta\s+name="twitter:title"\s+content="[^"]*">/i,
    `<meta name="twitter:title" content="${meta.title}">`
  );
  html = html.replace(
    /<meta\s+name="twitter:description"\s+content="[^"]*">/i,
    `<meta name="twitter:description" content="${meta.description}">`
  );
  html = html.replace(
    /<meta\s+name="twitter:image"\s+content="[^"]*">/i,
    `<meta name="twitter:image" content="${meta.image}">`
  );
  return html;
}

// High-confidence exploit & scanner paths that no legitimate visitor or SEO crawler ever requests
const SCANNER_EXACT_PATHS = new Set([
  '/.env',
  '/.env.bak',
  '/.env.local',
  '/.env.production',
  '/.env.dev',
  '/.git/config',
  '/.git/HEAD',
  '/.DS_Store',
  '/wp-login.php',
  '/xmlrpc.php',
  '/wp-config.php',
  '/wp-config.php.bak',
  '/config.php',
  '/configuration.php',
  '/info.php',
  '/phpinfo.php',
  '/test.php',
  '/shell.php',
  '/eval-stdin.php',
  '/admin.php',
  '/actuator/env',
  '/actuator/health',
  '/server-status',
  '/telescope/requests',
  '/_ignition/execute-solution',
  '/autodiscover/autodiscover.xml',
]);

const SCANNER_PREFIXES = [
  '/.git/',
  '/.aws/',
  '/.ssh/',
  '/.vscode/',
  '/wp-admin/',
  '/wp-content/',
  '/wp-includes/',
  '/phpmyadmin',
  '/pma/',
  '/myadmin/',
  '/mysql/',
  '/vendor/phpunit/',
  '/cgi-bin/',
  '/.well-known/pki-validation/',
];

const SCANNER_EXTENSIONS = [
  '.php',
  '.asp',
  '.aspx',
  '.jsp',
  '.cgi',
  '.env',
  '.sql',
  '.bak',
  '.old',
  '.orig',
  '.swp',
  '.ini',
  '.conf',
];

const VERIFIED_CRAWLER_UA_REGEX =
  /\b(?:googlebot|google-inspectiontool|googleother|storebot-google|adsbot-google|mediapartners-google|apis-google|bingbot|adidxbot|applebot|duckduckbot|slurp|baiduspider|yandexbot|facebookexternalhit|facebot|linkedinbot|twitterbot|slackbot|discordbot)\b/i;

const GOOGLEBOT_IP_PREFIXES = [
  '66.249.',
  '64.233.172.',
  '64.233.173.',
  '2001:4860:4801:',
];

function isVerifiedCrawler(request, clientIp = '') {
  if (request?.cf?.botManagement?.verifiedBot === true) return true;
  const ip = (clientIp || '').trim().toLowerCase();
  if (ip && GOOGLEBOT_IP_PREFIXES.some((prefix) => ip.startsWith(prefix))) return true;
  const ua = request?.headers?.get('User-Agent') || '';
  if (ua && VERIFIED_CRAWLER_UA_REGEX.test(ua)) return true;
  return false;
}

function isScannerRequest(pathname) {
  const lower = pathname.toLowerCase();
  if (lower.startsWith('/cdn-cgi/')) return false;
  if (SCANNER_EXACT_PATHS.has(lower)) return true;
  if (SCANNER_PREFIXES.some((prefix) => lower.startsWith(prefix))) return true;
  if (SCANNER_EXTENSIONS.some((ext) => lower.endsWith(ext))) return true;
  if (lower.includes('..') || lower.includes('%2e%2e')) return true;
  return false;
}

function parseCookies(cookieHeader) {
  const cookies = {};
  if (!cookieHeader) return cookies;
  for (const part of cookieHeader.split(';')) {
    const [rawKey, ...rest] = part.trim().split('=');
    if (rawKey) {
      cookies[rawKey] = rest.join('=');
    }
  }
  return cookies;
}

// Constant-time string comparison to prevent timing oracle attacks on secret keys
function timingSafeEqualStr(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const encoder = new TextEncoder();
  const aBytes = encoder.encode(a);
  const bBytes = encoder.encode(b);
  if (aBytes.byteLength !== bBytes.byteLength) return false;
  let diff = 0;
  for (let i = 0; i < aBytes.byteLength; i++) {
    diff |= aBytes[i] ^ bBytes[i];
  }
  return diff === 0;
}

function isOwnerOverride(request, env, clientIp) {
  // 1. Check static IP allowlist (comma-separated in env.ALLOWLIST_IPS)
  if (env.ALLOWLIST_IPS && clientIp) {
    const allowedIps = env.ALLOWLIST_IPS.split(',').map((ip) => ip.trim()).filter(Boolean);
    if (allowedIps.includes(clientIp)) {
      return { allowed: true, setCookie: false };
    }
  }

  // 2. Check secret override key (via URL param, custom header, or signed session cookie)
  const secretKey = env.STUDIO_OVERRIDE_KEY;
  if (secretKey && secretKey.length >= 16) {
    const url = new URL(request.url);
    const queryKey = url.searchParams.get('studio_override');
    if (queryKey && timingSafeEqualStr(queryKey, secretKey)) {
      return { allowed: true, setCookie: true, unbanIp: true };
    }

    const headerKey = request.headers.get('x-studio-override');
    if (headerKey && timingSafeEqualStr(headerKey, secretKey)) {
      return { allowed: true, setCookie: false, unbanIp: true };
    }

    const cookies = parseCookies(request.headers.get('Cookie'));
    if (cookies[OVERRIDE_COOKIE_NAME] && timingSafeEqualStr(cookies[OVERRIDE_COOKIE_NAME], secretKey)) {
      return { allowed: true, setCookie: false, unbanIp: false };
    }
  }

  return { allowed: false, setCookie: false };
}

async function serveAssetOrSectionRoute(request, url, env, hostname) {
  const lowerPath = url.pathname.toLowerCase();
  const sectionMeta = SECTION_SEO_ROUTES.get(lowerPath);
  if (sectionMeta && (request.method === 'GET' || request.method === 'HEAD')) {
    const rootUrl = new URL('/', url.origin);
    const rootResp = await env.ASSETS.fetch(new Request(rootUrl.toString(), request));
    if (rootResp && rootResp.status === 200) {
      if (request.method === 'HEAD') {
        return applySecurityHeaders(rootResp, hostname);
      }
      const rawHtml = await rootResp.text();
      const enrichedHtml = injectSectionSeoHtml(rawHtml, lowerPath, sectionMeta);
      const headers = new Headers(rootResp.headers);
      headers.delete('Content-Length');
      return applySecurityHeaders(
        new Response(enrichedHtml, {
          status: 200,
          statusText: 'OK',
          headers,
        }),
        hostname
      );
    }
  }

  const assetResponse = await env.ASSETS.fetch(request);
  return applySecurityHeaders(assetResponse, hostname);
}

function applySecurityHeaders(response, hostname, extraHeaders = {}) {
  const headers = new Headers(response.headers);

  headers.set('X-Frame-Options', 'DENY');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('Permissions-Policy', 'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()');
  headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  headers.set(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com https://www.googletagmanager.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; media-src 'self' https://cdn1.suno.ai https://cdn2.suno.ai https://*.suno.ai https://*.suno.com; frame-src https://td.doubleclick.net https://www.googletagmanager.com; connect-src 'self' https://cloudflareinsights.com https://www.google-analytics.com https://*.google-analytics.com https://analytics.google.com https://*.analytics.google.com https://*.googletagmanager.com https://www.google.com https://stats.g.doubleclick.net; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'"
  );

  // Prevent search engine indexing on staging or preview URLs
  if (hostname === STAGE_HOSTNAME || hostname.endsWith('.workers.dev')) {
    headers.set('X-Robots-Tag', 'noindex, nofollow');
  }

  // Never cache or index 4xx/5xx responses
  if (response.status >= 400) {
    headers.set('Cache-Control', 'no-store');
    headers.set('X-Robots-Tag', 'noindex, nofollow');
  }

  for (const [key, value] of Object.entries(extraHeaders)) {
    headers.set(key, value);
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function handleRequest(request, env, ctx) {
  const url = new URL(request.url);
  const hostname = url.hostname.toLowerCase();

  // Canonical redirect: craigbrothers.com -> www.craigbrothers.com
  if (hostname === APEX_HOSTNAME) {
    url.hostname = WWW_HOSTNAME;
    return Response.redirect(url.toString(), 301);
  }

  // Health check endpoint for automated deployment verification and uptime monitors
  if (url.pathname === '/__health') {
    const healthPayload = JSON.stringify({
      status: 'ok',
      service: 'craig-brothers-website',
      host: hostname,
      environment: hostname === STAGE_HOSTNAME ? 'staging' : 'production',
      timestamp: new Date().toISOString(),
    });
    return applySecurityHeaders(
      new Response(healthPayload, {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store',
        },
      }),
      hostname
    );
  }

  // Disallow all crawlers on stage.craigbrothers.com/robots.txt
  if (hostname === STAGE_HOSTNAME && url.pathname === '/robots.txt') {
    return applySecurityHeaders(
      new Response('User-agent: *\nDisallow: /\n', {
        status: 200,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'no-store',
        },
      }),
      hostname
    );
  }

  // Legacy Google Sites path redirects
  const redirectTarget = LEGACY_REDIRECTS.get(url.pathname.toLowerCase());
  if (redirectTarget) {
    const dest = new URL(redirectTarget, url.origin);
    return Response.redirect(dest.toString(), 301);
  }

  // Serve /favicon.png when legacy clients or crawlers request /favicon.ico
  if (url.pathname.toLowerCase() === '/favicon.ico') {
    const iconUrl = new URL('/favicon.png', url.origin);
    const iconResp = await env.ASSETS.fetch(new Request(iconUrl.toString(), request));
    return applySecurityHeaders(iconResp, hostname);
  }

  const clientIp = request.headers.get('CF-Connecting-IP') || '';
  const kv = env.SECURITY_BANS;

  // Check if owner override is active
  const override = isOwnerOverride(request, env, clientIp);
  if (override.allowed) {
    if (override.unbanIp && kv && clientIp) {
      ctx.waitUntil(kv.delete(`ban:${clientIp}`).catch(() => {}));
    }

    if (override.setCookie) {
      url.searchParams.delete('studio_override');
      const cleanUrl = url.pathname + (url.search ? url.search : '');
      return new Response(null, {
        status: 302,
        headers: {
          Location: cleanUrl,
          'Set-Cookie': `${OVERRIDE_COOKIE_NAME}=${env.STUDIO_OVERRIDE_KEY}; Path=/; Max-Age=2592000; HttpOnly; Secure; SameSite=Lax`,
          'Cache-Control': 'no-store',
        },
      });
    }

    return serveAssetOrSectionRoute(request, url, env, hostname);
  }

  // Exempt verified search engine and social preview crawlers from IP bans
  if (isVerifiedCrawler(request, clientIp)) {
    if (kv && clientIp) {
      ctx.waitUntil(kv.delete(`ban:${clientIp.toLowerCase()}`).catch(() => {}));
    }
    if (isScannerRequest(url.pathname)) {
      return applySecurityHeaders(
        new Response('Not Found', {
          status: 404,
          headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            'Cache-Control': 'no-store',
            'X-Robots-Tag': 'noindex, nofollow',
          },
        }),
        hostname
      );
    }
    return serveAssetOrSectionRoute(request, url, env, hostname);
  }

  // 1. Check if client IP is already banned in KV
  if (kv && clientIp) {
    try {
      const existingBan = await kv.get(`ban:${clientIp}`);
      if (existingBan) {
        return applySecurityHeaders(
          new Response('Access Denied: Your IP address has been temporarily blocked due to suspicious automated activity.', {
            status: 403,
            headers: {
              'Content-Type': 'text/plain; charset=utf-8',
              'Cache-Control': 'no-store',
            },
          }),
          hostname
        );
      }
    } catch {
      // Fail open if KV is temporarily unreachable
    }
  }

  // 2. Detect exploit/scanner probes & ban offending IP for 24 hours
  if (isScannerRequest(url.pathname)) {
    if (kv && clientIp) {
      const banRecord = JSON.stringify({
        ip: clientIp,
        path: url.pathname,
        ua: request.headers.get('User-Agent') || '',
        country: request.cf?.country || 'XX',
        ts: new Date().toISOString(),
      });
      ctx.waitUntil(
        kv.put(`ban:${clientIp}`, banRecord, { expirationTtl: BAN_TTL_SECONDS }).catch(() => {})
      );
    }

    return applySecurityHeaders(
      new Response('Forbidden', {
        status: 403,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'no-store',
        },
      }),
      hostname
    );
  }

  return serveAssetOrSectionRoute(request, url, env, hostname);
}

export default {
  fetch: handleRequest,
};

