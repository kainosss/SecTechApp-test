/**
 * Circuit Lab wiring check. Evaluates the learner's actual circuit graph in
 * every required state with the netlist evaluator, then diagnoses problems
 * from electrical facts (readings, shorts, bypasses) — not by matching a
 * drawing. A circuit is only "correct" when every state reads as required.
 */
import { formatOhms } from "@/lib/eol/engine";
import { resistanceBetween, shortedTogether, type Element } from "@/lib/eol/netlist";
import {
  ALARM_CONTACT,
  POINTS_BY_ID,
  POWER_POINTS,
  TAMPER_CONTACT,
  ZONE_A,
  ZONE_B,
  componentLabels,
  zoneNetlist,
  type BenchStateKind,
  type PlacedComponent,
  type PointId,
} from "./bench";

export const TEST_STATES: { kind: BenchStateKind; label: string }[] = [
  { kind: "sealed", label: "Sealed" },
  { kind: "alarm", label: "Alarm contact open" },
  { kind: "tamper", label: "Tamper contact open" },
  { kind: "cable-open", label: "Cable open" },
  { kind: "cable-short", label: "Cable short" },
];

/** The exercise target: generic NC PIR, dual EOL, 2k2 sealed / 4k4 alarm. */
export const TARGET: Record<BenchStateKind, number> = {
  sealed: 2200,
  alarm: 4400,
  tamper: Number.POSITIVE_INFINITY,
  "cable-open": Number.POSITIVE_INFINITY,
  "cable-short": 0,
};
export const RESISTOR_VALUE = 2200;
const TOLERANCE = 0.005;

export function readingMatches(actual: number, expected: number): boolean {
  if (!Number.isFinite(expected) || expected === 0) return actual === expected;
  return Number.isFinite(actual) && Math.abs(actual - expected) <= expected * TOLERANCE;
}

export interface StateReading {
  kind: BenchStateKind;
  label: string;
  /** null when the circuit could not be evaluated reliably. */
  ohms: number | null;
  expected: number;
  matches: boolean;
}

export type FindingCode =
  | "empty"
  | "power-terminal"
  | "zone-not-connected"
  | "direct-short"
  | "missing-series-resistor"
  | "incomplete-loop"
  | "tamper-bypassed"
  | "tamper-not-in-loop"
  | "alarm-not-in-loop"
  | "missing-alarm-resistor"
  | "wrong-resistor-value"
  | "wrong-sealed"
  | "wrong-alarm"
  | "no-effect"
  | "unsupported"
  | "correct"
  | "equivalent";

export interface Finding {
  code: FindingCode;
  severity: "error" | "warning" | "success" | "info";
  title: string;
  /** Why it matters. */
  why?: string;
  /** How to fix it. */
  fix?: string;
  componentIds?: string[];
}

export interface CheckResult {
  readings: StateReading[];
  findings: Finding[];
  correct: boolean;
}

function evaluate(components: PlacedComponent[], state: BenchStateKind): number | null {
  const r = resistanceBetween(zoneNetlist(components, state), ZONE_A, ZONE_B);
  return r.ok ? r.ohms : null;
}

export function readingsFor(components: PlacedComponent[]): StateReading[] {
  return TEST_STATES.map(({ kind, label }) => {
    const ohms = evaluate(components, kind);
    return { kind, label, ohms, expected: TARGET[kind], matches: ohms !== null && readingMatches(ohms, TARGET[kind]) };
  });
}

/** User wiring only (no contacts), to see what wires alone connect. */
function wiresOnly(components: PlacedComponent[]): Element[] {
  return components.filter((c) => c.kind === "wire").map((c) => ({ kind: "wire" as const, a: c.a, b: c.b }));
}

const CANONICAL = [
  { kind: "wire", a: "panel-z", b: "alm-com" },
  { kind: "resistor", a: "alm-com", b: "alm-nc", ohms: 2200 },
  { kind: "resistor", a: "alm-nc", b: "tmp-com", ohms: 2200 },
  { kind: "wire", a: "tmp-nc", b: "panel-com" },
];
const key = (c: { kind: string; a: string; b: string; ohms?: number }) => `${c.kind}:${c.ohms ?? 0}:${[c.a, c.b].sort().join("|")}`;

