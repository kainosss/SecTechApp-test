# Web deployment (pilot) — Vercel

Status: **prepared, not deployed.** Nothing in this repository connects to a hosting account or deploys by itself.
Every step below is done by the project owner in the Vercel dashboard.

> Plans, prices and dashboard menu names change. The figures here come from web search results (Sept–Oct 2026);
> vercel.com itself could not be opened from the session that wrote this. Confirm them at
> https://vercel.com/pricing and in Vercel's documentation before you commit.

## Why Vercel, and what it hosts
- Fieldwise is a Next.js 16 app. Every page is pre-rendered at build time; the only route handler is the static
  `/manifest.webmanifest`. There is no database, no API, no server-side secret, and no user data on the server —
  records stay in each tester's browser.
- Vercel builds Next.js natively (no adapter or custom server), serves the pages from its CDN with HTTPS, and keeps
  every deployment so a bad release can be rolled back in seconds.
- Alternatives that would also work: any static/Node host (e.g. Netlify, Cloudflare Pages, a small VPS running
  `npm start`). They would need their own access protection and header configuration.

## Plan and access protection
- **Hobby (free) is not suitable**: Vercel restricts Hobby to non-commercial personal use, and a pilot of a product
  for technicians is commercial use. Use **Pro**.
- **Restricting access to invited testers — options:**

| Option | How testers get in | Plan / cost (verify) | Notes |
|---|---|---|---|
| **A. Password Protection (recommended)** | One shared password, entered once per browser | Pro; reported ~US$20 per protected project per month (previously a US$150/month add-on) | Enforced by Vercel at the edge before any page is served. No tester accounts. Rotate the password if it leaks or when the pilot ends. |
| B. Vercel Authentication | Each tester signs in with a Vercel account and must be given access | Included on all plans; testers need Vercel accounts and team access (check seat costs) | Free of add-on costs, but more friction for technicians. |
| C. Cloudflare Access (email one-time PIN) | Tester enters their email, receives a code | Cloudflare Zero Trust free tier (up to 50 users, verify) | Needs a custom domain on Cloudflare DNS in front of Vercel, and the `*.vercel.app` address must also be protected. More moving parts. |

  Fieldwise deliberately has **no built-in login**: a managed, edge-level option is safer than custom
  authentication, and the app has no server-side data to protect beyond the pages themselves.
- Behind protection, the manifest is requested with credentials (`crossorigin="use-credentials"`), so installing
  should still work. **Verify installation on real Android and iPhone devices after enabling protection** — some
  install paths fetch icons separately.

## 1. Connect the repository
1. Sign in to Vercel → **Add New… → Project**.
2. Import the GitHub repository `kainosss/sectechapp-test` (install/authorise the Vercel GitHub app for that
   repository only when asked).
3. Framework preset: **Next.js** (detected automatically). Root directory: the repository root.

## 2. Choose the branch
- Recommended: create a **`pilot`** branch from the approved commit and set it as the **Production Branch**
  (Project → Settings → Git). Then ordinary development pushes do not change what testers see; you update the
  pilot by merging/fast-forwarding `pilot` deliberately.
- Alternatively set the production branch to `claude/fieldwise-architecture-setup-5ak87u` — every push to it would
  then go live.
- Preview deployments for other branches: keep them protected (Deployment Protection applies to previews by
  default) or disable them under Settings → Git if not needed.

## 3. Build settings
| Setting | Value |
|---|---|
| Install command | `npm ci` |
| Build command | `npm run build` (runs the content-manifest step first) |
| Output | Next.js default (leave empty) |
| Node.js version | 22.x (≥ 20.9 required; `engines` in package.json) |

## 4. Environment variables
None are required. Project → Settings → Environment Variables:
- `FIELDWISE_DEMO_MODE` — **leave unset** (it adds fictional *library* content meant for development; the demo
  *site* in the app works without it).
- `NEXT_PUBLIC_FEEDBACK_EMAIL` — optional; a real inbox you control. Public by design (it appears in the page).
- Never add passwords or secrets as `NEXT_PUBLIC_*` variables. Fieldwise needs no secrets at all; the pilot password
  lives in Vercel's Deployment Protection settings, not in the app.
Values are read at build time — redeploy after changing them.

## 5. HTTPS
Vercel issues and renews certificates automatically for `*.vercel.app` and custom domains and redirects HTTP to
HTTPS. The app also sends `Strict-Transport-Security` and `upgrade-insecure-requests`. Nothing to configure.

