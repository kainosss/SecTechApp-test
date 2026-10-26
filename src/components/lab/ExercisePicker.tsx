"use client";

import Link from "next/link";
import { useMemo, useState, useSyncExternalStore } from "react";
import { BENCH_EXERCISE_ID, LAB_EXERCISES } from "@/lib/lab/exercises";
import { BENCH_KEY, parseProgress, readProgressRaw, resetAllProgress, subscribeProgress } from "@/lib/lab/progress";
import { Icon } from "@/components/ui/Icon";

function readBenchRaw(): string {
  try {
    return window.localStorage.getItem(BENCH_KEY) ?? "";
  } catch {
    return "";
  }
}

/** Both saved strings, so the snapshot is stable between renders. */
const snapshot = () => `${readProgressRaw() ?? ""}\u0000${readBenchRaw()}`;

function benchStarted(raw: string): boolean {
  try {
    const parsed = JSON.parse(raw) as { components?: unknown[] };
    return Array.isArray(parsed.components) && parsed.components.length > 0;
  } catch {
    return false;
  }
}

type Status = "completed" | "in-progress" | "not-started";
const STATUS: Record<Status, { label: string; cls: string; mark: string }> = {
  completed: { label: "Completed", cls: "bg-verified/15 text-verified", mark: "✓" },
  "in-progress": { label: "In progress", cls: "bg-signal-500/15 text-signal-300", mark: "◐" },
  "not-started": { label: "Not started", cls: "bg-ink-800 text-fg-muted", mark: "○" },
};

/** Exercise list with completion status from this device's saved progress. */
export function ExercisePicker() {
  const raw = useSyncExternalStore(subscribeProgress, snapshot, () => "\u0000");
  const [confirming, setConfirming] = useState(false);
  const { progress, benchRaw } = useMemo(() => {
    const [p, b] = raw.split("\u0000");
    return { progress: parseProgress(p || null), benchRaw: b ?? "" };
  }, [raw]);

  const statusOf = (id: string): Status => {
    const e = progress.exercises[id];
    if (e?.completed) return "completed";
    if (e || (id === BENCH_EXERCISE_ID && benchStarted(benchRaw))) return "in-progress";
    return "not-started";
  };
  const done = LAB_EXERCISES.filter((e) => statusOf(e.id) === "completed").length;
  const anything = done > 0 || LAB_EXERCISES.some((e) => statusOf(e.id) !== "not-started");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-fg-muted" data-testid="progress-summary">
          {done} of {LAB_EXERCISES.length} completed
          <span className="text-fg-subtle"> · saved on this device only</span>
        </p>
        {anything &&
          (confirming ? (
            <span className="flex items-center gap-2 text-sm">
              <span className="text-fg">Clear all Circuit Lab progress?</span>
              <button
                type="button"
                onClick={() => {
                  resetAllProgress();
                  setConfirming(false);
                }}
                className="h-10 rounded-lg border border-fault/50 px-3 font-medium text-fault hover:bg-fault/10"
              >
                Clear
              </button>
              <button type="button" onClick={() => setConfirming(false)} className="h-10 rounded-lg border border-line-strong px-3 font-medium text-fg hover:bg-ink-800">
                Cancel
              </button>
            </span>
          ) : (
            <button type="button" onClick={() => setConfirming(true)} className="h-10 rounded-lg border border-line-strong px-3 text-sm font-medium text-fg-muted hover:text-fg">
              Reset progress
            </button>
          ))}
      </div>

      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {LAB_EXERCISES.map((e) => {
          const st = STATUS[statusOf(e.id)];
          const current = progress.current === e.id && statusOf(e.id) === "in-progress";
          return (
            <li key={e.id}>
              <Link
                href={e.href}
                data-exercise={e.id}
                className={`group flex h-full flex-col gap-2 rounded-2xl border bg-ink-900 p-4 transition-colors hover:bg-ink-850 ${current ? "border-signal-400/60" : "border-line hover:border-line-strong"}`}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className={`font-mono text-[10px] tracking-wider uppercase ${e.kind === "Fault" ? "text-amber-300" : "text-signal-400"}`}>
                    {e.kind === "Fault" ? "Fault finding" : "Build"} · {e.difficulty}
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${st.cls}`} data-status={statusOf(e.id)}>
                    <span aria-hidden="true">{st.mark} </span>
                    {st.label}
                  </span>
                </span>
                <span className="text-[15px] font-semibold text-fg">{e.title}</span>
                <span className="text-[13px] leading-snug text-fg-muted">{e.summary}</span>
                <span className="mt-auto flex items-center gap-1 pt-1 text-sm font-medium text-signal-400 group-hover:text-signal-300">
                  {current ? "Continue" : statusOf(e.id) === "completed" ? "Practise again" : "Start"}
                  <Icon name="chevron-right" className="size-4" />
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