export function checkWiring(components: PlacedComponent[]): CheckResult {
  const labels = componentLabels(components);
  const findings: Finding[] = [];
  const readings = readingsFor(components);
  const r = Object.fromEntries(readings.map((x) => [x.kind, x.ohms])) as Record<BenchStateKind, number | null>;
  const name = (id: PointId) => POINTS_BY_ID[id].name;

  if (components.length === 0) {
    return {
      readings,
      correct: false,
      findings: [{ code: "empty", severity: "info", title: "Nothing is wired yet.", fix: "Choose a wire or resistor from the tray, then tap two terminals to connect it." }],
    };
  }

  if (readings.some((x) => x.ohms === null)) {
    return {
      readings,
      correct: false,
      findings: [{ code: "unsupported", severity: "error", title: "This circuit can't be evaluated reliably.", fix: "Check each resistor value, or undo the last change." }],
    };
  }

  // Power terminals are a separate circuit: never part of the zone.
  const onPower = components.filter((c) => POWER_POINTS.includes(c.a) || POWER_POINTS.includes(c.b));
  if (onPower.length > 0) {
    findings.push({
      code: "power-terminal",
      severity: "error",
      title: `${onPower.map((c) => labels[c.id]).join(", ")} ${onPower.length > 1 ? "are" : "is"} connected to the detector's power terminals.`,
      why: "+12V and 0V power the detector's electronics from the panel's AUX supply. They are not part of the alarm zone: a resistor there loads the supply, and a wire could short it.",
      fix: "Remove it from +12V/0V. EOL resistors and zone wires belong on the ALARM and TAMPER terminals and the zone cable.",
      componentIds: onPower.map((c) => c.id),
    });
  }

  const touches = (p: PointId) => components.some((c) => c.a === p || c.b === p);
  const missingEnds = [ZONE_A, ZONE_B].filter((p) => !touches(p));
  if (missingEnds.length > 0) {
    findings.push({
      code: "zone-not-connected",
      severity: "error",
      title: `The ${missingEnds.map(name).join(" and the ")} ${missingEnds.length > 1 ? "are" : "is"} not connected.`,
      why: "The panel measures the loop between Z1 and COM. Both ends must connect to the detector wiring.",
      fix: "Run a wire from each panel zone terminal to the circuit at the detector.",
    });
  }

  const sealed = r.sealed!;
  const alarm = r.alarm!;
  const tamper = r.tamper!;

  if (sealed === 0) {
    if (shortedTogether(wiresOnly(components), ZONE_A, ZONE_B)) {
      findings.push({
        code: "direct-short",
        severity: "error",
        title: "Wires alone connect Z1 to COM: a direct short across the zone.",
        why: "The panel would read 0 Ω whatever the detector does, so it can never see an alarm or a tamper.",
        fix: "Remove the wire that joins the two zone conductors, so the loop has to pass through the detector's contacts and resistors.",
      });
    } else if (alarm !== null && alarm > 0) {
      findings.push({
        code: "missing-series-resistor",
        severity: "error",
        title: "The sealed loop reads 0 Ω: there is no series (seal) resistor.",
        why: "With the contacts closed nothing resists the current, so the panel can't tell a sealed zone from a shorted cable.",
        fix: `Fit a ${formatOhms(RESISTOR_VALUE)} resistor in series with the loop, e.g. between ALARM NC and TAMPER COM.`,
      });
    } else {
      findings.push({
        code: "direct-short",
        severity: "error",
        title: "The zone reads 0 Ω even with the alarm contact open: the contacts and resistors are bypassed.",
        why: "A wire is shorting across the detector circuit, so the panel can't see any change.",
        fix: "Look for a wire joining the zone conductors around the detector, and remove it.",
      });
    }
  } else if (!Number.isFinite(sealed)) {
    findings.push({
      code: "incomplete-loop",
      severity: "error",
      title: "The zone loop is incomplete: Z1 to COM reads open circuit when sealed.",
      why: "A sealed zone must read the seal value. Open circuit is what a cut cable looks like, so the panel would report a fault.",
      fix: "Follow the path from Z1 through ALARM COM/NC and TAMPER COM/NC back to COM, and add any missing wire or resistor.",
    });
  }

  if (Number.isFinite(sealed) && sealed > 0) {
    // Tamper must open the loop.
    if (Number.isFinite(tamper)) {
      const bypassed = shortedTogether(wiresOnly(components), TAMPER_CONTACT.a, TAMPER_CONTACT.b);
      findings.push(
        bypassed
          ? {
              code: "tamper-bypassed",
              severity: "error",
              title: "The tamper contact is bypassed by a wire.",
              why: "Removing the detector cover would not change the reading, so a tamper would go unnoticed.",
              fix: "Remove the wire across TAMPER COM and TAMPER NC. The tamper contact must be in series with the loop.",
            }
          : {
              code: "tamper-not-in-loop",
              severity: "error",
              title: `Opening the tamper contact still reads ${formatOhms(tamper)}: the tamper is not in series with the loop.`,
              why: "In this circuit the tamper must break the loop when it opens, so the panel sees an open circuit.",
              fix: "Route the loop through TAMPER COM and TAMPER NC, with nothing else connected across them.",
            },
      );
    }

    // Alarm must change the reading, to the alarm value.
    if (alarm !== null && alarm === sealed) {
      const bypassed = shortedTogether(wiresOnly(components), ALARM_CONTACT.a, ALARM_CONTACT.b);
      findings.push({
        code: "alarm-not-in-loop",
        severity: "error",
        title: bypassed ? "The alarm contact is bypassed by a wire." : "Opening the alarm contact doesn't change the reading: the alarm contact isn't in the loop.",
        why: "The panel would never see the PIR go into alarm.",
        fix: "Wire the loop through ALARM COM and ALARM NC, with only R2 across them.",
      });
    } else if (alarm !== null && !Number.isFinite(alarm) && Number.isFinite(sealed)) {
      findings.push({
        code: "missing-alarm-resistor",
        severity: "error",
        title: "Opening the alarm contact breaks the loop: there is no resistor across the alarm contact.",
        why: "In dual EOL the alarm resistor (R2) sits across the NC alarm contact. Without it, an alarm reads open circuit — the same as a cut cable or tamper — so the panel can't tell them apart.",
        fix: `Fit a ${formatOhms(RESISTOR_VALUE)} resistor directly across ALARM COM and ALARM NC.`,
      });
    }
  }

  const resistors = components.filter((c) => c.kind === "resistor");
  const wrongValue = resistors.filter((c) => c.ohms !== RESISTOR_VALUE);
  if (wrongValue.length > 0) {
    findings.push({
      code: "wrong-resistor-value",
      severity: "error",
      title: `Incorrect resistor value: ${wrongValue.map((c) => `${labels[c.id]} is ${formatOhms(c.ohms!)}`).join(", ")}.`,
      why: `This exercise uses two ${formatOhms(RESISTOR_VALUE)} resistors to give ${formatOhms(TARGET.sealed)} sealed and ${formatOhms(TARGET.alarm)} in alarm. Other values shift the readings outside what the panel expects.`,
      fix: `Replace ${wrongValue.length > 1 ? "them" : "it"} with ${formatOhms(RESISTOR_VALUE)} resistors.`,
      componentIds: wrongValue.map((c) => c.id),
    });
  }

  const has = (code: FindingCode) => findings.some((f) => f.code === code);
  if (Number.isFinite(sealed) && sealed > 0 && !readingMatches(sealed, TARGET.sealed) && !has("wrong-resistor-value")) {
    findings.push({
      code: "wrong-sealed",
      severity: "error",
      title: `Sealed reads ${formatOhms(sealed)}, not ${formatOhms(TARGET.sealed)}.`,
      why:
        sealed > TARGET.sealed
          ? "More resistance than one seal resistor: both resistors are in series even when the alarm contact is closed, so R2 isn't across the alarm contact."
          : "Less resistance than one seal resistor: resistors are in parallel somewhere they shouldn't be.",
      fix: "Only R1 should be in series when sealed. R2 goes directly across ALARM COM and ALARM NC, so the closed contact shorts it out.",
    });
  }
  if (alarm !== null && Number.isFinite(alarm) && alarm !== sealed && !readingMatches(alarm, TARGET.alarm) && !has("wrong-resistor-value") && !has("wrong-sealed")) {
    findings.push({
      code: "wrong-alarm",
      severity: "error",
      title: `Alarm reads ${formatOhms(alarm)}, not ${formatOhms(TARGET.alarm)}.`,
      why: "When the alarm contact opens, R2 should be added in series with R1: 2.2 kΩ + 2.2 kΩ = 4.4 kΩ.",
      fix: "Check that R2 is across the alarm contact only, and R1 is in series with the loop.",
    });
  }

  // Components that change no reading are dangling or bypassed (electrical test: remove each and re-measure).
  const noEffect = components.filter((c) => {
    if (POWER_POINTS.includes(c.a) || POWER_POINTS.includes(c.b)) return false;
    const without = components.filter((x) => x.id !== c.id);
    const other = readingsFor(without);
    return readings.every((x, i) => x.ohms === other[i]!.ohms);
  });
  if (noEffect.length > 0) {
    findings.push({
      code: "no-effect",
      severity: "warning",
      title: `${noEffect.map((c) => labels[c.id]).join(", ")} ${noEffect.length > 1 ? "have" : "has"} no effect on any reading.`,
      why: "It is either left dangling (one end not in the loop) or bypassed by a wire.",
      fix: "Remove it, or reconnect it where it belongs.",
      componentIds: noEffect.map((c) => c.id),
    });
  }

  const correct = readings.every((x) => x.matches) && !findings.some((f) => f.severity === "error");
  if (correct) {
    findings.unshift({
      code: "correct",
      severity: "success",
      title: "Correct wiring. Every state reads as it should.",
      why: `Sealed ${formatOhms(TARGET.sealed)} (R1 only — the closed alarm contact shorts out R2). Alarm ${formatOhms(TARGET.alarm)} (R1 + R2 in series). Tamper and a cut cable read open circuit; a shorted cable reads 0 Ω.`,
    });
    const canonical = new Set(CANONICAL.map(key));
    const mine = components.map(key);
    if (mine.length !== canonical.size || mine.some((k) => !canonical.has(k))) {
      findings.splice(1, 0, {
        code: "equivalent",
        severity: "info",
        title: "Electrically equivalent arrangement.",
        why: "Your layout differs from the step-by-step guide, but every state gives the same reading, so a panel can't tell the difference. In the field, follow the detector's and panel's documentation for where resistors are fitted.",
      });
    }
  }

  return { readings, findings, correct };
}

