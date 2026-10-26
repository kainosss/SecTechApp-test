"use client";

import type { WiringDetail } from "@/lib/content/repository";
import { STATUS_LABELS, WIRING_INPUT_LABELS } from "@/lib/content/schema";
import { circuitComponents, formatOhms, resistorCode } from "@/lib/eol/engine";
import { RESISTOR_ROLE_LABELS, STATE_KIND_LABELS, type CircuitState } from "@/lib/eol/model";
import type { StateEvaluation } from "@/lib/eol/validate";
import { Citation } from "@/components/devices/Citation";
import { DocumentList } from "@/components/devices/DocumentList";
import { LinkedDevices } from "@/components/records/LinkedDevices";
import { RECORD_STATUS_EXPLANATION } from "@/components/records/explanations";
import { Icon } from "@/components/ui/Icon";
import { StatusPanel } from "@/components/ui/StatusPanel";
import { VerificationBadge } from "@/components/ui/VerificationBadge";
import { useState } from "react";
import { bannerFor } from "@/lib/eol/classification";
import type { ContactPositions } from "@/lib/eol/engine";
import { interpretAgainstExample } from "@/lib/eol/explain";
import { CircuitWorkbench } from "./CircuitWorkbench";
import { ClassificationBadge } from "./ClassificationBadge";

const AGREEMENT_LABEL: Record<StateEvaluation["agreement"], string> = {
  agrees: "Matches documentation",
  disagrees: "Does not match documentation",
  undocumented: "No documented value",
  "not-calculated": "Cannot calculate — data incomplete",
};

function documentedText(s: StateEvaluation): string | null {
  const d = s.documented;
  if (!d) return null;
  const parts: string[] = [];
  if (d.nominalOhms !== undefined) parts.push(formatOhms(d.nominalOhms));
  if (d.minOhms !== undefined || (d.maxOhms !== undefined && d.maxOhms !== null)) {
    const lo = d.minOhms !== undefined ? formatOhms(d.minOhms) : "0 Ω";
    const hi = d.maxOhms == null ? "open" : formatOhms(d.maxOhms);
    parts.push(`band ${lo} – ${hi}`);
  }
  if (d.panelReports) parts.push(`panel reports “${d.panelReports}”`);
  return parts.join(" · ") || null;
}

function Section({ title, children, id }: { title: string; children: React.ReactNode; id?: string }) {
  return (
    <section id={id} aria-label={title} className="rounded-2xl border border-line bg-ink-900">
      <h3 className="flex min-h-11 items-center border-b border-line px-4 text-sm font-semibold text-fg">{title}</h3>
      {children}
    </section>
  );
}

/**
 * Full view of one wiring configuration: state switcher, live reading, diagram,
 * readings table, resistor roles, interpretation, checks, sources and devices.
 */
