/**
 * Fault-finding exercises: a pre-built faulty circuit on the bench, probed
 * with the virtual multimeter. Every reading is calculated from the circuit
 * (visible wiring plus any hidden fault), never stored with the scenario.
 */
import { shortedTogether, type Element } from "@/lib/eol/netlist";
import type { PlacedComponent, PointId } from "./bench";
import { checkWiring, readingMatches, readingsFor, TARGET } from "./check";

export type FaultType = "missing-eol" | "bypassed-tamper" | "zone-short" | "open-circuit" | "wrong-value";

export const FAULT_TYPES: { id: FaultType; label: string }[] = [
  { id: "missing-eol", label: "Missing EOL resistor" },
  { id: "bypassed-tamper", label: "Bypassed tamper contact" },
  { id: "zone-short", label: "Short circuit in the zone wiring" },
  { id: "open-circuit", label: "Open circuit in the zone wiring" },
  { id: "wrong-value", label: "Wrong resistor value" },
];

export type FaultLocation = "alarm-contact" | "series" | "tamper-contact" | "joint-block" | "panel" | "cable-panel" | "cable-detector";

export const FAULT_LOCATIONS: { id: FaultLocation; label: string; points: [PointId, PointId] }[] = [
  { id: "panel", label: "Panel zone terminals (Z1 – COM)", points: ["panel-z", "panel-com"] },
  { id: "cable-panel", label: "Cable between the panel and the joint block", points: ["panel-z", "j1"] },
  { id: "joint-block", label: "Joint block (J1 – J2)", points: ["j1", "j2"] },
  { id: "cable-detector", label: "Cable between the joint block and the detector", points: ["j2", "tmp-nc"] },
  { id: "alarm-contact", label: "Across the ALARM contact (COM – NC)", points: ["alm-com", "alm-nc"] },
  { id: "series", label: "Series position (ALARM NC – TAMPER COM)", points: ["alm-nc", "tmp-com"] },
  { id: "tamper-contact", label: "Across the TAMPER contact (COM – NC)", points: ["tmp-com", "tmp-nc"] },
];

/** Resistor values offered when asked what value is fitted. */
export const VALUE_OPTIONS = [1000, 2200, 4700, 10000];

export interface HiddenFault {
  /** Undrawn elements added to the circuit until repaired. */
  elements: Element[];
  /** Drawn components that don't conduct until repaired (e.g. a conductor broken inside its insulation). */
  brokenIds?: string[];
  /** What the learner would find on site. */
  finding: string;
  /** Label for the repair action. */
  repairLabel: string;
}

export interface FaultScenario {
  id: string;
  title: string;
  difficulty: "Beginner";
  /** One line for the exercise picker. */
  summary: string;
  /** What the customer/panel reports. */
  symptom: string;
  /** Visible, editable wiring as found. */
  components: PlacedComponent[];
  hidden?: HiddenFault;
  /** `value`: the learner must also say what value is fitted (checked against the circuit, not stored). */
  answer: { type: FaultType; location: FaultLocation; value?: true };
  hints: string[];
  /** Shown after a correct diagnosis. */
  explanation: { fault: string; expected: string; repair: string };
}

let n = 0;
const W = (a: PointId, b: PointId): PlacedComponent => ({ id: `c${++n}`, kind: "wire", a, b });
const R = (a: PointId, b: PointId, ohms = 2200): PlacedComponent => ({ id: `c${++n}`, kind: "resistor", ohms, a, b });
const fresh = <T>(build: () => T): T => {
  n = 0;
  return build();
};

