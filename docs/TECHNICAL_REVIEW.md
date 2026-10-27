# Fieldwise — Fault Finder technical review

Working document for experienced security technicians reviewing the Guided Fault Finder
(`content/diagnostics/*.json`). Developer-maintained; **no guide has been reviewed by a technician or checked
against manufacturer documentation yet.** An automated or AI review is not professional verification.

**How to review:** work through each guide in the app (`/fault-finder`) alongside this page. For each question
below, note your answer, your name and role, and the date. When a guide is signed off, a developer records it
in the guide's `verification` block (`status: "technician-reviewed"`, `reviewer`, `lastReviewed`, `reviewerNotes`);
the schema refuses that status without a reviewer and date. Manufacturer documents go in `sources` (title,
organisation, type, version or date, URL if public, section/page) and allow `manufacturer-referenced`.

**Current status of all five guides:** Generic guidance — not manufacturer verified. No sources recorded.

---

## Shared assumptions (all intrusion guides)

- **Topology:** generic dual EOL — R1 (EOL resistor) in series with the loop; R2 (alarm resistor) across the
  detector's NC alarm contact; NC tamper contact in series. Expected readings: sealed = R1, alarm = R1 + R2,
  tamper = open (OL), cable open = OL, cable short ≈ 0 Ω. Calculated by the app's EOL engine
  (`src/lib/fault-finder/eol.ts`), cross-checked against an independent netlist solver in tests.
- **Resistor pairs offered:** 2k2 + 2k2, 10k + 10k, 4k7 + 2k2, 2k2 + 4k7, or custom R1/R2 (10 Ω – 100 kΩ).
  These are examples, not any panel's values. Other wiring (tamper resistors, triple EOL) is not supported and
  routes to "confirm the EOL values first".
- **Classification bands (diagnostic aid, not panel thresholds):** "about" a value = within ±10 %
  (5 % resistors + cable + meter); short = below 2.5 % of the sealed reading, capped at 100 Ω; open = ≥ 1 MΩ or
  OL. Pairs whose sealed and alarm bands overlap (e.g. 10k + 470 Ω) are rejected.
- **Measurement safety:** resistance only with the zone conductors disconnected from the panel (circuit
  isolated); voltage checks live on DC volts with probes on terminals only; never short supply or battery
  outputs; mains work by a licensed electrician; apprentices under supervision.

**Questions for reviewers (shared)**
1. Is ±10 % a sensible "about the expected value" band on site, including long cable runs? Should it widen?
2. Is < 2.5 % of the sealed reading (max 100 Ω) a sensible "effectively shorted" threshold?
3. Are the four preset pairs the right common examples for Australian sites? Any to add or remove?
4. Is it correct and common practice to describe the tamper as "in series" for generic DEOL?

---

## 1. Alarm zone permanently open (`zone-permanently-open`, v2)

**Scenario:** zone never seals; shown as open, alarm, tamper or trouble depending on the panel.
**Assumed equipment:** intrusion panel zone input, single detector on a generic dual EOL loop, multimeter.
**Safety:** monitoring centre / site contact notified and system in test mode; terminations recorded; zone
isolated for Ω tests; detector supply tested live on DC volts; battery and mains precautions.

**Logic summary**
1. EOL resistors (preset / custom / unsupported → "confirm EOL values").
2. History (recent work / no change / new install) — weights causes only, doesn't branch.
3. Loop at the panel, isolated: short → shorted guide · low / between / high → wrong value or poor joint ·
   sealed → panel end (terminations, programming, input) · alarm → detector supply test · OL → measure at detector.
4. At the detector (cable disconnected there): OL → detector end (tamper, resistor, termination) · sealed →
   cable or joints · other → detector wiring/resistors.
5. Supply at the detector: none / low / normal / high; if normal, does it stay in alarm with the area clear?

**Electrical assumptions:** an unpowered detector's alarm relay reads open (alarm) — typical, model-specific.
**Potentially ambiguous:** "between" and "high" readings go to the same "unexpected value" result — they could
also mean R2 not across the alarm contact (both resistors in series). Is a separate branch worth it?
**Questions for reviewers**
- Is the detector-end split (disconnect at the detector, measure its terminals) how you'd do it in practice?
- Detector "low supply" boundary of 10.5 V for a 12 V detector — appropriate? (Flagged in-app.)
**Needs manufacturer confirmation:** detector minimum operating voltage; relay state when unpowered; how each
panel reports an open DEOL loop.

---

## 2. Alarm zone permanently shorted (`zone-permanently-shorted`, v2)

**Scenario:** zone reports short (or tamper / trouble on panels that treat a short that way) and won't clear.
**Assumed equipment / safety:** as guide 1; adds "never test by shorting supply outputs or zone inputs".

**Logic summary**
1. EOL resistors; history (weights only).
2. Loop at the panel, isolated: short → split at the detector · low → wrong value / leakage / programming ·
   sealed → panel end · above sealed → not a short (panel bands / programming) · OL → open guide.
3. Cable alone (both ends disconnected): short → cable or joints · some resistance → leakage **or another
   device / resistor still connected (e.g. in a joint)** · OL → short is at the detector (link, wiring error).

