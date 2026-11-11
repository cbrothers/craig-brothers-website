// Cloudflare Edge Security & Honeypot Middleware (v2.0)
// Powered by shared package: https://github.com/cbrothers/cloudflare-edge-honeypot
// Protects www.craigbrothers.com and stage.craigbrothers.com against automated vulnerability scanners,
// handles legacy Google Sites route redirects, serves WKD & security.txt, and enforces staging noindex headers.

import {
  BAN_TTL_MS,
  BAN_TTL_SECONDS,
  MAX_IN_MEMORY_BANS,
  OVERRIDE_COOKIE_MAX_AGE,
  banIp,
  bannedIps,
  clearBannedIps,
  constantTimeEqual,
  deriveOverrideToken,
  evaluateHoneypotRequest,
  getClientIp,
  hasValidOverrideCookie,
  hasValidOverrideSupply,
  injectStageNoIndexHtml,
  isIpAllowlisted,
  isIpBanned,
  isNonProductionHost,
  isScannerPath,
  isVerifiedCrawler,
  parseCookies,
  unbanIp,
} from './honeypot/src/index.js';

export const OVERRIDE_COOKIE_NAME = '__cb_studio_override';
export const OVERRIDE_TOKEN_PREFIX = 'cb_ovr';
export const APEX_HOSTNAME = 'craigbrothers.com';
export const WWW_HOSTNAME = 'www.craigbrothers.com';
export const STAGE_HOSTNAME = 'stage.craigbrothers.com';

export {
  BAN_TTL_MS,
  BAN_TTL_SECONDS,
  MAX_IN_MEMORY_BANS,
  OVERRIDE_COOKIE_MAX_AGE,
  banIp,
  bannedIps,
  clearBannedIps,
  constantTimeEqual,
  deriveOverrideToken,
  evaluateHoneypotRequest,
  getClientIp,
  hasValidOverrideCookie,
  hasValidOverrideSupply,
  injectStageNoIndexHtml,
  isIpAllowlisted,
  isIpBanned,
  isNonProductionHost,
  isScannerPath,
  isVerifiedCrawler,
  parseCookies,
  unbanIp,
};

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
      title: 'Music & Multimedia | Craig Brothers - Artificial Integrity, The Silent Whistle & More',
      description:
        'Human songwriting and AI-assisted music and multimedia production by Craig Brothers: Artificial Integrity, The Silent Whistle, Copperhead Blues, and Brothers Blues.',
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

const CRAIG_ALLOW_PATHS = new Set([
  '/pgp-key.txt',
  '/.well-known/security.txt',
  '/security.txt',
  '/.well-known/openpgpkey/policy',
  '/.well-known/openpgpkey/hu/a144to849imkhr1juqo7mikormp6errq',
  '/.well-known/openpgpkey/craigbrothers.com/policy',
  '/.well-known/openpgpkey/craigbrothers.com/hu/a144to849imkhr1juqo7mikormp6errq',
  ...LEGACY_REDIRECTS.keys(),
  ...SECTION_SEO_ROUTES.keys(),
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

async function serveAssetOrSectionRoute(request, url, env, hostname, extraHeaders = {}) {
  const lowerPath = url.pathname.toLowerCase();
  const sectionMeta = SECTION_SEO_ROUTES.get(lowerPath);
  if (sectionMeta && (request.method === 'GET' || request.method === 'HEAD')) {
    const rootUrl = new URL('/', url.origin);
    const rootResp = await env.ASSETS.fetch(new Request(rootUrl.toString(), request));
    if (rootResp && rootResp.status === 200) {
      if (request.method === 'HEAD') {
        return applySecurityHeaders(rootResp, hostname, extraHeaders);
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
        hostname,
        extraHeaders
      );
    }
  }

  const assetResponse = await env.ASSETS.fetch(request);
  return applySecurityHeaders(assetResponse, hostname, extraHeaders);
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

async function handleRequest(request, env = {}, _ctx = {}) {
  const url = new URL(request.url);
  const hostname = url.hostname.toLowerCase();
  const lowerPath = url.pathname.toLowerCase();

  // Serve RFC 9116 security.txt directly at the edge
  if (lowerPath === '/.well-known/security.txt' || lowerPath === '/security.txt') {
    const securityTxt = [
      'Contact: mailto:craig@craigbrothers.com',
      'Encryption: https://www.craigbrothers.com/pgp-key.txt',
      'Canonical: https://www.craigbrothers.com/.well-known/security.txt',
      'Preferred-Languages: en',
      'Expires: 2027-11-11T00:00:00.000Z',
      '',
    ].join('\n');
    return applySecurityHeaders(
      new Response(securityTxt, {
        status: 200,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'public, max-age=86400',
        },
      }),
      hostname
    );
  }

  // Serve Web Key Directory (WKD) direct & advanced requests on both craigbrothers.com and www.craigbrothers.com without redirecting
  if (lowerPath.startsWith('/.well-known/openpgpkey/')) {
    const wkdResp = await env.ASSETS.fetch(request);
    const isPolicy = lowerPath.endsWith('/policy');
    return applySecurityHeaders(wkdResp, hostname, {
      'Content-Type': isPolicy ? 'text/plain; charset=utf-8' : 'application/octet-stream',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=86400',
    });
  }

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

  // Evaluate shared cloudflare-edge-honeypot (v1.1.0)
  const { blockedResponse, setCookieHeader } = await evaluateHoneypotRequest({
    request,
    url,
    env,
    cookieName: OVERRIDE_COOKIE_NAME,
    tokenPrefix: OVERRIDE_TOKEN_PREFIX,
    allowPaths: CRAIG_ALLOW_PATHS,
  });

  if (blockedResponse) {
    return applySecurityHeaders(blockedResponse, hostname);
  }

  const extraHeaders = setCookieHeader
    ? {
        'Set-Cookie': setCookieHeader,
        'Cache-Control': 'private, no-store, no-cache, must-revalidate',
      }
    : {};

  // Legacy Google Sites path redirects
  const redirectTarget = LEGACY_REDIRECTS.get(lowerPath);
  if (redirectTarget) {
    const dest = new URL(redirectTarget, url.origin);
    return Response.redirect(dest.toString(), 301);
  }

  // Serve /favicon.png when legacy clients or crawlers request /favicon.ico
  if (lowerPath === '/favicon.ico') {
    const iconUrl = new URL('/favicon.png', url.origin);
    const iconResp = await env.ASSETS.fetch(new Request(iconUrl.toString(), request));
    return applySecurityHeaders(iconResp, hostname, extraHeaders);
  }

  return serveAssetOrSectionRoute(request, url, env, hostname, extraHeaders);
}

export default {
  fetch: handleRequest,
};
