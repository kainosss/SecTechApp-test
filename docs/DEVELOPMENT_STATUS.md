# Development status

**Milestone:** v0.9.1 — Web deployment & PWA pilot readiness — **complete, not deployed** (awaiting approval and
hosting configuration; not production)
**Branch:** `claude/fieldwise-architecture-setup-5ak87u` (latest commit: `git log -1`)
Pilot guide: `docs/PILOT_TESTING.md`. Readiness assessment: `docs/RELEASE_READINESS.md`. Deployment:
`docs/WEB_DEPLOYMENT.md`, `docs/DEPLOYMENT_CHECKLIST.md`. Share with testers: `docs/PILOT_TESTER_GUIDE.md`.

## Completed (v0.9.1)
- **PWA:** manifest at `/manifest.webmanifest` (static route from `src/lib/pwa-manifest.ts`, linked with
  `crossorigin="use-credentials"` so it loads behind password protection); icons in `public/icons` rendered from the
  logo mark by `scripts/generate-icons.mjs` (192, 512, maskable 512, Apple 180, favicon, SVG); Apple web-app meta
  (opaque status bar); landscape safe-area padding. **No service worker** (no stale caches, nothing cached; no
  offline claim). Help → Install on your phone.
- **Security:** `src/lib/security-headers.ts` applied to all routes in `next.config.ts` — CSP (self only;
  `unsafe-eval` and ws only in dev), nosniff, no-referrer, DENY framing, Permissions-Policy, COOP, HSTS, X-Robots-Tag;
  `robots.txt` disallow; noindex meta; no browser source maps; safe `error.tsx`. `.env.example` lists only
  non-secret build variables. `npm audit`: `uuid` via exceljs (moderate, not reachable — v4 only).
- **Pilot notice:** Help "Pilot notice" section; dashboard/device-list notice now reads "Pilot." and links to it;
  storage notes (no cross-device sync, iPhone home-screen vs Safari storage, Safari eviction).
- **Mobile:** feedback fields 16 px (no iPhone zoom on focus).
- **Deployment prep:** `engines.node >= 20.9.0`; Vercel guide, access options and costs; checklist; tester guide.
- Tests: `tests/deploy/` (manifest, icons, metadata, robots, headers, config, env, routes, pilot notice, reload
  persistence).

## Completed (v0.9.0)
- **Welcome:** first-run card on the dashboard (six tools in plain language, Get started / Explore the demo site /
  How each tool works / Skip); `fieldwise:onboarding:v1` per device; Help → "Show the welcome again".
- **Help (`/help`):** tool guide (`src/lib/guide.ts`), content-label legend, safety, data & privacy, demo, version.
  Help icon in the mobile top bar; Help and Feedback in the sidebar.
- **Demo workspace:** `src/lib/workspace.ts` (`scopedKey` → `fieldwise:demo:…` while active: registers, reports, technician, branding,
  backup meta), `src/lib/demo/seed.ts`
  (Riverside Business Centre, fictional; RFC 5737 IPs, RFC 7042 MACs; 2 linked reports + history),
  `src/lib/demo/workspace.ts` (enter / reset / exit; seeds through the normal stores only after the switch is
  stored). Banner on every page with Reset (confirm) and Exit. Backup/restore and the reminder are off in the demo.
- **Feedback (`/feedback`):** `src/lib/feedback.ts` + form; 5 types, optional fields, severity, version; copy /
  download; email draft only if `NEXT_PUBLIC_FEEDBACK_EMAIL` is a valid address; sensitive-detail warning; nothing
  stored or sent.
- **Navigation:** register → "Service reports for this site" (list + new linked report); report → "View site
  register"; report item → "Open equipment record and service history"; existing device → EOL and fault guide →
  Circuit Lab links (tested to point at real exercises).
