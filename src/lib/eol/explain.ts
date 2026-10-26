/**
 * Plain-language explanations generated from the circuit and the engine's
 * results, never written by hand per circuit, so they cannot disagree with
 * the calculated readings.
 */
import { OPEN_CIRCUIT, SHORT_CIRCUIT, formatOhms, networkResistance, resistorCode, type ContactPositions } from "./engine";
import type { Circuit, CircuitNode, CircuitState, ContactNode } from "./model";

const FN_NAME = { alarm: "alarm", tamper: "tamper", other: "" } as const;

function contactName(c: ContactNode) {
  return `${FN_NAME[c.function] ? `${FN_NAME[c.function]} contact` : "contact"} (${c.id})`;
}

interface Expr {
  /** e.g. "R1 + R2" */
  ids: string;
  /** e.g. "2.2 kΩ + 2.2 kΩ" */
  values: string;
  terms: number;
  ohms: number;
}

/** Builds the series/parallel equation for the conducting part of a network. */
function expression(node: CircuitNode, positions: ContactPositions, bypassed: string[]): Expr | null {
  const r = networkResistance(node, positions);
  if (r === OPEN_CIRCUIT) return null;
  if (r === SHORT_CIRCUIT) return { ids: "", values: "", terms: 0, ohms: 0 };
  if (node.kind === "resistor") return { ids: node.id, values: formatOhms(node.ohms!), terms: 1, ohms: r };
  if (node.kind === "contact") return { ids: "", values: "", terms: 0, ohms: 0 };

  if (node.kind === "series") {
    const parts = node.children.map((c) => expression(c, positions, bypassed)).filter((e): e is Expr => e !== null && e.terms > 0);
    if (parts.length === 1) return parts[0]!;
    return { ids: parts.map((p) => wrap(p, "series").ids).join(" + "), values: parts.map((p) => wrap(p, "series").values).join(" + "), terms: parts.length, ohms: r };
  }

  // Parallel (no zero-ohm branch here, or r would be 0): open branches drop out.
  const parts = node.children.map((c) => expression(c, positions, bypassed)).filter((e): e is Expr => e !== null && e.terms > 0);
  if (parts.length === 1) return parts[0]!;
  return { ids: parts.map((p) => wrap(p, "parallel").ids).join(" ∥ "), values: parts.map((p) => wrap(p, "parallel").values).join(" ∥ "), terms: parts.length, ohms: r };
}

function wrap(e: Expr, within: "series" | "parallel"): Expr {
  const needs = e.terms > 1 && ((within === "series" && e.ids.includes("∥")) || (within === "parallel" && e.ids.includes("+")));
  return needs ? { ...e, ids: `(${e.ids})`, values: `(${e.values})` } : e;
}

/** Resistors bypassed (shorted out) by a closed contact or other zero-ohm branch alongside them. */
function findBypassed(node: CircuitNode, positions: ContactPositions, out: string[]) {
  if (node.kind === "resistor" || node.kind === "contact") return;
  if (node.kind === "parallel") {
    const zero = node.children.filter((c) => networkResistance(c, positions) === SHORT_CIRCUIT);
    if (zero.length > 0) {
      const by = zero[0]!.kind === "contact" ? `the closed ${contactName(zero[0] as ContactNode)}` : "a zero-ohm path";
      for (const c of node.children) {
        if (zero.includes(c)) continue;
        const resistors = resistorsIn(c);
        if (resistors.length > 0) out.push(`${resistors.join(" and ")} ${resistors.length > 1 ? "are" : "is"} bypassed (shorted out) by ${by}, so no measurement current flows through ${resistors.length > 1 ? "them" : "it"}.`);
      }
      return;
    }
  }
  node.children.forEach((c) => findBypassed(c, positions, out));
}

function resistorsIn(node: CircuitNode): string[] {
  if (node.kind === "resistor") return [node.id];
  if (node.kind === "contact") return [];
  return node.children.flatMap(resistorsIn);
}

function contactsIn(node: CircuitNode): ContactNode[] {
  if (node.kind === "contact") return [node];
  if (node.kind === "resistor") return [];
  return node.children.flatMap(contactsIn);
}

export interface Explanation {
  headline: string;
  /** What changed compared with the sealed condition. */
  changes: string[];
  /** Where measurement current flows (or why it can't). */
  path: string;
  /** e.g. "R1 + R2 = 2.2 kΩ + 2.2 kΩ = 4.4 kΩ", or null when open/short. */
  equation: string | null;
  bypassed: string[];
  /** Individual resistor values vs the total the panel measures. */
  individualVsTotal: string | null;
  ohms: number;
}

