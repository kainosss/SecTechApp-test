import type { Metadata } from "next";
import { PlannedTool } from "@/components/ui/PlannedTool";

export const metadata: Metadata = { title: "EOL Wiring Assistant" };

export default function EolPage() {
  return (
    <PlannedTool
      icon="eol"
      title="EOL Wiring Assistant"
      phase="Phase 3"
      description="End-of-line resistor references for a specific panel, input type and device contact arrangement."
      steps={[
        "Select the alarm panel and zone input configuration.",
        "Select the detector or contact arrangement (NC alarm, tamper, etc.).",
        "Choose from the resistor values the panel documentation supports.",
        "See a wiring reference and the expected resistance in each zone state.",
      ]}
      safeguards={[
        "Only configurations backed by a cited manufacturer document are shown.",
        "Each diagram records the source, document revision and panel firmware it applies to.",
        "Diagrams are never generated from assumptions or interpolated between models.",
        "Unverified or example configurations are clearly labelled.",
      ]}
    />
  );
}
