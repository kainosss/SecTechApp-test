# Fieldwise architecture

## Principles

1. **Content is data, not code.** Technical information lives in `/content` as JSON, validated by
   Zod schemas in `src/lib/content/schema.ts`. UI components never contain technical facts.
2. **Every claim carries evidence.** Variants, terminals, power, specifications and notes each record
   `sourceRefs` (with page/section locator), `appliesToVariantIds`, `appliesToRevisions`, a declared
   `status` and an optional `review`.
3. **Verification fails safe.** `resolveStatus()` in `src/lib/content/verification.ts` is the only code
   that can produce "Verified", and only when reviewer, valid past review date, existing non-demo sources
   with a document revision/date, and applicable device revisions are all present. It can only lower a
   status. The loader additionally rejects content that declares Verified without that evidence, so it
   fails tests and builds.
4. **Demonstration content is separate.** It lives in `content/demo/`, must be declared
   `demonstration`, cannot cite or link real records (and vice versa), and is excluded by the repository
   unless `FIELDWISE_DEMO_MODE=true`.
5. **One async access layer.** Pages call `src/lib/content/repository.ts`, which returns plain,
   serialisable view models with effective statuses resolved. Replacing local JSON with Supabase means
   reimplementing this file, not the UI.
6. **Mobile first.** Bottom tab bar, 44px+ targets, static pages, instant client-side filtering.

## Layout

```
content/
  index.ts                 AUTO-GENERATED manifest (scripts/generate-content-manifest.mjs)
  manufacturers/ sources/ devices/ wiring/ workflows/      Real content
  demo/{same folders}                                      Fictional demonstration content
src/
  app/
    page.tsx               Dashboard (search, tools, recent, favourites)
    search/                Universal search (?q= kept in URL)
    devices/               Library (static; filters/page/scroll restored) and device pages
    eol/  eol/[id]/        Wiring configurations list + summary pages
    fault-finder/ [id]/    Troubleshooting workflows list + summary pages
  components/
    layout/  dashboard/  devices/  records/  ui/
  lib/
    content/schema.ts      Types + validation for every record type
    content/verification.ts  Effective status (fail-safe)
    content/loader.ts      Structural, cross-reference, demo-separation and evidence checks
    content/repository.ts  Async read API and view models
    devices/filter.ts      Library search/filter/URL state (pure)
    search/                Universal search scoring + index
    storage/               Favourites, recently viewed (localStorage), library position (sessionStorage)
    config.ts              Demo mode flag
tests/                     Vitest: content rules, verification, repository, UI and pages
```

## Record types

| Type | Key fields |
|------|------------|
| Manufacturer | name, country, website, parentCompany, sourceRefs, isDemo |
| Source (document) | title, publisher, documentType, documentNumber, documentRevision, publishedDate, url + accessedDate |
| Device | model, name, category, aliases, variants, terminals, power, specifications, notes (installation / commissioning), documentation, verification |
| Variant | name, partNumber, hardwareRevisions (revision, firmware), evidence |
| Wiring configuration | inputType, contactArrangement, resistors, appliesToDeviceIds, sourceRefs, appliesToRevisions, verification |
| Troubleshooting workflow | faultArea, symptoms, outline, appliesToCategories, appliesToDeviceIds, sourceRefs, verification |

Relationships are declared once, on wiring configurations and workflows, and resolved for device pages
by `getRelatedForDevice()`.

## Adding content

1. Add the source document to `content/sources/` (see the verification backlog for required fields).
2. Create `content/devices/<manufacturer>-<model>.json`. Leave unknown fields out entirely.
3. Run `npm test`. The manifest regenerates, and any invalid record or unsupported Verified claim fails
   with a message naming the record and the missing evidence.

## EOL Wiring Assistant

