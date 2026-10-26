/**
 * Target solver: finds resistor values that make a circuit produce target
 * readings (e.g. 2k2 sealed / 4k4 alarm), using the calculation engine itself
 * as the model. No per-topology formulas are hard-coded, so any arrangement
 * works, and the result is always re-checked with the engine.
 *
 * It only adjusts resistor values; it never changes the topology. Whether a
 * real panel uses a given topology must come from its documentation.
 */
import { OPEN_CIRCUIT, SHORT_CIRCUIT, circuitComponents, stateResistance } from "./engine";
import type { Circuit, CircuitNode, CircuitState, ResistorNode } from "./model";
import { realise } from "./standard-values";

export interface Targets {
  normal?: number;
  alarm?: number;
  tamper?: number;
}

export type SolveResult =
  | { ok: true; values: Record<string, number>; notes: string[] }
  | { ok: false; reason: string; notes: string[] };

const TARGET_KINDS = ["normal", "alarm", "tamper"] as const;
const KIND_LABEL = { normal: "sealed", alarm: "alarm", tamper: "tamper" } as const;

/** A copy of the network with resistor values replaced (others unchanged). */
export function withResistorValues(node: CircuitNode, values: Record<string, number>): CircuitNode {
  if (node.kind === "resistor") return values[node.id] !== undefined ? { ...node, ohms: values[node.id]! } : node;
  if (node.kind === "contact") return node;
  return { ...node, children: node.children.map((c) => withResistorValues(c, values)) };
}

function solveLinear(a: number[][], b: number[]): number[] | null {
  const n = b.length;
  const m = a.map((row, i) => [...row, b[i]!]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(m[r]![col]!) > Math.abs(m[pivot]![col]!)) pivot = r;
    if (Math.abs(m[pivot]![col]!) < 1e-14) return null;
    [m[col], m[pivot]] = [m[pivot]!, m[col]!];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = m[r]![col]! / m[col]![col]!;
      for (let c = col; c <= n; c++) m[r]![c]! -= f * m[col]![c]!;
    }
  }
  return m.map((row, i) => row[n]! / row[i]!);
}

export function solveForTargets(circuit: Circuit, states: CircuitState[], targets: Targets): SolveResult {
  const notes: string[] = [];
  const resistors = circuitComponents(circuit.network).filter((c): c is ResistorNode => c.kind === "resistor");
  const ids = resistors.map((r) => r.id);
  const start = Object.fromEntries(resistors.map((r) => [r.id, r.ohms ?? 1000]));

  const reading = (values: Record<string, number>, state: CircuitState) =>
    stateResistance({ ...circuit, network: withResistorValues(circuit.network, values) }, state);

  // Equations: one per target whose state reading actually depends on the resistors.
  const equations: { kind: (typeof TARGET_KINDS)[number]; state: CircuitState; target: number }[] = [];
  for (const kind of TARGET_KINDS) {
    const target = targets[kind];
    if (target === undefined) continue;
    const state = states.find((s) => s.kind === kind && s.line === "intact");
    if (!state) {
      notes.push(`This arrangement has no ${KIND_LABEL[kind]} state, so the ${KIND_LABEL[kind]} target is not used.`);
      continue;
    }
    const r = reading(start, state);
    if (r === OPEN_CIRCUIT || r === SHORT_CIRCUIT) {
      notes.push(
        `In this arrangement the ${KIND_LABEL[kind]} state always reads ${r === OPEN_CIRCUIT ? "open circuit" : "0 Ω (short)"}, whatever the resistor values, so the ${KIND_LABEL[kind]} target is not used.`,
      );
      continue;
    }
    if (!(target > 0) || !Number.isFinite(target)) return { ok: false, reason: `The ${KIND_LABEL[kind]} target must be a positive resistance.`, notes };
    equations.push({ kind, state, target });
  }

  if (ids.length === 0) {
    if (equations.length > 0) return { ok: false, reason: "This arrangement has no resistors, so it cannot produce resistance targets.", notes };
    return { ok: true, values: {}, notes };
  }
  if (equations.length < ids.length) {
    const missing = TARGET_KINDS.filter((k) => !equations.some((e) => e.kind === k)).map((k) => KIND_LABEL[k]);
    return {
      ok: false,
      reason: `This arrangement has ${ids.length} resistors, so it needs ${ids.length} target readings (add a ${missing.join(" or ")} target).`,
      notes,
    };
  }
  const used = equations.slice(0, ids.length);

  // Newton's method in log space (keeps every value positive).
  let x = ids.map((id) => Math.log(start[id]!));
  const valuesOf = (v: number[]) => Object.fromEntries(ids.map((id, i) => [id, Math.exp(v[i]!)]));
  const residual = (v: number[]) => used.map((e) => Math.log(reading(valuesOf(v), e.state)) - Math.log(e.target));
  let converged = false;
  for (let iter = 0; iter < 80; iter++) {
    const g = residual(x);
    if (g.some((v) => !Number.isFinite(v))) break;
    if (Math.max(...g.map(Math.abs)) < 1e-12) {
      converged = true;
      break;
    }
    const h = 1e-6;
    const jacobian = used.map((_, row) =>
      ids.map((__, col) => {
        const up = [...x];
        const down = [...x];
        up[col]! += h;
        down[col]! -= h;
        return (residual(up)[row]! - residual(down)[row]!) / (2 * h);
      }),
    );
    const dx = solveLinear(jacobian, g.map((v) => -v));
    if (!dx) break;
    const scale = Math.min(1, 1 / Math.max(...dx.map(Math.abs)));
    x = x.map((v, i) => v + dx[i]! * scale);
    if (x.some((v) => Math.abs(v) > 40)) break;
  }

  const values = valuesOf(x);
  // Independent re-check of every target with the engine.
  const ok =
    converged &&
    equations.every((e) => Math.abs(reading(values, e.state) - e.target) <= e.target * 1e-9) &&
    Object.values(values).every((v) => v >= 1 && v <= 1e8);
  if (!ok) {
    const sealed = targets.normal;
    const hint =
      sealed !== undefined && targets.alarm !== undefined && targets.alarm <= sealed
        ? " In these arrangements the alarm reading must be higher than the sealed reading."
        : "";
    return { ok: false, reason: `These targets cannot be produced by this arrangement with positive resistor values.${hint}`, notes };
  }
  // Clean floating-point noise (e.g. 2199.9999999 → 2200).
  return { ok: true, values: Object.fromEntries(Object.entries(values).map(([k, v]) => [k, Math.round(v * 1000) / 1000])), notes };
}

/**
 * Replaces any resistor whose value is not a standard part with the standard
 * parts that make it exactly (e.g. 4k4 → 2k2 + 2k2 in series), so the diagram
 * shows real components. Inexact values are left as they are.
 */
export function buildWithStandardParts(node: CircuitNode): CircuitNode {
  if (node.kind === "contact") return node;
  if (node.kind === "series" || node.kind === "parallel") return { ...node, children: node.children.map(buildWithStandardParts) };
  if (node.ohms === null) return node;
  const r = realise(node.ohms);
  if (r.arrangement === "single" || !r.exact) return node;
  const parts: CircuitNode[] = r.parts.map((ohms, i) => ({
    ...node,
    id: `${node.id}${String.fromCharCode(97 + i)}`,
    ohms,
    purpose: `${i === 0 ? "Part" : "Second part"} of ${node.id}: ${r.arrangement === "series" ? "two standard resistors in series" : "two standard resistors in parallel"} make the required value.${node.purpose ? ` ${node.purpose}` : ""}`,
  }));
  return { kind: r.arrangement, children: parts };
}
