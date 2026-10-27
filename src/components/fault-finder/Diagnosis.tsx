"use client";

import Link from "next/link";
import { useEffect, useReducer, useState } from "react";
import { answer, back, evaluate, fillText, rankCauses, startSession, type AnswerInput, type Finding, type Session } from "@/lib/fault-finder/engine";
import { BAND_LABELS, fmt, parseResistor, zoneBands } from "@/lib/fault-finder/eol";
import type { EolConfigNode, MeasureNode, QuestionNode, ResultNode, Workflow } from "@/lib/fault-finder/schema";
import { clearSession, loadSession, saveSession, type LoadStatus } from "@/lib/fault-finder/sessions";
import { getDiagnosticWorkflow, WORKFLOWS } from "@/lib/fault-finder/workflows";
import { Icon } from "@/components/ui/Icon";
import { VerificationPanel } from "./VerificationPanel";

interface State {
  session: Session;
  /** Safety checks read; the first question is shown. */
  started: boolean;
  loaded: boolean;
  status: LoadStatus;
  error: string | null;
}

type Action =
  | { type: "hydrate"; session: Session; status: LoadStatus }
  | { type: "start" }
  | { type: "answer"; input: AnswerInput; wf: Workflow }
  | { type: "back" }
  | { type: "go-to"; steps: number }
  | { type: "restart"; wf: Workflow }
  | { type: "clear"; wf: Workflow };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "hydrate":
      return { ...state, loaded: true, session: action.session, status: action.status, started: action.session.steps.length > 0 };
    case "start":
      return { ...state, started: true };
    case "answer": {
      const r = answer(action.wf, state.session, action.input);
      return r.ok ? { ...state, session: r.session, error: null, status: "none" } : { ...state, error: r.error };
    }
    case "back":
      return state.session.steps.length === 0 ? { ...state, started: false, error: null } : { ...state, session: back(state.session), error: null };
    case "go-to":
      return { ...state, session: { ...state.session, steps: state.session.steps.slice(0, action.steps) }, error: null };
    case "restart":
      return { ...state, session: startSession(action.wf), error: null, status: "none", started: true };
    case "clear":
      return { ...state, session: startSession(action.wf), error: null, status: "none", started: false };
  }
}

function Steps({ title, items, testId }: { title: string; items: string[]; testId?: string }) {
  if (!items.length) return null;
  return (
    <section aria-label={title} className="rounded-xl border border-line bg-ink-900 p-4" data-testid={testId}>
      <h3 className="text-sm font-semibold text-fg">{title}</h3>
      <ul className="mt-2 space-y-1.5 text-sm leading-relaxed text-fg-muted">
        {items.map((i) => (
          <li key={i} className="flex gap-2.5">
            <span className="mt-2 size-1.5 shrink-0 rounded-full bg-signal-400" aria-hidden="true" />
            {i}
          </li>
        ))}
      </ul>
    </section>
  );
}

function ReviewFlag({ note }: { note: string }) {
  return (
    <p className="flex gap-2 rounded-lg border border-unverified/40 bg-unverified/[0.07] px-3 py-2 text-xs leading-relaxed text-fg" data-testid="review-flag">
      <Icon name="alert" className="mt-0.5 size-3.5 shrink-0 text-unverified" />
      <span>
        <span className="font-semibold text-unverified">Needs verification: </span>
        {note}
      </span>
    </p>
  );
}

function TestBox({ procedure, expected, safety, kind }: { procedure: string; expected: string; safety?: string; kind?: "resistance" | "voltage" }) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-line bg-ink-850 p-3 text-sm" data-testid="test-procedure">
      {kind && (
        <p className="font-mono text-[11px] tracking-wider text-fg-subtle uppercase" data-testid="test-kind">
          {kind === "resistance" ? "Resistance test · circuit isolated and de-energised" : "Voltage test · live, DC volts range"}
        </p>
      )}
      {safety && (
        <p className="flex gap-2 rounded-lg border border-amber-300/40 bg-amber-300/10 px-3 py-2 text-fg">
          <Icon name="alert" className="mt-0.5 size-4 shrink-0 text-amber-300" />
          <span>
            <span className="font-semibold">Safety: </span>
            {safety}
          </span>
        </p>
      )}
      <p className="text-fg-muted">
        <span className="font-medium text-fg">How to test: </span>
        {procedure}
      </p>
      <p className="text-fg-muted">
        <span className="font-medium text-fg">Healthy result: </span>
        {expected}
      </p>
    </div>
  );
}

