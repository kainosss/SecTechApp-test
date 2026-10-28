# Pre-deployment checklist (v0.9.1)

Legend:
- ✅ **Done — verified locally** (production build on this machine, Chromium with Android/iPhone/desktop emulation)
- 🟦 **Hosting configuration** — the owner must do it in Vercel (see `docs/WEB_DEPLOYMENT.md`)
- 📱 **Live-device check** — needs a real Android phone / iPhone on the deployed site
- ⛔ **Blocked** — cannot proceed until the noted item is resolved

Nothing below is marked done unless it was actually tested. Real-phone installation has **not** been tested.

## Hosting configuration
- 🟦 Vercel **Pro** team created (Hobby is non-commercial only); spend limit / usage alerts set
- 🟦 Repository imported; framework Next.js; install `npm ci`; build `npm run build`; Node 22.x
- 🟦 Production branch chosen (recommended: a dedicated `pilot` branch from the approved commit)
- 🟦 Preview deployments protected or disabled
- ✅ Reproducible production build (`npm ci && npm run build`), Node ≥ 20.9 declared in `engines`
- ✅ No dependence on localhost; no API routes except the static manifest; no middleware or server secrets

## Domain and HTTPS
- 🟦 Production address decided **before** testers start (storage is tied to the address)
- 🟦 Optional custom domain added and DNS verified
- 🟦 HTTPS certificate active (automatic on Vercel)
- ✅ App sends `Strict-Transport-Security` and `upgrade-insecure-requests` (production build)

## Access restrictions
- 🟦 Deployment Protection enabled for **all deployments including production** (Password Protection recommended)
- 🟦 Strong shared password created and sent to testers separately from the URL
- 📱 Private window: challenge appears before `/`, a deep link (`/tech-docs`) and `/manifest.webmanifest`
- ✅ Search engines asked not to index (`robots.txt` disallow, robots meta, `X-Robots-Tag`) — advisory only

## Production build
- ✅ `npm run lint`, `npm run typecheck`, `npm test` pass
- ✅ `npm run build` (normal) and `FIELDWISE_DEMO_MODE=true npm run build` (demo) succeed
- ✅ Browser source maps not published (`productionBrowserSourceMaps: false`); `X-Powered-By` removed

## Environment variables
- ✅ No secrets required; `.env.example` documents only `FIELDWISE_DEMO_MODE` and `NEXT_PUBLIC_FEEDBACK_EMAIL`
- 🟦 `FIELDWISE_DEMO_MODE` **unset** in Production
- 🟦 Optional `NEXT_PUBLIC_FEEDBACK_EMAIL` set to a real inbox (or left unset)

## Security headers
- ✅ CSP (self only; no third-party origins; no `unsafe-eval` in production), `nosniff`, `Referrer-Policy:
  no-referrer`, `X-Frame-Options: DENY`, `Permissions-Policy`, `COOP` — verified with `curl -I` on `next start`
- ✅ No CSP violations or console errors across all tools, demo, PDF preview/download and Excel exports
- 📱 Headers present on the deployed site (dev tools → Network)
- ✅ Dependency review: one moderate advisory (`uuid` via `exceljs`), not reachable — documented

## Mobile compatibility
- ✅ No horizontal overflow and targets ≥ 44 px on every route — emulated Android 412 × 915, iPhone 390 × 844,
  landscape 844 × 390, desktop 1440 × 900; form fields ≥ 16 px (no iPhone zoom on focus)
- 📱 Real Android Chrome: navigation, forms/keyboard, dialogs, scrolling
- 📱 Real iPhone Safari: same (WebKit was not available locally; iPhone checks were Chromium emulation)

## PWA installation
- ✅ Manifest valid; Chromium reports no installability errors (DevTools protocol) — Android and desktop emulation
- ✅ 192, 512, maskable 512, Apple touch 180 icons served; theme colour; standalone display; Apple metadata
- ✅ Manifest fetched with credentials (works behind password protection — to be confirmed live)
- 📱 Android: Install app → launches standalone with icon and name (with access protection enabled)
- 📱 iPhone: Add to Home Screen → launches standalone; records persist between launches
- ✅ No service worker (no stale caches; nothing sensitive cached); offline not claimed

## Data isolation
- ✅ Demo workspace uses separate storage keys; entering, editing, resetting and exiting leave real records
  byte-identical (unit tests + browser run)
- ✅ Backup and restore disabled inside the demo
- ✅ Records persist across reload and browser restart (persistent Chromium profile)
- 📱 Records persist across days on iPhone (Safari may evict data of unused sites; home-screen app recommended)

## Backup and restore
- ✅ Download backup → restore (merge) into a fresh browser profile — emulated Android and iPhone viewports
- ✅ v1 (v0.7.1) and v2 backups import (unit tests); destructive replace requires confirmation
- 📱 Backup download and file picker restore on real Android and iPhone (download location differs per phone)

## Export functionality
- ✅ Client handover PDF (preview iframe + download) and Excel exports (register, report) under the production CSP
- 📱 Opening the PDF/XLSX on a real phone (Files / Downloads app)

## Feedback workflow
- ✅ Copy feedback (clipboard), download file; no email draft without a configured recipient; nothing sent
- 🟦 Decide where testers send feedback; optional `NEXT_PUBLIC_FEEDBACK_EMAIL`
- 📱 Clipboard copy on real phones (requires HTTPS — satisfied once deployed)

## Privacy notice
- ✅ Pilot notice on Help (testing, unverified content, manufacturer docs first, verify before live use, local
  storage, no sync, data loss on clearing, feedback not transmitted, fictional data); dashboard notice links to it
- ✅ Demo site labelled fictional throughout (banner, register, reports, PDF)
- ✅ No analytics, telemetry or external requests (browser runs)
- 🟦 If the host's own analytics/speed insights are offered, leave them **off**

## Rollback plan
- ✅ Documented: Vercel → Deployments → Instant Rollback / Promote previous deployment; no service worker, so
  testers get the rolled-back version on next load; records unaffected
- 🟦 Do one practice rollback after the first deployment

## Blocked
- ⛔ Live deployment — awaiting explicit approval from the project owner.
- ⛔ All 📱 items — need the deployed site and real devices.
