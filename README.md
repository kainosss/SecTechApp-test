# Fieldwise

Mobile-first technical reference for Australian electronic security technicians and apprentices.

> **Status: v0.5 beta.** The Device Library, EOL Wiring Assistant, Guided Fault Finder (five generic diagnostic workflows) and Circuit Lab (a simulated wiring exercise, virtual multimeter and five fault-finding exercises, with progress saved on the device) are functional. All real device records are
> identification-only and marked **Needs verification**. See
> [docs/VERIFICATION_BACKLOG.md](docs/VERIFICATION_BACKLOG.md).

## Run locally

Requires Node.js 20.9+ (22 recommended).

```bash
npm install
npm run dev          # http://localhost:3000 — real records only
npm run dev:demo     # also shows fictional demonstration devices, wiring and workflows
```

### On your phone

1. Connect the phone to the same Wi-Fi as your computer.
2. Run `npm run dev -- -H 0.0.0.0` (or `npm run dev:demo -- -H 0.0.0.0`).
3. Find your computer's local IP (macOS: `ipconfig getifaddr en0`, Windows: `ipconfig`).
4. Open `http://<that-ip>:3000` on the phone.

## Scripts

| Command | What it does |
|---------|--------------|
| `npm run dev` / `npm run dev:demo` | Development server (demo mode off / on) |
| `npm run lint` | ESLint (Next.js core-web-vitals + TypeScript rules) |
| `npm run typecheck` | TypeScript check |
| `npm test` | All automated tests (Vitest) |
| `npm run validate:content` | Content validation tests only |
| `npm run build` / `npm start` | Production build and server |

## Content statuses

| Status | Meaning |
|---|---|
| **Verified** | A named reviewer checked it against a cited, non-demo manufacturer document for stated device revisions |
| **Needs verification** | Real product, but not (yet) verified. Never presented as installation instructions |
| **Demonstration only** | Fictional development data. Hidden unless demo mode is on |

The effective status is computed in `src/lib/content/verification.ts` and fails safe: any missing or invalid
evidence downgrades a claim to Needs verification.

## Adding content

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#adding-content) and the verification steps in
[docs/VERIFICATION_BACKLOG.md](docs/VERIFICATION_BACKLOG.md#how-to-verify-a-claim).
The content manifest regenerates automatically before `dev`, `build` and `test`.
