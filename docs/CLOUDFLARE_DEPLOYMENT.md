# Cloudflare deployment (pilot) — Pages + Access

Status: **prepared, not deployed.** No Cloudflare account, project, Access application or domain has been created.
Every step below is done by the project owner. This is the chosen platform for the pilot; the Vercel route in
`docs/WEB_DEPLOYMENT.md` remains a documented alternative.

> Plans, limits and dashboard menu names change. developers.cloudflare.com could not be opened from the session
> that wrote this; facts below come from search results quoting Cloudflare's documentation (Oct 2026) and from
> local testing with Cloudflare's own `wrangler pages dev`. Confirm limits and the free-plan terms in the
> Cloudflare dashboard before relying on them.

## Architecture (assessed for v0.9.2)
- **Fully static.** `npm run build:cloudflare` runs `next build` with `output: "export"` and writes plain files to
  `out/`: 11 static pages, every dynamic page listed by `generateStaticParams` (16 devices, 6 EOL circuits, 5 fault
  guides, 5 Circuit Lab faults), `404.html`, `robots.txt`, `manifest.webmanifest`, icons, PDF fonts and `_next/` assets
  (~300 files, ~11 MB; largest file 0.7 MB).
- **No server code.** No API routes, middleware, cookies, `next/image` or request-time rendering. Records live in each
  tester's browser (`localStorage`); PDF and Excel files are generated in the browser and downloaded as `blob:` URLs.
- **Deep links** use query strings on static pages (`/reports?id=…`, `/tech-docs?id=…&item=…`, `/eol?t=…`), so a
  refresh loads the same file and the client restores the view.
- **Headers:** static hosting ignores `next.config` headers, so the build writes `out/_headers` from the same source
  (`src/lib/security-headers.ts`). Locally verified with `wrangler pages dev`.
- **The normal build is unchanged** (`npm run build` / `npm start`, Vercel-compatible, headers from `next.config`).
- **Compatibility fixes made for export:** `robots.ts` marked static; `/fault-finder/[id]` (workflow records — all
  demo-only, so there are none in production) now renders the standard "not found" page at `/fault-finder/none`
  instead of having zero pages, which static export rejects. The route behaves as before (404 content).
- **Not supported by static export** (none used): server actions, API routes with request data, ISR/revalidation,
  image optimisation, middleware, rewrites/redirects in `next.config`.

## Locally verified with `wrangler pages dev out` (Cloudflare's Pages simulator)
- Every route returns 200 by direct URL; `/help.html` → 308 `/help`; `/devices/` → 308 `/devices`; unknown paths
  → 404 with the Fieldwise "Page not found" page.
- `_headers` applied: CSP, nosniff, no-referrer, DENY, Permissions-Policy, COOP, HSTS, X-Robots-Tag; cache rules for
  the manifest (revalidate), icons (1 day) and `_next/static` (immutable).
- `manifest.webmanifest` served as `application/manifest+json`; Chromium reports no installability errors.
- Full workflow (welcome, demo, register, equipment history, linked report, client PDF, Excel exports, reset/exit,
  Help, Feedback), persistence across reload and browser restart, backup → restore in a fresh profile: no console
  errors, no CSP violations, no external requests. Android/iPhone sizes are Chromium emulation.
- **Not verifiable locally:** Cloudflare Access, real HTTPS, the live edge's header handling, real phones.

## Costs (verify in the dashboard)
| Item | Expected cost | Notes |
|---|---|---|
| Cloudflare Pages (Free) | US$0 | Reported limits: 500 builds/month, 1 build at a time, 20-minute build timeout, 20,000 files per site, 25 MiB per file, 100 custom domains per project. Fieldwise is far inside them. |
| Cloudflare Access / Zero Trust (Free) | US$0 | Reported: up to 50 users. One-time PIN login needs no identity provider. Cloudflare may ask for payment details when creating the Zero Trust organisation even on the free plan. |
| `*.pages.dev` address | US$0 | Stable for the life of the project. |
| Custom domain (optional) | Registrar fee | Not needed for the pilot. |

## 1. Prepare the branch (needs your approval)
The `pilot` branch currently points to `c5e6496` (v0.9.1), which has **no** `build:cloudflare` script. Before
connecting Cloudflare, fast-forward `pilot` to the approved v0.9.2 commit (see `docs/DEVELOPMENT_STATUS.md`), e.g.
`git push origin <v0.9.2-commit>:refs/heads/pilot` (a fast-forward; never force-push).

## 2. Create the Pages project
1. Cloudflare dashboard → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**.
2. Authorise the Cloudflare GitHub app for the repository `kainosss/SecTechApp-test` only.
3. **Production branch:** `pilot`.
4. Build settings:

| Setting | Value |
|---|---|
| Framework preset | None (the command below does everything) |
| Build command | `npm run build:cloudflare` |
| Build output directory | `out` |
| Root directory | `/` (repository root) |
| Environment variable | `NODE_VERSION` = `22` (also pinned in `.node-version`) |

5. **Preview deployments:** set to *None* (Settings → Builds → Branch control → production branch only), or keep
   them and protect them with Access (step 4 covers `*.<project>.pages.dev`). Unprotected previews would be a way
   around Access.
6. Save and deploy. The build fails loudly if any route, icon, font or `_headers` is missing from `out/`.

## 3. Environment variables (Pages → Settings → Variables)
- `NODE_VERSION=22` (build).
- `FIELDWISE_DEMO_MODE` — **leave unset** (development content). The in-app demo site works without it.
- `NEXT_PUBLIC_FEEDBACK_EMAIL` — optional, a real inbox you control (public by design).
- No secrets are needed. Values are baked in at build time — redeploy after changing them.

## 4. Cloudflare Access (invited technicians, emailed one-time codes)
1. Dashboard → **Zero Trust** → create the organisation (choose a team name; this becomes
   `<team>.cloudflareaccess.com`) and select the **Free** plan.
2. **Settings → Authentication → Login methods:** make sure **One-time PIN** is enabled.
3. **Access → Applications → Add an application → Self-hosted.**
   - Name: `Fieldwise pilot`.
   - Application domains — add **both**: `<project>.pages.dev` and `*.<project>.pages.dev` (previews and
     per-deployment URLs). If you add a custom domain later, add it too.
   - Session duration: e.g. **1 week** (technicians re-enter a code weekly; shorter is safer, longer is more
     convenient).
   - Identity providers: One-time PIN only. Optionally enable "instant auth" so testers go straight to the email
     prompt.
4. **Policy:** name `Invited technicians`, action **Allow**, include **Emails** → list each tester's address (3–5).
   Do not use "Everyone" or email-domain rules for public mail domains.
5. Save. Access is enforced at Cloudflare's edge before any Fieldwise file is served, so direct URLs, refreshes and
   static assets are all covered. Fieldwise has no login of its own.
6. Testers who are not on the list receive no code. Codes expire after about 10 minutes.

### PWA install behind Access
- The manifest is linked with `crossorigin="use-credentials"`, so it is requested with the Access cookie.
- If installation fails on a phone because the manifest or icons are blocked, add a second Access application for
  `<project>.pages.dev/manifest.webmanifest` and `<project>.pages.dev/icons/*` with a **Bypass** policy. Those files
  contain only the app name, colours and logo. Do not bypass anything else.
- On iPhone, a home-screen app keeps its own storage and cookies: testers sign in once more inside the installed
  app, and records saved in Safari do not appear there (move them with a backup file).

## 5. Custom domain (optional)
Pages → **Custom domains** → add e.g. `pilot.<your-domain>`. Add the same hostname to the Access application
**before** sharing it. Choose the final address before testers start — browser storage belongs to the exact
hostname, so changing it later makes records appear to vanish (restorable from a backup file).

## 6. Post-deployment smoke tests (live)
1. Private window → `https://<project>.pages.dev/` → Cloudflare Access email prompt appears (not Fieldwise).
   Repeat for `/tech-docs`, `/manifest.webmanifest`, a preview URL `https://<hash>.<project>.pages.dev/`.
2. Enter an invited email → code arrives → dashboard loads over HTTPS. A non-invited email gets no code.
3. Dev tools → Network → document response: CSP, `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`,
   `Permissions-Policy`, `Strict-Transport-Security`, `X-Robots-Tag`.
4. No console errors on each tool; Help shows the expected version.
5. Demo → report → client PDF preview + download → Excel → Exit demo.
6. Fictional register survives reload and browser restart; backup → restore in another browser.
7. Install: Android Chrome (menu → Install app) and iPhone Safari (Share → Add to Home Screen); launch from the
   icon, sign in if asked, confirm standalone window, icon and name.
8. Refresh on a deep link (`/tech-docs?id=…`) and an unknown URL (404 page).
Record the results in `docs/DEPLOYMENT_CHECKLIST.md`.

## 7. Roll back
Pages → project → **Deployments** → pick the last good production deployment → **Rollback to this deployment**.
Immediate; testers' records are unaffected (they live in browsers) and there is no service worker, so the next page
load gets the rolled-back files. Then fix or revert the commit on `pilot` so the next push doesn't redeploy it.

## 8. Ending the pilot
Delete the Access application's tester emails (or the application), then pause or delete the Pages project. Tell
testers to download a backup first if they want to keep their fictional records.