function QuestionView({ node, onAnswer }: { node: QuestionNode; onAnswer: (id: string) => void }) {
  return (
    <div className="flex flex-col gap-3">
      {node.help && <p className="text-sm leading-relaxed text-fg-muted">{node.help}</p>}
      {node.test && <TestBox {...node.test} />}
      {node.review && <ReviewFlag note={node.review.note} />}
      <div className={node.style === "yes-no" ? "grid grid-cols-2 gap-2" : "flex flex-col gap-2"} role="group" aria-label="Answers">
        {node.answers.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => onAnswer(a.id)}
            className="min-h-12 rounded-xl border border-line-strong bg-ink-900 px-4 py-2.5 text-left text-[15px] font-medium text-fg hover:border-signal-400 hover:bg-ink-850"
          >
            {a.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function EolConfigView({ node, error, onAnswer, onCustom }: { node: EolConfigNode; error: string | null; onAnswer: (id: string) => void; onCustom: (r1: string, r2: string) => void }) {
  const [r1, setR1] = useState("");
  const [r2, setR2] = useState("");
  const v1 = parseResistor(r1);
  const v2 = parseResistor(r2);
  const preview = v1 !== null && v2 !== null ? zoneBands({ r1: v1, r2: v2 }) : null;
  return (
    <div className="flex flex-col gap-3">
      {node.help && <p className="text-sm leading-relaxed text-fg-muted">{node.help}</p>}
      <p className="rounded-lg bg-ink-850 px-3 py-2 font-mono text-xs leading-relaxed text-fg-muted" aria-label="Assumed wiring">
        Z+ ─ [ALARM NC ∥ R2] ─ R1 ─ [TAMPER NC] ─ Z−
      </p>
      <div className="flex flex-col gap-2" role="group" aria-label="Answers">
        {node.presets.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onAnswer(p.id)}
            className="min-h-12 rounded-xl border border-line-strong bg-ink-900 px-4 py-2.5 text-left text-[15px] font-medium text-fg hover:border-signal-400 hover:bg-ink-850"
          >
            {p.label}
          </button>
        ))}
      </div>
      {node.allowCustom && (
        <form
          className="flex flex-col gap-2 rounded-xl border border-line p-3"
          onSubmit={(e) => {
            e.preventDefault();
            onCustom(r1, r2);
          }}
          aria-label="Other resistor values"
        >
          <p className="text-sm font-medium text-fg">Other values</p>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ["R1 — EOL resistor (in series)", r1, setR1],
                ["R2 — alarm resistor (across the alarm contact)", r2, setR2],
              ] as const
            ).map(([label, value, set]) => (
              <label key={label} className="flex flex-col gap-1 text-xs text-fg-muted">
                {label}
                <input
                  value={value}
                  onChange={(e) => set(e.target.value)}
                  autoComplete="off"
                  placeholder="e.g. 4k7"
                  className="h-11 min-w-0 rounded-lg border border-line-strong bg-ink-850 px-3 font-mono text-base text-fg focus:border-signal-500 focus:outline-none"
                />
              </label>
            ))}
          </div>
          {preview && (
            <p className={`text-xs ${preview.ok ? "text-fg-muted" : "text-fault"}`} data-testid="eol-preview">
              {preview.ok ? `Expected readings — sealed ${fmt(preview.expected.sealed)}, alarm ${fmt(preview.expected.alarm)}, tamper open (OL).` : preview.reason}
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm text-fault">
              {error}
            </p>
          )}
          <button type="submit" className="h-11 rounded-lg bg-signal-500 px-4 text-sm font-semibold text-ink-950 hover:bg-signal-400">
            Use these values
          </button>
        </form>
      )}
      <button
        type="button"
        onClick={() => onAnswer(node.unsupported.id)}
        className="min-h-11 self-start rounded-lg px-1 text-left text-sm font-medium text-fg-muted underline-offset-2 hover:text-fg hover:underline"
      >
        {node.unsupported.label}
      </button>
    </div>
  );
}

