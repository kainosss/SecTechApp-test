import type { Metadata } from "next";
import { PlannedTool } from "@/components/ui/PlannedTool";

export const metadata: Metadata = { title: "Guided Fault Finder" };

export default function FaultFinderPage() {
  return (
    <PlannedTool
      icon="fault"
      title="Guided Fault Finder"
      phase="Phase 4"
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
        "Trees record which device models and revisions they have been verified for.",
      ]}
    />
  );
}