/* ---------------------------------------------------------- guided steps */

export type StepId = "identify" | "tamper" | "r1" | "r2" | "loop" | "test";

/** Electrical progress conditions for each guided step. */
export function stepStatus(components: PlacedComponent[], ctx: { reviewedTerminals: boolean; lastCheckCorrect: boolean }): Record<StepId, boolean> {
  const wires = wiresOnly(components);
  const joined = (a: PointId, b: PointId) => shortedTogether(wires, a, b);
  const zone = components.filter((c) => !POWER_POINTS.includes(c.a) && !POWER_POINTS.includes(c.b));
  const twoK2 = zone.filter((c) => c.kind === "resistor" && c.ohms === RESISTOR_VALUE);
  const acrossAlarm = (c: PlacedComponent) =>
    (joined(c.a, ALARM_CONTACT.a) && joined(c.b, ALARM_CONTACT.b)) || (joined(c.a, ALARM_CONTACT.b) && joined(c.b, ALARM_CONTACT.a));
  const sealed = resistanceBetween(zoneNetlist(components, "sealed"), ZONE_A, ZONE_B);

  return {
    identify: ctx.reviewedTerminals,
    tamper: joined(ZONE_B, TAMPER_CONTACT.b) || joined(ZONE_B, TAMPER_CONTACT.a),
    r1: twoK2.some((c) => !acrossAlarm(c)),
    r2: twoK2.some(acrossAlarm),
    loop: components.some((c) => c.a === ZONE_A || c.b === ZONE_A) && sealed.ok && Number.isFinite(sealed.ohms) && sealed.ohms > 0,
    test: ctx.lastCheckCorrect,
  };
}