function MeasureView({
  node,
  context,
  error,
  onValue,
  onSkip,
}: {
  node: MeasureNode;
  context: Record<string, number>;
  error: string | null;
  onValue: (v: string) => void;
  onSkip: () => void;
}) {
  const [text, setText] = useState("");
  const unit = node.unit === "ohm" ? "Ω" : "V DC";
  const bands = node.scale === "zone" && context.r1 && context.r2 ? zoneBands({ r1: context.r1, r2: context.r2 }) : null;
  return (
    <div className="flex flex-col gap-3">
      <TestBox
        procedure={fillText(node.test.procedure, context)}
        expected={fillText(node.test.expected, context)}
        safety={node.safety}
        kind={node.unit === "ohm" ? "resistance" : "voltage"}
      />
      {node.review && <ReviewFlag note={node.review.note} />}
      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          onValue(text);
        }}
      >
        <label className="flex flex-col gap-1 text-sm font-medium text-fg">
          Your reading ({unit})
          <span className="flex gap-2">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              inputMode={node.unit === "volt" ? "decimal" : "text"}
              autoComplete="off"
              placeholder={node.unit === "ohm" ? "e.g. 2.2k, 2k2, 4400 or OL" : "e.g. 13.6"}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? "measure-error" : undefined}
              className={`h-12 min-w-0 flex-1 rounded-xl border bg-ink-850 px-3 font-mono text-base text-fg focus:outline-none ${error ? "border-fault" : "border-line-strong focus:border-signal-500"}`}
            />
            {node.unit === "ohm" && (
              <button type="button" onClick={() => onValue("OL")} className="h-12 shrink-0 rounded-xl border border-line-strong px-3 font-mono text-sm text-fg hover:bg-ink-800">
                OL
              </button>
            )}
          </span>
        </label>
        {error && (
          <p id="measure-error" role="alert" className="text-sm text-fault">
            {error}
          </p>
        )}
        <button type="submit" className="h-12 rounded-xl bg-signal-500 px-4 text-sm font-semibold text-ink-950 hover:bg-signal-400">
          Use this reading
        </button>
      </form>
      <details className="rounded-xl border border-line px-3 py-2 text-sm" data-testid="bands">
        <summary className="cursor-pointer font-medium text-fg-muted">How readings are classified</summary>
        {bands?.ok ? (
          <>
            <p className="mt-2 text-fg-muted">
              Calculated from R1 {fmt(context.r1!)} and R2 {fmt(context.r2!)}: sealed {fmt(bands.expected.sealed)}, alarm {fmt(bands.expected.alarm)}. “About” means within ±10 % (resistor
              tolerance, cable and meter) — a diagnostic aid, not your panel&apos;s thresholds.
            </p>
            <ul className="mt-1 space-y-0.5 text-fg-muted">
              {bands.bands.map((b) => (
                <li key={b.band} className="flex justify-between gap-3">
                  <span>{BAND_LABELS[b.band]}</span>
                  <span className="font-mono text-xs">{b.band === "open" ? `≥ ${fmt(b.min)} or OL` : `${fmt(b.min)} – ${fmt(b.max)}`}</span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <ul className="mt-2 list-disc space-y-0.5 pl-5 text-fg-muted">
            {node.ranges.map((r) => (
              <li key={r.id}>{r.label}</li>
            ))}
          </ul>
        )}
      </details>
      {node.skip && (
        <button type="button" onClick={onSkip} className="min-h-11 self-start rounded-lg px-1 text-sm font-medium text-fg-muted underline-offset-2 hover:text-fg hover:underline">
          {node.skip.label}
        </button>
      )}
    </div>
  );
}

const CONFIDENCE = {
  likely: { label: "Likely — your measurements point here", cause: "Likely cause", others: "Other possible causes" },
  possible: { label: "Possible — consistent with your answers, not isolated by measurement", cause: "Possible causes", others: "" },
  verify: { label: "Further verification required — not enough evidence yet", cause: "Causes to consider", others: "" },
} as const;

function ResultView({ wf, node, evidence, findings }: { wf: Workflow; node: ResultNode; evidence: Record<string, number>; findings: Finding[] }) {
  const causes = rankCauses(wf, node, evidence);
  const seeAlso = node.seeAlso ? getDiagnosticWorkflow(node.seeAlso) : undefined;
  const c = CONFIDENCE[node.confidence];
  const measured = findings.filter((f) => f.kind === "measured");
  const [first, ...rest] = causes;
  const split = node.confidence === "likely" && rest.length > 0;
  return (
    <div className="flex flex-col gap-3" data-testid="diagnosis-result" data-confidence={node.confidence}>
      <div className="rounded-xl border border-signal-400/40 bg-signal-500/10 p-4">
        <p className="font-mono text-[11px] tracking-wider text-signal-300 uppercase">Suggested direction — not a confirmed diagnosis</p>
        <h2 className="mt-1 text-lg font-semibold text-fg">{node.title}</h2>
        <p className="mt-1 text-sm leading-relaxed text-fg-muted">{node.summary}</p>
        <p className="mt-2 inline-block rounded-md bg-ink-900/60 px-2 py-1 text-xs font-medium text-fg" data-testid="confidence">
          {c.label}
        </p>
      </div>
      {node.review && <ReviewFlag note={node.review.note} />}
      {measured.length > 0 && <Steps title="Confirmed by your measurements" items={measured.map((f) => f.text)} testId="measured" />}
      <section aria-label="Causes" className="rounded-xl border border-line bg-ink-900 p-4">
        <h3 className="text-sm font-semibold text-fg">{c.cause}</h3>
        <ol className="mt-2 space-y-2">
          {(split ? [first!] : causes).map((cause, i) => (
            <li key={cause.id} className="flex gap-3 text-sm" data-cause={cause.id}>
              <span className="font-mono text-signal-400">{i + 1}</span>
              <span>
                <span className="block font-medium text-fg">{cause.title}</span>
                <span className="block text-fg-muted">{cause.detail}</span>
              </span>
            </li>
          ))}
        </ol>
        {split && (
          <>
            <h3 className="mt-3 text-sm font-semibold text-fg">{c.others}</h3>
            <ol className="mt-2 space-y-2">
              {rest.map((cause, i) => (
                <li key={cause.id} className="flex gap-3 text-sm" data-cause={cause.id}>
                  <span className="font-mono text-fg-subtle">{i + 2}</span>
                  <span>
                    <span className="block font-medium text-fg">{cause.title}</span>
                    <span className="block text-fg-muted">{cause.detail}</span>
                  </span>
                </li>
              ))}
            </ol>
          </>
        )}
      </section>
      <Steps title="Verify before acting" items={node.verify} />
      <Steps title="Possible corrective actions" items={node.actions} />
      <Steps title="When to escalate" items={[...node.escalate, ...wf.escalation]} />
      <Steps title="Technical notes" items={[...node.notes, ...wf.notes]} />
      {(seeAlso || wf.related.length > 0) && (
        <nav aria-label="Related" className="flex flex-col gap-2">
          {seeAlso && (
            <Link href={`/fault-finder/diagnose/${seeAlso.id}`} className="flex min-h-11 items-center justify-between gap-2 rounded-xl border border-signal-400/50 px-4 text-sm font-semibold text-signal-300 hover:bg-signal-500/10">
              Continue with: {seeAlso.title}
              <Icon name="chevron-right" className="size-4" />
            </Link>
          )}
          {wf.related.map((r) => (
            <Link key={r.href} href={r.href} className="flex min-h-11 items-center justify-between gap-2 rounded-xl border border-line-strong px-4 text-sm font-medium text-fg hover:bg-ink-850">
              {r.label}
              <Icon name="chevron-right" className="size-4 text-fg-subtle" />
            </Link>
          ))}
        </nav>
      )}
    </div>
  );
}

const KIND_TAG = { measured: "Measured", reported: "Observed", config: "Set up", skipped: "Not measured" } as const;

/** Interactive guided diagnosis for one workflow, saved on this device as it progresses. */
export function Diagnosis({ workflowId }: { workflowId: string }) {
  const wf = getDiagnosticWorkflow(workflowId) ?? WORKFLOWS[0]!;
  const [state, dispatch] = useReducer(reducer, { session: startSession(wf), started: false, loaded: false, status: "none", error: null });
  const { session, started, loaded, status, error } = state;
  const ev = evaluate(wf, session);
  const node = ev.node;

  useEffect(() => {
    const { session: s, status: st } = loadSession(wf);
    dispatch({ type: "hydrate", session: s, status: st });
  }, [wf]);

  useEffect(() => {
    if (!loaded) return;
    if (session.steps.length > 0) saveSession(session);
    else clearSession(session.workflowId);
  }, [loaded, session]);

  const pct = Math.round(((ev.done ? ev.total : ev.step - 1) / Math.max(ev.total, 1)) * 100);
  const send = (input: AnswerInput) => dispatch({ type: "answer", input, wf });

  return (
    <div className="flex flex-col gap-4">
      {status !== "none" && (
        <p className="rounded-xl border border-line-strong bg-ink-900 px-4 py-2.5 text-sm text-fg" role="status" data-testid="load-status">
          {status === "restored" && `Resumed your saved diagnosis (${session.steps.length} answer${session.steps.length === 1 ? "" : "s"}).`}
          {status === "trimmed" && "Resumed your saved diagnosis. Some saved answers no longer match this guide and were removed."}
          {status === "outdated" && "This guide has been updated since your last visit, so the saved diagnosis was cleared."}
        </p>
      )}

      {!started ? (
        <div className="flex flex-col gap-3">
          <VerificationPanel wf={wf} />
          <Steps title="Typical symptoms" items={wf.symptoms} />
          <section aria-labelledby="before-heading" className="rounded-xl border border-amber-300/40 bg-amber-300/[0.07] p-4" data-testid="safety">
            <h2 id="before-heading" className="flex items-center gap-2 text-sm font-semibold text-amber-300">
              <Icon name="alert" className="size-4" /> Before you start
            </h2>
            <ul className="mt-2 space-y-1.5 text-sm leading-relaxed text-fg">
              {wf.safety.map((s) => (
                <li key={s} className="flex gap-2.5">
                  <span className="mt-2 size-1.5 shrink-0 rounded-full bg-amber-300" aria-hidden="true" />
                  {s}
                </li>
              ))}
            </ul>
          </section>
          <button type="button" onClick={() => dispatch({ type: "start" })} className="h-12 rounded-xl bg-signal-500 px-4 text-[15px] font-semibold text-ink-950 hover:bg-signal-400">
            I&apos;ve read the safety checks — start
          </button>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2 text-xs text-fg-muted">
              <span data-testid="progress-label">{ev.done ? "Diagnosis complete" : `Question ${ev.step} of up to ${ev.total}`}</span>
              <span className="font-mono">{pct}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-ink-800" role="progressbar" aria-label="Diagnosis progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
              <div className="h-full rounded-full bg-signal-400" style={{ width: `${pct}%` }} />
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <section aria-labelledby="current-heading" className="flex min-w-0 flex-col gap-3 rounded-2xl border border-line bg-ink-900 p-4">
              {node.kind !== "result" ? (
                <h2 id="current-heading" className="text-lg leading-snug font-semibold text-balance text-fg" data-testid="question">
                  {node.text}
                </h2>
              ) : (
                <h2 id="current-heading" className="sr-only">
                  Result
                </h2>
              )}
              {node.kind === "question" && <QuestionView node={node} onAnswer={(id) => send({ answer: id })} />}
              {node.kind === "eol-config" && (
                <EolConfigView key={node.id} node={node} error={error} onAnswer={(id) => send({ answer: id })} onCustom={(r1, r2) => send({ eol: { r1, r2 } })} />
              )}
              {node.kind === "measure" && (
                <MeasureView key={node.id} node={node} context={ev.context} error={error} onValue={(v) => send({ value: v })} onSkip={() => send({ answer: node.skip!.id })} />
              )}
              {node.kind === "result" && <ResultView wf={wf} node={node} evidence={ev.evidence} findings={ev.findings} />}
              {error && node.kind === "question" && (
                <p role="alert" className="text-sm text-fault">
                  {error}
                </p>
              )}
              <div className="flex flex-wrap gap-2 border-t border-line pt-3">
                <button type="button" onClick={() => dispatch({ type: "back" })} className="h-11 rounded-lg border border-line-strong px-4 text-sm font-medium text-fg hover:bg-ink-800">
                  Back
                </button>
                <button
                  type="button"
                  onClick={() => dispatch({ type: "restart", wf })}
                  disabled={session.steps.length === 0}
                  className="h-11 rounded-lg border border-line-strong px-4 text-sm font-medium text-fg hover:bg-ink-800 disabled:opacity-40"
                >
                  Restart diagnosis
                </button>
                <button type="button" onClick={() => dispatch({ type: "clear", wf })} className="h-11 rounded-lg px-3 text-sm font-medium text-fg-muted hover:text-fault">
                  Clear saved session
                </button>
              </div>
            </section>

            <aside aria-labelledby="findings-heading" className="flex min-w-0 flex-col gap-2 rounded-2xl border border-line bg-ink-900 p-4 lg:self-start">
              <h2 id="findings-heading" className="text-sm font-semibold text-fg">
                Findings so far
              </h2>
              {ev.findings.length === 0 ? (
                <p className="text-sm text-fg-muted">Your answers will appear here.</p>
              ) : (
                <ol className="flex flex-col gap-1.5" data-testid="findings">
                  {ev.findings.map((f, i) => (
                    <li key={`${f.node}-${i}`} className="flex items-start gap-2 text-sm" data-finding-kind={f.kind}>
                      <span className="mt-0.5 font-mono text-xs text-fg-subtle">{i + 1}</span>
                      <span className="min-w-0 flex-1 text-fg">
                        <span className={`mr-1.5 rounded px-1 py-px font-mono text-[10px] uppercase ${f.kind === "measured" ? "bg-signal-500/15 text-signal-300" : "bg-ink-800 text-fg-subtle"}`}>
                          {KIND_TAG[f.kind]}
                        </span>
                        {f.text}
                      </span>
                      <button
                        type="button"
                        onClick={() => dispatch({ type: "go-to", steps: i })}
                        aria-label={`Change answer ${i + 1}: ${f.question}`}
                        className="h-8 shrink-0 rounded-md px-2 text-xs font-medium text-signal-400 hover:bg-ink-850"
                      >
                        Change
                      </button>
                    </li>
                  ))}
                </ol>
              )}
              {!ev.done && node.kind !== "result" && (
                <p className="mt-1 border-t border-line pt-2 text-xs text-fg-subtle" data-testid="next-action">
                  Next:{" "}
                  {node.kind === "measure"
                    ? "take the measurement described, then enter your reading."
                    : node.kind === "eol-config"
                      ? "choose the zone's EOL resistors so readings can be judged."
                      : "answer the question to narrow down the cause."}
                </p>
              )}
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
