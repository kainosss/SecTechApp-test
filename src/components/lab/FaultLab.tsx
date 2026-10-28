"use client";

import { useEffect, useReducer } from "react";
import { formatOhms, resistorCode } from "@/lib/eol/engine";
import { benchReducer, EMPTY_BENCH, type BenchAction, type BenchState } from "@/lib/lab/bench";
import { checkWiring, TARGET, type CheckResult } from "@/lib/lab/check";
import {
  checkDiagnosis,
  effectiveCircuit,
  FAULT_LOCATIONS,
  FAULT_TYPES,
  getFaultScenario,
  VALUE_OPTIONS,
  type Diagnosis,
  type DiagnosisResult,
  type FaultScenario,
} from "@/lib/lab/faults";
import { EMPTY_EXERCISE, readProgress, saveExercise, type ExerciseProgress } from "@/lib/lab/progress";
import { BenchWorkspace } from "./BenchWorkspace";
import { LabFeedback } from "./LabFeedback";

function Choice<T extends string | number>({
  name,
  legend,
  options,
  value,
  onChange,
}: {
  name: string;
  legend: string;
  options: { id: T; label: string }[];
  value: T | null | undefined;
  onChange: (v: T) => void;
}) {
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1.5 text-sm font-semibold text-fg">{legend}</legend>
      {options.map((o) => (
        <label
          key={o.id}
          className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm has-focus-visible:outline-2 has-focus-visible:outline-signal-400 ${
            value === o.id ? "border-signal-400 bg-signal-500/15 text-fg" : "border-line-strong text-fg-muted hover:text-fg"
          }`}
        >
          <input type="radio" name={name} value={String(o.id)} checked={value === o.id} onChange={() => onChange(o.id)} className="size-4 accent-[#3fd9c2]" />
          {o.label}
        </label>
      ))}
    </fieldset>
  );
}

const EMPTY_DIAGNOSIS: Diagnosis = { type: null, location: null, value: null };

interface FaultState {
  bench: BenchState;
  repaired: boolean;
  diagnosis: Diagnosis;
  result: DiagnosisResult | null;
  hintsShown: number;
  repairCheck: { result: CheckResult; sig: string } | null;
  completed: boolean;
  /** Saved progress has been read, so saving can start. */
  loaded: boolean;
  /** Bumped on reset to give the bench a fresh workspace (probes, selection). */
  round: number;
}

type FaultAction =
  | BenchAction
  | { type: "hydrate"; saved: ExerciseProgress | undefined }
  | { type: "diagnose"; patch: Partial<Diagnosis> }
  | { type: "check-diagnosis" }
  | { type: "hint" }
  | { type: "repair" }
  | { type: "check-repair" }
  | { type: "reset-exercise" };

const sigOf = (s: Pick<FaultState, "bench" | "repaired">) => JSON.stringify([s.bench.components, s.repaired]);

function initial(scenario: FaultScenario): FaultState {
  return {
    bench: benchReducer(EMPTY_BENCH, { type: "load", components: scenario.components }),
    repaired: false,
    diagnosis: EMPTY_DIAGNOSIS,
    result: null,
    hintsShown: 0,
    repairCheck: null,
    completed: false,
    loaded: false,
    round: 0,
  };
}

function makeReducer(scenario: FaultScenario) {
  const circuit = (s: FaultState) => ({ components: s.bench.components, repaired: s.repaired });
  return function reducer(state: FaultState, action: FaultAction): FaultState {
    switch (action.type) {
      case "hydrate": {
        const saved = action.saved;
        if (!saved) return { ...state, loaded: true };
        const next: FaultState = {
          ...state,
          loaded: true,
          bench: saved.components ? benchReducer(EMPTY_BENCH, { type: "load", components: saved.components }) : state.bench,
          repaired: Boolean(scenario.hidden) && saved.repaired,
          diagnosis: { ...EMPTY_DIAGNOSIS, ...saved.diagnosis },
          hintsShown: Math.min(saved.hintsShown, scenario.hints.length),
          completed: saved.completed,
        };
        // A saved "diagnosed" flag is never trusted: the saved answer is re-checked against the circuit as found.
        return saved.diagnosed ? { ...next, result: checkDiagnosis(scenario, next.diagnosis) } : next;
      }
      case "diagnose":
        return { ...state, diagnosis: { ...state.diagnosis, ...action.patch }, result: null };
      case "check-diagnosis":
        return { ...state, result: checkDiagnosis(scenario, state.diagnosis, circuit(state)) };
      case "hint":
        return { ...state, hintsShown: Math.min(state.hintsShown + 1, scenario.hints.length) };
      case "repair":
        return { ...state, repaired: true };
      case "check-repair": {
        const eff = effectiveCircuit(scenario, circuit(state));
        const result = checkWiring(eff.components, eff.extra);
        return { ...state, repairCheck: { result, sig: sigOf(state) }, completed: state.completed || (Boolean(state.result?.correct) && result.correct) };
      }
      case "reset-exercise": {
        // Completion is an achievement and survives a reset; Reset Progress on /circuit-lab clears it.
        return { ...initial(scenario), loaded: true, completed: state.completed, round: state.round + 1 };
      }
      default:
        return { ...state, bench: benchReducer(state.bench, action) };
    }
  };
}

/** One fault-finding exercise: probe the faulty circuit, diagnose it, then repair and verify. */
export function FaultLab({ scenarioId }: { scenarioId: string }) {
  const scenario = getFaultScenario(scenarioId)!;
  const [state, dispatch] = useReducer(makeReducer(scenario), scenario, initial);
  const { bench, repaired, diagnosis, result, hintsShown, repairCheck, completed, loaded, round } = state;
  const { components } = bench;
  const eff = effectiveCircuit(scenario, { components, repaired });
  const inactive = repaired ? [] : (scenario.hidden?.brokenIds ?? []);
  const repairResult = repairCheck && repairCheck.sig === sigOf(state) ? repairCheck.result : null;
  const verified = Boolean(result?.correct && repairResult?.correct);

  useEffect(() => {
    dispatch({ type: "hydrate", saved: readProgress().exercises[scenario.id] });
  }, [scenario.id]);

  useEffect(() => {
    if (!loaded) return;
    saveExercise(scenario.id, {
      ...EMPTY_EXERCISE,
      components,
      repaired,
      diagnosis,
      diagnosed: Boolean(result?.correct),
      hintsShown,
      completed,
    });
  }, [scenario.id, loaded, components, repaired, diagnosis, result, hintsShown, completed]);

  return (
    <div className="flex flex-col gap-4">
      <section aria-labelledby="report-heading" className="rounded-2xl border border-amber-300/30 bg-amber-300/[0.06] p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="report-heading" className="text-sm font-semibold text-amber-300">
            Fault report
          </h2>
          {completed && (
            <span className="rounded-full bg-verified/15 px-2.5 py-0.5 text-xs font-medium text-verified" data-testid="completed-badge">
              ✓ Completed
            </span>
          )}
        </div>
        <p className="mt-1 text-[15px] leading-relaxed text-fg" data-testid="symptom">
          {scenario.symptom}
        </p>
        <p className="mt-2 text-xs text-fg-muted">
          A healthy zone reads {formatOhms(TARGET.sealed)} sealed, {formatOhms(TARGET.alarm)} in alarm and open circuit (OL) on tamper, measured Z1 to COM.
          Use the meter to find out what&apos;s different.
        </p>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section aria-label="Wiring bench" className="min-w-0 rounded-2xl border border-line bg-ink-900 p-3">
          <BenchWorkspace
            key={round}
            components={components}
            canUndo={bench.history.length > 0}
            dispatch={dispatch}
            onReset={() => dispatch({ type: "reset-exercise" })}
            resetLabel="Reset exercise"
            resetAlwaysEnabled
            extra={eff.extra}
            inactive={inactive}
            initialTool="probe-red"
            initialMessage="Start by measuring. Tap a terminal to place the red (V Ω) probe."
          />
        </section>

        <section aria-labelledby="diagnosis-heading" className="flex min-w-0 flex-col gap-4 rounded-2xl border border-line bg-ink-900 p-4">
          <div>
            <h2 id="diagnosis-heading" className="text-sm font-semibold text-fg">
              Your diagnosis
            </h2>
            <p className="mt-1 text-xs text-fg-muted">Measure first, then choose what the fault is and where it is.</p>
          </div>

          <div className="flex flex-col gap-2">
            {scenario.hints.slice(0, hintsShown).map((h, i) => (
              <p key={i} className="rounded-lg bg-ink-850 px-3 py-2 text-sm text-fg-muted" data-testid="hint">
                <span className="font-medium text-fg">Hint {i + 1}: </span>
                {h}
              </p>
            ))}
            {hintsShown < scenario.hints.length && (
              <button
                type="button"
                onClick={() => dispatch({ type: "hint" })}
                className="h-11 self-start rounded-lg border border-line-strong px-3 text-sm font-medium text-fg-muted hover:text-fg"
              >
                Show hint ({hintsShown + 1} of {scenario.hints.length})
              </button>
            )}
          </div>

          <Choice name={`type-${scenario.id}`} legend="What is the fault?" options={FAULT_TYPES} value={diagnosis.type} onChange={(v) => dispatch({ type: "diagnose", patch: { type: v } })} />
          <Choice
            name={`location-${scenario.id}`}
            legend="Where is it?"
            options={FAULT_LOCATIONS}
            value={diagnosis.location}
            onChange={(v) => dispatch({ type: "diagnose", patch: { location: v } })}
          />
          {scenario.answer.value && (
            <Choice
              name={`value-${scenario.id}`}
              legend="What value is fitted there?"
              options={VALUE_OPTIONS.map((v) => ({ id: v, label: `${resistorCode(v)} (${formatOhms(v)})` }))}
              value={diagnosis.value}
              onChange={(v) => dispatch({ type: "diagnose", patch: { value: v } })}
            />
          )}
          <button
            type="button"
            disabled={!diagnosis.type || !diagnosis.location || (Boolean(scenario.answer.value) && !diagnosis.value)}
            onClick={() => dispatch({ type: "check-diagnosis" })}
            className="h-11 rounded-lg bg-signal-500 px-4 text-sm font-semibold text-ink-950 hover:bg-signal-400 disabled:opacity-40"
          >
            Check diagnosis
          </button>

          {result && !result.correct && (
            <div className="rounded-xl border border-fault/40 bg-fault/[0.07] px-3 py-2.5 text-sm" data-testid="diagnosis-result" data-correct="false">
              <p className="font-semibold text-fg">✗ Not quite.</p>
              {!result.faultPresent ? (
                <p className="mt-1 text-fg-muted">The circuit now reads correctly in every state, so there&apos;s no fault left to diagnose. Reset the exercise to start again.</p>
              ) : (
                <>
                  <ul className="mt-1 space-y-0.5 text-fg-muted">
                    <li>{result.typeCorrect ? "✓ The fault type is right." : "✗ That fault type doesn't match the readings."}</li>
                    <li>{result.locationCorrect ? "✓ The location is right." : "✗ The fault isn't at that location."}</li>
                    {result.valueCorrect !== undefined && <li>{result.valueCorrect ? "✓ The value is right." : "✗ That isn't the value fitted there — measure it."}</li>}
                  </ul>
                  <p className="mt-1 text-fg-muted">Take more measurements: compare each detector state with the healthy readings above, then narrow down where they change.</p>
                </>
              )}
            </div>
          )}

          {result?.correct && (
            <div className="flex flex-col gap-2 rounded-xl border border-verified/40 bg-verified/[0.08] px-3 py-2.5 text-sm" data-testid="diagnosis-result" data-correct="true">
              <p className="font-semibold text-verified">✓ Correct diagnosis: {scenario.title.toLowerCase()}.</p>
              {scenario.hidden && <p className="text-fg">On inspection: {scenario.hidden.finding}</p>}
              <p className="text-fg-muted">
                <span className="font-medium text-fg">The fault: </span>
                {scenario.explanation.fault}
              </p>
              <p className="text-fg-muted">
                <span className="font-medium text-fg">Expected behaviour: </span>
                {scenario.explanation.expected}
              </p>
              <p className="text-fg-muted">
                <span className="font-medium text-fg">Repair: </span>
                {scenario.explanation.repair}
              </p>
              <div className="flex flex-wrap gap-2">
                {scenario.hidden && (
                  <button
                    type="button"
                    disabled={repaired}
                    onClick={() => dispatch({ type: "repair" })}
                    className="h-11 rounded-lg border border-line-strong px-4 font-medium text-fg hover:bg-ink-800 disabled:opacity-50"
                  >
                    {repaired ? "✓ Repaired" : scenario.hidden.repairLabel}
                  </button>
                )}
                <button type="button" onClick={() => dispatch({ type: "check-repair" })} className="h-11 rounded-lg bg-signal-500 px-4 font-semibold text-ink-950 hover:bg-signal-400">
                  Check repair
                </button>
              </div>
            </div>
          )}

          {repairCheck && !repairResult && <p className="text-sm text-amber-300">The circuit has changed since the last check. Press Check repair again.</p>}
          {repairResult && (
            <div data-testid="repair-result">
              {verified && (
                <p className="mb-2 rounded-lg bg-verified/15 px-3 py-2 text-sm font-semibold text-verified" data-testid="exercise-complete">
                  ✓ Exercise complete: fault found, repaired and verified in every state.
                </p>
              )}
              <LabFeedback result={repairResult} />
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