export const FAULT_SCENARIOS: FaultScenario[] = [
  {
    id: "missing-eol-resistor",
    title: "Missing EOL resistor",
    difficulty: "Beginner",
    summary: "Alarms show as tamper. Find out what's missing from the detector.",
    symptom:
      "The zone reads sealed, but every time the PIR detects movement the panel reports a tamper / open-circuit fault instead of an alarm.",
    components: fresh(() => [W("panel-z", "alm-com"), R("alm-nc", "tmp-com"), W("tmp-nc", "panel-com")]),
    answer: { type: "missing-eol", location: "alarm-contact" },
    hints: [
      "Put the probes on Z1 and COM and compare the Sealed and Alarm readings. What should the alarm reading be?",
      "An alarm that reads OL means nothing is left in the loop when the alarm contact opens. Probe across ALARM COM and ALARM NC in the Alarm state.",
    ],
    explanation: {
      fault: "There is no resistor across the NC alarm contact. When the contact opens, the loop is broken completely, so the panel sees an open circuit — the same as a tamper or cut cable.",
      expected: "In dual EOL, R2 (2.2 kΩ) sits across the alarm contact. Closed, the contact shorts R2 out (2.2 kΩ sealed); open, R2 adds to R1 (4.4 kΩ alarm).",
      repair: "Fit a 2.2 kΩ resistor across ALARM COM and ALARM NC, then press Check repair.",
    },
  },
  {
    id: "bypassed-tamper",
    title: "Bypassed tamper contact",
    difficulty: "Beginner",
    summary: "Opening the detector cover raises nothing. Find the hidden bypass.",
    symptom: "During a service, removing the detector cover doesn't raise a tamper on the panel. Sealed and alarm work normally.",
    components: fresh(() => [W("panel-z", "alm-com"), R("alm-nc", "tmp-com"), R("alm-com", "alm-nc"), W("tmp-nc", "panel-com")]),
    hidden: {
      elements: [{ kind: "wire", a: "tmp-com", b: "tmp-nc", id: "hidden-link" }],
      finding: "A wire link has been fitted behind the terminal strip, straight across TAMPER COM and TAMPER NC.",
      repairLabel: "Remove the tamper link",
    },
    answer: { type: "bypassed-tamper", location: "tamper-contact" },
    hints: [
      "Select the Tamper state and probe Z1 to COM. A tamper should read OL. What do you get?",
      "Probe directly across TAMPER COM and TAMPER NC with the cover off. An open switch should read OL.",
    ],
    explanation: {
      fault: "The tamper contact is bypassed by a link, so opening it changes nothing: across the contact reads 0.0 Ω even with the cover off.",
      expected: "The NC tamper contact is in series with the loop. With the cover off it opens, and the whole zone reads open circuit (OL).",
      repair: "Remove the link, then confirm the tamper contact reads OL when open and press Check repair.",
    },
  },
  {
    id: "shorted-zone-wiring",
    title: "Shorted zone wiring",
    difficulty: "Beginner",
    summary: "The zone reads 0 Ω whatever happens. Trace the short.",
    symptom: "The panel shows this zone as shorted all the time. Walking in front of the PIR or opening its cover makes no difference.",
    components: fresh(() => [
      W("panel-z", "j1"),
      W("j1", "alm-com"),
      R("alm-nc", "tmp-com"),
      R("alm-com", "alm-nc"),
      W("tmp-nc", "j2"),
      W("j2", "panel-com"),
    ]),
    hidden: {
      elements: [{ kind: "wire", a: "j1", b: "j2", id: "hidden-short" }],
      finding: "Inside the joint block, a stray conductor strand bridges J1 and J2.",
      repairLabel: "Re-terminate the joint",
    },
    answer: { type: "zone-short", location: "joint-block" },
    hints: [
      "Probe Z1 to COM in each state. Does anything change the reading?",
      "Split the circuit. Remove the wire from J1 to ALARM COM, then measure the detector on its own (ALARM COM to TAMPER NC) and the joint on its own (J1 to J2).",
    ],
    explanation: {
      fault: "J1 and J2 are bridged in the joint block, so the zone conductors short together before they reach the detector. The panel reads 0 Ω whatever the detector does.",
      expected: "Measured on its own, the detector circuit reads 2.2 kΩ sealed and 4.4 kΩ in alarm. Between the zone conductors at the joint you should see the same — not 0.0 Ω.",
      repair: "Re-terminate the joint, then confirm Z1 to COM reads 2.2 kΩ sealed and press Check repair.",
    },
  },
  {
    id: "open-circuit",
    title: "Open circuit",
    difficulty: "Beginner",
    summary: "The zone is open all the time. Find the broken conductor.",
    symptom: "The panel reports this zone as open (tamper / fault) all the time, sealed or not. Nobody has touched the detector.",
    components: fresh(() => [
      W("panel-z", "j1"),
      W("j1", "alm-com"),
      R("alm-nc", "tmp-com"),
      R("alm-com", "alm-nc"),
      W("tmp-nc", "j2"),
      W("j2", "panel-com"),
    ]),
    hidden: {
      elements: [],
      brokenIds: ["c5"],
      finding: "The conductor from TAMPER NC to J2 is broken inside its insulation — it looks fine but doesn't conduct.",
      repairLabel: "Replace the damaged conductor",
    },
    answer: { type: "open-circuit", location: "cable-detector" },
    hints: [
      "Probe Z1 to COM. A zone that reads OL in every detector state is open somewhere along the loop.",
      "Check conductors for continuity: probe both ends of a wire. A good conductor reads 0.0 Ω; a broken one reads OL.",
      "Work outwards from the panel: Z1 to J1, COM to J2, then the cable from the joint block to the detector.",
    ],
    explanation: {
      fault: "A conductor between the joint block and the detector is open, so the loop never closes: Z1 to COM reads OL in every state.",
      expected: "Every conductor should read 0.0 Ω end to end, and the complete loop 2.2 kΩ sealed, 4.4 kΩ in alarm.",
      repair: "Replace the damaged conductor (or remove it and run a new wire), then press Check repair.",
    },
  },
  {
    id: "wrong-resistor-value",
    title: "Incorrect resistor value",
    difficulty: "Beginner",
    summary: "The sealed reading is out of range. Identify the wrong resistor and its value.",
    symptom: "After a detector replacement the panel shows this zone in trouble: the sealed reading is out of range, and alarms read high too.",
    components: fresh(() => [W("panel-z", "alm-com"), R("alm-nc", "tmp-com", 4700), R("alm-com", "alm-nc"), W("tmp-nc", "panel-com")]),
    answer: { type: "wrong-value", location: "series", value: true },
    hints: [
      "Probe Z1 to COM sealed. A 2k2 / 4k4 zone should read 2.200 kΩ — what do you get?",
      "Measure each resistor on its own: put the probes directly across it. Don't trust the colour bands — measure.",
      "R2 across the alarm contact is shorted while the contact is closed. Open the ALARM contact to measure it.",
    ],
    explanation: {
      fault: "The series resistor (R1) is 4.7 kΩ instead of 2.2 kΩ, so the zone reads 4.7 kΩ sealed and 6.9 kΩ in alarm — both outside what the panel expects.",
      expected: "Both resistors are 2.2 kΩ: 2.2 kΩ sealed, 4.4 kΩ in alarm.",
      repair: "Remove the 4.7 kΩ resistor and fit a 2.2 kΩ resistor in its place, then press Check repair.",
    },
  },
];

