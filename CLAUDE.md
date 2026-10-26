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
- `/fault-finder`, `/fault-finder/[id]`
- `/circuit-lab` exercise picker · `/circuit-lab/wiring-bench` build exercise · `/circuit-lab/faults/[id]` fault exercises
- Navigation: `src/lib/navigation.ts` (NAV_ITEMS, TOOLS → search index)

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
