# Development status

**Milestone:** v0.6.0 — Quick Service Report & Excel Generator — **complete**
**Branch:** `claude/fieldwise-architecture-setup-5ak87u` (latest commit: `git log -1`)

## Completed (v0.6.0)
- `/reports`: start a report by job type (CCTV / Intruder Alarm / Access Control / General Security), resume,
  duplicate, delete (with undo), re-export, clear all (with confirm); storage-is-device-only warning.
- Editor: job details (date auto-filled, technician remembered), quick-add equipment presets per job type,
  custom types, 4-button status, findings, collapsible extra fields, add another / duplicate / reorder /
  remove with undo, live status counts, summary with "fill empty sections from equipment" (entered text only),
  non-blocking warnings, autosave with a "Saved on this device" indicator, sticky Generate Excel.
- `src/lib/reports/`: schema (zod), pure operations, local store (per-report validation), ExcelJS workbook
  (Job Summary, Equipment Register, Outstanding Actions), on-demand loading, download helper.
- Navigation: Reports in the bottom bar; Lab moved to sidebar/dashboard only (`mobile: false`); tool card + search.

## Latest validation
- Lint, typecheck clean. Tests 348/348 (39 files), including reopening generated XLSX files. Normal + demo builds OK.
- Playwright (iPhone 13 touch, 1440 desktop): create report, add 3 items, reload restores, Generate Excel
  downloads a real .xlsx; reopened with ExcelJS: 3 sheets, correct rows, formula text neutralised, no formulas,
  no external network requests, no console errors, no horizontal overflow. Rendered via LibreOffice for a visual check.

## Known limitations
- Drafts live in this browser only (no sync/backup) — by design for this milestone.
- Row heights are estimated (Excel doesn't auto-fit rows written by a library); very long notes may need resizing.
- No company logo or sign-off/signature block in the workbook yet.
- `npm audit`: moderate advisory in `uuid` via ExcelJS (unused code path); see ARCHITECTURE.md.

## Next (suggested)
- Company details/logo on the workbook, photo references per item, and optional PDF export; later, cloud sync
  with accounts (Supabase) once storage and privacy requirements are agreed.
