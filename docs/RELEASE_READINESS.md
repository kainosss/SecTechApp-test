# Release readiness (v0.9.1)

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
- **Mobile:** no horizontal overflow on any route at 412 × 915, 390 × 844, 844 × 390 or 1440 × 900; interactive
  targets ≥ 44 px; form fields ≥ 16 px.
- **Web deployment prepared (v0.9.1, not deployed):** installable PWA (manifest, 192/512/maskable/Apple icons,
  standalone, no service worker); security headers and a self-only CSP on every route; noindex; safe error page;
  pilot notice; Vercel instructions, access-protection options and costs (`docs/WEB_DEPLOYMENT.md`), checklist
  (`docs/DEPLOYMENT_CHECKLIST.md`), tester guide (`docs/PILOT_TESTER_GUIDE.md`).

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
- **No independent security review**, penetration test or privacy assessment. Security headers and a CSP are in
  place, but the CSP allows inline scripts (Next.js static pages) and nothing has been tested by a third party.
- **Access control depends on the hosting platform** (Vercel Deployment Protection or similar); Fieldwise has no
  login of its own.
- **No error reporting or support channel** beyond manual feedback.
- **Verification workflow** is manual (edit content JSON with a named reviewer and source); there is no review tool.
- Browser support beyond current Chromium-based browsers and iOS Safari has not been tested.

## Requires live deployment (not yet verifiable)
- Access protection in front of every route, HTTPS, headers on the real host.
- Installing on real Android and iPhone devices (including behind password protection), standalone launch.
- Downloads, file-picker restore and clipboard on real phones; iPhone storage behaviour over several days.
- iPhone checks so far were Chromium emulation (WebKit was not available locally).

## Hosting
See `docs/WEB_DEPLOYMENT.md` (Vercel Pro + Password Protection recommended; Hobby is non-commercial only) and
`docs/DEPLOYMENT_CHECKLIST.md`. Nothing has been deployed.

## Validation for this release
See `docs/DEVELOPMENT_STATUS.md` → Latest validation.
