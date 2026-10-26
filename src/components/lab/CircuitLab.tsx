"use client";

import Link from "next/link";
import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { DiagramBanner } from "@/lib/eol/classification";
import { formatOhms, resistorCode, type ContactPositions } from "@/lib/eol/engine";
import type { Circuit } from "@/lib/eol/model";
import { EMPTY_BENCH, POINTS_BY_ID, TRAY, benchReducer, componentLabels, type BenchAction, type BenchState, type PlacedComponent, type PointId } from "@/lib/lab/bench";
import { checkWiring, stepStatus, type CheckResult, type StepId } from "@/lib/lab/check";
import { Icon } from "@/components/ui/Icon";
import { CircuitDiagram } from "@/components/eol/CircuitDiagram";
import { WiringBench } from "./WiringBench";

export const EXPLANATION_HREF = "/eol?t=demo-generic-deol-alarm-tamper&p=generic-2k2-4k4";
const STORAGE_KEY = "fieldwise:lab:pir-deol:v1";

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

type Tool = (typeof TRAY)[number]["key"];

interface Saved {
  components: PlacedComponent[];
  reviewed: boolean;
}

function readSaved(): Saved | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Saved>;
    return { components: Array.isArray(parsed.components) ? parsed.components : [], reviewed: parsed.reviewed === true };
  } catch {
    return null;
  }
}

function describe(c: PlacedComponent, label: string): string {
  const kind = c.kind === "resistor" ? `${label} ${resistorCode(c.ohms!)}` : label;
  return `${kind}: ${POINTS_BY_ID[c.a].name} → ${POINTS_BY_ID[c.b].name}`;
}

