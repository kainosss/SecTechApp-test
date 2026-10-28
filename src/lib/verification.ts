/**
 * The content statuses shown to pilot testers. Each content type keeps its own
 * stored status; these helpers only map it to one of these labels, and only
 * ever towards caution — nothing is promoted to verified here.
 */
export type Tier = "verified" | "generic" | "technician-configured" | "requires-verification";

export const TIER_LABELS: Record<Tier, string> = {
  verified: "Verified against manufacturer documentation",
  generic: "Generic training example",
  "technician-configured": "Technician-configured values",
  "requires-verification": "Requires verification",
};

/**
 * EOL resistor presets. A panel-named example (e.g. "Integriti example") is
 * user-provided example values, not a manufacturer specification, so it
 * requires verification. Custom targets are the technician's own.
 */
export function presetTier(preset: { kind: "generic-example" | "manufacturer-example" } | null | undefined, custom: boolean): Tier {
  if (custom || !preset) return "technician-configured";
  return preset.kind === "generic-example" ? "generic" : "requires-verification";
}