export function explainCircuit(circuit: Circuit, positions: ContactPositions, normal: ContactPositions, line: CircuitState["line"]): Explanation {
  const contacts = contactsIn(circuit.network);
  const changes: string[] = [];

  if (line === "open") {
    return {
      headline: "Cable cut",
      changes: ["The cable between the panel and the detector is cut."],
      path: "No current can flow anywhere in the loop, so the panel sees an open circuit, whatever the contacts are doing.",
      equation: null,
      bypassed: [],
      individualVsTotal: null,
      ohms: OPEN_CIRCUIT,
    };
  }
  if (line === "short") {
    return {
      headline: "Cable shorted",
      changes: ["The two cable cores are shorted together between the panel and the detector."],
      path: "Measurement current takes the short instead of going out to the detector, so the panel sees 0 Ω and the resistors and contacts have no effect.",
      equation: null,
      bypassed: [],
      individualVsTotal: null,
      ohms: SHORT_CIRCUIT,
    };
  }

  for (const c of contacts) {
    const now = positions[c.id];
    const sealed = normal[c.id];
    if (now && sealed && now !== sealed) {
      changes.push(`The ${contactName(c)} has ${now === "open" ? "opened" : "closed"} — it is ${sealed} when sealed (${c.type}).`);
    }
  }
  const changedFns = new Set(contacts.filter((c) => positions[c.id] !== normal[c.id]).map((c) => c.function));
  const headline =
    changes.length === 0 ? "Sealed (normal)" : changedFns.has("tamper") && changedFns.has("alarm") ? "Alarm and tamper" : changedFns.has("tamper") ? "Tamper opened" : "Alarm contact changed";
  if (changes.length === 0) changes.push("All contacts are in their sealed positions.");

  const ohms = networkResistance(circuit.network, positions);
  const bypassed: string[] = [];
  findBypassed(circuit.network, positions, bypassed);

  if (ohms === OPEN_CIRCUIT) {
    const open = contacts.filter((c) => positions[c.id] === "open" && networkResistance({ kind: "series", children: [c] }, positions) === OPEN_CIRCUIT);
    const series = open.filter((c) => !inParallelWithPath(circuit.network, c.id, positions));
    return {
      headline,
      changes,
      path: `There is no complete path between the terminals${series.length ? `: the open ${series.map(contactName).join(" and ")} breaks the loop` : ""}. The panel sees an open circuit — the same as a cut cable.`,
      equation: null,
      bypassed,
      individualVsTotal: null,
      ohms,
    };
  }
  if (ohms === SHORT_CIRCUIT) {
    return {
      headline,
      changes,
      path: "A closed contact connects the terminals directly, bypassing every resistor, so the panel sees 0 Ω — the same as a shorted cable.",
      equation: null,
      bypassed,
      individualVsTotal: null,
      ohms,
    };
  }

  const expr = expression(circuit.network, positions, bypassed)!;
  const equation = expr.terms > 1 ? `${expr.ids} = ${expr.values} = ${formatOhms(ohms)}` : `${expr.ids} = ${formatOhms(ohms)}`;
  const kind = expr.ids.includes("∥") && expr.ids.includes("+") ? "series and parallel" : expr.ids.includes("∥") ? "parallel" : expr.terms > 1 ? "series" : "";
  const path =
    expr.terms > 1
      ? `Measurement current flows through ${expr.ids.replace(/[()]/g, "").split(/ [+∥] /).join(", ")} (${kind}).`
      : `Measurement current flows through ${expr.ids} only.`;

  let individualVsTotal: string | null = null;
  if (expr.terms > 1) {
    individualVsTotal =
      kind === "series"
        ? `Each resistor has its own value, but the panel only measures the total between the terminals. In series the values add: ${expr.values} = ${formatOhms(ohms)} — a total made from ${expr.terms} resistors, not a single ${resistorCode(ohms)} part.`
        : `Each resistor has its own value, but the panel only measures the total between the terminals. Resistors in parallel give a total lower than the smallest one: ${expr.values} = ${formatOhms(ohms)}.`;
  }
  return { headline, changes, path, equation, bypassed, individualVsTotal, ohms };
}

/** True when an open contact sits inside a parallel group that still conducts (so it does not break the loop). */
function inParallelWithPath(node: CircuitNode, contactId: string, positions: ContactPositions): boolean {
  if (node.kind === "resistor" || node.kind === "contact") return false;
  const containing = node.children.find((c) => contactsIn(c).some((x) => x.id === contactId));
  if (!containing) return false;
  if (node.kind === "parallel" && networkResistance(node, positions) !== OPEN_CIRCUIT) return true;
  return inParallelWithPath(containing, contactId, positions);
}

/**
 * What a reading would mean to a panel documented for the given example values.
 * Never asserts how a specific real panel behaves.
 */
export function interpretAgainstExample(ohms: number, example?: { normal: number; alarm?: number; label: string }): string {
  if (ohms === OPEN_CIRCUIT || ohms === SHORT_CIRCUIT) {
    return `${ohms === OPEN_CIRCUIT ? "Open circuit" : "Short circuit"}. EOL inputs are designed so a cut or shorted cable can be told apart from sealed and alarm, but how a specific panel reports it must come from that panel's documentation.`;
  }
  if (!example) return "Generic circuit: how a panel treats this reading depends on its documented values and thresholds.";
  const near = (a: number, b: number) => Math.abs(a - b) <= b * 0.001;
  const values = `${formatOhms(example.normal)} sealed${example.alarm ? ` / ${formatOhms(example.alarm)} alarm` : ""}`;
  if (near(ohms, example.normal)) return `Matches the sealed value of the ${example.label} (${values}). A panel documented for these values would see this as sealed.`;
  if (example.alarm && near(ohms, example.alarm)) return `Matches the alarm value of the ${example.label} (${values}). A panel documented for these values would see this as alarm.`;
  return `Matches neither value of the ${example.label} (${values}). How a panel treats it depends on its documented thresholds.`;
}
