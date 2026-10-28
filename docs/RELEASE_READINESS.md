# Release readiness (v0.9.0)

Passing tests do not make Fieldwise production-ready. This is an honest assessment for a controlled pilot.

## Ready for controlled pilot
- **Onboarding:** first-run welcome (six tools, Get started / Explore the demo / Skip), remembered on the device,
  re-openable from Help. Help page covers tools, content labels, safety and privacy.
- **Demo site:** Riverside Business Centre (fictional) in a separate demo workspace — 8 cameras, NVR, switch,
  Integriti-type controller, keypad, 6 PIRs, 2 reeds, door controller, 4 readers, 2 strikes; two linked service
  reports with history. Documentation-range IPs (RFC 5737) and MACs (RFC 7042); no credentials or codes. Explicit
  enter / reset / exit; real records are never read, changed or copied. Backup/restore is off in the demo.
- **Workflows:** Device Library, EOL Wiring Assistant, Circuit Lab, Fault Finder, Technical Docs, Service Reports,
  client handover PDF, Excel exports, complete backup/restore — all exercised in browser QA on phone and desktop.
- **Navigation:** register → linked reports and new linked report; report → site register; report item →
  equipment record and history; device → EOL assistant; fault guide → Circuit Lab exercises.
- **Feedback:** local form; copy / download; email draft only when a recipient is configured; nothing sent
  automatically; warns about IPs, emails, phone numbers and codes in the text.
- **Privacy:** no analytics, telemetry or external requests (fonts are self-hosted); no `console.log` in app code.
- **Mobile:** no horizontal overflow on any route at 390 × 844, 844 × 390 or 1440 × 900; interactive targets ≥ 44 px.

## Requires further verification
- **All device records** are "Requires verification" — none has a named reviewer against a cited manufacturer
  document (`docs/VERIFICATION_BACKLOG.md`).
- **Integriti (2.2 kΩ / 4.4 kΩ) and Tecom (10 kΩ / 20 kΩ) EOL presets** are user-provided example values, labelled
  "Requires verification", not manufacturer specifications or defaults for any panel.
- **Fault Finder guides** are generic training examples with no technician review recorded
  (`docs/TECHNICAL_REVIEW.md`). An AI review is not verification.
- **Circuit Lab** terminals are generic and illustrative; detectors with built-in, link-selected EOL resistors are
  not modelled.
- PDF and Excel output checked visually with LibreOffice and pdftotext only — not in Microsoft Excel or on a range
  of printers.

## Not ready for production
- **Data durability:** records live only in browser storage on one device. No sync, no server backup, and storage
  is tied to the site's address. Backups are manual.
- **No accounts, access control or multi-user support**; no audit trail beyond local equipment history.
- **No independent security review**, penetration test or privacy assessment. No content security policy or other
  hardening headers are configured yet.
- **No error reporting or support channel** beyond manual feedback.
- **Verification workflow** is manual (edit content JSON with a named reviewer and source); there is no review tool.
- Browser support beyond current Chromium-based browsers and iOS Safari has not been tested.

## Hosting requirements for the pilot (not deployed)
- Build with `npm ci && npm run build`; serve with `npm start` (Node 20+) or any Next.js-capable host. All pages
  are static; there is no backend, database or API.
- **HTTPS** at **one stable address** for the whole pilot. Browser storage belongs to the exact origin — changing
  domain, subdomain or port means testers' records appear to vanish (they can restore from a backup file).
- Environment (build time): leave `FIELDWISE_DEMO_MODE` unset (it adds fictional library content for development).
  Optional `NEXT_PUBLIC_FEEDBACK_EMAIL` — a real inbox you control; never a placeholder.
- No third-party scripts, analytics or CDN fonts are required. If the host adds its own analytics or logging,
  disable it or tell testers.
- Recommended before any wider release: security headers (CSP, `X-Content-Type-Options`, `Referrer-Policy`),
  restricted access to the pilot URL, and a documented way to report a security issue.

## Validation for this release
See `docs/DEVELOPMENT_STATUS.md` → Latest validation.
