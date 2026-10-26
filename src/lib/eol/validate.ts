/**
 * EOL circuit validation and cross-checking.
 *
 * analyseCircuit() calculates every state's reading and reports diagnostics:
 *   - errors:   the configuration is incomplete or contradicts its documentation
 *   - warnings: something a reviewer must resolve before it can be verified
 *
 * wiringVerificationGaps() lists everything still missing before a real
 * configuration may display as Verified. Mathematical correctness alone is
 * never enough: every value, contact behaviour, terminal and state reading
 * must be documented, and the calculation must agree with that documentation.
 */
import type { Source, WiringConfiguration } from "@/lib/content/schema";
import { CircuitError, circuitComponents, formatOhms, sameReading, stateResistance } from "./engine";
import { STATE_KIND_LABELS, type Circuit, type CircuitNode, type CircuitState, type DocumentedReading } from "./model";

/** Default accepted deviation from a documented nominal value when the document gives none. */
export const DEFAULT_MATCH_TOLERANCE_PERCENT = 1;

export type DiagnosticCode =
  | "duplicate-component"
  | "empty-group"
  | "single-child-group"
  | "resistor-value-missing"
  | "duplicate-state"
  | "missing-state"
  | "contact-position-missing"
  | "unknown-component"
  | "contacts-ignored"
  | "recommended-state-missing"
  | "input-type-mismatch"
  | "documented-mismatch"
  | "state-overlap"
  | "state-overlap-documented"
  | "unusual-normal-reading";

export interface Diagnostic {
  severity: "error" | "warning" | "info";
  code: DiagnosticCode;
  message: string;
  /** True when this must be resolved before the configuration can be Verified. */
  blocksVerification: boolean;
  stateIds?: string[];
}

export type Agreement = "agrees" | "disagrees" | "undocumented" | "not-calculated";

export interface StateEvaluation {
  id: string;
  kind: CircuitState["kind"];
  label: string;
  line: CircuitState["line"];
  contacts: CircuitState["contacts"];
  /** Calculated reading in ohms (Infinity = open, 0 = short), or null when it could not be calculated. */
  ohms: number | null;
  documented?: DocumentedReading;
  agreement: Agreement;
}

export interface CircuitAnalysis {
  states: StateEvaluation[];
  diagnostics: Diagnostic[];
  hasErrors: boolean;
  /** No errors and no warnings that block verification. */
  readyForVerification: boolean;
}

const EXPECTED_RESISTORS: Partial<Record<WiringConfiguration["inputType"], number>> = {
  "no-eol": 0,
  "single-eol": 1,
  "double-eol": 2,
  "triple-eol": 3,
};

function stateLabel(s: CircuitState) {
  return s.label ?? STATE_KIND_LABELS[s.kind];
}

/** Does a calculated reading agree with what the manufacturer documents for the state? */
export function compareWithDocumented(ohms: number, documented: DocumentedReading | undefined): Agreement {
  if (!documented) return "undocumented";
  const { nominalOhms, minOhms, maxOhms } = documented;
  if (nominalOhms === undefined && minOhms === undefined && maxOhms === undefined) return "undocumented";

  if (nominalOhms !== undefined) {
    const tolerance = (documented.tolerancePercent ?? DEFAULT_MATCH_TOLERANCE_PERCENT) / 100;
    if (!Number.isFinite(ohms)) return "disagrees";
    if (nominalOhms === 0 ? ohms !== 0 : Math.abs(ohms - nominalOhms) > nominalOhms * tolerance) return "disagrees";
  }
  if (minOhms !== undefined && ohms < minOhms) return "disagrees";
  if (maxOhms !== undefined && maxOhms !== null && ohms > maxOhms) return "disagrees";
  return "agrees";
}

function structuralDiagnostics(network: CircuitNode): Diagnostic[] {
  const out: Diagnostic[] = [];
  const seen = new Set<string>();
  const walk = (n: CircuitNode) => {
    if (n.kind === "resistor" || n.kind === "contact") {
      if (seen.has(n.id)) {
        out.push({ severity: "error", code: "duplicate-component", message: `Component id ${n.id} is used more than once.`, blocksVerification: true });
      }
      seen.add(n.id);
      if (n.kind === "resistor" && n.ohms === null) {
        out.push({ severity: "error", code: "resistor-value-missing", message: `Resistor ${n.id} has no documented value.`, blocksVerification: true });
      }
      return;
    }
    if (n.children.length === 0) {
      out.push({ severity: "error", code: "empty-group", message: `A ${n.kind} group has no components.`, blocksVerification: true });
    } else if (n.children.length === 1) {
      out.push({ severity: "info", code: "single-child-group", message: `A ${n.kind} group contains only one component.`, blocksVerification: false });
    }
    n.children.forEach(walk);
  };
  walk(network);
  return out;
}

