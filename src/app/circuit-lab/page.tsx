import type { Metadata } from "next";
import { ExercisePicker } from "@/components/lab/ExercisePicker";
import { PageHeader } from "@/components/ui/PageHeader";

export const metadata: Metadata = { title: "Circuit Lab" };

export default function CircuitLabPage() {
  return (
    <>
      <PageHeader
        eyebrow="Circuit Lab"
        title="Practise wiring and fault finding"
        description="Simulated exercises on a generic NC PIR with 2k2 / 4k4 dual EOL. Build the circuit, then use the virtual multimeter to find faults. Not panel- or manufacturer-specific."
      />
      <ExercisePicker />
    </>
  );
}
