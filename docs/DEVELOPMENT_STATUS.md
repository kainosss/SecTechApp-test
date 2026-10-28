# Development status

**Milestone:** v0.8.0 — Professional client handover generator — **complete**
**Branch:** `claude/fieldwise-architecture-setup-5ak87u` (latest commit: `git log -1`)

## Completed (v0.8.0)
- **Client handover PDF** from any service report (linked or standalone): "Client handover PDF" button beside
  Generate Excel → choose sections → optional branding → live preview → Download / Open PDF.
- **Document:** "SECURITY SERVICE REPORT" + job type, report date, job reference; numbered sections — site & customer
  details, inspection overview (5 KPI tiles from the entries + factual summary), work completed, identified defects
  (Fault items only; finding, work, entered priority), recommendations, equipment inspection schedule, additional
  information (outstanding work, parts, site notes). Empty sections omitted. Footer: job ref · Generated with
  Fieldwise · Page n of N; running header from page 2. No signatures, approvals or compliance statements.
- **Sensitive data:** only client-facing report fields; no network settings, item notes, register details,
  snapshots (serial/firmware/asset ID) or equipment history.
- **Layout engine** (`src/lib/handover/layout.ts`): wrapping, keep-with-next headings, tables starting with ≥3 rows,
  repeated table headers, row splitting only when taller than a page, panels across pages.
- **Preview = PDF:** one generation produces the page model (drawn as SVG with the PDF font) and the PDF bytes.
- **Branding:** optional company name, phone, email, address, ABN, accent colour, PNG/JPEG logo (signature-checked,
  ≤512 KB, aspect kept, transparency kept); stored locally; unbranded by default.
- jsPDF 4.2.1 (exact) added; Carlito fonts (SIL OFL 1.1) bundled in `public/fonts/` with licence.

## Latest validation
- Lint, typecheck clean. Tests 503 passed, 3 skipped (opt-in sample writers). Normal + demo builds OK.
- Visual QA (3 passes, PDFs rendered with poppler `pdftoppm` and inspected): short CCTV, CCTV faults, intruder,
  access, long narrative, 120-item schedule, minimal, branded (sample logo), unbranded. Fixes: status column width,
  keep-with-next for tall first rows, running header keeps job ref, no repeated fault findings, header spacing,
  no single-row table openings.
- Playwright (iPhone 13 + 1440 px): preview in < 1 s, branding + logo upload, download → `pdfinfo`/`pdftotext`
  (page count matches preview, branding present, internal notes absent), back to editor; no overflow, console
  errors or external requests.

## Known limitations
- The PDF font (Carlito) has no glyphs for symbols such as ✓, emoji or CJK; these appear as "?" and are listed in
  the preview so the technician can edit the text.
- Branding is per device (not included in Technical Docs backups).
- The embedded logo is stored as base64 in browser storage (limited to 512 KB).
- Not verified in Adobe Acrobat; checked with poppler and Chromium.

## Next (suggested)
- Optional sign-off block with a technician-entered name (never auto-generated); photos per item.
