/**
 * Fault-finding exercises: a pre-built faulty circuit on the bench, probed
 * with the virtual multimeter. Every reading is calculated from the circuit
 * (visible wiring plus any hidden fault), never stored with the scenario.
 */
import type { Element } from "@/lib/eol/netlist";
import type { PlacedComponent, PointId } from "./bench";

export type FaultType = "missing-eol" | "bypassed-tamper" | "zone-short" | "open-circuit" | "wrong-value";

export const FAULT_TYPES: { id: FaultType; label: string }[] = [
  { id: "missing-eol", label: "Missing EOL resistor" },
  { id: "bypassed-tamper", label: "Bypassed tamper contact" },
  { id: "zone-short", label: "Short circuit in the zone wiring" },
  { id: "open-circuit", label: "Open circuit in the zone wiring" },
  { id: "wrong-value", label: "Wrong resistor value" },
];

export type FaultLocation = "alarm-contact" | "series" | "tamper-contact" | "joint-block" | "panel";

export const FAULT_LOCATIONS: { id: FaultLocation; label: string; points: [PointId, PointId] }[] = [
  { id: "panel", label: "Panel zone terminals (Z1 – COM)", points: ["panel-z", "panel-com"] },
  { id: "joint-block", label: "Joint block (J1 – J2)", points: ["j1", "j2"] },
  { id: "alarm-contact", label: "Across the ALARM contact (COM – NC)", points: ["alm-com", "alm-nc"] },
  { id: "series", label: "Series position (ALARM NC – TAMPER COM)", points: ["alm-nc", "tmp-com"] },
  { id: "tamper-contact", label: "Across the TAMPER contact (COM – NC)", points: ["tmp-com", "tmp-nc"] },
];

export interface HiddenFault {
  /** Undrawn elements added to the circuit until repaired. */
  elements: Element[];
  /** What the learner would find on site. */
  finding: string;
  /** Label for the repair action. */
  repairLabel: string;
}

export interface FaultScenario {
  id: string;
  title: string;
  difficulty: "Beginner";
  /** What the customer/panel reports. */
  symptom: string;
  /** Visible, editable wiring as found. */
  components: PlacedComponent[];
  hidden?: HiddenFault;
  answer: { type: FaultType; location: FaultLocation };
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
];

export function getFaultScenario(id: string): FaultScenario | undefined {
  return FAULT_SCENARIOS.find((s) => s.id === id);
}

export interface DiagnosisResult {
  typeCorrect: boolean;
  locationCorrect: boolean;
  correct: boolean;
}

export function checkDiagnosis(scenario: FaultScenario, diagnosis: { type: FaultType | null; location: FaultLocation | null }): DiagnosisResult {
  const typeCorrect = diagnosis.type === scenario.answer.type;
  const locationCorrect = diagnosis.location === scenario.answer.location;
  return { typeCorrect, locationCorrect, correct: typeCorrect && locationCorrect };
}
