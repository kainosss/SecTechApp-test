# Development status

**Milestone:** v0.4.1 — Virtual Multimeter & Fault Training — **complete**
**Branch:** `claude/fieldwise-architecture-setup-5ak87u` (see `git log -1` for the latest commit)

## Completed (v0.4.1)
- `CLAUDE.md` project guide.
- `src/lib/lab/meter.ts`: resistance between probe nodes on the real graph; sealed/alarm/tamper; auto-range + OL;
  supply terminals blocked; no reading when wiring touches detector power (electronics not modelled).
- `zoneNetlist` / `readingsFor` / `checkWiring` accept `extra` (undrawn hidden-fault elements).
- `src/lib/lab/faults.ts`: missing EOL, bypassed tamper (hidden link), shorted joint (hidden bridge);
  diagnosis = type + location; completion = repaired circuit passes `checkWiring`.
- UI: `BenchWorkspace`, `Multimeter`, `FaultLab`, `LabFeedback`, `LabExerciseNav`; contact states + probe tips
  drawn on `WiringBench`; route `/circuit-lab/faults/[id]`.
- Tests: `tests/lab/meter.test.ts`, `tests/lab/meter-ui.test.tsx` (+ existing lab/EOL suites).

## Latest validation
- Lint, typecheck: clean. Tests: 219/219 (26 files). Build + demo-mode build: OK.
- Playwright (iPhone 13 touch, 1440 desktop): all lab pages no horizontal overflow, no console errors;
  shorted-joint exercise completed end to end.

## Decisions
- Measurements simulate a de-energised circuit with the zone disconnected from the panel.
- Probe tool stays on the same probe after placement unless the other probe is unplaced (auto-advance).
- Hidden faults are cleared only by the repair action after a correct diagnosis.

## Known issues / limitations
- Detector state is set by the meter's Sealed/Alarm/Tamper control, not by tapping the drawn contacts.
- Fault exercise progress is not saved between visits (build exercise is).
- Wire labels can overlap terminal labels on crowded benches.

## Next (suggested)
- More fault scenarios (open circuit, wrong value) using the same data model; voltage range is out of scope
  until the panel input and detector electronics are modelled.
