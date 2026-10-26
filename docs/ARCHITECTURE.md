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
| Next | Verified panel wiring once documentation is reviewed; interactive Fault Finder |
| Later | Supabase (auth, content tables, review workflow), Stripe subscriptions, production deployment |
