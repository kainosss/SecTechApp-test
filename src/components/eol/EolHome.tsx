"use client";

import type { EolPanelOption, EolPreset, WiringDetail, WiringSummary } from "@/lib/content/repository";
import { useUrlSearch } from "@/lib/eol/use-url-selection";
import { CircuitExplorer } from "./CircuitExplorer";
import { EolAssistant } from "./EolAssistant";

/**
 * /eol: the generic circuit explorer by default (DEOL on screen immediately),
 * or the panel-configuration flow when the URL names a panel (?panel=…).
 */
export function EolHome(props: {
  templates: WiringDetail[];
  presets: EolPreset[];
  panels: EolPanelOption[];
  configs: WiringSummary[];
  details: Record<string, WiringDetail>;
}) {
  const { search, setSearch } = useUrlSearch();
  const panelMode = new URLSearchParams(search).has("panel");

  return (
    <div className="flex flex-col gap-3">
      <div role="tablist" aria-label="EOL assistant mode" className="grid grid-cols-2 gap-1 rounded-xl border border-line bg-ink-900 p-1">
        {[
          { label: "Generic circuits", active: !panelMode, go: () => setSearch("", "push") },
          { label: "Panel configurations", active: panelMode, go: () => setSearch("?panel=", "push") },
        ].map((t) => (
          <button
            key={t.label}
            type="button"
            role="tab"
            aria-selected={t.active}
            onClick={t.go}
            className={`h-11 rounded-lg text-sm font-medium ${t.active ? "bg-ink-800 text-fg" : "text-fg-muted hover:text-fg"}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {panelMode ? (
        <EolAssistant panels={props.panels} configs={props.configs.filter((c) => !c.generic)} details={props.details} />
      ) : (
        <CircuitExplorer templates={props.templates} presets={props.presets} />
      )}
    </div>
  );
}
