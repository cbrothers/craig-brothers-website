# Craig Brothers Website (`www.craigbrothers.com`)

Personal hub for **Craig Brothers** in Stephentown, NY - IT Systems Engineer, homelab architect, musician, and co-steward of [Emerald Glen Equestrian Center](https://www.emerald-glen.com).

## Architecture

- **Hosting**: Cloudflare Workers + Static Assets (`wrangler.jsonc`)
- **Edge Security & Middleware**: `functions/_middleware.js`
  - Canonical redirect (`craigbrothers.com` -> `www.craigbrothers.com`)
  - Legacy Google Sites 301 redirects (`/home` -> `/`, `/me` -> `/#me`, `/karry` -> `/#karry`, `/freya` -> `/#freya`, `/kora` -> `/#kora`, `/gus` -> `/#gus`)
  - Automated exploit scanner detection & 24-hour IP bans via shared `SECURITY_BANS` KV (`8042e1b5ee4b42279489114046987cf6`)
  - Owner override via `STUDIO_OVERRIDE_KEY` (`?studio_override=`, `x-studio-override` header, or `__cb_studio_override` cookie) and `ALLOWLIST_IPS`
  - Staging protection (`stage.craigbrothers.com` serves `X-Robots-Tag: noindex, nofollow` and `Disallow: /` on `/robots.txt`)
  - Health endpoint at `/__health`
- **Analytics**: Google Analytics 4 (`G-W8W15JLP5W`) with Consent Mode v2 (default denied until user consent).

## Commands

```bash
# Run site integrity & worker middleware unit tests
npm test

# Build static assets into ./dist
npm run build

# Verify Cloudflare Workers Builds check-runs on stage and main
npm run verify:deploy
```

## CI/CD Setup (Cloudflare Workers Builds)

- **Repository**: `cbrothers/craig-brothers-website`
- **Production branch**: `main` (`npm test` -> `npx wrangler deploy`)
- **Preview branch (`stage`)**: Worker Previews (`npx wrangler preview` using `"previews"` bindings in `wrangler.jsonc`)
- **Live Staging URL**: [https://stage.craigbrothers.com](https://stage.craigbrothers.com) (`www.craigbrothers.com` and `craigbrothers.com` remain on Google Sites until production cutover)

