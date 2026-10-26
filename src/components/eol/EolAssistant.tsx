"use client";

import Link from "next/link";
import type { EolPanelOption, WiringDetail, WiringSummary } from "@/lib/content/repository";
import { WIRING_INPUT_LABELS } from "@/lib/content/schema";
import { GENERIC_PANEL, arrangementOptions, configsForPanel, configurationOptions, resolveSelection } from "@/lib/eol/assistant";
import { useUrlSelection } from "@/lib/eol/use-url-selection";
import { Icon } from "@/components/ui/Icon";
import { VerificationBadge } from "@/components/ui/VerificationBadge";
import { ConfigurationView } from "./ConfigurationView";

function Step({
  n,
  title,
  value,
  onChange,
  children,
}: {
  n: number;
  title: string;
  value?: React.ReactNode;
  onChange?: () => void;
  children?: React.ReactNode;
}) {
  return (
    <section aria-label={`Step ${n}: ${title}`} className="rounded-2xl border border-line bg-ink-900">
      <div className="flex min-h-12 items-center gap-3 px-4 py-2">
        <span
          className={`grid size-6 shrink-0 place-items-center rounded-full font-mono text-xs ${value ? "bg-signal-500 text-ink-950" : "border border-line-strong text-fg-muted"}`}
        >
          {n}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-xs text-fg-subtle">{title}</span>
          {value && <span className="block truncate text-[15px] font-medium text-fg">{value}</span>}
        </span>
        {value && onChange && (
          <button type="button" onClick={onChange} className="h-9 shrink-0 rounded-lg px-2 text-sm font-medium text-signal-400 hover:text-signal-300">
            Change
          </button>
        )}
      </div>
      {children && <div className="border-t border-line">{children}</div>}
    </section>
  );
}

function OptionButton({ onClick, children, label }: { onClick: () => void; children: React.ReactNode; label: string }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} className="flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-ink-850 active:bg-ink-800">
      <span className="min-w-0 flex-1">{children}</span>
      <Icon name="chevron-right" className="size-4 shrink-0 text-fg-subtle" />
    </button>
  );
}

