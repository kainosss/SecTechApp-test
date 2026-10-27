# Development status

**Milestone:** v0.5.1 — Technical Accuracy, Reliability & Review Preparation — **complete**
**Branch:** `claude/fieldwise-architecture-setup-5ak87u` (latest commit: `git log -1`)

## Completed (v0.5.1)
- `src/lib/fault-finder/eol.ts`: expected zone readings calculated with the EOL engine for the generic dual EOL
  topology; ±10 % bands; unequal pairs (4k7/2k2, 2k2/4k7) and custom R1/R2; ambiguous or out-of-range pairs rejected.
- `eol-config` node + `scale: "zone"` measurements in all four intrusion guides (workflow versions → 2).
- Verification metadata (status, sources, pending, reviewer fields with schema guards), per-step review flags,
  result confidence (likely / possible / verify), finding kinds (measured / observed / set up / not measured).
- Guide audit fixes: tamper wiring branch, cable-alone reading may be another device, reader over-voltage
  branch, detector supply test wording, battery / mains / supervision safety, terminology.
- UI: EOL picker with preview, test-type labels, calculated bands, review flags, verification panel, confidence.
- `docs/TECHNICAL_REVIEW.md`: per-guide review workspace and log.

## Latest validation
- Lint, typecheck clean. Tests 320/320 (36 files). Normal + demo-mode production builds OK.
- Playwright (iPhone 13 touch, 1440 desktop): fault-finder, wiring bench and EOL pages 200 with no horizontal
  overflow or console errors; custom 4k7/2k2 path to a "likely" result verified.

## Outstanding verification (see docs/TECHNICAL_REVIEW.md)
- No guide is technician-reviewed or manufacturer-referenced; all are "Generic guidance".
- Tolerance bands, voltage boundaries (10.5 V detector low, lock 85–125 % / 10 %), tamper latching, separate
  tamper inputs, reader supply ranges and lock suppression need confirmation.

## Next (suggested)
- Technician review of the five guides using TECHNICAL_REVIEW.md, recording reviewers and sources;
  then new guides (comms/dialler, battery/AC fail, reader offline).
