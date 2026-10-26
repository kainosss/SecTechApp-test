"use client";

import { POINTS_BY_ID, type ContactState, type PointId } from "@/lib/lab/bench";
import { contactsFor, DETECTOR_STATES, stateFor, type MeterReading, type Probes } from "@/lib/lab/meter";
import { Icon } from "@/components/ui/Icon";

export type ProbeColor = "red" | "black";

export function pointShortName(id: PointId): string {
  const p = POINTS_BY_ID[id];
  if (p.group === "detector-alarm") return `ALARM ${p.label}`;
  if (p.group === "detector-tamper") return `TAMPER ${p.label}`;
  if (p.group === "panel-zone") return p.id === "panel-z" ? "Z1" : "panel COM";
  return p.label;
}

const PROBE_STYLE: Record<ProbeColor, { name: string; jack: string; dot: string; mark: string }> = {
  red: { name: "Red probe", jack: "V Ω", dot: "bg-[#ef4444] ring-[#fecaca]", mark: "+" },
  black: { name: "Black probe", jack: "COM", dot: "bg-[#111827] ring-[#e5e7eb]", mark: "−" },
};

export interface MultimeterProps {
  reading: MeterReading;
  probes: Probes;
  /** Probe currently being placed, if any. */
  activeProbe: ProbeColor | null;
  /** Detector contact positions (also switchable by tapping the contacts on the bench). */
  contacts: ContactState;
  onContacts: (c: ContactState) => void;
  onArmProbe: (c: ProbeColor) => void;
  onRemoveProbe: (c: ProbeColor) => void;
}

/** Digital multimeter on the resistance range. Readings come from the circuit graph (see lib/lab/meter). */
export function Multimeter(props: MultimeterProps) {
  const { reading, probes, activeProbe, contacts } = props;
  const state = stateFor(contacts);
  const stateText = state ? DETECTOR_STATES.find((s) => s.kind === state)!.short : "Alarm + tamper";
  const ok = reading.status === "ok";
  const spoken = ok ? `Meter reads ${reading.value === "OL" ? "OL, open circuit" : `${reading.value} ${reading.unit}`}` : reading.message;

  return (
    <section aria-label="Multimeter" className="rounded-xl border border-line-strong bg-ink-850 p-2.5" data-testid="multimeter">
      <div className="flex items-stretch gap-2.5">
        {/* LCD */}
        <div className="flex min-w-0 flex-1 flex-col justify-center rounded-lg bg-[#b9c7a5] px-3 py-1.5 text-[#14200f] shadow-inner">
          <div className="flex items-center justify-between font-mono text-[10px] font-semibold tracking-wider uppercase opacity-70">
            <span>Ω · auto</span>
            <span>{stateText}</span>
          </div>
          <p className="flex items-baseline justify-end gap-1.5 font-mono leading-none" data-testid="meter-display">
            <span className="text-[32px] font-semibold tracking-tight tabular-nums">{ok ? reading.value : "- - - -"}</span>
            <span className="w-7 text-base font-semibold">{ok ? reading.unit : ""}</span>
          </p>
        </div>
        {/* Probe jacks: tap to place / move that probe. */}
        <div className="flex w-[42%] max-w-44 shrink-0 flex-col gap-1.5">
          {(["red", "black"] as const).map((c) => {
            const at = probes[c];
            const s = PROBE_STYLE[c];
            return (
              <div key={c} className="flex items-center gap-1">
                <button
                  type="button"
                  aria-pressed={activeProbe === c}
                  onClick={() => props.onArmProbe(c)}
                  aria-label={`${s.name} (${s.jack})${at ? ` on ${pointShortName(at)}` : ", not placed"}. ${activeProbe === c ? "Placing: tap a terminal." : "Tap to place or move."}`}
                  className={`flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-lg border px-2 text-left text-xs ${
                    activeProbe === c ? "border-signal-400 bg-signal-500/15" : "border-line-strong hover:bg-ink-800"
                  }`}
                  data-probe-button={c}
                >
                  <span className={`grid size-5 shrink-0 place-items-center rounded-full text-[11px] font-bold text-white ring-1 ${s.dot}`} aria-hidden="true">
                    {s.mark}
                  </span>
                  <span className="min-w-0">
                    <span className="block font-semibold text-fg">{s.jack}</span>
                    <span className="block truncate text-fg-muted">{at ? pointShortName(at) : activeProbe === c ? "tap terminal" : "not placed"}</span>
                  </span>
                </button>
                {at && (
                  <button
                    type="button"
                    onClick={() => props.onRemoveProbe(c)}
                    aria-label={`Remove ${s.name.toLowerCase()}`}
                    className="grid size-9 shrink-0 place-items-center rounded-lg text-fg-muted hover:text-fault"
                  >
                    <Icon name="close" className="size-4" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <p className="sr-only" aria-live="polite">
        {spoken}
      </p>
      {!ok && (
        <p className={`mt-2 text-xs leading-relaxed ${reading.status === "idle" ? "text-fg-muted" : "text-fault"}`} data-testid="meter-message">
          {reading.status === "blocked" && <span className="font-semibold">⚠ Not measured. </span>}
          {reading.message}
        </p>
      )}

      <div role="radiogroup" aria-label="Detector state" className="mt-2 grid grid-cols-3 gap-1">
        {DETECTOR_STATES.map((s) => (
          <button
            key={s.kind}
            type="button"
            role="radio"
            aria-checked={state === s.kind}
            aria-label={s.label}
            onClick={() => props.onContacts(contactsFor(s.kind))}
            className={`h-10 rounded-lg border text-xs font-medium ${state === s.kind ? "border-signal-400 bg-signal-500/15 text-signal-300" : "border-line text-fg-muted hover:text-fg"}`}
          >
            {s.short}
          </button>
        ))}
      </div>
      {!state && (
        <p className="mt-1.5 text-xs text-amber-300" data-testid="custom-contacts">
          Alarm and tamper contacts are both open.
        </p>
      )}
      <p className="mt-1.5 text-[11px] leading-snug text-fg-subtle">
        Tap the ALARM or TAMPER contact on the bench to open or close it. 
        Simulated with power isolated and the zone disconnected from the panel. On site, always isolate before measuring resistance.
      </p>
    </section>
  );
}
