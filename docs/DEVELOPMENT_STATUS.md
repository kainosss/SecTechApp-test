# Development status

**Milestone:** v0.5.0 — Guided Fault Finder — **complete**
**Branch:** `claude/fieldwise-architecture-setup-5ak87u` (latest commit: `git log -1`)

## Completed (v0.5.0)
- Deterministic diagnostic engine `src/lib/fault-finder/` (schema, engine, sessions, workflows loader).
- Five workflows in `content/diagnostics/`: zone permanently open, zone permanently shorted, PIR not activating,
  tamper won't clear, access-controlled door not unlocking. Yes/no, choice and measurement nodes; bands relative
  to the zone's EOL value (2k2/2k2 or 10k/10k examples) or a lock's rated voltage; evidence-ranked causes;
  verify / act / escalate / notes; cross-links between guides and to EOL Assistant / Circuit Lab.
- `/fault-finder` landing (guides + resume badges + generic-guidance notice; content records listed when present),
  `/fault-finder/diagnose/[id]` (safety first, progress, findings with Change, Back / Restart / Clear).
- Local sessions, zod-validated and replayed (outdated discarded, invalid tails trimmed).
- Search index includes the guides; tool card marked available. Bottom nav unchanged (Faults already present).

## Latest validation
- Lint, typecheck clean. Tests 292/292 (33 files). Normal + demo-mode production builds OK.
- Playwright (iPhone 13 touch, 1440 desktop): all fault-finder routes, /circuit-lab, /eol, /search 200 with no
  horizontal overflow or console errors; full open-zone path to a result; resume after reload verified.

## Known limitations
- Measurement steps assume equal seal/alarm resistors; other EOL combinations route to "confirm EOL values".
- Workflows are generic and unreviewed by a manufacturer; no source citations (not panel-specific claims).
- Older outline-only workflow records (demo mode) still live at `/fault-finder/[id]`.

## Next (suggested)
- Technical review of the five trees by an experienced technician; then more workflows (comms/dialler faults,
  battery/AC fail, reader offline) and optional unequal EOL pairs (e.g. 4k7/2k2) via a second context value.