function short(id: PointId): string {
  const p = POINTS_BY_ID[id];
  if (p.group === "detector-alarm") return `ALARM ${p.label}`;
  if (p.group === "detector-tamper") return `TAMPER ${p.label}`;
  return p.label;
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
  const [tool, setTool] = useState<Tool | null>("wire");
  const [pending, setPending] = useState<PointId | null>(null);
  const [moving, setMoving] = useState<string | null>(null);
  const [selectedComponent, setSelectedComponent] = useState<string | null>(null);
  const [selectedPoint, setSelectedPoint] = useState<PointId | null>(null);
  const [check, setCheck] = useState<{ result: CheckResult; sig: string } | null>(null);
  const [viewedStep, setViewedStep] = useState<StepId | null>(null);
  const [hints, setHints] = useState<Partial<Record<StepId, boolean>>>({});
  const [view, setView] = useState<"bench" | "schematic">("bench");
  const [message, setMessage] = useState("Choose a component from the tray, then tap two terminals to connect it.");
  const feedbackRef = useRef<HTMLElement>(null);

  const { components } = bench;
  const sig = JSON.stringify(components);
  const labels = componentLabels(components);

  // Restore progress saved on this device.
  useEffect(() => {
    dispatch({ type: "hydrate", saved: readSaved() });
  }, []);
  useEffect(() => {
    if (!loaded) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ components, reviewed } satisfies Saved));
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
  const armed = tool !== null || moving !== null;
  const toolItem = TRAY.find((t) => t.key === tool);
  const movingComponent = components.find((c) => c.id === moving);
  const selected = components.find((c) => c.id === selectedComponent);
  const inspected = selectedPoint ? POINTS_BY_ID[selectedPoint] : null;

  function cancelPlacement() {
    setPending(null);
    setMoving(null);
  }

  function chooseTool(key: Tool) {
    cancelPlacement();
    setSelectedPoint(null);
    if (tool === key) {
      setTool(null);
      setMessage("Inspect mode: tap a terminal to read what it does.");
      return;
    }
    setTool(key);
    setMessage(`${TRAY.find((t) => t.key === key)!.label} selected. Tap the start terminal.`);
  }

  function onPoint(id: PointId) {
    const point = POINTS_BY_ID[id];
    if (!armed) {
      setSelectedComponent(null);
      setSelectedPoint(selectedPoint === id ? null : id);
      return;
    }
    if (!point.connectable) {
      setMessage(`${point.name} is pre-wired to the detector's power terminals and isn't available. Choose another terminal.`);
      return;
    }
    if (pending === null) {
      setPending(id);
      setSelectedComponent(null);
      setMessage(`Start: ${short(id)}. Now tap the end terminal, or tap ${short(id)} again to cancel.`);
      return;
    }
    if (pending === id) {
      setPending(null);
      setMessage("Start point cleared. Tap a start terminal.");
      return;
    }
    if (movingComponent) {
      dispatch({ type: "move", id: movingComponent.id, a: pending, b: id });
      setMessage(`Moved ${labels[movingComponent.id]} to ${short(pending)} → ${short(id)}.`);
      setSelectedComponent(movingComponent.id);
      setMoving(null);
    } else if (toolItem) {
      const n = components.filter((c) => c.kind === toolItem.kind).length + 1;
      const label = toolItem.kind === "resistor" ? `R${n} (${resistorCode(toolItem.ohms!)})` : `W${n}`;
      dispatch({ type: "place", kind: toolItem.kind, ohms: toolItem.ohms, a: pending, b: id });
      setMessage(`Placed ${label} from ${short(pending)} to ${short(id)}. Tap another start terminal to place more.`);
    }
    setPending(null);
  }

  function onComponent(id: string) {
    cancelPlacement();
    setSelectedPoint(null);
    setSelectedComponent(selectedComponent === id ? null : id);
  }

  function remove(id: string) {
    setMessage(`Removed ${labels[id]}. Undo restores it.`);
    dispatch({ type: "remove", id });
    setSelectedComponent(null);
    cancelPlacement();
  }

  function startMove(id: string) {
    setMoving(id);
    setPending(null);
    setSelectedPoint(null);
    setMessage(`Moving ${labels[id]}: tap its new start terminal.`);
  }

  function runCheck() {
    cancelPlacement();
    setCheck({ result: checkWiring(components), sig });
    setMessage("Wiring checked in all five states. See the results below.");
    feedbackRef.current?.scrollIntoView?.({ behavior: "smooth", block: "nearest" });
  }

  function reset() {
    dispatch({ type: "reset" });
    cancelPlacement();
    setSelectedComponent(null);
    setSelectedPoint(null);
    setCheck(null);
    setMessage("Bench reset. Undo restores your wiring.");
  }

  const doneCount = STEPS.filter((s) => status[s.id]).length;

  return (
    <div
      className="flex flex-col gap-4"
      onKeyDown={(e) => {
        if (e.key === "Escape" && (pending || moving)) {
          cancelPlacement();
          setMessage("Placement cancelled.");
        }
      }}
    >
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
              className="h-10 rounded-lg border border-line-strong px-3 text-sm font-medium text-fg-muted hover:text-fg"
            >
              {hints[shownStep.id] ? "Hide hint" : "Show hint"}
            </button>
            {shownStep.id === "identify" && !reviewed && (
              <button type="button" onClick={() => dispatch({ type: "reviewed" })} className="h-10 rounded-lg bg-signal-500 px-3 text-sm font-semibold text-ink-950 hover:bg-signal-400">
                I&apos;ve reviewed the terminals
              </button>
            )}
            {viewedStep && viewedStep !== currentStep && (
              <button type="button" onClick={() => setViewedStep(null)} className="h-10 px-1 text-sm font-medium text-signal-400 hover:text-signal-300">
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
            className={`h-10 rounded-lg text-sm font-medium ${view === id ? "bg-signal-500/15 text-signal-300" : "text-fg-muted hover:text-fg"}`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Bench */}
        <section aria-label="Wiring bench" className={`${view === "bench" ? "" : "hidden"} min-w-0 rounded-2xl border border-line bg-ink-900 p-3 lg:block`}>
          <div role="group" aria-label="Component tray" className="flex flex-wrap gap-2">
            {TRAY.map((t) => {
              const active = tool === t.key && !moving;
              return (
                <button
                  key={t.key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => chooseTool(t.key)}
                  className={`flex h-11 items-center gap-2 rounded-lg border px-3 text-sm font-medium ${
                    active ? "border-signal-400 bg-signal-500/15 text-signal-300" : "border-line-strong text-fg-muted hover:text-fg"
                  }`}
                >
                  {t.kind === "wire" ? (
                    <span className="h-0.5 w-5 rounded bg-current" aria-hidden="true" />
                  ) : (
                    <span className="flex h-3 w-6 items-center justify-center gap-[2px] rounded-sm bg-[#e8d6b0]" aria-hidden="true">
                      {t.bands!.map((b, i) => (
                        <span key={i} className="h-3 w-[3px]" style={{ background: { red: "#dc2626", yellow: "#facc15", violet: "#8b5cf6", brown: "#8b5a2b", black: "#111", orange: "#f08c00", gold: "#c9a227" }[b] }} />
                      ))}
                    </span>
                  )}
                  {t.kind === "wire" ? "Wire" : resistorCode(t.ohms!)}
                  {active && <span className="sr-only"> (selected)</span>}
                </button>
              );
            })}
          </div>

          <p className="mt-2 min-h-10 rounded-lg bg-ink-850 px-3 py-2 text-sm text-fg" role="status" aria-live="polite" data-testid="bench-status">
            {message}
          </p>

          <div className="mt-2 rounded-xl border border-line bg-ink-950 p-1">
            <WiringBench
              components={components}
              pending={pending}
              armed={armed}
              selectedComponent={selectedComponent}
              selectedPoint={selectedPoint}
              flagged={flagged}
              onPoint={onPoint}
              onComponent={onComponent}
            />
          </div>

          {(pending || moving) && (
            <div className="mt-2 flex items-center justify-between gap-2 rounded-lg border border-signal-400/40 bg-signal-500/10 px-3 py-2 text-sm text-fg">
              <span>
                {moving ? `Moving ${labels[moving]}` : `Placing ${toolItem?.kind === "resistor" ? resistorCode(toolItem.ohms!) + " resistor" : "wire"}`}
                {pending ? ` · start ${short(pending)} → choose end` : " · choose start"}
              </span>
              <button
                type="button"
                onClick={() => {
                  cancelPlacement();
                  setMessage("Placement cancelled.");
                }}
                className="h-9 shrink-0 px-1 font-medium text-signal-400 hover:text-signal-300"
              >
                Cancel
              </button>
            </div>
          )}

          {inspected && (
            <div className="mt-2 rounded-lg border border-line bg-ink-850 px-3 py-2 text-sm" data-testid="terminal-info">
              <p className="font-semibold text-fg">{inspected.name}</p>
              <p className="mt-0.5 text-fg-muted">{inspected.description}</p>
            </div>
          )}

          {selected && (
            <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-line bg-ink-850 px-3 py-2 text-sm" data-testid="selected-component">
              <span className="min-w-0 flex-1 text-fg">{describe(selected, labels[selected.id]!)}</span>
              <button type="button" onClick={() => startMove(selected.id)} className="h-10 rounded-lg border border-line-strong px-3 font-medium text-fg hover:bg-ink-800">
                Move
              </button>
              <button type="button" onClick={() => remove(selected.id)} className="h-10 rounded-lg border border-fault/50 px-3 font-medium text-fault hover:bg-fault/10">
                Remove
              </button>
            </div>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={runCheck} className="h-11 flex-1 rounded-lg bg-signal-500 px-4 text-sm font-semibold text-ink-950 hover:bg-signal-400 sm:flex-none">
              Check wiring
            </button>
            <button
              type="button"
              onClick={() => {
                dispatch({ type: "undo" });
                cancelPlacement();
                setSelectedComponent(null);
                setMessage("Undid the last change.");
              }}
              disabled={bench.history.length === 0}
              className="h-11 rounded-lg border border-line-strong px-4 text-sm font-medium text-fg hover:bg-ink-800 disabled:opacity-40"
            >
              Undo
            </button>
            <button
              type="button"
              onClick={reset}
              disabled={components.length === 0}
              className="h-11 rounded-lg border border-line-strong px-4 text-sm font-medium text-fg hover:bg-ink-800 disabled:opacity-40"
            >
              Reset
            </button>
          </div>

          <details className="mt-3 rounded-lg border border-line px-3 py-2 text-sm" open={components.length > 0}>
            <summary className="cursor-pointer font-medium text-fg">Placed components ({components.length})</summary>
            {components.length === 0 ? (
              <p className="mt-2 text-fg-muted">Nothing placed yet.</p>
            ) : (
              <ul className="mt-2 flex flex-col gap-1.5" aria-label="Placed components">
                {components.map((c) => (
                  <li key={c.id} className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onComponent(c.id)}
                      aria-pressed={c.id === selectedComponent}
                      className={`min-h-10 min-w-0 flex-1 rounded-lg px-2 text-left ${c.id === selectedComponent ? "bg-signal-500/15 text-signal-300" : "text-fg hover:bg-ink-850"}`}
                    >
                      <span className="font-mono font-semibold">{labels[c.id]}</span>{" "}
                      <span className="text-fg-muted">
                        {c.kind === "resistor" ? `${resistorCode(c.ohms!)} · ` : "wire · "}
                        {short(c.a)} → {short(c.b)}
                      </span>
                    </button>
                    <button type="button" onClick={() => remove(c.id)} aria-label={`Remove ${labels[c.id]}`} className="grid size-10 shrink-0 place-items-center rounded-lg text-fg-muted hover:text-fault">
                      <Icon name="close" className="size-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </details>
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
        {current && <Feedback result={current} />}
      </section>
    </div>
  );
}

const SEVERITY = {
  error: { mark: "✗", label: "Problem", cls: "border-fault/40 bg-fault/[0.07]", text: "text-fault" },
  warning: { mark: "!", label: "Check", cls: "border-amber-300/40 bg-amber-300/[0.07]", text: "text-amber-300" },
  success: { mark: "✓", label: "Correct", cls: "border-verified/40 bg-verified/[0.08]", text: "text-verified" },
  info: { mark: "i", label: "Note", cls: "border-line-strong bg-ink-850", text: "text-signal-300" },
} as const;

function Feedback({ result }: { result: CheckResult }) {
  return (
    <div className="mt-3 flex flex-col gap-3">
      <p className={`text-[15px] font-semibold ${result.correct ? "text-verified" : "text-fault"}`} data-testid="check-verdict">
        {result.correct ? "✓ Correct wiring — all five states pass." : "✗ Not correct yet."}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Simulated readings between Z1 and COM</caption>
          <thead className="text-xs text-fg-subtle">
            <tr>
              <th scope="col" className="py-1 pr-2 font-medium">
                State
              </th>
              <th scope="col" className="py-1 pr-2 font-medium">
                Expected
              </th>
              <th scope="col" className="py-1 pr-2 font-medium">
                Simulated
              </th>
              <th scope="col" className="py-1 font-medium">
                Result
              </th>
            </tr>
          </thead>
          <tbody>
            {result.readings.map((r) => (
              <tr key={r.kind} className="border-t border-line" data-state={r.kind}>
                <th scope="row" className="py-1.5 pr-2 font-medium text-fg">
                  {r.label}
                </th>
                <td className="py-1.5 pr-2 font-mono text-fg-muted">{formatOhms(r.expected)}</td>
                <td className="py-1.5 pr-2 font-mono text-fg">{r.ohms === null ? "Can't evaluate" : formatOhms(r.ohms)}</td>
                <td className={`py-1.5 font-semibold ${r.matches ? "text-verified" : "text-fault"}`}>{r.matches ? "✓ Pass" : "✗ Fail"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="flex flex-col gap-2">
        {result.findings.map((f, i) => {
          const s = SEVERITY[f.severity];
          return (
            <li key={`${f.code}-${i}`} className={`rounded-xl border px-3 py-2.5 text-sm ${s.cls}`} data-finding={f.code}>
              <p className="font-semibold text-fg">
                <span className={`mr-1.5 ${s.text}`} aria-hidden="true">
                  {s.mark}
                </span>
                <span className="sr-only">{s.label}: </span>
                {f.title}
              </p>
              {f.why && (
                <p className="mt-1 text-fg-muted">
                  <span className="font-medium text-fg">Why it matters: </span>
                  {f.why}
                </p>
              )}
              {f.fix && (
                <p className="mt-1 text-fg-muted">
                  <span className="font-medium text-fg">How to fix: </span>
                  {f.fix}
                </p>
              )}
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-fg-subtle">Simulated readings from a circuit model of your wiring. Not a measurement, and not a panel-specific installation diagram.</p>
    </div>
  );
}
