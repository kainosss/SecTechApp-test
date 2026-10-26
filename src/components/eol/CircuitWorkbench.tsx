"use client";

import { useSyncExternalStore } from "react";
import type { DiagramBanner } from "@/lib/eol/classification";
import { formatOhms, stateResistance, type ContactPositions } from "@/lib/eol/engine";
import { explainCircuit } from "@/lib/eol/explain";
import type { Circuit, CircuitState } from "@/lib/eol/model";
import type { StateEvaluation } from "@/lib/eol/validate";
import { DiagramViewer } from "./DiagramViewer";
import { circuitTone } from "./CircuitDiagram";

const TONE_TEXT = { sealed: "text-signal-300", alarm: "text-amber-300", fault: "text-fault" } as const;
const TONE_DOT = { sealed: "bg-signal-400", alarm: "bg-amber-300", fault: "bg-fault" } as const;
const TONE_LABEL = { sealed: "Sealed", alarm: "Alarm", fault: "Tamper / fault" } as const;
const TONE_COLOR = { sealed: "rgb(63 217 194 / 0.55)", alarm: "rgb(251 191 36 / 0.55)", fault: "rgb(248 113 113 / 0.55)" } as const;

/* "Explain" preference, remembered per device so technicians can keep it hidden on site. */
const LEARN_KEY = "fieldwise:eol-explain";
const LEARN_EVENT = "fieldwise:eol-explain";
function subscribeLearn(cb: () => void) {
  window.addEventListener(LEARN_EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(LEARN_EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}
function readLearn(): boolean {
  try {
    return window.localStorage.getItem(LEARN_KEY) !== "hidden";
  } catch {
    return true;
  }
}
function writeLearn(show: boolean) {
  try {
    window.localStorage.setItem(LEARN_KEY, show ? "shown" : "hidden");
  } catch {
    // Preference just won't persist.
  }
  window.dispatchEvent(new Event(LEARN_EVENT));
}

const ANIM_KEY = "fieldwise:eol-current";
/** On by default; only an explicit "off" disables it. */
function readAnim(): boolean {
  try {
    return window.localStorage.getItem(ANIM_KEY) !== "off";
  } catch {
    return true;
  }
}
function writeAnim(on: boolean) {
  try {
    window.localStorage.setItem(ANIM_KEY, on ? "on" : "off");
  } catch {
    // ignore
  }
  window.dispatchEvent(new Event(LEARN_EVENT));
}

export interface CircuitWorkbenchProps {
  circuit: Circuit;
  /** Defined states with readings calculated for this circuit. */
  evaluations: StateEvaluation[];
  positions: ContactPositions;
  normalPositions: ContactPositions;
  line: CircuitState["line"];
  matchedStateId: string | null;
  banner: DiagramBanner;
  panelLabel?: string;
  title: string;
  onSelectState: (stateId: string) => void;
  onToggleContact: (id: string) => void;
  onSetLine: (line: CircuitState["line"]) => void;
  onSelectResistor?: (id: string) => void;
  selectedResistor?: string;
  /** Generic circuits may show the illustrative current animation. */
  allowCurrentAnimation?: boolean;
  /** One-line interpretation of the current reading (generated, never asserting a real panel's behaviour). */
  interpretation: (ohms: number) => string;
  /** Extra content under the explanation (e.g. resistor editor). */
  children?: React.ReactNode;
  /** Classification chip shown with the reading. */
  badge?: React.ReactNode;
}

/**
 * Interactive circuit: state readings, live reading, tappable diagram, cable
 * fault toggles and generated explanations — all from one circuit and the engine.
 */
export function CircuitWorkbench(props: CircuitWorkbenchProps) {
  const { circuit, evaluations, positions, normalPositions, line, matchedStateId } = props;
  const showExplain = useSyncExternalStore(subscribeLearn, readLearn, () => true);
  const animate = useSyncExternalStore(subscribeLearn, readAnim, () => true) && Boolean(props.allowCurrentAnimation);

  const ohms = stateResistance(circuit, { id: "current", kind: "other", line, contacts: positions });
  const tone = circuitTone(circuit, positions, normalPositions, line);
  const explanation = explainCircuit(circuit, positions, normalPositions, line);
  const matched = evaluations.find((s) => s.id === matchedStateId);
  const label = matched?.label ?? "Custom contact positions";
  const { a, b } = circuit.terminals;

  return (
    <div className="flex flex-col gap-3">
      {/* Readings for every defined state — also the state selector. */}
      <div role="radiogroup" aria-label="Circuit state" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
        {evaluations.map((s) => {
          const selected = s.id === matchedStateId;
          return (
            <button
              key={s.id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => props.onSelectState(s.id)}
              className={`flex min-h-14 shrink-0 flex-col items-start justify-center rounded-xl border px-3 py-1.5 text-left ${
                selected ? "border-signal-400 bg-signal-500/15" : "border-line-strong bg-ink-900 hover:bg-ink-850"
              }`}
            >
              <span className={`text-xs font-medium ${selected ? "text-signal-300" : "text-fg-muted"}`}>{s.label}</span>
              <span className="font-mono text-sm whitespace-nowrap text-fg">{s.ohms === null ? "—" : formatOhms(s.ohms)}</span>
            </button>
          );
        })}
      </div>

      {/* Re-keyed on every change so the brief flash replays (disabled for reduced motion in CSS). */}
      <div
        key={`${tone}:${ohms}:${line}`}
        className="fw-pulse flex items-center justify-between gap-3 rounded-2xl border border-line bg-ink-900 px-4 py-2"
        style={{ "--fw-pulse-color": TONE_COLOR[tone] } as React.CSSProperties}
      >
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-xs text-fg-muted">
            <span className={`size-2 shrink-0 rounded-full ${TONE_DOT[tone]}`} aria-hidden="true" />
            <span className={`font-semibold ${TONE_TEXT[tone]}`}>{TONE_LABEL[tone]}</span>
            <span className="truncate">· {label}</span>
          </p>
          <p className="truncate text-[11px] text-fg-subtle">
            Total across {a.label} – {b.label} (calculated)
          </p>
          {props.badge && <div className="mt-1">{props.badge}</div>}
        </div>
        <p className="shrink-0 font-mono text-2xl font-medium text-fg sm:text-3xl" aria-live="polite" data-testid="reading">
          {formatOhms(ohms)}
        </p>
      </div>

      <DiagramViewer
        circuit={circuit}
        positions={positions}
        normalPositions={normalPositions}
        line={line}
        banner={props.banner}
        panelLabel={props.panelLabel}
        title={props.title}
        stateLabel={label}
        onToggleContact={props.onToggleContact}
        onSelectResistor={props.onSelectResistor}
        selectedResistor={props.selectedResistor}
        animateCurrent={animate}
      />

      {props.allowCurrentAnimation && animate && (
        <p className="-mt-1 text-[11px] text-fg-subtle" data-testid="animation-note">
          Moving dots: illustrative conventional-current path, not a measurement of panel current.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-fg-subtle">Tap a contact to open or close it.</span>
        <span className="flex-1" />
        {props.allowCurrentAnimation && (
          <button
            type="button"
            aria-pressed={animate}
            onClick={() => writeAnim(!animate)}
            className={`h-10 rounded-lg border px-3 text-sm font-medium ${
              animate ? "border-signal-400/60 bg-signal-500/15 text-signal-300" : "border-line-strong text-fg-muted hover:text-fg"
            }`}
          >
            Flow animation
          </button>
        )}
        {(["open", "short"] as const).map((fault) => (
          <button
            key={fault}
            type="button"
            aria-pressed={line === fault}
            onClick={() => props.onSetLine(line === fault ? "intact" : fault)}
            className={`h-10 rounded-lg border px-3 text-sm font-medium ${
              line === fault ? "border-fault/60 bg-fault/15 text-fault" : "border-line-strong text-fg-muted hover:text-fg"
            }`}
          >
            {fault === "open" ? "Cut cable" : "Short cable"}
          </button>
        ))}
      </div>

      <section aria-label="What's happening" className="rounded-2xl border border-line bg-ink-900">
        <div className="flex min-h-11 items-center justify-between gap-2 border-b border-line px-4">
          <h3 className="text-sm font-semibold text-fg">What&apos;s happening</h3>
          <button type="button" aria-expanded={showExplain} onClick={() => writeLearn(!showExplain)} className="h-9 px-1 text-sm font-medium text-signal-400 hover:text-signal-300">
            {showExplain ? "Hide" : "Explain"}
          </button>
        </div>
        {showExplain && (
          <div className="flex flex-col gap-2 px-4 py-3 text-sm leading-relaxed" data-testid="explanation">
            <p className="font-semibold text-fg">{explanation.headline}</p>
            <ul className="list-disc space-y-1 pl-5 text-fg-muted">
              {explanation.changes.map((c) => (
                <li key={c}>{c}</li>
              ))}
              <li>{explanation.path}</li>
              {explanation.bypassed.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
            {explanation.equation && <p className="rounded-lg bg-ink-850 px-3 py-2 font-mono text-[13px] text-fg">{explanation.equation}</p>}
            {explanation.individualVsTotal && <p className="text-fg-muted">{explanation.individualVsTotal}</p>}
            <p className="text-fg-muted">{props.interpretation(ohms)}</p>
            <p className="text-xs text-fg-subtle">
              Highlighted wires show where a resistance measurement&apos;s small test current flows between {a.label} and {b.label}. Dashed grey wires carry none
              (interrupted or bypassed).
            </p>
          </div>
        )}
        {props.allowCurrentAnimation && animate && (
          <p className="border-t border-line px-4 py-3 text-xs leading-relaxed text-fg-subtle">
            About the moving dots: they mark the connected path the engine calculates, moving {a.label} → {b.label} in the conventional-current direction.
            They are a concept illustration, not a measurement — no panel supply voltage is modelled, and the dots move at the same speed everywhere, including
            through resistors, so their speed means nothing about current size.
          </p>
        )}
        {props.children}
      </section>
    </div>
  );
}
