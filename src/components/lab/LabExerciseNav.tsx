import Link from "next/link";
import { FAULT_SCENARIOS } from "@/lib/lab/faults";

const EXERCISES = [
  { href: "/circuit-lab", kind: "Build", title: "Wire a dual EOL PIR" },
  ...FAULT_SCENARIOS.map((s) => ({ href: `/circuit-lab/faults/${s.id}`, kind: "Fault", title: s.title })),
];

/** Circuit Lab exercise switcher. */
export function LabExerciseNav({ current }: { current: string }) {
  return (
    <nav aria-label="Circuit Lab exercises" className="mb-4">
      <ul className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
        {EXERCISES.map((e) => {
          const active = e.href === current;
          return (
            <li key={e.href} className="shrink-0">
              <Link
                href={e.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-11 flex-col justify-center rounded-xl border px-3 py-1 ${
                  active ? "border-signal-400 bg-signal-500/15" : "border-line-strong bg-ink-900 hover:bg-ink-850"
                }`}
              >
                <span className={`font-mono text-[10px] tracking-wider uppercase ${e.kind === "Fault" ? "text-amber-300" : "text-signal-400"}`}>{e.kind}</span>
                <span className={`text-sm font-medium whitespace-nowrap ${active ? "text-signal-300" : "text-fg"}`}>{e.title}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
