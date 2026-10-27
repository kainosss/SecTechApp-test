/**
 * Deterministic diagnostic engine. A session is just the list of answers
 * given; everything else (current question, findings, context, evidence,
 * progress) is derived by replaying it against the workflow, so a saved
 * session can never put the UI in a state the workflow doesn't allow.
 */
import { classifyZoneReading, fmt, parseResistor, zoneBands, ZONE_BANDS, type EolConfig } from "./eol";
import type { Answer, EolConfigNode, MeasureNode, Range, ResultNode, Workflow, WorkflowNode } from "./schema";

export interface Step {
  node: string;
  /** Answer, range, preset or skip id chosen at that node ("custom" for entered EOL values). */
  answer: string;
  /** Measurement value (Ω or V; Infinity = OL) for measure nodes. */
  value?: number;
  /** Entered EOL resistor values for a "custom" eol-config answer. */
  r1?: number;
  r2?: number;
}

export interface Session {
  workflowId: string;
  version: number;
  steps: Step[];
}

/** How a finding was established — a measurement is stronger evidence than a reported observation. */
export type FindingKind = "measured" | "reported" | "config" | "skipped";

export interface Finding {
  node: string;
  question: string;
  text: string;
  kind: FindingKind;
}

export interface Evaluation {
  node: WorkflowNode;
  findings: Finding[];
  context: Record<string, number>;
  evidence: Record<string, number>;
  /** 1-based number of the current question. */
  step: number;
  /** Longest possible number of questions on the current path (for a progress bar). */
  total: number;
  done: boolean;
}

export type AnswerInput = { answer: string } | { value: string } | { eol: { r1: string; r2: string } };
export type AnswerResult = { ok: true; session: Session } | { ok: false; error: string };

export function nodeById(wf: Workflow, id: string): WorkflowNode | undefined {
  return wf.nodes.find((n) => n.id === id);
}

export function startSession(wf: Workflow): Session {
  return { workflowId: wf.id, version: wf.version, steps: [] };
}

/** The EOL configuration set earlier on the path, if any. */
export function eolFromContext(context: Record<string, number>): EolConfig | null {
  return context.r1 !== undefined && context.r2 !== undefined ? { r1: context.r1, r2: context.r2 } : null;
}

/* ------------------------------------------------------------ measurements */

const OL = /^(ol|o\.l\.?|open|∞|inf(inity)?|over ?load)$/i;

/**
 * Parses a meter reading. Ohms accept "2200", "2.2k", "2k2", "4.4 kΩ", "1M",
 * "OL"; volts accept "12.6", "13.8V". Returns null when not a valid reading.
 */
export function parseMeasurement(text: string, unit: "ohm" | "volt"): number | null {
  const s = text.trim().replace(/\s+/g, "");
  if (!s) return null;
  if (unit === "ohm" && OL.test(s)) return Number.POSITIVE_INFINITY;
  const body = (unit === "ohm" ? s.replace(/(Ω|ohms?)$/i, "") : s.replace(/(v|volts?)$/i, "")).toLowerCase();
  let value: number;
  const code = unit === "ohm" ? body.match(/^(\d+)([rkm])(\d+)$/) : null; // RKM code, e.g. 2k2, 4r7
  if (code) {
    value = Number(`${code[1]}.${code[3]}`) * (code[2] === "k" ? 1e3 : code[2] === "m" ? 1e6 : 1);
  } else {
    const m = body.match(unit === "ohm" ? /^(\d+(?:\.\d+)?|\.\d+)([kmr]?)$/ : /^(\d+(?:\.\d+)?|\.\d+)(m?)$/);
    if (!m) return null;
    const mult = unit === "ohm" ? (m[2] === "k" ? 1e3 : m[2] === "m" ? 1e6 : 1) : m[2] === "m" ? 1e-3 : 1;
    value = Number(m[1]) * mult;
  }
  if (!Number.isFinite(value) || value < 0) return null;
  if (unit === "volt" && value > 60) return null; // outside extra-low-voltage security circuits
  return value;
}

export function formatMeasurement(value: number, unit: "ohm" | "volt"): string {
  if (unit === "volt") return `${Number(value.toFixed(2))} V`;
  if (!Number.isFinite(value)) return "OL (open circuit)";
  if (value >= 1e6) return `${Number((value / 1e6).toPrecision(4))} MΩ`;
  if (value >= 1e3) return `${Number((value / 1e3).toPrecision(4))} kΩ`;
  return `${Number(value.toPrecision(4))} Ω`;
}

