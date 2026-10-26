/**
 * Generic circuit explorer: state model and URL format. Pure functions only.
 *
 * A circuit is built from a generic template (a validated content record),
 * a preset or custom targets (solved with the engine, then built from
 * standard parts), and the user's own edits. Readings are always recalculated
 * by the engine from the resulting circuit.
 */
import type { EolPreset } from "@/lib/content/schema";
import type { WiringDetail } from "@/lib/content/repository";
import { classifyCircuit, type CircuitClassification } from "./classification";
import { circuitComponents, stateResistance, type ContactPositions } from "./engine";
import type { Circuit, CircuitState } from "./model";
import { buildWithStandardParts, solveForTargets, withResistorValues, type Targets } from "./solve";
import { analyseCircuit, type CircuitAnalysis } from "./validate";

export const CUSTOM_PRESET = "custom";

export interface ExplorerParams {
  /** Template (generic circuit record) id. */
  t?: string;
  /** Preset id, or "custom". */
  p?: string;
  /** Custom targets (ohms). */
  seal?: number;
  alarm?: number;
  tamper?: number;
  /** User edits: resistor id → ohms. */
  r?: Record<string, number>;
  /** Contact positions set by tapping or the state selector. */
  c?: ContactPositions;
  line?: "open" | "short";
}

const num = (v: string | null) => {
  const n = Number(v);
  return v !== null && v !== "" && Number.isFinite(n) && n > 0 ? n : undefined;
};

function parsePairs<T extends string | number>(raw: string | null, value: (v: string) => T | undefined): Record<string, T> | undefined {
  if (!raw) return undefined;
  const out: Record<string, T> = {};
  for (const pair of raw.split(",")) {
    const [k, v] = pair.split(":");
    if (!k || v === undefined || !/^[A-Za-z][A-Za-z0-9_-]{0,15}$/.test(k)) continue;
    const parsed = value(v);
    if (parsed !== undefined) out[k] = parsed;
  }
  return Object.keys(out).length ? out : undefined;
}

export function parseExplorer(search: string): ExplorerParams {
  const q = new URLSearchParams(search);
  const line = q.get("line");
  return {
    t: q.get("t") || undefined,
    p: q.get("p") || undefined,
    seal: num(q.get("seal")),
    alarm: num(q.get("alarm")),
    tamper: num(q.get("tamper")),
    r: parsePairs(q.get("r"), (v) => num(v)),
    c: parsePairs(q.get("c"), (v) => (v === "open" || v === "closed" ? v : undefined)),
    line: line === "open" || line === "short" ? line : undefined,
  };
}

export function explorerToSearch(p: ExplorerParams): string {
  const q = new URLSearchParams();
  if (p.t) q.set("t", p.t);
  if (p.p) q.set("p", p.p);
  if (p.p === CUSTOM_PRESET) {
    if (p.seal) q.set("seal", String(p.seal));
    if (p.alarm) q.set("alarm", String(p.alarm));
    if (p.tamper) q.set("tamper", String(p.tamper));
  }
  if (p.r && Object.keys(p.r).length) q.set("r", Object.entries(p.r).map(([k, v]) => `${k}:${v}`).join(","));
  if (p.c && Object.keys(p.c).length) q.set("c", Object.entries(p.c).map(([k, v]) => `${k}:${v}`).join(","));
  if (p.line) q.set("line", p.line);
  const s = q.toString();
  return s ? `?${s}` : "";
}

export interface ExplorerCircuit {
  template: WiringDetail;
  preset: EolPreset | null;
  isCustomPreset: boolean;
  targets: Targets | null;
  /** Why the preset/targets could not be applied (the template's own values are used instead). */
  solveError: string | null;
  solveNotes: string[];
  circuit: Circuit;
  states: CircuitState[];
  /** Resistor values the preset/targets produced, before user edits (for "Modified" + Reset). */
  baseValues: Record<string, number>;
  /** User edits that actually differ from the base values. */
  edits: Record<string, number>;
  modified: boolean;
  positions: ContactPositions;
  normalPositions: ContactPositions;
  line: CircuitState["line"];
  /** The defined state matching the current contacts and cable, if any. */
  matchedStateId: string | null;
  /** Current reading across the terminals. */
  ohms: number;
  analysis: CircuitAnalysis;
  classification: CircuitClassification;
}