export function getFaultScenario(id: string): FaultScenario | undefined {
  return FAULT_SCENARIOS.find((s) => s.id === id);
}

export interface Diagnosis {
  type: FaultType | null;
  location: FaultLocation | null;
  value?: number | null;
}

/** The circuit as it currently stands in the exercise. */
export interface ExerciseCircuit {
  components: PlacedComponent[];
  repaired: boolean;
}

/** Components and undrawn elements that actually conduct. */
export function effectiveCircuit(scenario: FaultScenario, circuit: ExerciseCircuit): { components: PlacedComponent[]; extra: Element[] } {
  if (circuit.repaired || !scenario.hidden) return { components: circuit.components, extra: [] };
  const broken = new Set(scenario.hidden.brokenIds ?? []);
  return { components: circuit.components.filter((c) => !broken.has(c.id)), extra: scenario.hidden.elements };
}

/** Fault types consistent with the circuit's Z1–COM readings (an electrical check, not a lookup). */
export function faultTypesShown(components: PlacedComponent[], extra: Element[] = []): Set<FaultType> {
  const readings = readingsFor(components, extra);
  const read = (kind: string) => readings.find((x) => x.kind === kind)?.ohms ?? null;
  const shown = new Set<FaultType>();
  const sealed = read("sealed");
  const alarm = read("alarm");
  const tamper = read("tamper");
  if (sealed === null || alarm === null || tamper === null) return shown;
  if (sealed === 0) shown.add("zone-short");
  if (!Number.isFinite(sealed)) shown.add("open-circuit");
  if (Number.isFinite(sealed) && sealed > 0 && !Number.isFinite(alarm)) shown.add("missing-eol");
  if (Number.isFinite(sealed) && sealed > 0 && Number.isFinite(tamper)) shown.add("bypassed-tamper");
  if (Number.isFinite(sealed) && sealed > 0 && (!readingMatches(sealed, TARGET.sealed) || (Number.isFinite(alarm) && !readingMatches(alarm, TARGET.alarm)))) {
    shown.add("wrong-value");
  }
  return shown;
}