/** Range bounds in real units for absolute or context-scaled ranges; null when the needed context is missing. */
export function rangeBounds(node: MeasureNode, range: Range, context: Record<string, number>): { min: number; max: number } | null {
  if (node.scale === "zone") return null;
  const scale = node.relativeTo ? context[node.relativeTo] : 1;
  if (scale === undefined) return null;
  return { min: (range.min ?? 0) * scale, max: range.max === undefined ? Number.POSITIVE_INFINITY : range.max * scale };
}

export function matchRange(node: MeasureNode, value: number, context: Record<string, number>): Range | null {
  if (node.scale === "zone") {
    const cfg = eolFromContext(context);
    const band = cfg ? classifyZoneReading(cfg, value) : null;
    return band ? (node.ranges.find((r) => r.bands?.includes(band)) ?? null) : null;
  }
  for (const r of node.ranges) {
    const b = rangeBounds(node, r, context);
    if (!b) return null;
    // Infinity (OL) only matches an unbounded range.
    if (!Number.isFinite(value) ? r.max === undefined : value >= b.min && value < b.max) return r;
  }
  return null;
}

/** Fills {value}, {sealed} and {alarm} placeholders in content text. */
export function fillText(text: string, context: Record<string, number>, value?: number, unit?: "ohm" | "volt") {
  const cfg = eolFromContext(context);
  const b = cfg ? zoneBands(cfg) : null;
  return text
    .replace("{value}", value === undefined ? "" : formatMeasurement(value, unit ?? "ohm"))
    .replace("{sealed}", b?.ok ? fmt(b.expected.sealed) : "the sealed reading")
    .replace("{alarm}", b?.ok ? fmt(b.expected.alarm) : "the alarm reading");
}

/* ------------------------------------------------------------------ replay */

function applyAnswer(ctx: { context: Record<string, number>; evidence: Record<string, number> }, a: { set?: Record<string, number>; evidence?: Record<string, number> }) {
  Object.assign(ctx.context, a.set ?? {});
  for (const [cause, w] of Object.entries(a.evidence ?? {})) ctx.evidence[cause] = (ctx.evidence[cause] ?? 0) + w;
}

function edges(n: WorkflowNode): string[] {
  switch (n.kind) {
    case "question":
      return n.answers.map((a) => a.next);
    case "measure":
      return [...n.ranges.map((r) => r.next), ...(n.skip ? [n.skip.next] : [])];
    case "eol-config":
      return [n.next, n.unsupported.next];
    case "result":
      return [];
  }
}

/** Longest number of questions from a node to any result (the trees are acyclic). */
function depth(wf: Workflow, id: string, memo = new Map<string, number>()): number {
  if (memo.has(id)) return memo.get(id)!;
  const n = nodeById(wf, id);
  const d = n && n.kind !== "result" ? 1 + Math.max(...edges(n).map((x) => depth(wf, x, memo))) : 0;
  memo.set(id, d);
  return d;
}

/** Validates entered or preset EOL values for the node; returns the config or an error. */
export function checkEolConfig(cfg: EolConfig): { ok: true } | { ok: false; error: string } {
  const b = zoneBands(cfg);
  return b.ok ? { ok: true } : { ok: false, error: b.reason };
}

function eolStep(node: EolConfigNode, step: Step): { next: string; set?: Record<string, number>; finding: string; kind: FindingKind } | null {
  if (step.answer === node.unsupported.id) return { next: node.unsupported.next, finding: node.unsupported.finding, kind: "reported" };
  const preset = node.presets.find((p) => p.id === step.answer);
  const cfg = preset ? { r1: preset.r1, r2: preset.r2 } : step.answer === "custom" && node.allowCustom && step.r1 && step.r2 ? { r1: step.r1, r2: step.r2 } : null;
  if (!cfg) return null;
  const b = zoneBands(cfg);
  if (!b.ok) return null;
  return {
    next: node.next,
    set: { r1: cfg.r1, r2: cfg.r2 },
    finding: `EOL resistors: R1 ${fmt(cfg.r1)} (in series), R2 ${fmt(cfg.r2)} (across the alarm contact) — expect ${fmt(b.expected.sealed)} sealed, ${fmt(b.expected.alarm)} in alarm.`,
    kind: "config",
  };
}

/**
 * Replays the session. Steps that don't fit the workflow (outdated or
 * tampered data) stop the replay; `validSteps` says how many were applied.
 */
