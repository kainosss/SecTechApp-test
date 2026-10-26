import type { Metadata } from "next";
import { getWiringConfiguration, listEolPanels, listWiringConfigurations, type WiringDetail } from "@/lib/content/repository";
import { EolAssistant } from "@/components/eol/EolAssistant";
import { Icon } from "@/components/ui/Icon";
import { PageHeader } from "@/components/ui/PageHeader";

export const metadata: Metadata = { title: "EOL Wiring Assistant" };

const SAFEGUARDS = [
  "Panel configurations appear only when backed by the manufacturer's documentation, and show Verified only after a named reviewer has checked them.",
  "Diagrams are drawn from structured circuit data — never improvised — and calculations are checked against documented readings.",
  "Resistor values and thresholds are never assumed to carry over between panels or firmware versions.",
  "Demonstration circuits are labelled inside the diagram itself and are not installation instructions.",
];

export default async function EolPage() {
  const [panels, configs] = await Promise.all([listEolPanels(), listWiringConfigurations()]);
  const details: Record<string, WiringDetail> = {};
  for (const c of configs) {
    const d = await getWiringConfiguration(c.id);
    if (d) details[c.id] = d;
  }

  return (
    <>
      <PageHeader
        eyebrow="EOL Wiring Assistant"
        title="EOL Wiring Assistant"
        description="Panel → contact arrangement → EOL configuration. See the circuit and the reading to expect in each state."
      />
      <EolAssistant panels={panels} configs={configs} details={details} />
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
