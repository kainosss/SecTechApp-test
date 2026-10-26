import type { Metadata } from "next";
import { getWiringConfiguration } from "@/lib/content/repository";
import { bannerFor } from "@/lib/eol/classification";
import { formatOhms } from "@/lib/eol/engine";
import { TARGET } from "@/lib/lab/check";
import { CircuitLab, type LabSchematic } from "@/components/lab/CircuitLab";
import { LabExerciseNav } from "@/components/lab/LabExerciseNav";

export const metadata: Metadata = { title: "Circuit Lab" };

const TARGET_ID = "demo-generic-deol-alarm-tamper";

const SPEC: [string, string][] = [
  ["Detector", "Generic NC PIR (illustrative terminals)"],
  ["Contacts", "NC alarm relay, NC tamper switch"],
  ["Resistors", "R1 2k2 in series · R2 2k2 across ALARM"],
  ["Sealed", formatOhms(TARGET.sealed)],
  ["Alarm", formatOhms(TARGET.alarm)],
  ["Tamper", formatOhms(TARGET.tamper)],
  ["Cable open", formatOhms(TARGET["cable-open"])],
  ["Cable short", "≈ 0 Ω"],
];

export default async function CircuitLabPage() {
  const detail = await getWiringConfiguration(TARGET_ID);
  const schematic: LabSchematic | null = detail
    ? {
        circuit: detail.circuit,
        normalPositions: detail.states.find((s) => s.kind === "normal")?.contacts ?? {},
        banner: bannerFor(detail.classification),
        title: detail.title,
      }
    : null;

  return (
    <>
      <header className="mb-4 sm:mb-6">
        <p className="mb-1 font-mono text-xs tracking-[0.18em] text-signal-400 uppercase">Circuit Lab · Exercise 1</p>
        <h1 className="text-xl font-semibold tracking-tight text-balance text-fg sm:text-3xl">Generic NC PIR detector — Dual EOL — 2k2 sealed / 4k4 alarm</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-verified/40 bg-verified/10 px-2.5 py-1 font-medium text-verified">
            <span aria-hidden="true">●○○</span> Difficulty: Beginner
          </span>
          <span className="rounded-full border border-line-strong px-2.5 py-1 font-medium text-fg-muted">Simulated · not an installation diagram</span>
        </div>
        <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-fg-muted">
          Wire a generic PIR detector to a zone input with two 2.2 kΩ resistors, then check your circuit in every state. Terminal labels are illustrative, not
          any manufacturer&apos;s layout.
        </p>
      </header>

      <LabExerciseNav current="/circuit-lab" />

      <details className="mb-4 rounded-2xl border border-line bg-ink-900 px-4 py-3 text-sm" open>
        <summary className="cursor-pointer font-medium text-fg">Circuit specification</summary>
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
          {SPEC.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-fg-subtle">{k}</dt>
              <dd className="font-mono text-fg">{v}</dd>
            </div>
          ))}
        </dl>
      </details>

      <CircuitLab schematic={schematic} />
    </>
  );
}
