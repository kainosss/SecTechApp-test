"use client";

import Link from "next/link";
import { useEffect, useReducer, useState } from "react";
import { answer, back, evaluate, rankCauses, startSession, type AnswerInput, type Session } from "@/lib/fault-finder/engine";
import type { MeasureNode, QuestionNode, ResultNode, Workflow } from "@/lib/fault-finder/schema";
import { clearSession, loadSession, saveSession, type LoadStatus } from "@/lib/fault-finder/sessions";
import { getDiagnosticWorkflow, WORKFLOWS } from "@/lib/fault-finder/workflows";
import { Icon } from "@/components/ui/Icon";

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

function TestBox({ procedure, expected, safety }: { procedure: string; expected: string; safety?: string }) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-line bg-ink-850 p-3 text-sm" data-testid="test-procedure">
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

function MeasureView({ node, error, onValue, onSkip }: { node: MeasureNode; error: string | null; onValue: (v: string) => void; onSkip: () => void }) {
  const [text, setText] = useState("");
  const unit = node.unit === "ohm" ? "Ω" : "V DC";
  return (
    <div className="flex flex-col gap-3">
      <TestBox {...node.test} safety={node.safety} />
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
      <details className="rounded-xl border border-line px-3 py-2 text-sm">
        <summary className="cursor-pointer font-medium text-fg-muted">How readings are classified</summary>
        <p className="mt-2 text-fg-muted">The guide sorts your reading into one of these bands{node.relativeTo === "seal" ? ", scaled to the zone's EOL values" : node.relativeTo === "rated" ? ", scaled to the lock's rated voltage" : ""}:</p>
        <ul className="mt-1 list-disc space-y-0.5 pl-5 text-fg-muted">
          {node.ranges.map((r) => (
            <li key={r.id}>{r.label}</li>
          ))}
        </ul>
      </details>
      {node.skip && (
        <button type="button" onClick={onSkip} className="h-11 self-start rounded-lg px-1 text-sm font-medium text-fg-muted underline-offset-2 hover:text-fg hover:underline">
          {node.skip.label}
        </button>
      )}
    </div>
  );
}

function ResultView({ wf, node, evidence }: { wf: Workflow; node: ResultNode; evidence: Record<string, number> }) {
  const causes = rankCauses(wf, node, evidence);
  const seeAlso = node.seeAlso ? getDiagnosticWorkflow(node.seeAlso) : undefined;
  return (
    <div className="flex flex-col gap-3" data-testid="diagnosis-result">
      <div className="rounded-xl border border-signal-400/40 bg-signal-500/10 p-4">
        <p className="font-mono text-[11px] tracking-wider text-signal-300 uppercase">Suggested direction — not a confirmed diagnosis</p>
        <h2 className="mt-1 text-lg font-semibold text-fg">{node.title}</h2>
        <p className="mt-1 text-sm leading-relaxed text-fg-muted">{node.summary}</p>
      </div>
      <section aria-label="Most likely causes" className="rounded-xl border border-line bg-ink-900 p-4">
        <h3 className="text-sm font-semibold text-fg">{causes.length > 1 ? "Most likely causes, based on your answers" : "Likely cause, based on your answers"}</h3>
        <ol className="mt-2 space-y-2">
          {causes.map((c, i) => (
            <li key={c.id} className="flex gap-3 text-sm" data-cause={c.id}>
              <span className="font-mono text-signal-400">{i + 1}</span>
              <span>
                <span className="block font-medium text-fg">{c.title}</span>
                <span className="block text-fg-muted">{c.detail}</span>
              </span>
            </li>
          ))}
        </ol>
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
              {node.kind !== "result" && (
                <h2 id="current-heading" className="text-lg leading-snug font-semibold text-balance text-fg" data-testid="question">
                  {node.text}
                </h2>
              )}
              {node.kind === "result" && (
                <h2 id="current-heading" className="sr-only">
                  Result
                </h2>
              )}
              {node.kind === "question" && <QuestionView node={node} onAnswer={(id) => dispatch({ type: "answer", input: { answer: id }, wf })} />}
              {node.kind === "measure" && (
                <MeasureView
                  key={node.id}
                  node={node}
                  error={error}
                  onValue={(v) => dispatch({ type: "answer", input: { value: v }, wf })}
                  onSkip={() => dispatch({ type: "answer", input: { answer: node.skip!.id }, wf })}
                />
              )}
              {node.kind === "result" && <ResultView wf={wf} node={node} evidence={ev.evidence} />}
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
                    <li key={`${f.node}-${i}`} className="flex items-start gap-2 text-sm">
                      <span className="mt-0.5 font-mono text-xs text-fg-subtle">{i + 1}</span>
                      <span className="min-w-0 flex-1 text-fg">{f.text}</span>
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
                  Next: {node.kind === "measure" ? "take the measurement described, then enter your reading." : "answer the question to narrow down the cause."}
                </p>
              )}
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
