# Fieldwise

Mobile-first technical reference and troubleshooting for electronic security technicians.

> **Status: Phase 1 preview.** All manufacturers and devices are **fictional demonstration data**,
> labelled "Example data" in the UI. Nothing in this build describes real equipment.

## Run locally

Requires Node.js 20.9+ (22 recommended).

```bash
npm install
npm run dev          # http://localhost:3000
```

Open it on your phone: run `npm run dev -- -H 0.0.0.0` and visit `http://<your-computer-ip>:3000`
on the same Wi-Fi network.

## Scripts

| Command | What it does |
|---------|--------------|
| `npm run dev` | Development server with hot reload |
| `npm test` | Run all automated tests (Vitest) |
| `npm run validate:content` | Validate only the content files |
| `npm run typecheck` | TypeScript check |
| `npm run build` / `npm start` | Production build and server |

## What's in Phase 1

- Dashboard: universal search, the three tools, recently viewed, favourites, library status
- Navigation: bottom tab bar on phones, sidebar on desktop
- Device Library (preview): list, category filter, basic device pages with sources and verification status
- EOL Wiring Assistant and Guided Fault Finder: placeholder pages describing the planned approach
- Content schema that requires sources, revisions and verification status

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the structure and the phased plan.

## Adding content

1. Add or reference a source document in `content/sources/sources.json`.
2. Create `content/devices/<manufacturer>-<model>.json` (copy an existing file).
3. Register it in `content/index.ts`.
4. Run `npm test`. Invalid or unsourced "verified" content fails the tests.