- **Verification labels:** "Requires verification" replaces "Needs verification"; Fault Finder "generic" reads
  "Generic training example — not manufacturer verified"; EOL explorer shows the resistor values' status
  (`src/lib/verification.ts`: generic / requires verification / technician-configured). Note on built-in,
  link-selected EOL resistors vs terminals. Nothing promoted.
- **Mobile:** all interactive targets ≥ 44 px (chips, summaries, row actions, back links); 10 px labels → 11 px;
  no horizontal overflow at 390 × 844, 844 × 390, 1440 × 900.
- **Version:** 0.9.0 (`NEXT_PUBLIC_APP_VERSION` from package.json via `next.config.ts`; `APP_VERSION` in config).

## Completed (v0.8.1)
- **Complete backup & restore (v2):** registers (equipment, custom fields, history), all service reports with
  equipment links, company branding and logo. v0.7.1 backups still import. Preview states whether the file holds
  reports and branding; merge / replace; branding conflict → keep or import (choice); replace needs confirmation
  listing what is removed; id collisions → copies; registers + reports + branding rolled back together on failure.
  Logos re-validated by signature. Panel available on both Technical Docs and Reports.
- **Backup reminder:** last backup date shown; reminder appears only when there are changes since a backup that is
  ≥ 7 days old (or none), snoozable for a week; dates only, no telemetry.
- **PDF characters:** symbol fallback font (DejaVu Sans subset, renamed "Fieldwise Symbols", ~224 KB per weight,
  loaded only when needed) for ✓ ✗ ☐ ☑ ⚠ → ≤ ≥ ≈ ± ° ℃ Ω ⌀ ∞ ½, Greek, Cyrillic, etc. Embedded and subset,
  extractable text, preview uses the same font runs. Emoji/CJK and other uncovered characters are listed with
  their location and require acknowledgement before download ("?" in the PDF). PDF layout unchanged.
- **History integrity:** deleted reports' events kept and marked (no broken links; undo restores); missing source
  reports labelled; duplicated linked reports start with blank results; removed equipment labelled in Excel.
- **Quick Entry:** category-specific quick fields (IP camera, NVR, network, panels, detectors, access readers and
  controllers, power, other), remaining fields in sections, mode remembered, values kept when switching,
  Ctrl+Shift+Enter save & add another.
- **Technical Excel printing:** wide sheets print at 90 % across page widths with ID columns, heading row and a
  page header repeated (was ~60–70 % squeezed onto one width); narrower sheets fit to width.

## Latest validation
- See the v0.9.1 commit: lint and typecheck clean; full test suite; normal + demo builds.
- Local production build (`next start`), Chromium: headers verified with curl; installability via DevTools protocol
  (no errors, Android + desktop emulation); route sweep at 412 × 915, 390 × 844, 844 × 390, 1440 × 900 (no overflow,
  no small targets, no console/CSP errors, no external requests); demo workflow with PDF + Excel under the CSP;
  persistence across reload and browser restart; backup → restore into a fresh profile.
- Not tested: real phones, WebKit/Safari, the deployed host, access protection.

## Known limitations
- Demo workspace and onboarding state are per browser/device. The Quick Entry mode preference is shared between
  the demo and real workspaces; every record store and the technician profile are workspace-scoped.
- All technical content still requires verification (see `docs/RELEASE_READINESS.md`).
- Characters outside Carlito + Fieldwise Symbols (emoji, CJK, many scripts) still print as "?" (with warning).
- Branding conflicts are resolved as a whole (no per-field merge).
- Wide technical sheets now span two page widths when printed (more pages, larger text).
- Backup reminder state is per device/browser.

## Next (suggested)
- Owner: approve deployment; follow `docs/WEB_DEPLOYMENT.md`; tick `docs/DEPLOYMENT_CHECKLIST.md` live items.
- Run the pilot (`docs/PILOT_TESTING.md`); triage feedback; technician review of Fault Finder guides and EOL presets.
- Security headers / restricted pilot URL before any wider release.
- Optional sign-off block with technician-entered name; photos per equipment entry.
