"use client";

import { useEffect, useMemo, useReducer, useState, useSyncExternalStore } from "react";
import { downloadWorkbook } from "@/lib/reports/download";
import { applyEdit, checkReport, fillEmptySummary, itemLabel, statusCounts, type ReportEdit } from "@/lib/reports/report";
import { EQUIPMENT_PRESETS } from "@/lib/reports/presets";
import { JOB_TYPES, STATUSES, type Report, type ReportItem, type ReportSummary } from "@/lib/reports/schema";
import { getReport, loadTechnician, parseReports, readRaw, saveReport, saveTechnician, subscribeReports } from "@/lib/reports/store";
import { Icon } from "@/components/ui/Icon";
import { applyEquipmentUpdate, linkReport, syncReportHistory, unlinkReport } from "@/lib/sites/link";
import type { HistoryChange, TechRegister } from "@/lib/techdocs/schema";
import { parseRegisters, readRegistersRaw, subscribeRegisters, updateRegister } from "@/lib/techdocs/store";
import { areaClass, EquipmentCard, Field, inputClass, STATUS_STYLE } from "./EquipmentCard";
import { EquipmentPicker, LinkedItemPanel, SiteLinkCard } from "./SiteLink";

interface State {
  report: Report | null;
  loaded: boolean;
  openId: string | null;
  undo: { item: ReportItem; index: number } | null;
}

type Action = { type: "load"; report: Report | null } | { type: "replace"; report: Report } | { type: "edit"; edit: ReportEdit } | { type: "open"; id: string | null } | { type: "remove"; id: string } | { type: "undo" };

function reducer(state: State, action: Action): State {
  if (action.type === "load") return { ...state, loaded: true, report: action.report };
  if (action.type === "replace") return { ...state, report: action.report };
  if (!state.report) return state;
  switch (action.type) {
    case "open":
      return { ...state, openId: action.id };
    case "edit": {
      const next = applyEdit(state.report, action.edit);
      // Newly added or duplicated items open straight away, ready for input.
      const before = new Set(state.report.equipment.map((i) => i.id));
      const added = next.equipment.find((i) => !before.has(i.id));
      return { ...state, report: next, openId: added ? added.id : state.openId, undo: added ? null : state.undo };
    }
    case "remove": {
      const index = state.report.equipment.findIndex((i) => i.id === action.id);
      if (index < 0) return state;
      return { ...state, report: applyEdit(state.report, { type: "remove-item", id: action.id }), undo: { item: state.report.equipment[index]!, index }, openId: null };
    }
    case "undo":
      if (!state.undo) return state;
      return { ...state, report: applyEdit(state.report, { type: "restore-item", ...state.undo }), openId: state.undo.item.id, undo: null };
  }
}

const SUMMARY_FIELDS: [keyof ReportSummary, string][] = [
  ["workCompleted", "Work completed"],
  ["faults", "Faults identified"],
  ["outstanding", "Outstanding issues"],
  ["recommendations", "Recommendations"],
  ["parts", "Parts required"],
  ["notes", "Additional site notes"],
];

