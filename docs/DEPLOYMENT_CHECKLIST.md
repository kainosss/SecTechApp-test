# Pre-deployment checklist (v0.9.2 — Cloudflare Pages + Access)

Legend:
- ✅ **Done — verified locally** (static export served by Cloudflare's `wrangler pages dev`, Chromium with
  Android/iPhone/desktop emulation; or the normal build on `next start`)
- 🟦 **Hosting configuration** — the owner must do it in Cloudflare (see `docs/CLOUDFLARE_DEPLOYMENT.md`)
- 📱 **Live check** — needs the deployed site and/or real Android phones and iPhones
- ⛔ **Blocked** — waiting on the noted item

Nothing is marked done unless it was actually tested. Real-phone installation has **not** been tested.

## Hosting configuration
- ⛔ `pilot` branch fast-forwarded to the approved v0.9.2 commit (currently v0.9.1 `c5e6496`, no Cloudflare build) — needs approval
- 🟦 Pages project connected to GitHub (`kainosss/SecTechApp-test`, this repository only); production branch `pilot`
- 🟦 Build command `npm run build:cloudflare`, output `out`, root `/`, `NODE_VERSION=22`
- 🟦 Preview deployments disabled, or covered by the Access application (`*.<project>.pages.dev`)
- ✅ Static export builds reproducibly; the build fails if any page, icon, font or `_headers` is missing
- ✅ No server code, API routes with request data, middleware, image optimisation or secrets
- ✅ Normal (`npm run build`) and demo builds still succeed (Vercel / `next start` path unchanged)

## Domain and HTTPS
- 🟦 Final address chosen before testers start (`<project>.pages.dev` or a custom domain) — storage is per address
- 📱 HTTPS padlock on the live address (automatic on Pages)
- ✅ HSTS and `upgrade-insecure-requests` in `_headers`

## Access restrictions
- 🟦 Zero Trust organisation (Free) created; One-time PIN login method enabled
- 🟦 Self-hosted Access application covering `<project>.pages.dev`, `*.<project>.pages.dev` (and any custom domain)
- 🟦 Allow policy listing only the invited testers' email addresses; session duration chosen (e.g. 1 week)
- 📱 Private window: Access prompt before `/`, `/tech-docs`, `/manifest.webmanifest` and a preview URL
- 📱 Non-invited email receives no code
- ✅ Search engines asked not to index (robots.txt, meta, `X-Robots-Tag`) — advisory only

## Production build
- ✅ `npm run lint`, `npm run typecheck`, `npm test` pass
- ✅ `npm run build:cloudflare`, `npm run build`, `FIELDWISE_DEMO_MODE=true npm run build` succeed
- ✅ No browser source maps; static export contains all 16 routes (+ every generated dynamic page)

## Environment variables
- ✅ No secrets required; `.env.example` documents only `FIELDWISE_DEMO_MODE` and `NEXT_PUBLIC_FEEDBACK_EMAIL`
- 🟦 `FIELDWISE_DEMO_MODE` unset in the Pages project; optional `NEXT_PUBLIC_FEEDBACK_EMAIL` set to a real inbox

## Security headers
- ✅ `_headers` generated from `src/lib/security-headers.ts` (same values as `next.config`): CSP (self only, no
  `unsafe-eval`), nosniff, no-referrer, DENY, Permissions-Policy, COOP, HSTS, X-Robots-Tag — verified on every
  route incl. the 404 response with `wrangler pages dev`
- ✅ No CSP violations or console errors across all tools, demo, PDF preview/download and Excel exports
- 📱 Same headers on the live Pages responses (dev tools → Network)
- ✅ Dependency review: one moderate advisory (`uuid` via `exceljs`), not reachable (ExcelJS uses v4 only)

## Routing
- ✅ Direct URLs and refresh for every route; query-string deep links; `.html` and trailing-slash URLs redirect
  (308) to the clean URL; unknown paths return 404 with the Fieldwise page — in `wrangler pages dev`
- 📱 Same on the live site

## Mobile compatibility
- ✅ No horizontal overflow, targets ≥ 44 px, form fields ≥ 16 px — emulated Android 412 × 915, iPhone 390 × 844,
  landscape 844 × 390, desktop 1440 × 900 (static export)
- 📱 Real Android Chrome and iPhone Safari: navigation, keyboard, dialogs, scrolling (WebKit not available locally)

## PWA installation
- ✅ Manifest served as `application/manifest+json`; Chromium reports no installability errors (static export)
- ✅ 192, 512, maskable 512, Apple 180 icons; theme colour; standalone; Apple metadata; manifest fetched with credentials
- ✅ No service worker (no stale caches, nothing sensitive cached); offline not claimed
- 📱 Android: Install app → standalone launch **behind Access**
- 📱 iPhone: Add to Home Screen → standalone launch, sign-in inside the app, records persist between launches
- 🟦 Only if install fails behind Access: Bypass policy for `/manifest.webmanifest` and `/icons/*` only

## Data isolation and persistence
- ✅ Demo workspace separate keys; enter/edit/reset/exit leave real records byte-identical (tests + browser)
- ✅ Records persist across reload and browser restart (persistent Chromium profile, static export)
- 📱 iPhone: data over several days (Safari may evict unused sites' data; home-screen app recommended)

## Backup and restore
- ✅ Download backup → restore (merge) into a fresh profile — emulated Android and iPhone, static export
- ✅ v1 and v2 backups import (unit tests); replace requires confirmation
- 📱 Download location and file-picker restore on real phones

## Export functionality
- ✅ Client PDF (preview iframe + download) and Excel (register, report) under the `_headers` CSP
- 📱 Opening PDF/XLSX on real phones

## Feedback workflow
- ✅ Copy (clipboard) and download; no email draft without a configured address; "Nothing has been sent"
- 📱 Clipboard on real phones (needs HTTPS — satisfied when deployed)

## Privacy notice
- ✅ Pilot notice on Help and dashboard; demo labelled fictional everywhere; no analytics or external requests
- 🟦 Leave Cloudflare Web Analytics / Zaraz **off** for this project

## Rollback plan
- ✅ Documented (Pages → Deployments → Rollback); no service worker, records unaffected
- 🟦 One practice rollback after the first deployment

## Blocked
- ⛔ Moving `pilot` to v0.9.2 and any deployment — awaiting explicit approval.
- ⛔ All 📱 items — need the deployed site and real devices.
