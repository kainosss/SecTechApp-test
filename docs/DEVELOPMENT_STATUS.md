# Development status

**Milestone:** v0.6.2 — Premium Corporate Inspection Report Redesign — **complete**
**Branch:** `claude/fieldwise-architecture-setup-5ak87u` (latest commit: `git log -1`)

## Completed (v0.6.2)
- Workbook redesigned as a corporate inspection report (`src/lib/reports/excel.ts`); in-app reporting UI and the
  Generate Excel workflow unchanged. Palette navy/blue/greys, Calibri type scale, muted status colours.
  - Job Summary: SERVICE REPORT + job-type subtitle, date/ref right; numbered sections — report identification panel,
    five KPI tiles, factual inspection summary, work completed, identified defects table (restrained wording when
    none), recommendations & follow-up action table (entered priorities only) + outstanding work, additional
    information. Empty sections omitted; auto-fill narrative not duplicated beside its table.
  - Equipment Register: all 11 fields on one A4 landscape page width (≈ 80 %), table at row 6, frozen headings +
    No./Equipment, filter, status/priority drop-downs, status + priority conditional formatting, page header on
    every printed page (fixes the clipped meta line on continuation pages).
  - Outstanding Actions: corrective-action schedule (No., equipment, location, finding, action, priority, status).
  - Full Text: only when needed; ref / register No. / equipment / field / part.
  - `finalizeXlsx` (jszip, exact dep) makes print areas fully absolute so LibreOffice honours them.
- Fixtures: added `cctvFaults`, `emptyReport`; workbook tests rewritten for the new layout (reopen real XLSX).

## Latest validation
- Lint, typecheck clean. Tests 375 passed, 1 skipped (opt-in sample writer). Normal + demo builds OK.
- Visual QA (three passes, LibreOffice → PDF/PNG): 7 samples (short CCTV, CCTV faults, intruder, access, long text,
  120 items, empty). Fixes: tighter vertical rhythm (no near-empty spill page), label spacing beside long values,
  absolute print areas, one-page-wide register, status-line wording.
- Playwright (mobile + desktop): in-app Generate Excel downloads; reopened with ExcelJS — correct rows at the new
  positions, absolute print areas, no formulas, injection text neutralised, no external requests.
- Not verified in Microsoft Excel itself (not available in this environment).

## Known limitations
- Row heights are estimates; LibreOffice draws lines slightly shorter than Excel, leaving small gaps under long or
  split text. Excel re-fits a row when a cell is edited.
- The register prints at ≈ 80 % to keep every column on one page width.
- ExcelJS reads half-point font sizes back as integers (the file itself stores 10.5 etc. correctly).

## Next (suggested)
- Optional company name/logo and sign-off block (only from details the user provides); photo references per item.