/** Resistors fitted at a location: their ends join the location's two points (directly or by wires). */
export function resistorsAt(components: PlacedComponent[], location: FaultLocation): PlacedComponent[] {
  const [p, q] = FAULT_LOCATIONS.find((l) => l.id === location)!.points;
  const wires: Element[] = components.filter((c) => c.kind === "wire").map((c) => ({ kind: "wire", a: c.a, b: c.b }));
  const at = (x: PointId, y: PointId) => x === y || shortedTogether(wires, x, y);
  return components.filter((c) => c.kind === "resistor" && ((at(c.a, p) && at(c.b, q)) || (at(c.a, q) && at(c.b, p))));
}

export interface DiagnosisResult {
  /** The circuit as it stands still shows a fault. */
  faultPresent: boolean;
  typeCorrect: boolean;
  locationCorrect: boolean;
  /** Only for scenarios that ask for the fitted value; checked against the resistor actually there. */
  valueCorrect?: boolean;
  /** The resistance actually fitted at the answer location, when asked. */
  actualValue?: number | null;
  correct: boolean;
}

/**
 * Checks a diagnosis against the scenario AND the simulated circuit: the fault
 * must still be present, the chosen type must match the circuit's readings,
 * and a stated value must match the resistor actually fitted.
 */
export function checkDiagnosis(scenario: FaultScenario, diagnosis: Diagnosis, circuit: ExerciseCircuit = { components: scenario.components, repaired: false }): DiagnosisResult {
  const { components, extra } = effectiveCircuit(scenario, circuit);
  const faultPresent = !checkWiring(components, extra).correct;
  const shown = faultTypesShown(components, extra);
  const typeCorrect = diagnosis.type === scenario.answer.type && shown.has(diagnosis.type);
  const locationCorrect = diagnosis.location === scenario.answer.location;
  let valueCorrect: boolean | undefined;
  let actualValue: number | null | undefined;
  if (scenario.answer.value) {
    const fitted = resistorsAt(components, scenario.answer.location);
    actualValue = fitted.length === 1 ? fitted[0]!.ohms! : null;
    valueCorrect = actualValue !== null && diagnosis.value === actualValue;
  }
  const correct = faultPresent && typeCorrect && locationCorrect && valueCorrect !== false;
  return { faultPresent, typeCorrect, locationCorrect, valueCorrect, actualValue, correct };
}