```
src/lib/eol/
  model.ts       Circuit data model: series/parallel tree of resistors and NO/NC contacts between
                 two panel terminals; explicit contact positions per state; documented readings
  engine.ts      Pure calculations: series/parallel, open/short, per-state readings, live path
  validate.ts    Diagnostics + wiringVerificationGaps() (what blocks Verified)
  layout.ts      Circuit tree → diagram geometry (connectivity-faithful)
  assistant.ts   Panel-configuration step rules: DEOL-first ordering, safe auto-selection
  classification.ts  Electrically validated vs manufacturer confirmed vs custom (separate axes)
  solve.ts       Sizes resistors for target readings using the engine itself; standard-part builds
  standard-values.ts  E12/E24 values, exact two-part combinations, Ω/k input parsing
  explorer.ts    Generic circuit explorer state + URL format
  explain.ts     Generated explanations (changes, live path, equation, individual vs total)
  live.ts        Which drawn wires carry measurement current (from engine paths)
src/components/eol/  CircuitDiagram (SVG), DiagramViewer (expand/zoom), ConfigurationView,
                     EolAssistant, ConfigurationPermalink
content/wiring/          Real configurations (none yet)
content/demo/wiring/     Generic demonstration circuits + demo-panel examples
```

**Verified wiring** requires everything the generic evidence rules need (reviewer, valid date,
revisioned non-demo sources, applicable revisions) **plus**: a named panel and its HW/FW revisions,
documented terminal labels, every resistor value and every contact's behaviour cited, a documented
reading for every state that the calculation matches (documented tolerance, else 1%), the documented
state interpretation, and no unresolved diagnostics. Identical readings across two states are a
warning that is resolved only when the documentation says the panel reports both the same way.

**Two separate questions (v0.3.1).** *Electrically validated* = valid structure, every value present, every
contact position defined, every reading calculated by the engine; needs no documentation. *Manufacturer
confirmed* = the unchanged Verified rules above. Generic and edited/custom circuits are never manufacturer
confirmed. Example presets (`content/presets/`) are provisional values, not manufacturer specifications.

**Explorer (default /eol view).** Generic DEOL with the 2k2 / 4k4 example opens immediately. Presets and
custom targets are solved with the engine for the selected arrangement and re-checked; non-standard values
are built from exact pairs of standard parts (e.g. 4k4 = 2k2 + 2k2), so the diagram shows real components.
Contacts are tappable; highlighted wires are the engine's conducting paths. The flow animation (on by
default since v0.3.2, toggleable, static under reduced motion) draws round particles at one uniform speed
along exactly the conducting segments, through resistors and closed contacts alike. It is labelled as an
illustration of the connected path, not a measurement: no panel supply is modelled.
The explorer offers Dual EOL, Single EOL (NC/NO) and No EOL. Alternative DEOL and triple EOL records are
kept (`explorerHidden`) for the engine, permanent links and future use.

**Visibility:** generic demonstration circuits (no panel, no devices) are shown in normal mode inside a
separated "Demonstration" area and are branded inside the diagram. Demo records linked to fictional
demo devices appear only in demo mode.

## Circuit Lab (v0.4.0)

`/circuit-lab` — one beginner exercise: a generic NC PIR (illustrative terminals, not any manufacturer's)
wired to a zone input as dual EOL, 2k2 sealed / 4k4 alarm. Entirely simulated; no backend.

- **`src/lib/eol/netlist.ts`** — general circuit-graph evaluator for user-built wiring (the EOL engine only
  handles authored series/parallel trees). Wires and closed contacts merge nodes (union-find); the rest is
  solved by nodal analysis. Handles bridges, bypasses and dangling parts; returns `{ ok: false }` instead
  of a reading when a network can't be evaluated. Cross-checked against `stateResistance` for every
  generic circuit.
- **`src/lib/lab/bench.ts`** — terminals, tray, placed components and an undoable reducer
  (place / move / remove / undo / reset / load). `zoneNetlist()` turns the learner's wiring plus the
  detector's internal ALARM and TAMPER contacts into a netlist for each test state (sealed, alarm,
  tamper, cable open, cable short). Detector power (+12V/0V, pre-wired from AUX) is a separate circuit.
- **`src/lib/lab/check.ts`** — `checkWiring()` measures Z1–COM in all five states and diagnoses from
  electrical facts (wire-only shorts, bypassed contacts, components whose removal changes nothing),
  never by matching a drawing. Electrically equivalent layouts pass and are labelled as such. `correct`
  requires every state to match. `stepStatus()` drives the six guided steps from the same circuit.
