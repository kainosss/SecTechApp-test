"use client";

import Link from "next/link";
import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { DiagramBanner } from "@/lib/eol/classification";
import type { ContactPositions } from "@/lib/eol/engine";
import type { Circuit } from "@/lib/eol/model";
import { EMPTY_BENCH, benchReducer, type BenchAction, type BenchState, type PlacedComponent } from "@/lib/lab/bench";
import { checkWiring, stepStatus, type CheckResult, type StepId } from "@/lib/lab/check";
import { Icon } from "@/components/ui/Icon";
import { CircuitDiagram } from "@/components/eol/CircuitDiagram";
import { BENCH_EXERCISE_ID } from "@/lib/lab/exercises";
import { BENCH_KEY, saveExercise } from "@/lib/lab/progress";
import { BenchWorkspace } from "./BenchWorkspace";
import { LabFeedback } from "./LabFeedback";

export const EXPLANATION_HREF = "/eol?t=demo-generic-deol-alarm-tamper&p=generic-2k2-4k4";

export interface LabSchematic {
  circuit: Circuit;
  normalPositions: ContactPositions;
  banner: DiagramBanner;
  title: string;
}

interface Step {
  id: StepId;
  title: string;
  body: string;
  hint: string;
}

const STEPS: Step[] = [
  {
    id: "identify",
    title: "Identify terminals",
    body: "Find the panel's zone input (Z1 and COM) and the detector's ALARM and TAMPER contacts. +12V and 0V are a separate power circuit, already wired from the panel's AUX supply.",
    hint: "With nothing selected in the tray, tap any terminal to read what it does.",
  },
  {
    id: "tamper",
    title: "Wire the tamper loop",
    body: "Run a wire from the panel's COM terminal to one side of the TAMPER contact (e.g. TAMPER NC).",
    hint: "The tamper contact goes in series with the loop: when the cover comes off, it opens and breaks the whole zone.",
  },
  {
    id: "r1",
    title: "Place R1 (series)",
    body: "Fit a 2.2 kΩ resistor in series with the loop, e.g. from ALARM NC to TAMPER COM.",
    hint: "R1 sets the sealed reading. It must be in the loop, but not across the alarm contact.",
  },
  {
    id: "r2",
    title: "Place R2 (across alarm)",
    body: "Fit a second 2.2 kΩ resistor directly across the ALARM contact: ALARM COM to ALARM NC.",
    hint: "While the alarm contact is closed it shorts R2 out. When it opens, R2 adds to R1: 2.2 kΩ + 2.2 kΩ = 4.4 kΩ.",
  },
  {
    id: "loop",
    title: "Complete the zone loop",
    body: "Wire the panel's Z1 terminal to the open end of the circuit (e.g. ALARM COM).",
    hint: "The panel measures resistance between Z1 and COM, so the loop must run from Z1 through the detector and back to COM.",
  },
  {
    id: "test",
    title: "Test",
    body: "Press Check wiring. The circuit is simulated in five states: sealed, alarm, tamper, cable open and cable short.",
    hint: "Every state must read correctly before the exercise is complete. The guide's layout isn't the only correct one: equivalent wiring is accepted.",
  },
];

interface Saved {
  components: PlacedComponent[];
  reviewed: boolean;
}