export function evaluate(wf: Workflow, session: Session): Evaluation & { validSteps: number } {
  const ctx = { context: {} as Record<string, number>, evidence: {} as Record<string, number> };
  const findings: Finding[] = [];
  let node = nodeById(wf, wf.start)!;
  let validSteps = 0;
  for (const step of session.steps) {
    if (step.node !== node.id || node.kind === "result") break;
    let next: string | null = null;
    if (node.kind === "question") {
      const a = node.answers.find((x) => x.id === step.answer);
      if (!a) break;
      applyAnswer(ctx, a);
      findings.push({ node: node.id, question: node.text, text: fillText(a.finding, ctx.context), kind: "reported" });
      next = a.next;
    } else if (node.kind === "eol-config") {
      const r = eolStep(node, step);
      if (!r) break;
      applyAnswer(ctx, { set: r.set });
      findings.push({ node: node.id, question: node.text, text: r.finding, kind: r.kind });
      next = r.next;
    } else if (node.skip && step.answer === node.skip.id) {
      applyAnswer(ctx, node.skip);
      findings.push({ node: node.id, question: node.text, text: node.skip.finding, kind: "skipped" });
      next = node.skip.next;
    } else {
      if (step.value === undefined || Number.isNaN(step.value)) break;
      const r = matchRange(node, step.value, ctx.context);
      if (!r || r.id !== step.answer) break;
      applyAnswer(ctx, r);
      findings.push({ node: node.id, question: node.text, text: fillText(r.finding, ctx.context, step.value, node.unit), kind: "measured" });
      next = r.next;
    }
    const n = nodeById(wf, next);
    if (!n) break;
    node = n;
    validSteps++;
  }
  const remaining = depth(wf, node.id);
  return {
    node,
    findings,
    context: ctx.context,
    evidence: ctx.evidence,
    step: validSteps + 1,
    total: validSteps + remaining,
    done: node.kind === "result",
    validSteps,
  };
}

/** Records an answer to the current node, validating it. Never mutates the session. */
export function answer(wf: Workflow, session: Session, input: AnswerInput): AnswerResult {
  const ev = evaluate(wf, session);
  const node = ev.node;
  const base = { ...session, steps: session.steps.slice(0, ev.validSteps) };
  const push = (step: Step): AnswerResult => ({ ok: true, session: { ...base, steps: [...base.steps, step] } });
  if (node.kind === "result") return { ok: false, error: "This diagnosis is complete. Go back or restart to change an answer." };

  if ("eol" in input) {
    if (node.kind !== "eol-config" || !node.allowCustom) return { ok: false, error: "Resistor values aren't asked for here." };
    const r1 = parseResistor(input.eol.r1);
    const r2 = parseResistor(input.eol.r2);
    if (r1 === null || r2 === null) return { ok: false, error: "Enter both resistor values, e.g. 4k7, 2.2k or 2200." };
    const c = checkEolConfig({ r1, r2 });
    if (!c.ok) return c;
    return push({ node: node.id, answer: "custom", r1, r2 });
  }
  if ("answer" in input) {
    const options: Pick<Answer, "id">[] =
      node.kind === "question" ? node.answers : node.kind === "eol-config" ? [...node.presets, node.unsupported] : node.skip ? [node.skip] : [];
    if (!options.some((o) => o.id === input.answer)) return { ok: false, error: "That answer isn't available for this question." };
    return push({ node: node.id, answer: input.answer });
  }
  if (node.kind !== "measure") return { ok: false, error: "Choose one of the answers." };
  const value = parseMeasurement(input.value, node.unit);
  if (value === null) {
    return {
      ok: false,
      error: node.unit === "ohm" ? "Enter a resistance like 2200, 2.2k, 2k2 or OL (open circuit)." : "Enter a DC voltage like 13.6 (0–60 V).",
    };
  }
  const r = matchRange(node, value, ev.context);
  if (!r) return { ok: false, error: "That reading couldn't be classified. Check the meter range and units, then enter it again." };
  return push({ node: node.id, answer: r.id, value });
}

export function back(session: Session): Session {
  return { ...session, steps: session.steps.slice(0, -1) };
}

export function restart(wf: Workflow): Session {
  return startSession(wf);
}

export interface RankedCause {
  id: string;
  title: string;
  detail: string;
  score: number;
}

/**
 * Orders a result's candidate causes: the author's order sets a base score,
 * and evidence gathered from the answers adjusts it. Only the result's own
 * candidates are listed — evidence never introduces a cause the path ruled out.
 */