export function ConfigurationView({
  detail,
  stateId,
  onStateChange,
  compact = false,
}: {
  detail: WiringDetail;
  stateId?: string;
  onStateChange: (stateId: string) => void;
  /** In the assistant the steps already name the configuration: lead with the reading and diagram. */
  compact?: boolean;
}) {
  const evaluations = detail.states;
  const current = evaluations.find((s) => s.id === stateId) ?? evaluations.find((s) => s.kind === "normal") ?? evaluations[0]!;
  // Cable faults leave the detector undisturbed, so its contacts are drawn in their sealed positions.
  const normalContacts = evaluations.find((s) => s.kind === "normal")?.contacts ?? {};
  // Contacts tapped on the diagram override the selected state until another state is chosen.
  const [manual, setManual] = useState<{ forState: string; positions: ContactPositions; line: CircuitState["line"] } | null>(null);
  const active =
    manual && manual.forState === current.id
      ? manual
      : { positions: current.line === "intact" ? current.contacts : normalContacts, line: current.line };
  const matched = evaluations.find((s) =>
    active.line === "intact"
      ? s.line === "intact" && Object.keys(normalContacts).every((id) => s.contacts[id] === active.positions[id])
      : s.line === active.line,
  );
  const interpretation = (ohms: number) => {
    const reports = matched?.documented?.panelReports;
    if (detail.classification === "manufacturer-confirmed" && reports && matched?.ohms === ohms) return `Documented: the panel reports this as “${reports}”.`;
    if (detail.classification === "manufacturer-confirmed") return "This combination is not a documented state for this panel; check its manual.";
    return interpretAgainstExample(ohms);
  };
  const resistors = circuitComponents(detail.circuit.network).filter((c) => c.kind === "resistor");
  const { a, b } = detail.circuit.terminals;
  const demo = detail.classification === "demonstration";
  // Generic circuits: overlaps are explained, not warned about; errors are always shown.
  const problems = detail.diagnostics.filter((d) => d.severity === "error" || (d.severity === "warning" && !detail.generic));
  const header = (
    <header>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-xl font-medium text-fg">{detail.configurationLabel}</span>
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
            detail.inputType === "double-eol" ? "bg-signal-500/20 text-signal-300" : "border border-line-strong text-fg-muted"
          }`}
        >
          {WIRING_INPUT_LABELS[detail.inputType]}
        </span>
        <VerificationBadge status={detail.status} />
      </div>
      <p className="mt-1 text-[15px] text-fg">{detail.title}</p>
      <p className="mt-0.5 text-sm leading-relaxed text-fg-muted">{detail.summary}</p>
    </header>
  );

  return (
    <div className={`flex flex-col gap-4 ${demo ? "rounded-2xl border-2 border-dashed border-example/40 p-3 sm:p-4" : ""}`}>
      {demo && (
        <p className="-mb-1 font-mono text-[11px] font-semibold tracking-[0.14em] text-example uppercase">
          Demonstration only — not an installation diagram
        </p>
      )}

      {!compact && header}

      <CircuitWorkbench
        circuit={detail.circuit}
        evaluations={evaluations}
        positions={active.positions}
        normalPositions={normalContacts}
        line={active.line}
        matchedStateId={matched?.id ?? null}
        banner={bannerFor(detail.classification)}
        panelLabel={detail.panel?.model ?? "Panel input"}
        title={`${detail.configurationLabel} wiring diagram`}
        onSelectState={(id) => {
          setManual(null);
          onStateChange(id);
        }}
        onToggleContact={(id) =>
          setManual({ forState: current.id, line: "intact", positions: { ...active.positions, [id]: active.positions[id] === "open" ? "closed" : "open" } })
        }
        onSetLine={(line) => setManual({ forState: current.id, line, positions: active.positions })}
        allowCurrentAnimation={detail.generic}
        interpretation={interpretation}
      />
      {matched && matched.agreement !== "undocumented" && (
        <p className={`-mt-1 text-xs font-medium ${matched.agreement === "agrees" ? "text-verified" : "text-fault"}`}>{AGREEMENT_LABEL[matched.agreement]}</p>
      )}

      {compact && header}

      {detail.generic ? (
        <div className="flex flex-col gap-1.5 rounded-xl border border-line bg-ink-900 px-4 py-3 text-sm">
          <ClassificationBadge value={detail.classification} full />
          <p className="text-fg-muted">Not tied to any panel. Electrical validation does not confirm that a panel supports this arrangement or these values.</p>
        </div>
      ) : (
        <StatusPanel
          status={detail.status}
          explanation={RECORD_STATUS_EXPLANATION[detail.status]}
          updatedAt={detail.updatedAt}
          review={detail.review}
          notes={detail.statusNotes}
        />
      )}
      {detail.status === "needs-verification" && detail.statusReasons.length > 0 && (
        <details className="rounded-xl border border-line bg-ink-900 px-4 py-3 text-sm">
          <summary className="cursor-pointer font-medium text-fg">Why this is not verified ({detail.statusReasons.length})</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-fg-muted">
            {detail.statusReasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </details>
      )}

      <Section title="Readings by state">
        <ul className="divide-y divide-line">
          {evaluations.map((s) => {
            const doc = documentedText(s);
            return (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => onStateChange(s.id)}
                  aria-label={`Show ${s.label}`}
                  className={`grid w-full grid-cols-[7rem_1fr] items-baseline gap-x-3 px-4 py-2.5 text-left hover:bg-ink-850 ${s.id === current.id ? "bg-ink-850" : ""}`}
                >
                  <span className="text-sm text-fg-muted">{s.label}</span>
                  <span>
                    <span className="block font-mono text-[15px] text-fg">{s.ohms === null ? "—" : formatOhms(s.ohms)}</span>
                    {doc && <span className="block text-xs text-fg-subtle">Documented: {doc}</span>}
                    {s.agreement === "disagrees" && <span className="block text-xs font-medium text-fault">Does not match documentation</span>}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </Section>

      <Section title="What each resistor does">
        {resistors.length === 0 ? (
          <p className="px-4 py-3 text-sm text-fg-muted">This circuit has no EOL resistors: the panel only sees closed (0 Ω) or open.</p>
        ) : (
          <ul className="divide-y divide-line">
            {resistors.map((r) => (
              <li key={r.id} className="px-4 py-3">
                <span className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-mono text-[15px] text-signal-300">
                    {r.id} · {r.ohms === null ? "value not documented" : `${resistorCode(r.ohms)} (${formatOhms(r.ohms)})`}
                  </span>
                  <span className="text-sm text-fg">{RESISTOR_ROLE_LABELS[r.role]}</span>
                </span>
                {r.purpose && <span className="mt-0.5 block text-sm leading-relaxed text-fg-muted">{r.purpose}</span>}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="How the panel tells the states apart">
        <div className="px-4 py-3 text-sm leading-relaxed">
          {detail.interpretation ? (
            <>
              <p className="text-fg">{detail.interpretation.text}</p>
              <Citation sources={detail.interpretation.sources} className="mt-1" />
            </>
          ) : (
            <p className="text-fg-muted">
              {demo
                ? "Demonstration circuit: no panel is specified, so there are no documented thresholds. The readings above only show how the resistor network behaves."
                : "Not documented yet. Panels use their own thresholds — check the panel's installation manual."}
            </p>
          )}
        </div>
        {problems.length > 0 && (
          <ul className="flex flex-col gap-2 border-t border-line p-3">
            {problems.map((d, i) => (
              <li
                key={i}
                className={`flex gap-2.5 rounded-lg border px-3 py-2 text-sm ${
                  d.severity === "error" ? "border-fault/40 bg-fault/5 text-fg" : "border-unverified/30 bg-unverified/5 text-fg"
                }`}
              >
                <Icon name="alert" className={`mt-0.5 size-4 shrink-0 ${d.severity === "error" ? "text-fault" : "text-unverified"}`} />
                <span>{d.message}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Panel input">
        <dl className="divide-y divide-line text-sm">
          <div className="grid grid-cols-[8rem_1fr] gap-3 px-4 py-2.5">
            <dt className="text-fg-muted">Panel</dt>
            <dd className="text-fg">{detail.panel ? `${detail.panel.manufacturerName} ${detail.panel.model}` : "Generic input (no panel)"}</dd>
          </div>
          <div className="grid grid-cols-[8rem_1fr] gap-3 px-4 py-2.5">
            <dt className="text-fg-muted">Terminals</dt>
            <dd className="font-mono text-fg">
              {a.label} / {b.label}
              {a.sourceRefs.length === 0 && <span className="ml-2 font-sans text-xs text-unverified">not documented</span>}
            </dd>
          </div>
          <div className="grid grid-cols-[8rem_1fr] gap-3 px-4 py-2.5">
            <dt className="text-fg-muted">Panel revisions</dt>
            <dd className="text-fg">
              {[...detail.panelHardwareRevisions.map((r) => `HW ${r}`), ...detail.panelFirmwareRevisions.map((r) => `FW ${r}`)].join(", ") || (
                <span className="text-fg-subtle">Not identified</span>
              )}
            </dd>
          </div>
          {detail.appliesToVariants.length > 0 && (
            <div className="grid grid-cols-[8rem_1fr] gap-3 px-4 py-2.5">
              <dt className="text-fg-muted">Variants</dt>
              <dd className="text-fg">{detail.appliesToVariants.map((v) => `${v.model} ${v.variant}`).join(", ")}</dd>
            </div>
          )}
        </dl>
      </Section>

      <Section title="Manufacturer documentation">
        <DocumentList
          documents={detail.sources}
          empty={demo ? "Demonstration circuit — there is no manufacturer document." : "No source documents are cited for this configuration."}
        />
      </Section>

      {(detail.devices.length > 0 || detail.panel) && (
        <Section title="Related devices">
          <LinkedDevices
            devices={[
              ...(detail.panel ? [{ id: detail.panel.id, model: detail.panel.model, manufacturerName: detail.panel.manufacturerName, status: detail.panel.status }] : []),
              ...detail.devices.filter((d) => d.id !== detail.panel?.id),
            ]}
            empty=""
          />
        </Section>
      )}

      <p className="text-xs text-fg-subtle">
        Status: {STATUS_LABELS[detail.status]} · States: {evaluations.map((s) => STATE_KIND_LABELS[s.kind]).join(", ")}
      </p>
    </div>
  );
}
