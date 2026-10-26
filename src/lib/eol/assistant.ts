/**
 * EOL Assistant step logic. Pure functions over listed configurations so the
 * rules (ordering, DEOL priority, when auto-selection is allowed) are tested
 * independently of the UI.
 */
import type { EolPanelOption, WiringSummary } from "@/lib/content/repository";

export const GENERIC_PANEL = "generic";

export interface AssistantSelection {
  panel?: string;
  arrangement?: string;
  config?: string;
  state?: string;
}

export function parseSelection(search: string): AssistantSelection {
  const p = new URLSearchParams(search);
  const get = (k: string) => p.get(k) || undefined;
  return { panel: get("panel"), arrangement: get("arrangement"), config: get("config"), state: get("state") };
}

export function selectionToSearch(s: AssistantSelection): string {
  const p = new URLSearchParams();
  for (const k of ["panel", "arrangement", "config", "state"] as const) if (s[k]) p.set(k, s[k]!);
  const out = p.toString();
  return out ? `?${out}` : "";
}

export function configsForPanel(configs: WiringSummary[], panel: string | undefined): WiringSummary[] {
  if (!panel) return [];
  return panel === GENERIC_PANEL ? configs.filter((c) => c.generic) : configs.filter((c) => c.panel?.id === panel);
}

export interface ArrangementOption {
  key: string;
  label: string;
  configs: WiringSummary[];
  hasDeol: boolean;
  verifiedCount: number;
}

/** Contact arrangements for the chosen panel; those offering DEOL first, then by verified count. */
export function arrangementOptions(configs: WiringSummary[]): ArrangementOption[] {
  const groups = new Map<string, ArrangementOption>();
  for (const c of configs) {
    const g = groups.get(c.arrangement.key) ?? { key: c.arrangement.key, label: c.arrangement.label, configs: [], hasDeol: false, verifiedCount: 0 };
    g.configs.push(c);
    g.hasDeol ||= c.inputType === "double-eol";
    if (c.status === "verified") g.verifiedCount++;
    groups.set(c.arrangement.key, g);
  }
  return [...groups.values()].sort(
    (a, b) => Number(b.hasDeol) - Number(a.hasDeol) || b.verifiedCount - a.verifiedCount || a.label.localeCompare(b.label),
  );
}

/** Configurations in an arrangement: verified first, DEOL first, demonstrations last. */
export function configurationOptions(configs: WiringSummary[], arrangement: string | undefined): WiringSummary[] {
  const rank = { verified: 0, "needs-verification": 1, demonstration: 2 } as const;
  return configs
    .filter((c) => c.arrangement.key === arrangement)
    .sort(
      (a, b) =>
        rank[a.status] - rank[b.status] ||
        Number(b.inputType === "double-eol") - Number(a.inputType === "double-eol") ||
        a.configurationLabel.localeCompare(b.configurationLabel),
    );
}

/**
 * Auto-select a step only when there is exactly one option and compatibility
 * is confirmed: it is a generic demonstration, or every candidate is Verified.
 * An unverified configuration for a real panel is never chosen automatically.
 */
export function canAutoSelect(panel: string | undefined, candidates: WiringSummary[]): boolean {
  if (candidates.length === 0) return false;
  if (panel === GENERIC_PANEL) return candidates.every((c) => c.generic);
  return candidates.every((c) => c.status === "verified");
}

/** Resolves the effective selection, applying safe auto-selection and dropping invalid values. */
export function resolveSelection(
  raw: AssistantSelection,
  panels: EolPanelOption[],
  configs: WiringSummary[],
): { panel?: string; arrangement?: string; config?: WiringSummary; autoSelected: ("arrangement" | "config")[] } {
  const autoSelected: ("arrangement" | "config")[] = [];
  const panelValid = raw.panel === GENERIC_PANEL ? configs.some((c) => c.generic) : panels.some((p) => p.id === raw.panel);
  if (!panelValid) return { autoSelected };
  const panel = raw.panel!;

  const forPanel = configsForPanel(configs, panel);
  const arrangements = arrangementOptions(forPanel);
  let arrangement = arrangements.find((a) => a.key === raw.arrangement)?.key;
  if (!arrangement && arrangements.length === 1 && canAutoSelect(panel, arrangements[0]!.configs)) {
    arrangement = arrangements[0]!.key;
    autoSelected.push("arrangement");
  }
  if (!arrangement) return { panel, autoSelected };

  const options = configurationOptions(forPanel, arrangement);
  let config = options.find((c) => c.id === raw.config);
  if (!config && options.length === 1 && canAutoSelect(panel, options)) {
    config = options[0]!;
    autoSelected.push("config");
  }
  return { panel, arrangement, config, autoSelected };
}
