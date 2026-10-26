/**
 * EOL circuit calculation engine.
 *
 * Pure functions over the circuit model: no UI, no content access. Resistance
 * is returned in ohms, with Infinity for an open circuit and 0 for a short.
 * Contact positions are always supplied explicitly — the engine never guesses
 * how a contact behaves in a given state.
 */
import type { Circuit, CircuitNode, CircuitState, ContactNode, ResistorNode } from "./model";

export type ContactPosition = "open" | "closed";
export type ContactPositions = Record<string, ContactPosition>;

export const OPEN_CIRCUIT = Number.POSITIVE_INFINITY;
export const SHORT_CIRCUIT = 0;

/** Relative tolerance used to decide that two calculated readings are the same value. */
const SAME_VALUE_EPSILON = 1e-9;

export class CircuitError extends Error {
  constructor(
    public readonly code: "resistor-value-missing" | "contact-position-missing" | "empty-group",
    public readonly componentId?: string,
  ) {
    super(
      code === "resistor-value-missing"
        ? `Resistor ${componentId} has no documented value`
        : code === "contact-position-missing"
          ? `Contact ${componentId} has no position in this state`
          : "A series or parallel group has no components",
    );
    this.name = "CircuitError";
  }
}

/** All resistors and contacts in a network, depth first, left to right. */
export function circuitComponents(node: CircuitNode): (ResistorNode | ContactNode)[] {
  if (node.kind === "resistor" || node.kind === "contact") return [node];
  return node.children.flatMap(circuitComponents);
}

export function seriesResistance(values: number[]): number {
  if (values.length === 0) throw new CircuitError("empty-group");
  return values.some((v) => v === OPEN_CIRCUIT) ? OPEN_CIRCUIT : values.reduce((a, b) => a + b, 0);
}

export function parallelResistance(values: number[]): number {
  if (values.length === 0) throw new CircuitError("empty-group");
  if (values.some((v) => v === SHORT_CIRCUIT)) return SHORT_CIRCUIT;
  const conductance = values.filter((v) => v !== OPEN_CIRCUIT).reduce((sum, v) => sum + 1 / v, 0);
  return conductance === 0 ? OPEN_CIRCUIT : 1 / conductance;
}

/** Resistance of a network for the given contact positions. Throws CircuitError if data is missing. */
export function networkResistance(node: CircuitNode, positions: ContactPositions): number {
  switch (node.kind) {
    case "resistor":
      if (node.ohms === null) throw new CircuitError("resistor-value-missing", node.id);
      return node.ohms;
    case "contact": {
      const position = positions[node.id];
      if (!position) throw new CircuitError("contact-position-missing", node.id);
      return position === "closed" ? SHORT_CIRCUIT : OPEN_CIRCUIT;
    }
    case "series":
      return seriesResistance(node.children.map((c) => networkResistance(c, positions)));
    case "parallel":
      return parallelResistance(node.children.map((c) => networkResistance(c, positions)));
  }
}

/** Reading across the panel input terminals for a circuit state. */
export function stateResistance(circuit: Circuit, state: CircuitState): number {
  if (state.line === "open") return OPEN_CIRCUIT;
  if (state.line === "short") return SHORT_CIRCUIT;
  return networkResistance(circuit.network, state.contacts);
}

/**
 * Components that carry current when the panel measures the loop. Used to
 * highlight the active path: e.g. a closed contact bypasses its parallel resistor.
 */
export function conductingComponents(node: CircuitNode, positions: ContactPositions): Set<string> {
  const ids = new Set<string>();
  const visit = (n: CircuitNode) => {
    const r = networkResistance(n, positions);
    if (r === OPEN_CIRCUIT) return;
    if (n.kind === "resistor" || n.kind === "contact") {
      ids.add(n.id);
    } else if (n.kind === "series") {
      n.children.forEach(visit);
    } else {
      // In a parallel group, a zero-ohm branch carries all the current.
      const shorted = n.children.filter((c) => networkResistance(c, positions) === SHORT_CIRCUIT);
      (shorted.length > 0 ? shorted : n.children).forEach(visit);
    }
  };
  visit(node);
  return ids;
}

export function sameReading(a: number, b: number): boolean {
  if (a === b) return true;
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  return Math.abs(a - b) <= SAME_VALUE_EPSILON * Math.max(Math.abs(a), Math.abs(b));
}

/* --------------------------------------------------------------- formatting */

/** Resistor code as printed on drawings, e.g. 4700 → "4k7", 2200 → "2k2", 470 → "470R", 1e6 → "1M". */
export function resistorCode(ohms: number): string {
  const [unit, scale] = ohms >= 1e6 ? ["M", 1e6] : ohms >= 1e3 ? ["k", 1e3] : ["R", 1];
  const value = Math.round((ohms / scale) * 1000) / 1000;
  const [whole, fraction] = String(value).split(".");
  return fraction ? `${whole}${unit}${fraction}` : `${whole}${unit === "R" ? "R" : unit}`;
}

/** Human-readable reading, e.g. "6.9 kΩ", "Open circuit", "Short circuit (0 Ω)". */
export function formatOhms(ohms: number): string {
  if (ohms === OPEN_CIRCUIT) return "Open circuit";
  if (ohms === SHORT_CIRCUIT) return "Short circuit (0 Ω)";
  if (ohms >= 1e6) return `${trim(ohms / 1e6)} MΩ`;
  if (ohms >= 1e3) return `${trim(ohms / 1e3)} kΩ`;
  return `${trim(ohms)} Ω`;
}

function trim(n: number): string {
  return Number(n.toPrecision(4)).toLocaleString("en-AU", { maximumFractionDigits: 3 });
}