function InputTypeTag({ type }: { type: WiringSummary["inputType"] }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ${
        type === "double-eol" ? "bg-signal-500/20 text-signal-300" : "border border-line-strong text-fg-muted"
      }`}
    >
      {WIRING_INPUT_LABELS[type]}
    </span>
  );
}

export function EolAssistant({
  panels,
  configs,
  details,
}: {
  panels: EolPanelOption[];
  configs: WiringSummary[];
  details: Record<string, WiringDetail>;
}) {
  const { selection, update } = useUrlSelection();
  const { panel, arrangement, config } = resolveSelection(selection, panels, configs);
  const genericAvailable = configs.some((c) => c.generic);

  const realPanel = panels.find((p) => p.id === panel);
  const forPanel = configsForPanel(configs, panel);
  const arrangements = arrangementOptions(forPanel);
  const currentArrangement = arrangements.find((a) => a.key === arrangement);
  const options = configurationOptions(forPanel, arrangement);

  const panelValue = panel === GENERIC_PANEL ? "Generic input (demonstration)" : realPanel ? `${realPanel.manufacturerName} ${realPanel.model}` : undefined;

  const detail = config ? details[config.id] : undefined;

  if (config && detail) {
    // All three choices made: collapse the steps into one compact card so the reading and diagram sit near the top.
    const rows = [
      { label: "Panel", value: panelValue, change: () => update({}, "push") },
      { label: "Arrangement", value: currentArrangement?.label, change: arrangements.length > 1 ? () => update({ panel }, "push") : undefined },
      { label: "EOL", value: <span className="font-mono">{config.configurationLabel}</span>, change: options.length > 1 ? () => update({ panel, arrangement }, "push") : undefined },
    ];
    return (
      <div className="flex flex-col gap-3">
        <section aria-label="Selected configuration" className="rounded-2xl border border-line bg-ink-900">
          <dl className="divide-y divide-line">
            {rows.map((r) => (
              <div key={r.label} className="flex min-h-11 items-center gap-3 px-4 py-1.5">
                <dt className="w-24 shrink-0 text-xs text-fg-subtle">{r.label}</dt>
                <dd className="min-w-0 flex-1 truncate text-sm font-medium text-fg">{r.value}</dd>
                {r.change && (
                  <button type="button" onClick={r.change} aria-label={`Change ${r.label.toLowerCase()}`} className="h-9 shrink-0 px-1 text-sm font-medium text-signal-400 hover:text-signal-300">
                    Change
                  </button>
                )}
              </div>
            ))}
          </dl>
        </section>
        <ConfigurationView
          detail={detail}
          compact
          stateId={selection.state}
          onStateChange={(state) => update({ panel, arrangement, config: config.id, state }, "replace")}
        />
        <div className="flex flex-col gap-2 text-sm min-[420px]:flex-row">
          <Link href={`/eol/${config.id}`} className="inline-flex h-11 items-center justify-center gap-1.5 rounded-lg border border-line-strong px-4 font-medium text-fg hover:bg-ink-850">
            Permanent link to this configuration
          </Link>
          {realPanel && (
            <Link href={`/devices/${realPanel.id}`} className="inline-flex h-11 items-center justify-center gap-1.5 rounded-lg px-4 font-medium text-signal-400 hover:text-signal-300">
              Back to {realPanel.model}
            </Link>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <Step n={1} title="Alarm panel or input" value={panelValue} onChange={() => update({}, "push")}>
        {!panel && (
          <>
            <ul className="divide-y divide-line">
              {panels.map((p) => (
                <li key={p.id}>
                  <OptionButton label={`${p.manufacturerName} ${p.model}`} onClick={() => update({ panel: p.id }, "push")}>
                    <span className="block text-[15px] text-fg">
                      {p.manufacturerName} <span className="font-mono">{p.model}</span>
                    </span>
                    <span className="mt-0.5 block text-xs text-fg-muted">
                      {p.verifiedCount > 0
                        ? `${p.verifiedCount} verified configuration${p.verifiedCount === 1 ? "" : "s"}`
                        : p.configurationCount > 0
                          ? `${p.configurationCount} configuration${p.configurationCount === 1 ? "" : "s"} — none verified`
                          : "No verified configurations available"}
                    </span>
                  </OptionButton>
                </li>
              ))}
            </ul>
            {genericAvailable && (
              <div className="border-t-2 border-dashed border-example/40 bg-example/[0.04]">
                <p className="px-4 pt-3 font-mono text-[11px] font-semibold tracking-[0.12em] text-example uppercase">Demonstration — not field references</p>
                <OptionButton label="Generic input (demonstration)" onClick={() => update({ panel: GENERIC_PANEL }, "push")}>
                  <span className="block text-[15px] text-fg">Generic input (demonstration)</span>
                  <span className="mt-0.5 block text-xs text-fg-muted">Learn how DEOL and other EOL circuits behave. Not tied to any panel.</span>
                </OptionButton>
              </div>
            )}
          </>
        )}
      </Step>

      {panel && (
        <Step
          n={2}
          title="Detector / contact arrangement"
          value={currentArrangement?.label}
          onChange={arrangements.length > 1 ? () => update({ panel }, "push") : undefined}
        >
          {forPanel.length === 0 ? (
            <div className="px-4 py-4 text-sm leading-relaxed text-fg-muted">
              <p className="font-medium text-fg">No verified configurations available{realPanel ? ` for ${realPanel.model}` : ""}.</p>
              <p className="mt-1">
                Fieldwise only adds panel wiring once it is backed by the manufacturer&apos;s documentation and reviewed. Use the
                panel&apos;s installation manual — don&apos;t rely on another panel&apos;s resistor values.
              </p>
              <div className="mt-3 flex flex-col gap-2 min-[420px]:flex-row">
                {realPanel && (
                  <Link
                    href={`/devices/${realPanel.id}`}
                    className="inline-flex h-11 items-center justify-center gap-1.5 rounded-lg border border-line-strong px-4 font-medium text-fg hover:bg-ink-850"
                  >
                    {realPanel.model} documents
                    <Icon name="chevron-right" className="size-4" />
                  </Link>
                )}
                {genericAvailable && (
                  <button
                    type="button"
                    onClick={() => update({ panel: GENERIC_PANEL }, "push")}
                    className="inline-flex h-11 items-center justify-center rounded-lg px-4 font-medium text-signal-400 hover:text-signal-300"
                  >
                    Try a demonstration circuit
                  </button>
                )}
              </div>
            </div>
          ) : (
            !arrangement && (
              <ul className="divide-y divide-line">
                {arrangements.map((a) => (
                  <li key={a.key}>
                    <OptionButton label={a.label} onClick={() => update({ panel, arrangement: a.key }, "push")}>
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-[15px] text-fg">{a.label}</span>
                        {a.hasDeol && <InputTypeTag type="double-eol" />}
                      </span>
                      <span className="mt-0.5 block text-xs text-fg-muted">
                        {a.configs.length} configuration{a.configs.length === 1 ? "" : "s"}
                        {a.verifiedCount > 0 && ` · ${a.verifiedCount} verified`}
                      </span>
                    </OptionButton>
                  </li>
                ))}
              </ul>
            )
          )}
        </Step>
      )}

      {panel && arrangement && (
        <Step
          n={3}
          title="EOL configuration"
          value={config && <span className="font-mono">{config.configurationLabel}</span>}
          onChange={options.length > 1 ? () => update({ panel, arrangement }, "push") : undefined}
        >
          {!config && (
            <ul className="divide-y divide-line">
              {options.map((c) => (
                <li key={c.id}>
                  <OptionButton label={`${c.configurationLabel} ${WIRING_INPUT_LABELS[c.inputType]}`} onClick={() => update({ panel, arrangement, config: c.id }, "push")}>
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-[15px] text-fg">{c.configurationLabel}</span>
                      <InputTypeTag type={c.inputType} />
                      <VerificationBadge status={c.status} />
                    </span>
                    <span className="mt-0.5 block text-xs text-fg-muted">{c.title}</span>
                  </OptionButton>
                </li>
              ))}
            </ul>
          )}
        </Step>
      )}

    </div>
  );
}