## 6. Restrict access to invited testers
Project → Settings → **Deployment Protection**:
1. Option A: enable **Password Protection**, choose **All Deployments** (production included), set a strong
   password (≥ 16 random characters). Share it with testers separately from the URL (e.g. text message vs email).
2. Option B: enable **Vercel Authentication** for all deployments and give each tester access.
3. Open the production URL in a private window and confirm you are challenged before any Fieldwise page appears —
   also for a deep link such as `/tech-docs` and for `/manifest.webmanifest`.
4. Do **not** share the URL publicly; `robots.txt`, `<meta name="robots">` and `X-Robots-Tag` already ask search
   engines not to index it, but that is advisory only.

## 7. Custom domain (optional)
Project → Settings → Domains → add e.g. `pilot.<your-domain>` and create the DNS record Vercel shows. Pick it
**before** testers start: browser storage belongs to the exact address, so moving domains later makes records
appear to vanish (they can be restored from a backup file).

## 8. Post-deployment smoke tests
On the production URL (desktop + one Android + one iPhone):
1. Access challenge appears; after unlocking, the dashboard loads over HTTPS (padlock).
2. Response headers (browser dev tools → Network → document): `Content-Security-Policy`, `X-Content-Type-Options:
   nosniff`, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`, `Strict-Transport-Security`, `X-Robots-Tag`.
3. No console errors (especially CSP violations) on: dashboard, Device Library, EOL, Fault Finder, Circuit Lab,
   Technical Docs, Service Reports, Help, Feedback.
4. Help shows **Fieldwise 0.9.1 · pilot build**.
5. Explore the demo site → open a report → client PDF preview + download → Excel export → Exit demo.
6. Create a fictional register, reload, close and reopen the browser: still there.
7. Download a backup and restore it in another browser.
8. Install to the home screen (Android Chrome: menu → Install app; iPhone Safari: Share → Add to Home Screen), launch
   from the icon: opens standalone with the Fieldwise icon and name.
9. Feedback → Copy feedback works; status says nothing was sent.
10. Refresh on a deep link (e.g. `/tech-docs?id=…`) loads the same view.
Record results in `docs/DEPLOYMENT_CHECKLIST.md`.

## 9. Roll back a faulty release
Project → **Deployments** → choose the last good production deployment → **Instant Rollback** / **Promote to
Production**. It takes effect in seconds; testers' records are unaffected (they live in their browsers). Then
revert or fix the commit on the production branch so the next push doesn't redeploy the fault. Because Fieldwise
has no service worker, testers get the rolled-back version on their next page load.

## 10. Expected costs (verify before committing)
- Vercel Pro: reported US$20 per month per member who deploys (one owner seat for the pilot), with usage
  allowances far above what 3–5 testers of a static app will use.
- Password Protection: reported ~US$20 per protected project per month on Pro (Sept 2026 change); teams that bought
  the earlier US$150/month add-on keep that billing.
- Optional custom domain: registrar fees (typically tens of dollars per year).
- Vercel Authentication (option B) and Cloudflare Access free tier (option C) have no direct fee but add setup or
  tester friction.
- Estimated pilot total with option A: about **US$40 per month** plus any domain. Set a spend limit / usage alerts
  in Vercel's billing settings.

## Caching and updates
- Pages are static. Vercel's CDN serves them and invalidates them on every deployment; browsers revalidate HTML.
- `/manifest.webmanifest`: `max-age=0, must-revalidate`. `/icons/*`: one day. Next.js's hashed assets are immutable.
- **No service worker** is installed, so no stale app shell, no cached records, reports or backup files. The app
  needs a connection to load; offline use is not supported in the pilot.

## Security notes
- Headers are defined in `src/lib/security-headers.ts` and applied to every route in `next.config.ts`.
- CSP allows only this origin, plus `'unsafe-inline'` scripts/styles (required by Next.js static pages without
  nonces) and `blob:`/`data:` for the PDF preview, downloads and logos. No third-party origins.
- Known dependency advisory: `uuid` < 11.1.1 via `exceljs` (moderate, GHSA-w5hq-g745-h8pq) — affects the v3/v5/v6
  `buf` argument; ExcelJS uses v4 only, so it is not reachable. The suggested "fix" downgrades ExcelJS (breaking).
  Re-check with `npm audit --omit=dev` before each release.
- No formal security audit or penetration test has been performed.
