# Fieldwise architecture

## Principles

1. **Content is data, not code.** Technical information (manufacturers, devices, sources, and later EOL
   configurations and fault trees) lives in `/content` as JSON. The app never hard-codes technical facts.
2. **Every fact has a source.** Terminals, power data and documentation entries carry `sourceRefs`
   pointing at a `Source` record (title, publisher, document revision, URL, accessed date).
3. **Verification is explicit.** Every device has `verification.status`:
   - `verified`: checked against a cited, non-demo manufacturer document. Must record `verifiedBy` + `verifiedAt`.
   - `unverified`: a real product, but not yet checked. Shown with a warning.
   - `example`: fictional demonstration data. Shown with an amber "Example data" badge.
   The loader rejects verified content that has no reviewer, no documentation, or relies on a demo source.
4. **One access layer.** UI code reads content only through `src/lib/content/repository.ts`. Swapping
   local JSON for Supabase later changes that file, not the pages.
5. **Mobile first.** Bottom tab bar and 44px+ touch targets on phones. A sidebar takes over at `lg`.

## Layout

```
content/                      Technical content (reviewed like documentation)
  index.ts                    AUTO-GENERATED manifest (scripts/generate-content-manifest.mjs)
  manufacturers/*.json
  sources/*.json              Source documents (manuals, datasheets) with revisions
  devices/<id>.json           One file per device: small diffs, easy review
src/
  app/                        Next.js App Router pages
    page.tsx                  Dashboard
    search/                   Universal search results
    devices/ devices/[id]/    Device Library (preview)
    eol/ fault-finder/        Placeholders for Phases 3–4
  components/
    layout/                   AppShell, Sidebar (desktop), BottomNav + TopBar (mobile)
    dashboard/                UniversalSearch, ToolCards, DeviceShortlists
    devices/                  DeviceRow, FavouriteButton, RecordView
    ui/                       Icon, VerificationBadge, DemoNotice, PageHeader, PlannedTool
  lib/
    content/schema.ts         Zod schemas + verification rules
    content/loader.ts         Validation + cross-reference checks
    content/repository.ts     Read API used by pages
    devices/filter.ts         Device Library filtering, category counts, URL state
    search/                   Pure search scoring + index builder
    storage/                  Recently viewed / favourites (localStorage today)
    navigation.ts             Nav items + tool registry
tests/                        Vitest: content rules, search, storage, components
```

## Device records

A device page is rendered entirely from its JSON record. Optional sections (terminals, specifications,
installation notes) only appear when the record has data, so adding a device never needs UI code.

| Field | Purpose |
|-------|---------|
| `terminals[]` | Label, function, notes, `sourceRefs` |
| `power` | Supply voltage range, current draw, `sourceRefs` |
| `specifications[]` | Generic `{group, label, value, sourceRefs}` rows: electrical, communications, physical, environmental |
| `installationNotes[]` | `{text, severity: info \| caution, sourceRefs}` |
| `documentation[]` | Source documents (manuals, datasheets) with revision and URL |
| `modelRevisions[]` | Hardware/firmware revisions the record applies to |

**Relationships:** EOL configurations and fault workflows will declare which devices they apply to.
The device page resolves them through `getRelatedForDevice()`, so each link is stored once.

## Scaling notes

- **Thousands of devices:** the JSON + manifest approach is for the MVP. Phase 4 moves content into
  Supabase Postgres tables that mirror these schemas (`manufacturers`, `devices`, `device_revisions`,
  `terminals`, `sources`, `source_refs`). The Zod schemas stay as the import/validation contract.
- **Search:** today the index is built on the server and searched in the browser. Once the catalogue is
  large, `search()` moves behind an API route backed by Postgres full-text / trigram search.
- **Model revisions:** devices list `modelRevisions`. When terminals differ between revisions, the plan is
  to scope terminal/power blocks per revision rather than duplicating devices.
- **Recent/favourites:** stored on the device. When accounts arrive they sync to a user profile table;
  the pure list functions in `storage/device-lists.ts` are reused.

## Phased plan

| Phase | Scope |
|-------|-------|
| 1 ✅ | Architecture, content schema, demo data, dashboard, navigation, search, recent/favourites |
| 2 (v0.2) | ✅ Device Library foundation · EOL Wiring Assistant · Guided Fault Finder |
| 3 | EOL Wiring Assistant: EOL config schema, panel/input/contact selection, SVG references from verified data only |
| 4 | Guided Fault Finder: decision-tree schema, interactive runner, test procedures |
| 5 | Supabase: auth, content tables, content admin/review workflow, synced favourites |
| 6 | Stripe subscriptions, plans, paywall; Vercel production deployment |
