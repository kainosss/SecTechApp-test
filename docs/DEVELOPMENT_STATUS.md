# Development status

**Milestone:** v0.7.1 — Site integration, equipment history & data backup — **complete**
**Branch:** `claude/fieldwise-architecture-setup-5ak87u` (latest commit: `git log -1`)

## Completed (v0.7.1)
- **Site-linked service reports:** optional "Site register" card in the report editor; links fill empty site name,
  customer and address; differing values need "Link and replace" (or keep). Link persists (`report.registerId`).
  Unlink (confirmed) keeps items and removes the job's service history entries. Standalone reports unchanged.
- **Equipment picker:** search (name, ref, location, make, model, IP), multi-select, "select all shown", already-added
  entries disabled ("In report"); duplicate-safe at the data layer; manual items still allowed.
- **Master records:** register stays the source of truth; report items keep a reference + snapshot (no network
  data). Card shows "Site equipment details", notes where the site record has since changed, then "Service findings".
- **Proposed equipment updates:** enter new values → review original vs proposed with per-field ticks → apply only
  ticked fields (checked against the reviewed original). Applied changes listed on the item.
- **Equipment history:** added / service inspection / fault / repair / replacement / firmware / details events with
  report link, date, technician and previous → new values; derived service events have fixed ids (no duplicates on
  reopen or export). Shown in the equipment form (newest first) and as an "Equipment History" workbook sheet.
- **Backup & restore** in Technical Docs: versioned JSON (registers, equipment, custom fields, history, linked
  reports); validation, preview, merge or confirmed replace, copies for id collisions, atomic commit with rollback.

## Latest validation
- Lint, typecheck clean. Tests 479 passed, 2 skipped (opt-in sample writers). Normal + demo builds OK.
- Playwright (iPhone 13 + 1440 px): v0.7.0-format stored data loads; link → pick 3 → fault + outcome → propose and
  apply firmware → Excel (no IP addresses) → history visible in Technical Docs → backup download → restore preview
  (all skipped, no duplicates). No horizontal overflow, console errors or external requests.
- Excel outputs not verified in Microsoft Excel itself (not available here).

## Known limitations
- History sync from a report is debounced (~0.4 s); closing the tab within that window can miss the last edit (it
  is re-synced next time the report is opened).
- Applying an update and editing the same register in another browser tab at the same time can overwrite one
  another (single-tab use assumed; local storage only).
- Equipment IDs are unique within a register; links always pair register + equipment id.
- Restore merges whole registers (no per-entry merge inside a register; a changed register is imported as a copy).
- Deleting a report keeps its history events (history records what happened).

## Next (suggested)
- v0.8: Client Handover Documentation (customer-facing PDF from a register and its history).
