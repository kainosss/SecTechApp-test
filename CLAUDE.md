# Fieldwise — Claude Code guide

Mobile-first reference and learning app for Australian electronic security technicians.
Resume work from `docs/DEVELOPMENT_STATUS.md`. Architecture detail: `docs/ARCHITECTURE.md`.

## Stack
Next.js 16 App Router (static pages), React 19, TypeScript 6 (pinned for typescript-eslint),
Tailwind v4 (tokens in `src/app/globals.css`: ink-*, signal-*, fg, line, verified, unverified, example, fault),
Zod 4, Vitest + Testing Library (jsdom), ESLint 9 (eslint-config-next). No backend yet (Supabase/Stripe later).

## Routes
- `/` dashboard · `/search` · `/devices`, `/devices/[id]` Device Library
- `/eol` EOL Wiring Assistant (explorer; URL state `?t=<template>&p=<preset>`), `/eol/[id]`
- `/fault-finder` guided fault finder · `/fault-finder/diagnose/[id]` diagnosis · `/fault-finder/[id]` workflow records
- `/circuit-lab` exercise picker · `/circuit-lab/wiring-bench` build exercise · `/circuit-lab/faults/[id]` fault exercises
- `/reports` Quick Service Report (list, or editor with `?id=`; `&view=handover` client handover PDF)
- `/tech-docs` Technical Docs: site equipment registers (list; `?id=` register; `&item=` equipment form)
- Navigation: `src/lib/navigation.ts` (NAV_ITEMS — `mobile: false` keeps an item off the 5-slot bottom bar; TOOLS → search index)

## Content
- JSON in `/content` (+ `/content/demo`, shown only when `FIELDWISE_DEMO_MODE=true`, except generic circuits).
- Manifest auto-generated (`scripts/generate-content-manifest.mjs`, runs pre dev/build/test).
- Read via async `src/lib/content/repository.ts`. Status from `verification.ts` (fail-safe).
- Never fabricate manufacturer data, URLs, terminal assignments or readings. Unverified content is labelled.

## Circuit engines (electrical accuracy is critical)
- `src/lib/eol/engine.ts`: authored series/parallel trees → `stateResistance`, `formatOhms`, `resistorCode`.
- `src/lib/eol/netlist.ts`: arbitrary graphs (wires/resistors/switches); union-find for 0 Ω + nodal analysis.
  `resistanceBetween(elements, a, b)` → `{ok, ohms}` (Infinity = open) or `{ok:false, reason}` — never invent a value.
- `src/lib/lab/bench.ts`: terminals, tray, undoable reducer, `circuitNetlist(components, contacts)`, `zoneNetlist`.
- `src/lib/lab/check.ts`: `checkWiring` (5 states, behaviour-based findings), `stepStatus`.
- `src/lib/lab/meter.ts`: virtual multimeter (resistance between probe nodes, de-energised only).
- `src/lib/lab/faults.ts`: scenarios (hidden elements, broken conductors) + diagnosis checked against the circuit.
- `src/lib/fault-finder/`: diagnostic engine (`engine.ts`, replayed answer lists), zod `schema.ts`, `sessions.ts`;
  workflows in `content/diagnostics/*.json` (generic guidance; `validateWorkflow` checks structure). Zone readings
  are classified against bands calculated by `fault-finder/eol.ts` (EOL engine), never fixed values. Never set
  `verification.status` beyond "generic" without a real source or a named technician review (see
  `docs/TECHNICAL_REVIEW.md`); an AI review is not verification.
- `src/lib/reports/`: report schema (zod), pure edits/derivations (`report.ts`, never invents content), local
  drafts (`store.ts`), ExcelJS workbook (`excel.ts` + `xlsx-layout.ts`; loaded on demand; `finalizeXlsx` (jszip) fixes print areas; all user text through
  `safeText`; no formulas; long text split across rows / Full Text sheet, never truncated). Visual QA: write samples with
  `FIELDWISE_SAMPLE_DIR=<dir> npx vitest run tests/reports/samples.test.ts`, render with `soffice --headless --convert-to pdf`.