function resistorValues(c: Circuit): Record<string, number> {
  return Object.fromEntries(
    circuitComponents(c.network)
      .filter((x) => x.kind === "resistor" && x.ohms !== null)
      .map((x) => [x.id, (x as { ohms: number }).ohms]),
  );
}

export function buildExplorerCircuit(templates: WiringDetail[], presets: EolPreset[], params: ExplorerParams): ExplorerCircuit {
  const template = templates.find((t) => t.id === params.t) ?? templates[0]!;
  const isCustomPreset = params.p === CUSTOM_PRESET;
  const preset = isCustomPreset ? null : (presets.find((p) => p.id === params.p) ?? presets.find((p) => p.isDefault) ?? presets[0] ?? null);
  const targets: Targets | null = isCustomPreset
    ? params.seal
      ? { normal: params.seal, alarm: params.alarm, tamper: params.tamper }
      : null
    : preset
      ? { normal: preset.targets.normal, alarm: preset.targets.alarm, tamper: preset.targets.tamper }
      : null;

  let circuit: Circuit = template.circuit;
  let solveError: string | null = null;
  let solveNotes: string[] = [];
  if (targets) {
    const solved = solveForTargets(template.circuit, template.states, targets);
    solveNotes = solved.notes;
    if (solved.ok) circuit = { ...circuit, network: buildWithStandardParts(withResistorValues(circuit.network, solved.values)) };
    else solveError = solved.reason;
  } else if (isCustomPreset) {
    solveError = "Enter a sealed target to size the resistors.";
  }

  const baseValues = resistorValues(circuit);
  const edits = Object.fromEntries(Object.entries(params.r ?? {}).filter(([id, v]) => id in baseValues && baseValues[id] !== v));
  if (Object.keys(edits).length) circuit = { ...circuit, network: withResistorValues(circuit.network, edits) };
  const modified = Object.keys(edits).length > 0;

  const states: CircuitState[] = template.states.map((s) => ({ id: s.id, kind: s.kind, label: s.label, line: s.line, contacts: s.contacts }));
  const normalPositions = states.find((s) => s.kind === "normal")?.contacts ?? {};
  const contactIds = circuitComponents(circuit.network)
    .filter((x) => x.kind === "contact")
    .map((x) => x.id);
  const positions: ContactPositions = Object.fromEntries(contactIds.map((id) => [id, params.c?.[id] ?? normalPositions[id] ?? "closed"]));
  const line = params.line ?? "intact";

  const matched = states.find((s) =>
    line === "intact" ? s.line === "intact" && contactIds.every((id) => s.contacts[id] === positions[id]) : s.line === line,
  );
  const ohms = stateResistance(circuit, { id: "current", kind: "other", line, contacts: positions });
  const analysis = analyseCircuit({ circuit, states, inputType: template.inputType });
  const classification = classifyCircuit({
    analysis,
    manufacturerStatus: "demonstration",
    generic: true,
    custom: isCustomPreset || modified,
  });

  return {
    template,
    preset,
    isCustomPreset,
    targets,
    solveError,
    solveNotes,
    circuit,
    states,
    baseValues,
    edits,
    modified,
    positions,
    normalPositions,
    line,
    matchedStateId: matched?.id ?? null,
    ohms,
    analysis,
    classification,
  };
}

/** Params for selecting a defined state: sets every contact explicitly and the cable condition. */
export function paramsForState(params: ExplorerParams, state: CircuitState, normal: ContactPositions): ExplorerParams {
  return {
    ...params,
    c: state.line === "intact" ? { ...state.contacts } : { ...normal },
    line: state.line === "intact" ? undefined : state.line,
  };
}