function readSaved(): Saved | null {
  try {
    const raw = window.localStorage.getItem(BENCH_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Saved>;
    return { components: Array.isArray(parsed.components) ? parsed.components : [], reviewed: parsed.reviewed === true };
  } catch {
    return null;
  }
}

/** Bench state plus the progress that is saved with it. */
interface LabState {
  bench: BenchState;
  reviewed: boolean;
  /** True once saved progress has been read (so the first save can't overwrite it). */
  loaded: boolean;
}
type LabAction = BenchAction | { type: "reviewed" } | { type: "hydrate"; saved: Saved | null };

function labReducer(state: LabState, action: LabAction): LabState {
  if (action.type === "reviewed") return { ...state, reviewed: true };
  if (action.type === "hydrate") {
    if (!action.saved) return { ...state, loaded: true };
    return { bench: benchReducer(state.bench, { type: "load", components: action.saved.components }), reviewed: action.saved.reviewed, loaded: true };
  }
  return { ...state, bench: benchReducer(state.bench, action) };
}

export function CircuitLab({ schematic }: { schematic: LabSchematic | null }) {
  const [{ bench, reviewed, loaded }, dispatch] = useReducer(labReducer, { bench: EMPTY_BENCH, reviewed: false, loaded: false });
  const [check, setCheck] = useState<{ result: CheckResult; sig: string } | null>(null);
  const [viewedStep, setViewedStep] = useState<StepId | null>(null);
  const [hints, setHints] = useState<Partial<Record<StepId, boolean>>>({});
  const [view, setView] = useState<"bench" | "schematic">("bench");
  const feedbackRef = useRef<HTMLElement>(null);

  const { components } = bench;
  const sig = JSON.stringify(components);

  // Restore progress saved on this device.
  useEffect(() => {
    dispatch({ type: "hydrate", saved: readSaved() });
  }, []);
  useEffect(() => {
    if (!loaded) return;
    try {
      window.localStorage.setItem(BENCH_KEY, JSON.stringify({ components, reviewed } satisfies Saved));
    } catch {
      // Progress just won't persist.
    }
  }, [components, reviewed, loaded]);

  const current = check && check.sig === sig ? check.result : null;
  const stale = check !== null && check.sig !== sig;
  const flagged = useMemo(() => new Set(current?.findings.flatMap((f) => (f.severity === "error" || f.severity === "warning" ? (f.componentIds ?? []) : [])) ?? []), [current]);
  const status = stepStatus(components, { reviewedTerminals: reviewed, lastCheckCorrect: current?.correct ?? false });
  const currentStep = STEPS.find((s) => !status[s.id])?.id ?? "test";
  const shownStep = STEPS.find((s) => s.id === (viewedStep ?? currentStep))!;
  function runCheck() {
    const result = checkWiring(components);
    setCheck({ result, sig });
    if (result.correct) saveExercise(BENCH_EXERCISE_ID, { completed: true });
    feedbackRef.current?.scrollIntoView?.({ behavior: "smooth", block: "nearest" });
  }

  function reset() {
    dispatch({ type: "reset" });
    setCheck(null);
  }

  const doneCount = STEPS.filter((s) => status[s.id]).length;

  return (
    <div className="flex flex-col gap-4">
      {/* Guided steps */}
      <section aria-labelledby="steps-heading" className="rounded-2xl border border-line bg-ink-900 p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 id="steps-heading" className="text-sm font-semibold text-fg">
            Guided steps
          </h2>
          <span className="font-mono text-xs text-fg-muted">
            {doneCount} / {STEPS.length} done
          </span>
        </div>
        <ol className="mt-3 grid grid-cols-6 gap-1.5" aria-label="Steps">
          {STEPS.map((s, i) => {
            const done = status[s.id];
            const isShown = s.id === shownStep.id;
            return (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => setViewedStep(s.id === currentStep ? null : s.id)}
                  aria-current={s.id === currentStep ? "step" : undefined}
                  aria-pressed={isShown}
                  aria-label={`Step ${i + 1}: ${s.title}${done ? " (done)" : s.id === currentStep ? " (current)" : ""}`}
                  className={`flex h-11 w-full flex-col items-center justify-center rounded-lg border text-xs font-semibold ${
                    isShown ? "border-signal-400 bg-signal-500/15 text-signal-300" : done ? "border-verified/40 text-verified" : "border-line-strong text-fg-muted"
                  }`}
                  data-step={s.id}
                  data-done={done}
                >
                  <span aria-hidden="true">{done ? "✓" : i + 1}</span>
                </button>
              </li>
            );
          })}
        </ol>
        <div className="mt-3" data-testid="step-detail">
          <p className="text-[15px] font-semibold text-fg">
            {STEPS.indexOf(shownStep) + 1}. {shownStep.title}{" "}
            {status[shownStep.id] ? (
              <span className="ml-1 rounded bg-verified/15 px-1.5 py-0.5 text-xs font-medium text-verified">✓ Done</span>
            ) : shownStep.id === currentStep ? (
              <span className="ml-1 rounded bg-signal-500/15 px-1.5 py-0.5 text-xs font-medium text-signal-300">Current</span>
            ) : null}
          </p>
          <p className="mt-1 text-sm leading-relaxed text-fg-muted">{shownStep.body}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              aria-expanded={Boolean(hints[shownStep.id])}
              onClick={() => setHints({ ...hints, [shownStep.id]: !hints[shownStep.id] })}
              className="h-11 rounded-lg border border-line-strong px-3 text-sm font-medium text-fg-muted hover:text-fg"
            >
              {hints[shownStep.id] ? "Hide hint" : "Show hint"}
            </button>
            {shownStep.id === "identify" && !reviewed && (
              <button type="button" onClick={() => dispatch({ type: "reviewed" })} className="h-11 rounded-lg bg-signal-500 px-3 text-sm font-semibold text-ink-950 hover:bg-signal-400">
                I&apos;ve reviewed the terminals
              </button>
            )}
            {viewedStep && viewedStep !== currentStep && (
              <button type="button" onClick={() => setViewedStep(null)} className="h-11 px-1 text-sm font-medium text-signal-400 hover:text-signal-300">
                Back to current step
              </button>
            )}
          </div>
          {hints[shownStep.id] && <p className="mt-2 rounded-lg bg-ink-850 px-3 py-2 text-sm text-fg-muted">{shownStep.hint}</p>}
        </div>
      </section>

      {/* Mobile view switcher; both views are shown side by side on desktop. */}
      <div role="tablist" aria-label="Lab view" className="grid grid-cols-2 gap-1 rounded-xl border border-line bg-ink-900 p-1 lg:hidden">
        {(
          [
            ["bench", "Wiring bench"],
            ["schematic", "Target schematic"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={view === id}
            onClick={() => setView(id)}
            className={`h-11 rounded-lg text-sm font-medium ${view === id ? "bg-signal-500/15 text-signal-300" : "text-fg-muted hover:text-fg"}`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Bench */}
        <section aria-label="Wiring bench" className={`${view === "bench" ? "" : "hidden"} min-w-0 rounded-2xl border border-line bg-ink-900 p-3 lg:block`}>
          <BenchWorkspace
            components={components}
            canUndo={bench.history.length > 0}
            dispatch={dispatch}
            onReset={reset}
            flagged={flagged}
            actions={
              <button type="button" onClick={runCheck} className="h-11 flex-1 rounded-lg bg-signal-500 px-4 text-sm font-semibold text-ink-950 hover:bg-signal-400 sm:flex-none">
                Check wiring
              </button>
            }
          />
        </section>

        {/* Target schematic */}
        <section aria-label="Target schematic" className={`${view === "schematic" ? "" : "hidden"} min-w-0 rounded-2xl border border-line bg-ink-900 p-3 lg:block`}>
          <h2 className="text-sm font-semibold text-fg">Target circuit</h2>
          <p className="mt-1 text-xs leading-relaxed text-fg-muted">
            The same generic 2k2 / 4k4 dual EOL circuit as the EOL Assistant, shown sealed. The diagram&apos;s Z+ is the panel&apos;s Z1 and Z− is COM.
          </p>
          <div className="mt-2 rounded-xl border border-line bg-ink-950 p-2">
            {schematic ? (
              <CircuitDiagram
                circuit={schematic.circuit}
                positions={schematic.normalPositions}
                normalPositions={schematic.normalPositions}
                line="intact"
                banner={schematic.banner}
                title={schematic.title}
              />
            ) : (
              <p className="p-4 text-sm text-fg-muted">The target schematic isn&apos;t available.</p>
            )}
          </div>
          <Link
            href={EXPLANATION_HREF}
            className="mt-3 inline-flex h-11 items-center gap-2 rounded-lg border border-signal-400/50 px-4 text-sm font-semibold text-signal-300 hover:bg-signal-500/10"
          >
            View Circuit Explanation
            <Icon name="chevron-right" className="size-4" />
          </Link>
        </section>
      </div>

      {/* Feedback */}
      <section ref={feedbackRef} aria-labelledby="feedback-heading" className="rounded-2xl border border-line bg-ink-900 p-4" data-testid="feedback">
        <h2 id="feedback-heading" className="text-sm font-semibold text-fg">
          Wiring check
        </h2>
        {!check && <p className="mt-2 text-sm text-fg-muted">Press Check wiring to simulate the circuit in all five states. Nothing is marked correct until every state reads as required.</p>}
        {stale && (
          <p className="mt-2 rounded-lg border border-amber-300/40 bg-amber-300/10 px-3 py-2 text-sm text-fg" data-testid="stale-check">
            The wiring has changed since the last check. Press Check wiring again.
          </p>
        )}
        {current && <LabFeedback result={current} />}
      </section>
    </div>
  );
}
