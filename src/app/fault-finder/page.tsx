import type { Metadata } from "next";
import { listWorkflows } from "@/lib/content/repository";
import { FAULT_AREA_LABELS } from "@/lib/content/schema";
import { RecordList } from "@/components/records/RecordList";
import { PlannedTool } from "@/components/ui/PlannedTool";

export const metadata: Metadata = { title: "Guided Fault Finder" };

export default async function FaultFinderPage() {
  const records = await listWorkflows();
  return (
    <PlannedTool
      icon="fault"
      title="Guided Fault Finder"
      phase="Troubleshooting workflows · Preview"
      description="Structured troubleshooting for common faults, one question at a time."
      steps={[
        "Pick the equipment category and the symptom you are seeing.",
        "Answer short diagnostic questions based on what you measure on site.",
        "Follow a decision tree to the most likely cause.",
        "Get the relevant test procedure and links to source documentation.",
      ]}
      safeguards={[
        "Decision trees are authored and reviewed as content, separate from app code.",
        "Every step that quotes a value or procedure cites its source.",
        "The tool never invents specifications — it points to the manual when unsure.",
        "Workflows record which device models and revisions they have been verified for.",
      ]}
    >
      <RecordList
        title="Troubleshooting workflows"
        items={records.map((r) => ({
          id: r.id,
          href: `/fault-finder/${r.id}`,
          title: r.title,
          status: r.status,
          meta: FAULT_AREA_LABELS[r.faultArea],
        }))}
        empty="No troubleshooting workflows have been published yet. The interactive fault finder is coming in a later release."
      />
    </PlannedTool>
  );
}
