# Development status

**Milestone:** v0.4.2 — Circuit Lab Refinement & Training Expansion — **complete**
**Branch:** `claude/fieldwise-architecture-setup-5ak87u` (latest commit: `git log -1`)

## Completed (v0.4.2)
- Tappable ALARM/TAMPER contacts (touch, mouse, keyboard) synced with the meter's state control; any combination
  is calculated (`circuitNetlist`, `ContactState`).
- Fault exercises: open circuit (broken conductor via `brokenIds`), incorrect resistor value (value question);
  five in total. Diagnoses checked against the simulated circuit (fault present, type consistent with readings,
  stated value = fitted value).
- `src/lib/lab/layout.ts`: leads route around unconnected terminals; labels avoid each other, terminals, text.
- `src/lib/lab/progress.ts`: zod-validated localStorage progress (current, completed, diagnosis, repair, wiring,
  hints); Reset exercise keeps completion; Reset progress (with confirm) clears all incl. the wiring bench.
- `/circuit-lab` = exercise picker; build exercise moved to `/circuit-lab/wiring-bench`.

## Latest validation
- Lint, typecheck clean. Tests 256/256 (29 files). Normal + demo-mode production builds OK.
- Playwright (iPhone 13 touch, 1440 desktop): lab, EOL and Devices pages 200, no horizontal overflow, no console
  errors; contact tap → meter update and wrong-value diagnosis verified.

## Known limitations
- Leads can still cross board titles/group headings (labels avoid them; lines don't).
- Probe tool stays on the same probe once both are placed (deliberate, for adjusting).
- Fault locations are chosen from a list; the electrical check covers type, value and fault presence.

## Next (suggested)
- Intermediate exercises (combined faults), and a voltage range only once panel/detector electronics are modelled.
