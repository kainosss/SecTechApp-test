import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FAULT_SCENARIOS, getFaultScenario } from "@/lib/lab/faults";
import { FaultLab } from "@/components/lab/FaultLab";
import { LabExerciseNav } from "@/components/lab/LabExerciseNav";

export function generateStaticParams() {
  return FAULT_SCENARIOS.map((s) => ({ id: s.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const s = getFaultScenario((await params).id);
  return { title: s ? `${s.title} · Circuit Lab` : "Circuit Lab" };
}

export default async function FaultExercisePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const scenario = getFaultScenario(id);
  if (!scenario) notFound();

  return (
    <>
      <header className="mb-4">
        <p className="mb-1 font-mono text-xs tracking-[0.18em] text-amber-300 uppercase">Circuit Lab · Fault finding</p>
        <h1 className="text-xl font-semibold tracking-tight text-balance text-fg sm:text-3xl">{scenario.title}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-verified/40 bg-verified/10 px-2.5 py-1 font-medium text-verified">
            <span aria-hidden="true">●○○</span> Difficulty: {scenario.difficulty}
          </span>
          <span className="rounded-full border border-line-strong px-2.5 py-1 font-medium text-fg-muted">Simulated · generic dual EOL PIR, 2k2 / 4k4</span>
        </div>
      </header>
      <LabExerciseNav current={`/circuit-lab/faults/${scenario.id}`} />
      <FaultLab scenarioId={scenario.id} />
    </>
  );
}