**Changed in v0.5.1:** the "cable alone reads some resistance" result previously only suggested leakage; a
resistor or device left in a joint gives the same reading.
**Questions for reviewers**
- Is "a link left across the zone terminals" common enough to rank first at the detector end?
- Any typical moisture/leakage readings worth quoting (as examples)?
**Needs manufacturer confirmation:** which reading bands each panel reports as "short" vs tamper/trouble.

---

## 3. PIR detector not activating (`pir-not-activating`, v2)

**Scenario:** walk test doesn't put the zone into alarm.
**Assumed equipment:** PIR with alarm LED (may be disabled), generic dual EOL loop, panel walk-test / status view.
**Safety:** test mode and monitoring centre informed; ladder safety; live DC volts only on supply terminals;
isolate for Ω tests; mains and supervision note.

**Logic summary**
- LED lights → does the panel see a change? yes → zone programming / isolation · no → can you measure the loop
  during a walk test? → EOL resistors → loop at panel (isolated, detector still powered): stays sealed → alarm
  path bypassed / wrong terminals / relay · changes to alarm → panel end · other bands → values, short, open.
- LED off → detector supply → warm-up → siting/obstruction → settings or faulty detector.

**Electrical assumptions:** with the zone isolated and the detector powered from its own supply, the loop
moves from R1 to R1 + R2 on activation.
**Potentially ambiguous:** detectors whose LED is disabled take the "panel sees it?" path; a detector with both
a failed LED and a failed relay would be reported as "panel end" only if the loop changes — check.
**Questions for reviewers**
- Is measuring the loop during a walk test (two people) realistic, or is there a better single-person method?
- Warm-up time wording ("often a minute or two") — accurate enough? (Flagged in-app.)
**Needs manufacturer confirmation:** warm-up times, minimum voltage, LED behaviour, walk-test guidance.

---

## 4. Tamper fault that won't clear (`tamper-will-not-clear`, v2)

**Scenario:** tamper keeps being reported after covers are closed and the system reset.
**Assumed equipment:** detector, enclosure, siren or module tampers; panel tamper latching.
**Safety:** tamper may be monitored 24 h; external sirens may sound; isolate before Ω tests; battery, mains and
supervision notes; never leave tamper inputs linked out permanently.

**Logic summary**
- Source: zone → cover seated? → reset at keypad? → **how is the tamper wired?** (in series with the loop →
  EOL resistors → loop at panel: OL → tamper switch / wiring / open guide; sealed → latched / programming /
  input; short → shorted guide; other → values) · (separate tamper input → test the tamper loop itself) ·
  (unknown → find out first).
- Enclosure → lid and switch → enclosure tamper circuit. Siren / module → service procedure first. Unknown →
  identify the source from the event log.

**Changed in v0.5.1:** added the tamper-wiring question. Previously the guide assumed the tamper was in series
with the zone loop, which isn't true on sites using separate tamper zones.
**Questions for reviewers**
- What do separate tamper inputs typically expect (closed loop vs their own resistor)? (Flagged in-app.)
- Which panels latch tamper until an installer code is used?
**Needs manufacturer confirmation:** latching behaviour and reset code levels; how out-of-band readings are
reported; siren and module service procedures.

---

## 5. Access-controlled door not unlocking (`door-not-unlocking`, v2)

**Scenario:** valid credential, REX or software command doesn't release the door.
**Assumed equipment:** reader, door controller with lock relay, lock power supply, fail-safe or fail-secure lock.
**Safety (safety-critical door):** agree temporary security with the site; free egress always; never bypass
emergency release, fire release or egress devices without approval and alternative measures, and never
permanently; isolate lock power before rewiring; never short lock or power outputs; battery precautions;
mains by a licensed electrician; apprentices supervised.

**Logic summary**
- Reader response: denied → access rights / credential / door mode · nothing → reader supply (none, low,
  normal → comms/config, **high → check rating**) · granted → does REX / software unlock work? yes → door
  configuration · no → lock type (fail-secure / fail-safe / unknown) → rated voltage (12 / 24 V) → lock voltage
  during unlock, classified relative to the rated voltage.
- Fail-secure: ~0 V → relay contact / supply / cable · low → supply / voltage drop / setting · about rated →
  mechanics (preload, strike) · high → over-voltage.
- Fail-safe: drops to ~0 V → what still holds the door (armature, preload, second lock) · stays on → wrong
  relay contact or a second feed (involve the fire services contractor if a fire interface is in the circuit).

**Electrical assumptions:** "about rated" = 85–125 % of rated; "removed" = below 10 % of rated. Both are
diagnostic aids, flagged for confirmation.
**Questions for reviewers**
- Are the 85–125 % and 10 % boundaries reasonable for common strikes and maglocks?
- Is "reader shows granted but nothing happens → test REX / software unlock first" the order you'd use?
- Anything to add about fire-trip interfaces and egress approvals in Australian practice?
**Needs manufacturer confirmation:** lock operating ranges and suppression-diode requirements; reader supply
ranges (12 V vs 12–24 V); controller relay behaviour.

---

## Review log

| Guide | Reviewer (name, role) | Date | Outcome / notes |
|-------|----------------------|------|-----------------|
| — | — | — | No reviews recorded yet. |
