"use client";

import { useReducer, useState } from "react";
import { formatOhms } from "@/lib/eol/engine";
import { benchReducer, EMPTY_BENCH } from "@/lib/lab/bench";
import { checkWiring, TARGET, type CheckResult } from "@/lib/lab/check";
import { checkDiagnosis, FAULT_LOCATIONS, FAULT_TYPES, getFaultScenario, type DiagnosisResult, type FaultLocation, type FaultType } from "@/lib/lab/faults";
import { BenchWorkspace } from "./BenchWorkspace";
import { LabFeedback } from "./LabFeedback";

function Choice<T extends string>({ name, legend, options, value, onChange }: { name: string; legend: string; options: { id: T; label: string }[]; value: T | null; onChange: (v: T) => void }) {
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
          <input type="radio" name={name} value={o.id} checked={value === o.id} onChange={() => onChange(o.id)} className="size-4 accent-[#3fd9c2]" />
          {o.label}
        </label>
      ))}
    </fieldset>
  );
}

/** One fault-finding exercise: probe the faulty circuit, diagnose it, then repair and verify. */
export function FaultLab({ scenarioId }: { scenarioId: string }) {
  const scenario = getFaultScenario(scenarioId)!;
  const [bench, dispatch] = useReducer(benchReducer, EMPTY_BENCH, (s) => benchReducer(s, { type: "load", components: scenario.components }));
  const [repaired, setRepaired] = useState(false);
  const [type, setType] = useState<FaultType | null>(null);
  const [location, setLocation] = useState<FaultLocation | null>(null);
  const [diagnosis, setDiagnosis] = useState<DiagnosisResult | null>(null);
  const [hintsShown, setHintsShown] = useState(0);
  const [repairCheck, setRepairCheck] = useState<{ result: CheckResult; sig: string } | null>(null);
  const [round, setRound] = useState(0);

  const { components } = bench;
  const extra = repaired || !scenario.hidden ? [] : scenario.hidden.elements;
  const sig = JSON.stringify([components, repaired]);
  const repairResult = repairCheck && repairCheck.sig === sig ? repairCheck.result : null;
  const complete = diagnosis?.correct && repairResult?.correct;

  function resetExercise() {
    dispatch({ type: "load", components: scenario.components });
    setRepaired(false);
    setType(null);
    setLocation(null);
    setDiagnosis(null);
    setHintsShown(0);
    setRepairCheck(null);
    setRound((r) => r + 1); // fresh workspace: probes, selection, messages
  }

  return (
    <div className="flex flex-col gap-4">
      <section aria-labelledby="report-heading" className="rounded-2xl border border-amber-300/30 bg-amber-300/[0.06] p-4">
        <h2 id="report-heading" className="text-sm font-semibold text-amber-300">
          Fault report
        </h2>
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
            onReset={resetExercise}
            resetLabel="Reset exercise"
            resetAlwaysEnabled
            extra={extra}
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
                onClick={() => setHintsShown(hintsShown + 1)}
                className="h-10 self-start rounded-lg border border-line-strong px-3 text-sm font-medium text-fg-muted hover:text-fg"
              >
                Show hint ({hintsShown + 1} of {scenario.hints.length})
              </button>
            )}
          </div>

          <Choice
            name={`type-${scenario.id}`}
            legend="What is the fault?"
            options={FAULT_TYPES}
            value={type}
            onChange={(v) => {
              setType(v);
              setDiagnosis(null);
            }}
          />
          <Choice
            name={`location-${scenario.id}`}
            legend="Where is it?"
            options={FAULT_LOCATIONS}
            value={location}
            onChange={(v) => {
              setLocation(v);
              setDiagnosis(null);
            }}
          />
          <button
            type="button"
            disabled={!type || !location}
            onClick={() => setDiagnosis(checkDiagnosis(scenario, { type, location }))}
            className="h-11 rounded-lg bg-signal-500 px-4 text-sm font-semibold text-ink-950 hover:bg-signal-400 disabled:opacity-40"
          >
            Check diagnosis
          </button>

          {diagnosis && !diagnosis.correct && (
            <div className="rounded-xl border border-fault/40 bg-fault/[0.07] px-3 py-2.5 text-sm" data-testid="diagnosis-result" data-correct="false">
              <p className="font-semibold text-fg">✗ Not quite.</p>
              <ul className="mt-1 space-y-0.5 text-fg-muted">
                <li>{diagnosis.typeCorrect ? "✓ The fault type is right." : "✗ That fault type doesn't match the readings."}</li>
                <li>{diagnosis.locationCorrect ? "✓ The location is right." : "✗ The fault isn't at that location."}</li>
              </ul>
              <p className="mt-1 text-fg-muted">Take more measurements: compare each detector state with the healthy readings above, then narrow down where they change.</p>
            </div>
          )}

          {diagnosis?.correct && (
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
                    onClick={() => setRepaired(true)}
                    className="h-11 rounded-lg border border-line-strong px-4 font-medium text-fg hover:bg-ink-800 disabled:opacity-50"
                  >
                    {repaired ? "✓ Repaired" : scenario.hidden.repairLabel}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setRepairCheck({ result: checkWiring(components, extra), sig })}
                  className="h-11 rounded-lg bg-signal-500 px-4 font-semibold text-ink-950 hover:bg-signal-400"
                >
                  Check repair
                </button>
              </div>
            </div>
          )}

          {repairCheck && !repairResult && <p className="text-sm text-amber-300">The circuit has changed since the last check. Press Check repair again.</p>}
          {repairResult && (
            <div data-testid="repair-result">
              {complete && (
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