- **UI** (`src/components/lab/`) — tap-to-connect SVG bench (terminals and components are buttons with
  ≥ 44 px hit areas and keyboard support), tray, step guide with hints, feedback (what / why / how to
  fix), and the target schematic reusing `CircuitDiagram` with the generic DEOL record. Progress is
  saved per device in `localStorage` (`fieldwise:lab:pir-deol:v1`).

### v0.4.1 — virtual multimeter and fault training

- **`src/lib/lab/meter.ts`** — `measure(components, probes, state, extra)`: resistance between the two probe
  nodes on the assembled graph (`zoneNetlist` + `resistanceBetween`) in the sealed / alarm / tamper state.
  4-digit auto-range display with OL above 40 MΩ. Simulated de-energised: power isolated, zone disconnected
  from the panel (panel input not modelled). Probes can't go on supply terminals; wiring on detector power
  gives no reading because the detector electronics aren't modelled.
- **`src/lib/lab/faults.ts`** — beginner scenarios (missing EOL, bypassed tamper, shorted joint). Faults can be
  hidden (`extra` elements, undrawn) so they must be found by measurement. Diagnosis = fault type + location;
  the exercise completes when the repaired circuit passes `checkWiring` in every state.
- **UI** — `BenchWorkspace` (tray, bench, meter, edit controls) is shared by `CircuitLab` (build) and
  `FaultLab` (`/circuit-lab/faults/[id]`); `LabExerciseNav` switches exercises.

### v0.4.2 — refinement and training expansion

- Contacts are tappable on the bench; `circuitNetlist(components, contacts)` evaluates any combination
  (both open included) and the meter's Sealed/Alarm/Tamper control mirrors it.
