import type { Metadata } from "next";
import { listWiringConfigurations } from "@/lib/content/repository";
import { RecordList } from "@/components/records/RecordList";
import { PlannedTool } from "@/components/ui/PlannedTool";

export const metadata: Metadata = { title: "EOL Wiring Assistant" };

export default async function EolPage() {
  const records = await listWiringConfigurations();
  return (
    <PlannedTool
      icon="eol"
      title="EOL Wiring Assistant"
      phase="Wiring configurations · Preview"
      description="End-of-line resistor references for a specific panel, input type and device contact arrangement."
      steps={[
        "Select the alarm panel and zone input configuration.",
        "Select the detector or contact arrangement (NC alarm, tamper, etc.).",
        "Choose from the resistor values the panel documentation supports.",
        "See a wiring reference and the expected resistance in each zone state.",
      ]}
      safeguards={[
        "Only configurations backed by a cited manufacturer document are shown as verified.",
        "Each configuration records the source, document revision and panel revision it applies to.",
        "Diagrams are never generated from assumptions or interpolated between models.",
        "Unverified and demonstration configurations are clearly labelled.",
      ]}
    >
      <RecordList
        title="Wiring configurations"
        items={records.map((r) => ({
          id: r.id,
          href: `/eol/${r.id}`,
          title: r.title,
          status: r.status,
          meta: r.devices.map((d) => d.model).join(" · ") || "No linked devices",
        }))}
        empty="No wiring configurations have been published yet. Configurations are added only once they are backed by manufacturer documentation. The interactive assistant is coming in a later release."
      />
    </PlannedTool>
  );
}