export function rankCauses(wf: Workflow, result: ResultNode, evidence: Record<string, number>): RankedCause[] {
  const n = result.causes.length;
  return result.causes
    .map((id, i) => ({ id, ...wf.causes[id]!, score: n - i + (evidence[id] ?? 0), order: i }))
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .map(({ order: _order, ...c }) => c);
}

/**
 * Structural problems in a workflow (for content tests): dangling links, unreachable nodes, cycles, unknown
 * causes, measurement ranges that don't classify every reading, and zone measurements without EOL values.
 */
export function validateWorkflow(wf: Workflow, known: Set<string> = new Set([wf.id])): string[] {
  const problems: string[] = [];
  const ids = new Set(wf.nodes.map((n) => n.id));
  if (ids.size !== wf.nodes.length) problems.push("duplicate node ids");
  if (!ids.has(wf.start)) problems.push(`start node ${wf.start} missing`);
  for (const n of wf.nodes) {
    for (const next of edges(n)) if (!ids.has(next)) problems.push(`${n.id} → missing ${next}`);
    if (n.kind === "result") {
      for (const c of n.causes) if (!wf.causes[c]) problems.push(`${n.id}: unknown cause ${c}`);
      if (n.seeAlso && !known.has(n.seeAlso)) problems.push(`${n.id}: unknown workflow ${n.seeAlso}`);
    }
    if (n.kind === "question" || n.kind === "measure") {
      const answers = n.kind === "question" ? n.answers : n.ranges;
      for (const a of answers) for (const c of Object.keys(a.evidence ?? {})) if (!wf.causes[c]) problems.push(`${n.id}/${a.id}: unknown cause ${c}`);
      if (new Set(answers.map((a) => a.id)).size !== answers.length) problems.push(`${n.id}: duplicate answer ids`);
    }
    if (n.kind === "eol-config") {
      for (const p of n.presets) {
        const c = checkEolConfig(p);
        if (!c.ok) problems.push(`${n.id}/${p.id}: ${c.error}`);
      }
    }
    if (n.kind === "measure" && n.scale === "zone") {
      // Every calculated band must lead somewhere, exactly once.
      const covered = n.ranges.flatMap((r) => r.bands ?? []);
      for (const b of ZONE_BANDS) if (covered.filter((x) => x === b).length !== 1) problems.push(`${n.id}: band ${b} covered ${covered.filter((x) => x === b).length} times`);
      if (n.ranges.some((r) => !r.bands)) problems.push(`${n.id}: zone ranges must use bands`);
      if (n.unit !== "ohm") problems.push(`${n.id}: zone measurements are resistance`);
    }
    if (n.kind === "measure" && n.scale === "absolute") {
      if (n.ranges.some((r) => r.bands)) problems.push(`${n.id}: bands need scale "zone"`);
      // Ranges must tile 0 → ∞ without gaps or overlaps so every reading classifies.
      const sorted = [...n.ranges].sort((a, b) => (a.min ?? 0) - (b.min ?? 0));
      let at = 0;
      for (const r of sorted) {
        if ((r.min ?? 0) !== at) problems.push(`${n.id}: gap or overlap at ${at}`);
        at = r.max ?? Number.POSITIVE_INFINITY;
      }
      if (at !== Number.POSITIVE_INFINITY) problems.push(`${n.id}: ranges don't reach OL`);
    }
  }
  // Reachability, cycles, and zone measurements reached without EOL values.
  const seen = new Set<string>();
  const stack = new Set<string>();
  const visit = (id: string, configured: boolean) => {
    if (stack.has(id)) {
      problems.push(`cycle at ${id}`);
      return;
    }
    const n = nodeById(wf, id);
    if (n?.kind === "measure" && n.scale === "zone" && !configured) problems.push(`${id}: reachable without EOL values`);
    const key = `${id}|${configured}`;
    if (seen.has(key)) return;
    seen.add(key);
    stack.add(id);
    if (n) {
      if (n.kind === "eol-config") {
        visit(n.next, true);
        visit(n.unsupported.next, configured);
      } else for (const next of edges(n)) visit(next, configured);
    }
    stack.delete(id);
  };
  visit(wf.start, false);
  const reached = new Set([...seen].map((k) => k.split("|")[0]));
  for (const id of ids) if (!reached.has(id)) problems.push(`unreachable node ${id}`);
  return problems;
}