- Faults: open circuit (`brokenIds` — a drawn conductor that doesn't conduct) and incorrect resistor value
  (learner states the fitted value). `checkDiagnosis` requires the fault to still be present, the type to be
  consistent with the readings (`faultTypesShown`) and a stated value to match the resistor fitted (`resistorsAt`).
- `layout.ts`: leads avoid terminals they don't connect to; resistor bodies and labels avoid board text,
  terminals and each other (tested).
- `progress.ts`: per-device progress (`fieldwise:lab:progress:v1`), validated with zod; invalid or unknown
  entries are dropped. `/circuit-lab` is the exercise picker with completion status and Reset progress.

## Guided Fault Finder (v0.5.0)

- **Content:** `content/diagnostics/*.json` — one deterministic decision tree per fault (symptoms, safety checks,
  question / measure / result nodes, causes, escalation, notes). Validated by `src/lib/fault-finder/schema.ts`
  at import; `validateWorkflow` (tested) rejects dangling links, unknown causes, unreachable nodes, cycles and
  measurement bands that don't cover 0 → OL. Bump `version` when a tree changes.
- **Engine:** `src/lib/fault-finder/engine.ts`. A session is the list of answers; the current node, findings,
  context (e.g. the zone's seal value, a lock's rated voltage) and evidence are derived by replaying it.
  Measure nodes classify a parsed reading (2k2, 2.2k, OL, volts) into bands, optionally scaled by a context
  value, so 4.4 kΩ means "alarm" on a 2k2 zone but "low" on a 10k zone. Results rank their own candidate causes
  by author order plus evidence; wording never claims a confirmed diagnosis.
- **Sessions:** `sessions.ts` saves per-workflow answers locally (`fieldwise:fault-finder:v1`); on load they
  are zod-validated and replayed — outdated versions are discarded and invalid tails trimmed.
- **UI:** `/fault-finder` lists the guides (resume badges) above any content workflow records;
  `/fault-finder/diagnose/[id]` shows safety checks, then questions/measurements, findings with "Change",
  progress, Back / Restart / Clear, and the result with verify / act / escalate / notes and related links.
- Guidance is generic: example EOL values are illustrations; resistance only on isolated circuits.

### v0.5.1 — technical accuracy and review preparation

- **Expected readings are calculated, not assumed.** `src/lib/fault-finder/eol.ts` builds the generic dual EOL
  network (R1 series, R2 across the NC alarm contact, NC tamper in series) and evaluates it with the EOL engine
  (`networkResistance`). An `eol-config` node collects R1/R2 (presets 2k2/2k2, 10k/10k, 4k7/2k2, 2k2/4k7, or custom);
  measure nodes with `scale: "zone"` classify readings into calculated bands (short / low / sealed / between /
  alarm / high / open) with ±10 % tolerance. Out-of-range or indistinguishable pairs are rejected with a reason;
  other topologies route to "confirm EOL values". `validateWorkflow` checks band coverage and that zone
  measurements are only reachable after the EOL values are set.
- **Verification metadata:** each guide has `verification` (status: generic / manufacturer-referenced /
  technician-reviewed / requires-verification, reviewer, lastReviewed, reviewerNotes, pending) and `sources`
  (title, organisation, type, version or date, URL, section). The schema refuses manufacturer-referenced
  without a source and technician-reviewed without a reviewer and date. Steps can carry `review` flags.
- **Confidence:** results declare `likely` / `possible` / `verify`; the UI separates confirmed measurements,
  likely and possible causes, and further verification. Findings record how they were established.
- Review workspace: `docs/TECHNICAL_REVIEW.md`. Workflow versions bumped to 2 (older saved sessions discarded).

## Quick Service Report (v0.6.0)

- **Route:** `/reports` — one client page: start a report (job type), resume / duplicate / delete / re-export drafts;
  `?id=` opens the editor (history entries, so the phone's Back button works).
- **Model:** `src/lib/reports/schema.ts` (zod). `report.ts` holds pure edits (add, update, duplicate, move, remove,
  restore) and derivations: status counts, outstanding actions (Fault / Recommendation items, text only from what
  was entered, priority blank unless set), a draft summary built from entered text, and non-blocking warnings.
- **Storage:** `store.ts` — drafts in `localStorage` (`fieldwise:reports:v1`), each validated on read; damaged or
  outdated entries are skipped and counted. Technician details in `fieldwise:technician:v1`. Autosave on every edit;
  the "Saved" indicator compares the stored copy with the editor state.
- **Workbook:** `excel.ts` builds three sheets with ExcelJS (MIT), imported dynamically on Generate so it's not in
  page bundles: Job Summary (details, totals, summaries), Equipment Register (frozen, filtered headers, status
  drop-down) and Outstanding Actions. Navy headers, light-blue dividers, thin borders, wrapped text, estimated row
  heights, A4 print setup with repeated headers. `safeText` strips XML-invalid characters, prefixes formula-like
  text with an apostrophe and truncates to Excel's cell limit; no formulas are written. Generated in the browser —
  nothing is uploaded.
- `npm audit` reports a moderate advisory in `uuid` (a dependency of ExcelJS) affecting v3/v5/v6 calls with a
  caller-supplied buffer, which ExcelJS doesn't use. Revisit when ExcelJS updates.

## Supabase migration path

Tables mirror the schemas: `manufacturers`, `sources`, `devices`, `device_variants`, `claims` (or one
table per claim type) with evidence columns, `claim_sources`, `wiring_configurations`, `workflows`,
`record_devices`. The Zod schemas remain the import contract, and `verification.ts` keeps running on read.
The client-side library filter moves behind a search API once the catalogue is too large to ship to the
browser.

## Phased plan

| Phase | Scope |
|-------|-------|
| v0.1 ✅ | Foundation, dashboard, navigation |
| v0.2 ✅ | Device Library foundation |
| v0.3 ✅ | Evidence model, fail-safe verification, real device identification, library journey, summary pages, ESLint |
| v0.3 ✅ | EOL Wiring Assistant: circuit model, engine, validation, SVG diagrams, guided assistant, Device Library links |
| v0.4 ✅ | Circuit Lab: interactive wiring bench, one generic dual EOL exercise |
| v0.4.1 ✅ | Virtual multimeter, three fault-finding exercises |
| v0.6.0 ✅ | Quick Service Report: on-site entry, local drafts, one-tap Excel workbook |
| v0.5.1 ✅ | Calculated EOL expectations (unequal pairs), verification metadata, guide audit, review workspace |
| v0.5.0 ✅ | Guided Fault Finder: five deterministic diagnostic workflows, saved sessions |
| v0.4.2 ✅ | Tappable contacts, five fault exercises, readable routing, saved progress, exercise picker |
| Next | Verified panel wiring once documentation is reviewed; interactive Fault Finder |
| Later | Supabase (auth, content tables, review workflow), Stripe subscriptions, production deployment |
