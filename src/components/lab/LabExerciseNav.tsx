import Link from "next/link";
import { LAB_EXERCISES } from "@/lib/lab/exercises";

/** Circuit Lab exercise switcher. */
export function LabExerciseNav({ current }: { current: string }) {
  return (
    <nav aria-label="Circuit Lab exercises" className="mb-4">
      <ul className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
        <li className="shrink-0">
          <Link href="/circuit-lab" className="flex min-h-11 items-center rounded-xl border border-line-strong bg-ink-900 px-3 text-sm font-medium text-fg-muted hover:bg-ink-850 hover:text-fg">
            ← All exercises
          </Link>
        </li>
        {LAB_EXERCISES.map((e) => {
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
                <span className={`font-mono text-[11px] tracking-wider uppercase ${e.kind === "Fault" ? "text-amber-300" : "text-signal-400"}`}>{e.kind}</span>
                <span className={`text-sm font-medium whitespace-nowrap ${active ? "text-signal-300" : "text-fg"}`}>{e.title}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
