# Development status

**Milestone:** v0.8.1 — Reliability, backup & workflow improvements — **complete**
**Branch:** `claude/fieldwise-architecture-setup-5ak87u` (latest commit: `git log -1`)

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
- Lint, typecheck clean. Tests 535 passed, 3 skipped (opt-in sample writers). Normal + demo builds OK.
- Playwright (iPhone 13 + 1440 px), full workflow: Quick Entry register with 3 cameras → reopen → linked job → fault
  + firmware update → client PDF (symbols extracted with pdftotext, emoji warned + acknowledgement) → technical Excel
  → complete backup → restore into a fresh browser profile (registers, reports, history, links). No console errors,
  no external requests.
- Visual: technical workbooks rendered with LibreOffice (register/network/access sheets at 90 % over two page
  widths with repeated columns); handover PDF samples unchanged in page count. Microsoft Excel not available.

## Known limitations
- Characters outside Carlito + Fieldwise Symbols (emoji, CJK, many scripts) still print as "?" (with warning).
- Branding conflicts are resolved as a whole (no per-field merge).
- Wide technical sheets now span two page widths when printed (more pages, larger text).
- Backup reminder state is per device/browser.

## Next (suggested)
- Optional sign-off block with technician-entered name; photos per equipment entry.
