# Development status

**Milestone:** v0.6.1 — Professional Excel Export Redesign — **complete**
**Branch:** `claude/fieldwise-architecture-setup-5ak87u` (latest commit: `git log -1`)

## Completed (v0.6.1)
- Redesigned workbook (`src/lib/reports/excel.ts`, helpers in `xlsx-layout.ts`); in-app reporting UI unchanged.
  - Job Summary: SERVICE REPORT header (date/ref right), two-column details, horizontal status tiles, only filled
    narrative sections, keep-with-next page breaks, A4 portrait fit-to-width, "Generated with Fieldwise" + page numbers.
  - Equipment Register: header + meta line, 11 columns incl. Priority, frozen headings + item columns, filter,
    status/priority drop-downs, status colours via conditional formatting on status cells, A4 landscape 85 % with
    repeated heading row and Item/Equipment columns.
  - Outstanding Actions: register item numbers, filters, frozen headings, fit-to-width landscape, concise empty state.
  - Full Text sheet for over-long register cells; narrative split across rows; nothing truncated.
- Representative fixtures `tests/reports/fixtures.ts`; sample writer `tests/reports/samples.test.ts` (opt-in).

## Latest validation
- Lint, typecheck clean. Tests 365 passed, 1 skipped (opt-in sample writer). Normal + demo builds OK.
- Visual QA: five sample workbooks (short CCTV, intruder inspection, access faults, long text, 120 items) rendered
  with LibreOffice → PDF/PNG and inspected; fixes made (keep-with-next, print title columns, meta-line wrap, widths).
- Playwright (mobile + desktop): in-app Generate Excel downloads; reopened with ExcelJS — 3 sheets, correct rows,
  no formulas, injection text neutralised.
- Not verified in Microsoft Excel itself (not available in this environment).

## Known limitations
- Row heights are estimates; LibreOffice renders lines slightly shorter than Excel, leaving small gaps under long
  text. Excel re-fits a row when a cell is edited.
- When printed, the register's repeated A:B columns also repeat the merged meta line, which is clipped on
  continuation pages (cosmetic).
- Very long narratives split mid-paragraph show as separate blocks.

## Next (suggested)
- Optional company name/logo and sign-off block (only from details the user provides); photo references per item.