export function analyseCircuit(input: {
  circuit: Circuit;
  states: CircuitState[];
  inputType: WiringConfiguration["inputType"];
}): CircuitAnalysis {
  const { circuit, states, inputType } = input;
  const diagnostics = structuralDiagnostics(circuit.network);
  const components = circuitComponents(circuit.network);
  const contactIds = new Set(components.filter((c) => c.kind === "contact").map((c) => c.id));
  const componentIds = new Set(components.map((c) => c.id));

  // States: required kinds, explicit contact positions, unknown references.
  const stateIds = new Set<string>();
  for (const s of states) {
    if (stateIds.has(s.id)) {
      diagnostics.push({ severity: "error", code: "duplicate-state", message: `State "${s.id}" is defined more than once.`, blocksVerification: true });
    }
    stateIds.add(s.id);
    for (const id of Object.keys(s.contacts)) {
      if (!contactIds.has(id)) {
        diagnostics.push({
          severity: "error",
          code: "unknown-component",
          message: `${stateLabel(s)} sets a position for "${id}", which is ${componentIds.has(id) ? "not a contact" : "not in the circuit"}.`,
          blocksVerification: true,
          stateIds: [s.id],
        });
      }
    }
    if (s.line === "intact") {
      for (const id of contactIds) {
        if (!s.contacts[id]) {
          diagnostics.push({
            severity: "error",
            code: "contact-position-missing",
            message: `${stateLabel(s)} does not say whether contact ${id} is open or closed.`,
            blocksVerification: true,
            stateIds: [s.id],
          });
        }
      }
    } else if (Object.keys(s.contacts).length > 0) {
      diagnostics.push({
        severity: "info",
        code: "contacts-ignored",
        message: `${stateLabel(s)} is a cable fault; its contact positions do not affect the reading.`,
        blocksVerification: false,
        stateIds: [s.id],
      });
    }
  }

  const kinds = new Set(states.map((s) => s.kind));
  for (const kind of ["normal", "alarm"] as const) {
    if (!kinds.has(kind)) {
      diagnostics.push({ severity: "error", code: "missing-state", message: `No ${STATE_KIND_LABELS[kind].toLowerCase()} state is defined.`, blocksVerification: true });
    }
  }
  const recommended: CircuitState["kind"][] = ["cable-open", "cable-short"];
  if (components.some((c) => c.kind === "contact" && c.function === "tamper")) recommended.push("tamper");
  for (const kind of recommended) {
    if (!kinds.has(kind)) {
      diagnostics.push({
        severity: "warning",
        code: "recommended-state-missing",
        message: `No ${STATE_KIND_LABELS[kind].toLowerCase()} state is defined.`,
        blocksVerification: true,
      });
    }
  }

  const expected = EXPECTED_RESISTORS[inputType];
  const resistorCount = components.filter((c) => c.kind === "resistor").length;
  if (expected !== undefined && expected !== resistorCount) {
    diagnostics.push({
      severity: "warning",
      code: "input-type-mismatch",
      message: `Input type suggests ${expected} resistor${expected === 1 ? "" : "s"}, but the circuit has ${resistorCount}. Check the documentation.`,
      blocksVerification: true,
    });
  }

  // Calculate each state and cross-check against documentation.
  const evaluations: StateEvaluation[] = states.map((s) => {
    let ohms: number | null = null;
    try {
      ohms = stateResistance(circuit, s);
    } catch (e) {
      if (!(e instanceof CircuitError)) throw e;
    }
    const agreement: Agreement = ohms === null ? "not-calculated" : compareWithDocumented(ohms, s.documented);
    if (agreement === "disagrees") {
      diagnostics.push({
        severity: "error",
        code: "documented-mismatch",
        message: `${stateLabel(s)}: calculated ${formatOhms(ohms!)} does not match the documented reading.`,
        blocksVerification: true,
        stateIds: [s.id],
      });
    }
    return { id: s.id, kind: s.kind, label: stateLabel(s), line: s.line, contacts: s.contacts, ohms, documented: s.documented, agreement };
  });

  // Identical readings: a warning, resolved only by documented panel behaviour.
  for (let i = 0; i < evaluations.length; i++) {
    for (let j = i + 1; j < evaluations.length; j++) {
      const a = evaluations[i]!;
      const b = evaluations[j]!;
      if (a.ohms === null || b.ohms === null || !sameReading(a.ohms, b.ohms)) continue;
      const reportedA = a.documented?.panelReports;
      const reportedB = b.documented?.panelReports;
      const documentedSame = Boolean(reportedA && reportedB && reportedA === reportedB);
      diagnostics.push(
        documentedSame
          ? {
              severity: "info",
              code: "state-overlap-documented",
              message: `${a.label} and ${b.label} both read ${formatOhms(a.ohms)}; the panel documentation reports both as "${reportedA}".`,
              blocksVerification: false,
              stateIds: [a.id, b.id],
            }
          : {
              severity: "warning",
              code: "state-overlap",
              message: `${a.label} and ${b.label} both read ${formatOhms(a.ohms)}. The panel cannot tell them apart by resistance unless its documented thresholds or behaviour say otherwise.`,
              blocksVerification: true,
              stateIds: [a.id, b.id],
            },
      );
    }
  }

  const normal = evaluations.find((e) => e.kind === "normal");
  if (normal?.ohms != null && inputType !== "no-eol" && (normal.ohms === 0 || !Number.isFinite(normal.ohms))) {
    diagnostics.push({
      severity: "warning",
      code: "unusual-normal-reading",
      message: `The normal (sealed) reading is ${formatOhms(normal.ohms)}, which is unusual for an EOL input.`,
      blocksVerification: true,
      stateIds: [normal.id],
    });
  }

  const hasErrors = diagnostics.some((d) => d.severity === "error");
  return {
    states: evaluations,
    diagnostics,
    hasErrors,
    readyForVerification: !diagnostics.some((d) => d.blocksVerification),
  };
}

