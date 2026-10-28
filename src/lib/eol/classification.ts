/**
 * Two independent questions, kept apart:
 *
 *  1. Is the circuit electrically valid? (structure, values, contact positions,
 *     every reading calculated by the engine). Needs no documentation.
 *  2. Has a manufacturer confirmed it for a specific panel? (the existing,
 *     unchanged Verified rules in validate.ts / verification.ts).
 *
 * An electrically valid circuit is never implied to be compatible with a panel.
 */
import type { CircuitAnalysis } from "./validate";

export type CircuitClassification =
  | "manufacturer-confirmed"
  | "electrically-validated"
  | "custom"
  | "needs-verification"
  | "demonstration"
  | "invalid";

export const CLASSIFICATION_LABELS: Record<CircuitClassification, string> = {
  "manufacturer-confirmed": "Manufacturer confirmed — documented configuration",
  "electrically-validated": "Electrically validated — generic circuit",
  custom: "Custom circuit — panel compatibility not confirmed",
  "needs-verification": "Requires verification — not confirmed by the manufacturer",
  demonstration: "Demonstration only — fictional panel",
  invalid: "Circuit has errors — not validated",
};

export const CLASSIFICATION_SHORT: Record<CircuitClassification, string> = {
  "manufacturer-confirmed": "Manufacturer confirmed",
  "electrically-validated": "Electrically validated",
  custom: "Custom circuit",
  "needs-verification": "Requires verification",
  demonstration: "Demonstration only",
  invalid: "Not validated",
};

/** Electrical validity only: no errors and every state's reading could be calculated. */
export function isElectricallyValid(analysis: Pick<CircuitAnalysis, "hasErrors" | "states">): boolean {
  return !analysis.hasErrors && analysis.states.every((s) => s.ohms !== null);
}

export function classifyCircuit(input: {
  analysis: Pick<CircuitAnalysis, "hasErrors" | "states">;
  /** Effective manufacturer status from the existing fail-safe rules. */
  manufacturerStatus: "verified" | "needs-verification" | "demonstration";
  /** Generic circuit: not tied to any panel or device. */
  generic: boolean;
  /** Values edited by the user, or custom targets. */
  custom?: boolean;
}): CircuitClassification {
  if (!isElectricallyValid(input.analysis)) return "invalid";
  if (input.manufacturerStatus === "verified" && !input.generic && !input.custom) return "manufacturer-confirmed";
  if (input.custom) return "custom";
  if (input.generic) return "electrically-validated";
  return input.manufacturerStatus === "demonstration" ? "demonstration" : "needs-verification";
}

/** Diagram labelling: compact line for generic circuits, prominent banner otherwise (none when confirmed). */
export type DiagramBanner = "none" | "generic" | "custom" | "demonstration" | "unverified" | "invalid";

export function bannerFor(c: CircuitClassification): DiagramBanner {
  switch (c) {
    case "manufacturer-confirmed":
      return "none";
    case "electrically-validated":
      return "generic";
    case "custom":
      return "custom";
    case "demonstration":
      return "demonstration";
    case "needs-verification":
      return "unverified";
    case "invalid":
      return "invalid";
  }
}
