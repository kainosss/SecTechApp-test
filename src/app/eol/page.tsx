import type { Metadata } from "next";
import { getWiringConfiguration, listEolPanels, listEolPresets, listGenericCircuits, listWiringConfigurations, type WiringDetail } from "@/lib/content/repository";
import { EolHome } from "@/components/eol/EolHome";
import { Icon } from "@/components/ui/Icon";

export const metadata: Metadata = { title: "EOL Wiring Assistant" };

const SAFEGUARDS = [
  "Panel configurations appear only when backed by the manufacturer's documentation, and show Verified only after a named reviewer has checked them.",
  "Diagrams are drawn from structured circuit data — never improvised — and calculations are checked against documented readings.",
  "Resistor values and thresholds are never assumed to carry over between panels or firmware versions.",
  "Generic circuits are electrically validated (structure and every reading calculated), which is not the same as manufacturer confirmation for a panel.",
  "Example presets (e.g. Integriti or Tecom examples) are provisional values, not manufacturer specifications.",
];

export default async function EolPage() {
  const [panels, configs, templates, presets] = await Promise.all([listEolPanels(), listWiringConfigurations(), listGenericCircuits(), listEolPresets()]);
  const details: Record<string, WiringDetail> = {};
  for (const c of configs) {
    const d = await getWiringConfiguration(c.id);
    if (d) details[c.id] = d;
  }

  return (
    <>
      {/* Compact on phones so the circuit is visible without scrolling. */}
      <header className="mb-3 sm:mb-6">
        <p className="mb-1 hidden font-mono text-xs tracking-[0.18em] text-signal-400 uppercase sm:block">EOL Wiring Assistant</p>
        <h1 className="text-xl font-semibold tracking-tight text-fg sm:text-3xl">EOL Wiring Assistant</h1>
        <p className="mt-1 hidden text-[15px] text-fg-muted sm:block">Tap a contact to see how the resistance changes.</p>
      </header>
      <EolHome templates={templates} presets={presets} panels={panels} configs={configs} details={details} />
      <details className="mt-6 rounded-2xl border border-line bg-ink-900 px-4 py-3 text-sm">
        <summary className="flex cursor-pointer items-center gap-2 font-medium text-fg">
          <Icon name="shield" className="size-4 text-verified" />
          How Fieldwise keeps wiring references accurate
        </summary>
        <ul className="mt-3 space-y-2 text-fg-muted">
          {SAFEGUARDS.map((s) => (
            <li key={s} className="flex gap-3">
              <span className="mt-2 size-1 shrink-0 rounded-full bg-verified" aria-hidden="true" />
              {s}
            </li>
          ))}
        </ul>
      </details>
    </>
  );
}
