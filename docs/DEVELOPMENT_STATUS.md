# Development status

**Milestone:** v0.7.0 — Technical Documentation System (stage 1 of dual documentation) — **complete**
**Branch:** `claude/fieldwise-architecture-setup-5ak87u` (latest commit: `git log -1`)

## Completed (v0.7.0)
- New section **Technical Docs** (`/tech-docs`): standalone site equipment registers, independent of service reports.
  - Registers: create, edit details (name, site, customer, address, site ref, technician, notes; created/updated
    dates), reopen, duplicate, delete with confirmation, multiple sites; stored locally (`fieldwise:techdocs:v1`).
  - Equipment: identification, hardware (incl. firmware, hardware revision), network, connectivity, access (ladder
    height, ladder type, mounting height kept separate), system references, maintenance, custom fields.
  - Category-aware form: relevant sections first/open, all fields always available, category change keeps values.
  - Fast entry: add by category, Save & add another, Save & duplicate, list Duplicate (clears name, asset ID, serial,
    IP, MAC, hostname, switch port, system numbers, maintenance notes), Enter → next field, Ctrl+Enter save, Esc
    cancel, phone Back closes form (Restore offered), delete with confirm + undo.
  - Register view: search (name, ref, location, make, model, IP, serial), category/status filters, desktop table /
    mobile cards, duplicate-IP note; tested with 120 entries.
  - Validation warnings only (IPv4/IPv6, mask/prefix, gateway subnet, DNS, VLAN, MAC, duplicate IP).
  - Excel: Equipment Register, Network Configuration, Access & Maintenance, Full Equipment Details, Site Information.
  - Sensitivity notices (list, export, workbook); no credential fields; no network data in service report exports.
- Shared `headerFooterText`, `absolutePrintAreas`, `finalizeXlsx` moved to `reports/xlsx-layout.ts` (re-exported).

## Latest validation
- Lint, typecheck clean. Tests 431 passed, 2 skipped (opt-in sample writers). Normal + demo builds OK.
- Visual QA: 5 sample registers (CCTV 12 cameras + NVR, intruder, access control, mixed, 120 entries) exported and
  rendered with LibreOffice; UI checked with Playwright at iPhone 13 and 1440 px (seeded registers, open, search,
  duplicate, warnings, Back, reload, export → reopened with ExcelJS; no overflow, no errors, no external requests).
  Refinements: one-row scrolling add bar on phones, wrapped desktop table cells, name/ref and make/model stacked.
- Not verified in Microsoft Excel itself (not available in this environment).

## Known limitations
- Technical Docs isn't in the 5-slot mobile bottom bar (sidebar, dashboard, search and a Reports link instead).
- Search matches the query as a phrase within one field (no multi-field AND search).
- The equipment form for IP cameras opens six sections, so it is long on phones (sections collapse).
- Sheets 1–3 print at roughly 60–70 % to fit all columns on one A4 landscape width.
- Network checks are syntax/consistency warnings only; they don't confirm a configuration works.

## Next (suggested)
- v0.8: Client Handover Documentation (customer-facing PDF built from a technical register).
- Optional: import/export register JSON for backup; CSV import of equipment lists.
