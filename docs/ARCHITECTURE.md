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
| Next | Verify a first set of real devices; interactive EOL Wiring Assistant; interactive Fault Finder |
| Later | Supabase (auth, content tables, review workflow), Stripe subscriptions, production deployment |