- `src/lib/techdocs/`: standalone technical registers — zod `schema.ts` (no credential fields), shared `fields.ts`
  (sections, category priority), `register.ts` (edits, duplicate clears unique IDs, search/filters), `validation.ts`
  (network warnings only — never rewrite values), `store.ts` (`fieldwise:techdocs:v1`), `excel.ts` (5 plain sheets).
  Ladder height/type and mounting height are separate free text; never infer one or assess ladder suitability.
  Never assign IPs or other configuration automatically. Network data stays out of service report exports.
  `history.ts` (factual equipment events; `saveWithHistory`), `backup.ts` (complete v2 backup: registers, all reports,
  branding + logo; v1 still imported; validate → preview → merge/replace, branding conflict = user choice, never
  overwrite silently; `commitImport` rolls back registers, reports and branding together). Quick Entry fields per
  category in `fields.ts` (`QUICK_FIELDS`). Wide sheets print at 90 % with repeated ID columns (never shrink < 85 %).
- `src/lib/backup/`: `meta.ts` (last-backup date + snooze only, no data copies), `download.ts` (complete backup file).
- `src/lib/sites/link.ts`: report ↔ register link (`report.registerId`, `item.source` with snapshot — no network data),
  picker duplicate prevention, `syncReportHistory` (fixed event ids, no duplicates), `applyEquipmentUpdate` (only
  confirmed fields, checked against reviewed originals). Never update master records without explicit confirmation.
  Deleted reports: history kept, `sourceDeletedAt` set (no links); duplicating a linked report blanks service results.
- `src/lib/handover/`: client handover PDF — `content.ts` (client-facing document model only; never network data, item
  notes, register details or history; no compliance claims), `layout.ts` (page model; wrap, keep-with-next, repeated
  table headers), `pdf.ts` (jsPDF + Carlito, symbol fallback "Fieldwise Symbols" loaded only when needed; text ops carry
  font `runs`; unsupported characters listed with locations and need acknowledgement — never silently replaced;
  one generation for preview + download),
  `branding.ts` (optional, `fieldwise:branding:v1`, logo checked by signature/size). Visual QA: write samples with
  `FIELDWISE_SAMPLE_DIR=<dir> npx vitest run tests/handover/samples.test.ts`, render with `pdftoppm`.
- `src/lib/lab/layout.ts`: bench drawing layout (routing, label collision avoidance). `progress.ts`: saved progress (zod).
- Rules: validate by electrical behaviour, never by visual pattern; equivalent circuits must pass; "correct"
  only when every state is validated; generic/illustrative terminals only; resistance is only measured on the
  simulated de-energised circuit, never across supply terminals.

## Conventions
- Pure logic in `src/lib/**` with unit tests in `tests/**` mirroring the path; UI in `src/components/**`.
- Client components only where interactive. Wrap every `localStorage` access in try/catch.
- Accessibility: ≥44 px targets, visible focus, keyboard support, never colour alone; respect reduced motion.
- No heavy dependencies. Match surrounding code style and comment density.

## Commands
- `npm run dev` · `npm run dev:demo`
- `npm run lint` · `npm run typecheck` · `npm test` · `npx vitest run <path>` · `npm run build`
- Browser QA: Playwright is pre-installed (`require('playwright')`); run `npx next start -p 3100` after build.
  Stop the server with `ps aux | grep next-server | grep -v grep | awk '{print $2}' | xargs -r kill` (not `pkill -f`).

## Working style
- Token-efficient: targeted searches, no full-file dumps, minimal commentary, short summaries.
- Focused tests while developing; full lint + typecheck + tests + build before committing.
- Never edit tests to hide a real defect. Keep `docs/DEVELOPMENT_STATUS.md` current.

## Git & safety
- Branch: `claude/fieldwise-architecture-setup-5ak87u`; push with `git push -u origin <branch>`.
- Commit only validated work; never force-push, deploy, or delete unrelated work. No PRs unless asked.
- Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` + session link. No model IDs elsewhere.
- Don't circumvent bot checks or permission controls; stop if credentials or destructive ops are needed.