function Card({ title, children, aside }: { title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section aria-label={title} className="rounded-2xl border border-line bg-ink-900 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[15px] font-semibold text-fg">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

const rows = (s: string) => Math.min(10, Math.max(3, s.split("\n").length + 1));

/** Edits one report. Every change is saved on this device immediately. */
export function ReportEditor({ id, onClose }: { id: string; onClose: () => void }) {
  const [{ report, loaded, openId, undo }, dispatch] = useReducer(reducer, { report: null, loaded: false, openId: null, undo: null });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [profileSaved, setProfileSaved] = useState(false);
  const raw = useSyncExternalStore(subscribeReports, () => readRaw() ?? "", () => "");
  const stored = useMemo(() => parseReports(raw || null).reports.find((r) => r.id === id), [raw, id]);
  const registersRaw = useSyncExternalStore(subscribeRegisters, () => readRegistersRaw() ?? "", () => "");
  const registers = useMemo(() => parseRegisters(registersRaw || null).registers, [registersRaw]);
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    dispatch({ type: "load", report: getReport(id) });
  }, [id]);

  // Autosave: every change goes straight to this device's storage.
  useEffect(() => {
    if (report) saveReport(report);
  }, [report]);

  // Linked reports keep the site's equipment history current. Events have fixed ids, so this never duplicates.
  useEffect(() => {
    if (!report?.registerId) return;
    const t = setTimeout(() => updateRegister(report.registerId, (r) => syncReportHistory(r, report)), 400);
    return () => clearTimeout(t);
  }, [report]);

  if (!loaded) return <p className="text-sm text-fg-muted">Loading report…</p>;
  if (!report) {
    return (
      <div className="rounded-2xl border border-line bg-ink-900 p-4 text-sm" role="alert">
        <p className="font-semibold text-fg">This report isn&apos;t saved on this device.</p>
        <p className="mt-1 text-fg-muted">It may have been deleted, or saved in a different browser.</p>
        <button type="button" onClick={onClose} className="mt-3 h-11 rounded-lg border border-line-strong px-4 font-medium text-fg hover:bg-ink-800">
          Back to reports
        </button>
      </div>
    );
  }

  const edit = (e: ReportEdit) => dispatch({ type: "edit", edit: e });
  const set = (patch: Partial<Report>) => edit({ type: "set", patch });
  const saved = stored?.updatedAt === report.updatedAt;
  const counts = statusCounts(report);
  const { warnings } = checkReport(report);
  const fill = fillEmptySummary(report);
  const presets = EQUIPMENT_PRESETS[report.jobType];
  const site: TechRegister | null = report.registerId ? (registers.find((r) => r.id === report.registerId) ?? null) : null;
  const applyUpdate = (equipmentId: string, changes: HistoryChange[]) => {
    let result = { applied: [] as HistoryChange[], conflicts: changes };
    updateRegister(report.registerId, (r) => {
      const res = applyEquipmentUpdate(r, equipmentId, changes, report);
      result = res;
      return res.register;
    });
    return result;
  };

  async function generate() {
    setBusy(true);
    setMessage(null);
    try {
      const name = await downloadWorkbook(report!);
      setMessage(`Downloaded ${name}`);
    } catch {
      setMessage("Couldn't create the Excel file. Your report is still saved — try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 pb-28 lg:pb-24">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button type="button" onClick={onClose} className="-ml-2 inline-flex h-10 items-center gap-1 rounded-lg px-2 text-sm font-medium text-fg-muted hover:bg-ink-850 hover:text-fg">
          <Icon name="chevron-right" className="size-4 rotate-180" />
          All reports
        </button>
        <p className={`text-xs font-medium ${saved ? "text-verified" : "text-amber-300"}`} role="status" data-testid="save-status">
          {saved ? "✓ Saved on this device" : "Saving…"}
        </p>
      </div>

      <div role="radiogroup" aria-label="Job type" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {JOB_TYPES.map((j) => (
          <button
            key={j.id}
            type="button"
            role="radio"
            aria-checked={report.jobType === j.id}
            onClick={() => set({ jobType: j.id })}
            className={`h-11 rounded-xl border text-sm font-semibold ${report.jobType === j.id ? "border-signal-400 bg-signal-500/15 text-signal-300" : "border-line-strong text-fg-muted hover:text-fg"}`}
          >
            {j.label}
          </button>
        ))}
      </div>

      <SiteLinkCard
        report={report}
        registers={registers}
        site={site}
        onLink={(r, replace) => dispatch({ type: "replace", report: linkReport(report, r, replace) })}
        onUnlink={() => {
          // Remove this job's service entries from the site history, then unlink.
          updateRegister(report.registerId, (r) => syncReportHistory(r, { ...report, equipment: [] }));
          dispatch({ type: "replace", report: unlinkReport(report) });
          setPicking(false);
        }}
        onPick={() => setPicking(true)}
      />

      <Card title="Job details">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Site name">
            <input className={inputClass} value={report.siteName} onChange={(e) => set({ siteName: e.target.value })} placeholder="e.g. Harbour Depot" />
          </Field>
          <Field label="Customer">
            <input className={inputClass} value={report.customer} onChange={(e) => set({ customer: e.target.value })} />
          </Field>
          <Field label="Date">
            <input className={inputClass} type="date" value={report.date} onChange={(e) => set({ date: e.target.value })} />
          </Field>
          <Field label="Job reference">
            <input className={inputClass} value={report.reference} onChange={(e) => set({ reference: e.target.value })} placeholder="e.g. JOB-1042" />
          </Field>
          <Field label="Technician">
            <span className="flex gap-2">
              <input
                className={inputClass}
                value={report.technician}
                onChange={(e) => {
                  set({ technician: e.target.value });
                  setProfileSaved(false);
                }}
              />
              <button
                type="button"
                onClick={() => {
                  saveTechnician({ ...loadTechnician(), name: report.technician });
                  setProfileSaved(true);
                }}
                disabled={!report.technician.trim()}
                className="h-11 shrink-0 rounded-lg border border-line-strong px-3 text-xs font-medium text-fg hover:bg-ink-800 disabled:opacity-40"
              >
                {profileSaved ? "✓ Saved" : "Use for new reports"}
              </button>
            </span>
          </Field>
        </div>
        <details className="mt-3 rounded-xl border border-line px-3 py-2" open={Boolean(report.siteAddress || report.description)}>
          <summary className="cursor-pointer py-1 text-sm font-medium text-fg-muted">Site address and job description</summary>
          <div className="mt-2 grid gap-3">
            <Field label="Site address">
              <textarea className={areaClass} rows={2} value={report.siteAddress} onChange={(e) => set({ siteAddress: e.target.value })} />
            </Field>
            <Field label="Job description">
              <textarea className={areaClass} rows={rows(report.description)} value={report.description} onChange={(e) => set({ description: e.target.value })} />
            </Field>
          </div>
        </details>
      </Card>

      <Card
        title={`Equipment (${report.equipment.length})`}
        aside={
          <span className="flex flex-wrap gap-1.5 text-xs" data-testid="counts">
            {STATUSES.map((s) => (
              <span key={s.id} className={`rounded-full px-2 py-0.5 font-medium ${STATUS_STYLE[s.id].pill}`}>
                {s.label} {counts[s.id]}
              </span>
            ))}
          </span>
        }
      >
        <div role="group" aria-label="Quick add" className="-mx-1 flex flex-wrap gap-2">
          {presets.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => edit({ type: "add-item", itemType: p })}
              className="h-11 rounded-full border border-line-strong px-3.5 text-sm font-medium text-fg hover:border-signal-400 hover:bg-ink-850"
            >
              + {p}
            </button>
          ))}
          <button type="button" onClick={() => edit({ type: "add-item" })} className="h-11 rounded-full border border-dashed border-line-strong px-3.5 text-sm font-medium text-fg-muted hover:text-fg">
            + Other
          </button>
        </div>

        {site && !picking && (
          <button type="button" onClick={() => setPicking(true)} className="mt-2 h-11 rounded-full border border-signal-400/60 px-3.5 text-sm font-semibold text-signal-300 hover:bg-signal-500/10">
            + From site register
          </button>
        )}
        {site && picking && (
          <EquipmentPicker
            report={report}
            site={site}
            onAdd={(items) => {
              edit({ type: "add-items", items });
              setPicking(false);
            }}
            onClose={() => setPicking(false)}
          />
        )}

        {report.equipment.length > 0 && (
          <ol className="mt-3 flex flex-col gap-2" aria-label="Equipment entries">
            {report.equipment.map((item, i) => (
              <EquipmentCard
                key={item.id}
                report={report}
                item={item}
                index={i}
                open={openId === item.id}
                onToggle={() => dispatch({ type: "open", id: openId === item.id ? null : item.id })}
                edit={edit}
                onRemove={() => dispatch({ type: "remove", id: item.id })}
                linked={
                  item.source ? (
                    <LinkedItemPanel item={item} site={item.source.registerId === report.registerId ? site : null} edit={edit} onApply={(changes) => applyUpdate(item.source!.equipmentId, changes)} />
                  ) : undefined
                }
              />
            ))}
          </ol>
        )}
        {undo && (
          <p className="mt-2 flex items-center justify-between gap-2 rounded-lg bg-ink-850 px-3 py-2 text-sm text-fg" role="status">
            Removed {itemLabel({ ...report, equipment: [...report.equipment, undo.item] }, undo.item)}.
            <button type="button" onClick={() => dispatch({ type: "undo" })} className="h-9 px-2 font-semibold text-signal-400 hover:text-signal-300">
              Undo
            </button>
          </p>
        )}
        {report.equipment.length > 0 && (
          <button
            type="button"
            onClick={() => edit({ type: "duplicate-item", id: report.equipment.at(-1)!.id })}
            className="mt-3 h-11 rounded-lg border border-line-strong px-4 text-sm font-medium text-fg hover:bg-ink-800"
          >
            Duplicate previous
          </button>
        )}
      </Card>

      <Card
        title="Job summary"
        aside={
          Object.keys(fill).length > 0 ? (
            <button type="button" onClick={() => edit({ type: "summary", patch: fill })} className="h-10 rounded-lg border border-signal-400/50 px-3 text-sm font-medium text-signal-300 hover:bg-signal-500/10">
              Fill empty sections from equipment
            </button>
          ) : undefined
        }
      >
        <p className="mb-3 text-xs text-fg-muted">Filling only copies what you entered on the equipment — edit freely afterwards.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {SUMMARY_FIELDS.map(([key, label]) => (
            <Field key={key} label={label}>
              <textarea className={areaClass} rows={rows(report.summary[key])} value={report.summary[key]} onChange={(e) => edit({ type: "summary", patch: { [key]: e.target.value } })} />
            </Field>
          ))}
        </div>
      </Card>

      {warnings.length > 0 && (
        <ul className="rounded-xl border border-amber-300/30 bg-amber-300/[0.06] px-4 py-3 text-sm text-fg" aria-label="Before you generate" data-testid="warnings">
          {warnings.map((w) => (
            <li key={w} className="flex gap-2">
              <span className="text-amber-300" aria-hidden="true">
                !
              </span>
              {w}
            </li>
          ))}
        </ul>
      )}

      {/* Always reachable: generate sits above the mobile bottom navigation. */}
      <div className="sticky bottom-20 z-30 flex flex-wrap items-center gap-3 rounded-2xl border border-line-strong bg-ink-900/95 p-3 shadow-lg backdrop-blur lg:bottom-4">
        <button
          type="button"
          onClick={generate}
          disabled={busy}
          className="h-12 flex-1 rounded-xl bg-signal-500 px-5 text-[15px] font-semibold text-ink-950 hover:bg-signal-400 disabled:opacity-60 sm:flex-none"
        >
          {busy ? "Creating Excel…" : "Generate Excel"}
        </button>
        <p className="min-w-0 flex-1 text-xs text-fg-muted" role="status" data-testid="generate-status">
          {message ?? `${report.equipment.length} item${report.equipment.length === 1 ? "" : "s"} · created on this device, nothing is uploaded`}
        </p>
      </div>
    </div>
  );
}
