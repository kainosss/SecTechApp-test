"use client";

import { useMemo, useState } from "react";
import type { EolPreset } from "@/lib/content/schema";
import type { WiringDetail } from "@/lib/content/repository";
import { bannerFor } from "@/lib/eol/classification";
import { circuitComponents, formatOhms, resistorCode } from "@/lib/eol/engine";
import { interpretAgainstExample } from "@/lib/eol/explain";
import { CUSTOM_PRESET, buildExplorerCircuit, explorerToSearch, paramsForState, parseExplorer, type ExplorerParams } from "@/lib/eol/explorer";
import { RESISTOR_ROLE_LABELS, type ResistorNode } from "@/lib/eol/model";
import { COMMON_EOL_VALUES, isStandardValue, parseResistance, realise } from "@/lib/eol/standard-values";
import { useUrlSearch } from "@/lib/eol/use-url-selection";
import { Icon } from "@/components/ui/Icon";
import { ClassificationBadge } from "./ClassificationBadge";
import { CircuitWorkbench } from "./CircuitWorkbench";

function Chips<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string; accent?: boolean }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={`h-10 shrink-0 rounded-full border px-4 text-sm font-medium whitespace-nowrap ${
            o.value === value ? "border-signal-400 bg-signal-500 text-ink-950" : "border-line-strong text-fg-muted hover:text-fg"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function describeRealisation(ohms: number): string | null {
  if (isStandardValue(ohms)) return null;
  const r = realise(ohms);
  if (!r.exact) return `${resistorCode(ohms)} is not a standard E24 value, and no pair of standard values makes it exactly. Nearest standard value: ${resistorCode(r.parts[0]!)}.`;
  return `${resistorCode(ohms)} is not a single standard value, but ${r.parts.map(resistorCode).join(r.arrangement === "series" ? " + " : " ∥ ")} in ${r.arrangement} makes it exactly.`;
}

function TargetInput({ label, value, onCommit }: { label: string; value?: number; onCommit: (ohms: number | undefined) => void }) {
  const [text, setText] = useState(value ? resistorCode(value) : "");
  const parsed = text.trim() === "" ? undefined : parseResistance(text);
  const invalid = text.trim() !== "" && parsed === null;
  return (
    <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-fg-muted">
      {label}
      <input
        value={text}
        inputMode="decimal"
        autoComplete="off"
        placeholder="e.g. 2k2"
        aria-invalid={invalid}
        onChange={(e) => {
          setText(e.target.value);
          const v = e.target.value.trim() === "" ? undefined : parseResistance(e.target.value);
          if (v !== null) onCommit(v);
        }}
        className={`h-11 rounded-lg border bg-ink-850 px-3 font-mono text-base text-fg focus:outline-none ${invalid ? "border-fault" : "border-line-strong focus:border-signal-500"}`}
      />
      {invalid && <span className="text-fault">Enter a value like 2k2, 4.7k or 10000 (10 Ω – 10 MΩ).</span>}
    </label>
  );
}

function ResistorEditor({ resistor, base, onApply, onClose }: { resistor: ResistorNode; base?: number; onApply: (ohms: number) => void; onClose: () => void }) {
  const [text, setText] = useState("");
  const parsed = text.trim() ? parseResistance(text) : undefined;
  const invalid = text.trim() !== "" && parsed === null;
  return (
    <div className="border-t border-line bg-ink-850 px-4 py-3" aria-label={`Change ${resistor.id}`} role="group">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-fg">
          {resistor.id} · {resistor.ohms === null ? "—" : resistorCode(resistor.ohms)} <span className="font-normal text-fg-muted">({RESISTOR_ROLE_LABELS[resistor.role]})</span>
        </p>
        <button type="button" onClick={onClose} className="h-9 px-1 text-sm font-medium text-fg-muted hover:text-fg">
          Done
        </button>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {COMMON_EOL_VALUES.map((v) => (
          <button
            key={v}
            type="button"
            aria-pressed={resistor.ohms === v}
            onClick={() => onApply(v)}
            className={`h-9 rounded-lg border px-2.5 font-mono text-sm ${resistor.ohms === v ? "border-signal-400 bg-signal-500/20 text-signal-300" : "border-line-strong text-fg"}`}
          >
            {resistorCode(v)}
          </button>
        ))}
      </div>
      <form
        className="mt-2 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (parsed) {
            onApply(parsed);
            setText("");
          }
        }}
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          inputMode="decimal"
          placeholder="Custom: 4k7, 3.9k, 1500 Ω"
          aria-label={`Custom value for ${resistor.id}`}
          aria-invalid={invalid}
          className={`h-11 min-w-0 flex-1 rounded-lg border bg-ink-900 px-3 font-mono text-base text-fg focus:outline-none ${invalid ? "border-fault" : "border-line-strong focus:border-signal-500"}`}
        />
        <button type="submit" disabled={!parsed} className="h-11 rounded-lg bg-signal-500 px-4 text-sm font-semibold text-ink-950 disabled:opacity-40">
          Set
        </button>
      </form>
      {invalid && <p className="mt-1 text-xs text-fault">Not a valid resistance. Use Ω or k (e.g. 4k7, 4.7k, 4700). Range 10 Ω – 10 MΩ.</p>}
      {base !== undefined && resistor.ohms !== base && <p className="mt-1 text-xs text-amber-300">Changed from {resistorCode(base)} in the selected example.</p>}
    </div>
  );
}

export function CircuitExplorer({ templates, presets }: { templates: WiringDetail[]; presets: EolPreset[] }) {
  const { search, setSearch } = useUrlSearch();
  const params = useMemo(() => parseExplorer(search), [search]);
  const model = useMemo(() => buildExplorerCircuit(templates, presets, params), [templates, presets, params]);
  const [selectedResistor, setSelectedResistor] = useState<string | undefined>();

  const go = (next: ExplorerParams, mode: "push" | "replace") => setSearch(explorerToSearch(next), mode);
  const current: ExplorerParams = { ...params, t: model.template.id, p: model.isCustomPreset ? CUSTOM_PRESET : model.preset?.id };

  const resistors = circuitComponents(model.circuit.network).filter((c): c is ResistorNode => c.kind === "resistor");
  const selected = resistors.find((r) => r.id === selectedResistor);
  const example = model.targets
    ? { normal: model.targets.normal!, alarm: model.targets.alarm, label: model.isCustomPreset ? "custom targets" : (model.preset?.shortLabel ?? "example") }
    : undefined;

  return (
    <div className="flex flex-col gap-3">
      <Chips
        label="Resistor values"
        value={(model.isCustomPreset ? CUSTOM_PRESET : model.preset?.id) ?? CUSTOM_PRESET}
        options={[...presets.map((p) => ({ value: p.id, label: p.shortLabel })), { value: CUSTOM_PRESET, label: "Custom" }]}
        onChange={(p) => go({ t: current.t, p, ...(p === CUSTOM_PRESET ? { seal: model.targets?.normal, alarm: model.targets?.alarm } : {}) }, "push")}
      />
      {model.isCustomPreset && (
        <div className="flex gap-2" key={model.template.id}>
          <TargetInput label="Sealed reading" value={params.seal} onCommit={(v) => go({ ...current, seal: v, r: undefined }, "replace")} />
          <TargetInput label="Alarm reading" value={params.alarm} onCommit={(v) => go({ ...current, alarm: v, r: undefined }, "replace")} />
          {model.template.inputType === "triple-eol" && (
            <TargetInput label="Tamper reading" value={params.tamper} onCommit={(v) => go({ ...current, tamper: v, r: undefined }, "replace")} />
          )}
        </div>
      )}

      <Chips
        label="Circuit arrangement"
        value={model.template.id}
        // Hidden arrangements stay reachable by link; they only get a chip while selected.
        options={templates.filter((t) => !t.explorerHidden || t.id === model.template.id).map((t) => ({ value: t.id, label: t.shortLabel }))}
        onChange={(t) => go({ t, p: current.p, seal: params.seal, alarm: params.alarm, tamper: params.tamper }, "push")}
      />

      {model.solveError && (
        <p role="status" className="rounded-xl border border-amber-300/30 bg-amber-300/5 px-3 py-2 text-sm text-fg">
          <span className="font-semibold text-amber-300">Can&apos;t size this arrangement for these values.</span> {model.solveError} Showing the
          arrangement&apos;s own example values instead.
        </p>
      )}
      {model.solveNotes.map((n) => (
        <p key={n} className="text-xs text-fg-subtle">
          {n}
        </p>
      ))}

      <CircuitWorkbench
        circuit={model.circuit}
        evaluations={model.analysis.states}
        positions={model.positions}
        normalPositions={model.normalPositions}
        line={model.line}
        matchedStateId={model.matchedStateId}
        banner={bannerFor(model.classification)}
        title={`${model.template.shortLabel} — ${resistors.map((r) => `${r.id} ${r.ohms === null ? "?" : resistorCode(r.ohms)}`).join(", ")}`}
        onSelectState={(id) => go(paramsForState(current, model.states.find((s) => s.id === id)!, model.normalPositions), "replace")}
        onToggleContact={(id) => go({ ...current, line: undefined, c: { ...model.positions, [id]: model.positions[id] === "open" ? "closed" : "open" } }, "replace")}
        onSetLine={(line) => go({ ...current, line: line === "intact" ? undefined : line }, "replace")}
        onSelectResistor={(id) => setSelectedResistor((cur) => (cur === id ? undefined : id))}
        selectedResistor={selectedResistor}
        allowCurrentAnimation
        badge={<ClassificationBadge value={model.classification} />}
        interpretation={(ohms) => interpretAgainstExample(ohms, example)}
      />

      <div className="flex flex-col gap-1">
        <p className="text-sm text-fg">{model.template.title}</p>
        <p className="text-xs leading-relaxed text-fg-subtle">
        {model.isCustomPreset
          ? "Enter the readings you want; Fieldwise sizes the resistors for the selected arrangement."
          : model.preset
            ? `${model.preset.label}. ${model.preset.note}`
            : null}
        </p>
      </div>

      <section aria-label="Resistors" className="rounded-2xl border border-line bg-ink-900">
        <div className="flex min-h-11 items-center justify-between gap-2 border-b border-line px-4">
          <h3 className="text-sm font-semibold text-fg">Resistors · tap to change</h3>
          {model.modified && (
            <button type="button" onClick={() => go({ ...current, r: undefined }, "replace")} className="h-9 px-1 text-sm font-medium text-signal-400 hover:text-signal-300">
              Reset
            </button>
          )}
        </div>
        {model.modified && (
          <p className="border-b border-line bg-amber-300/5 px-4 py-2 text-xs text-amber-300">
            Modified from {model.preset ? `the ${model.preset.shortLabel}` : "your custom targets"} — now a custom circuit. Panel compatibility not confirmed.
          </p>
        )}
        {resistors.length === 0 ? (
          <p className="px-4 py-3 text-sm text-fg-muted">No resistors: the panel only sees closed (0 Ω) or open.</p>
        ) : (
          <ul className="divide-y divide-line">
            {resistors.map((r) => {
              const note = r.ohms === null ? null : describeRealisation(r.ohms);
              return (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedResistor((cur) => (cur === r.id ? undefined : r.id))}
                    aria-expanded={selectedResistor === r.id}
                    className="flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-ink-850"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-baseline gap-x-2">
                        <span className="font-mono text-[15px] text-signal-300">
                          {r.id} · {r.ohms === null ? "—" : `${resistorCode(r.ohms)} (${formatOhms(r.ohms)})`}
                        </span>
                        <span className="text-sm text-fg">{RESISTOR_ROLE_LABELS[r.role]}</span>
                        {model.edits[r.id] !== undefined && <span className="text-xs font-semibold text-amber-300">edited</span>}
                      </span>
                      {r.purpose && <span className="mt-0.5 block text-sm leading-relaxed text-fg-muted">{r.purpose}</span>}
                      {note && <span className="mt-0.5 block text-xs text-fg-subtle">{note}</span>}
                    </span>
                    <Icon name="chevron-right" className={`size-4 shrink-0 text-fg-subtle transition-transform ${selectedResistor === r.id ? "rotate-90" : ""}`} />
                  </button>
                  {selected?.id === r.id && (
                    <ResistorEditor
                      resistor={r}
                      base={model.baseValues[r.id]}
                      onApply={(ohms) => go({ ...current, r: { ...(params.r ?? {}), [r.id]: ohms } }, "replace")}
                      onClose={() => setSelectedResistor(undefined)}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <p className="text-xs leading-relaxed text-fg-subtle">
        <span className="font-semibold text-fg-muted">Electrically validated</span> means the circuit structure and every calculated reading are correct. It does
        not confirm that any alarm panel supports this arrangement or these values — use the panel&apos;s documentation.
      </p>
    </div>
  );
}