/**
 * Everything that prevents a wiring configuration from being Verified, beyond
 * the generic evidence rules (reviewer, review date, cited sources, revisions).
 */
export function wiringVerificationGaps(
  config: WiringConfiguration,
  analysis: CircuitAnalysis,
  getSource: (id: string) => Source | undefined,
): string[] {
  const gaps: string[] = [];
  if (analysis.hasErrors) gaps.push("the circuit has validation errors");
  for (const d of analysis.diagnostics) {
    if (d.blocksVerification && d.severity === "warning") gaps.push(`unresolved: ${d.message}`);
  }
  if (!config.panelDeviceId) gaps.push("no panel identified");
  if (config.panelHardwareRevisions.length === 0 && config.panelFirmwareRevisions.length === 0) {
    gaps.push("panel hardware/firmware revisions not identified");
  }

  const { a, b } = config.circuit.terminals;
  if (a.sourceRefs.length === 0 || b.sourceRefs.length === 0) gaps.push("panel terminal assignments not documented");
  for (const c of circuitComponents(config.circuit.network)) {
    if (c.sourceRefs.length === 0) {
      gaps.push(c.kind === "resistor" ? `resistor ${c.id} value/placement not documented` : `contact ${c.id} behaviour not documented`);
    }
  }
  for (const s of analysis.states) {
    if (s.agreement !== "agrees") gaps.push(`${s.label}: no documented reading that the calculation matches`);
    else if (!s.documented?.sourceRefs.length) gaps.push(`${s.label}: documented reading has no source`);
  }
  if (!config.interpretation?.sourceRefs.length) gaps.push("how the panel interprets the states is not documented");

  // Every citation inside the circuit must point to a real, revisioned, non-demo document.
  const refs = [
    ...a.sourceRefs,
    ...b.sourceRefs,
    ...circuitComponents(config.circuit.network).flatMap((c) => c.sourceRefs),
    ...config.states.flatMap((s) => s.documented?.sourceRefs ?? []),
    ...(config.interpretation?.sourceRefs ?? []),
  ];
  for (const id of new Set(refs.map((r) => r.sourceId))) {
    const source = getSource(id);
    if (!source) gaps.push(`cited source "${id}" does not exist`);
    else if (source.isDemo) gaps.push(`cites demonstration source "${id}"`);
    else if (!source.documentRevision && !source.publishedDate) gaps.push(`source "${id}" has no document revision or date`);
  }
  return gaps;
}
