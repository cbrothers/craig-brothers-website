// Cloudflare Edge Security & Honeypot Middleware
// Protects www.craigbrothers.com and stage.craigbrothers.com against automated vulnerability scanners,
// handles legacy Google Sites route redirects, and enforces staging noindex headers.

const BAN_TTL_SECONDS = 86400; // 24-hour ban
const OVERRIDE_COOKIE_NAME = '__cb_studio_override';
const APEX_HOSTNAME = 'craigbrothers.com';
const WWW_HOSTNAME = 'www.craigbrothers.com';
const STAGE_HOSTNAME = 'stage.craigbrothers.com';

// Legacy Google Sites routes redirected to single-page section anchors
const LEGACY_REDIRECTS = new Map([
  ['/home', '/'],
  ['/home/', '/'],
  ['/me', '/#me'],
  ['/me/', '/#me'],
  ['/karry', '/#karry'],
  ['/karry/', '/#karry'],
  ['/freya', '/#freya'],
  ['/freya/', '/#freya'],
  ['/kora', '/#kora'],
  ['/kora/', '/#kora'],
  ['/gus', '/#gus'],
  ['/gus/', '/#gus'],
]);

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

function isScannerRequest(pathname) {
  const lower = pathname.toLowerCase();
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

function applySecurityHeaders(response, hostname, extraHeaders = {}) {
  const headers = new Headers(response.headers);

  headers.set('X-Frame-Options', 'DENY');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('Permissions-Policy', 'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()');
  headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  headers.set(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline' https://www.googletagmanager.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self' https://www.google-analytics.com https://analytics.google.com https://region1.google-analytics.com; frame-src 'none'; object-src 'none'; base-uri 'self'; form-action 'self'"
  );

  // Prevent search engine indexing on staging or preview URLs
  if (hostname === STAGE_HOSTNAME || hostname.endsWith('.workers.dev')) {
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

    const assetResponse = await env.ASSETS.fetch(request);
    return applySecurityHeaders(assetResponse, hostname);
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

  const assetResponse = await env.ASSETS.fetch(request);
  return applySecurityHeaders(assetResponse, hostname);
}

export default {
  fetch: handleRequest,
};
