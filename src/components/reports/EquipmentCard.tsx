"use client";

import { itemLabel, type ReportEdit } from "@/lib/reports/report";
import { PRIORITIES, STATUSES, type ItemStatus, type Report, type ReportItem } from "@/lib/reports/schema";
import { EQUIPMENT_PRESETS } from "@/lib/reports/presets";
import { Icon } from "@/components/ui/Icon";

export const STATUS_STYLE: Record<ItemStatus, { mark: string; on: string; pill: string }> = {
  pass: { mark: "✓", on: "border-verified bg-verified/15 text-verified", pill: "bg-verified/15 text-verified" },
  fault: { mark: "✗", on: "border-fault bg-fault/15 text-fault", pill: "bg-fault/15 text-fault" },
  recommendation: { mark: "!", on: "border-amber-300 bg-amber-300/15 text-amber-300", pill: "bg-amber-300/15 text-amber-300" },
  "not-tested": { mark: "–", on: "border-line-strong bg-ink-800 text-fg", pill: "bg-ink-800 text-fg-muted" },
};

const input =
  "h-11 w-full min-w-0 rounded-lg border border-line-strong bg-ink-850 px-3 text-base text-fg placeholder:text-fg-subtle focus:border-signal-500 focus:outline-none";
const area =
  "w-full min-w-0 rounded-lg border border-line-strong bg-ink-850 px-3 py-2 text-base text-fg placeholder:text-fg-subtle focus:border-signal-500 focus:outline-none";

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-fg-muted">
      {label}
      {children}
    </label>
  );
}

export { input as inputClass, area as areaClass };

/** One equipment entry: compact when closed, quick status + findings when open, everything else one tap away. */
export function EquipmentCard({
  report,
  item,
  index,
  open,
  onToggle,
  edit,
  onRemove,
}: {
  report: Report;
  item: ReportItem;
  index: number;
  open: boolean;
  onToggle: () => void;
  edit: (e: ReportEdit) => void;
  onRemove: () => void;
}) {
  const label = itemLabel(report, item);
  const set = (patch: Partial<ReportItem>) => edit({ type: "update-item", id: item.id, patch });
  const s = STATUSES.find((x) => x.id === item.status)!;
  const listId = `types-${item.id}`;
  const last = index === report.equipment.length - 1;
  return (
    <li className={`rounded-2xl border bg-ink-900 ${open ? "border-signal-400/60" : "border-line"}`} data-item={item.id}>
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left">
        <span className="font-mono text-xs text-fg-subtle">{index + 1}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-semibold text-fg">{label}</span>
          {(item.location || item.type) && <span className="block truncate text-xs text-fg-muted">{[item.type, item.location].filter(Boolean).join(" · ")}</span>}
        </span>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_STYLE[item.status].pill}`} data-status={item.status}>
          <span aria-hidden="true">{STATUS_STYLE[item.status].mark} </span>
          {s.label}
        </span>
        <Icon name="chevron-right" className={`size-4 shrink-0 text-fg-subtle transition-transform motion-reduce:transition-none ${open ? "rotate-90" : ""}`} />
      </button>

      {open && (
        <div className="flex flex-col gap-3 border-t border-line px-4 py-3">
          <div role="group" aria-label="Status" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {STATUSES.map((st) => (
              <button
                key={st.id}
                type="button"
                aria-pressed={item.status === st.id}
                onClick={() => set({ status: st.id })}
                className={`flex h-12 items-center justify-center gap-1.5 rounded-xl border text-sm font-semibold ${
                  item.status === st.id ? STATUS_STYLE[st.id].on : "border-line-strong text-fg-muted hover:text-fg"
                }`}
              >
                <span aria-hidden="true">{STATUS_STYLE[st.id].mark}</span>
                {st.label}
              </button>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Type">
              <input className={input} value={item.type} list={listId} onChange={(e) => set({ type: e.target.value })} placeholder="e.g. Camera" />
              <datalist id={listId}>
                {EQUIPMENT_PRESETS[report.jobType].map((p) => (
                  <option key={p} value={p} />
                ))}
              </datalist>
            </Field>
            <Field label="Location">
              <input className={input} value={item.location} onChange={(e) => set({ location: e.target.value })} placeholder="e.g. Front gate" />
            </Field>
          </div>
          <Field label="Findings">
            <textarea className={area} rows={2} value={item.findings} onChange={(e) => set({ findings: e.target.value })} placeholder="What you found" />
          </Field>
          <details className="group rounded-xl border border-line px-3 py-2" open={Boolean(item.name || item.makeModel || item.work || item.recommendations || item.notes || item.priority)}>
            <summary className="cursor-pointer py-1 text-sm font-medium text-fg-muted">More details (name, make/model, work, recommendations, priority, notes)</summary>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <Field label="Equipment name">
                <input className={input} value={item.name} onChange={(e) => set({ name: e.target.value })} placeholder={label} />
              </Field>
              <Field label="Make/model">
                <input className={input} value={item.makeModel} onChange={(e) => set({ makeModel: e.target.value })} />
              </Field>
              <Field label="Work completed">
                <textarea className={area} rows={2} value={item.work} onChange={(e) => set({ work: e.target.value })} />
              </Field>
              <Field label="Recommendations">
                <textarea className={area} rows={2} value={item.recommendations} onChange={(e) => set({ recommendations: e.target.value })} />
              </Field>
              <Field label="Priority (optional)">
                <select className={input} value={item.priority} onChange={(e) => set({ priority: e.target.value as ReportItem["priority"] })}>
                  {PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {p || "Not set"}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Additional notes">
                <textarea className={area} rows={2} value={item.notes} onChange={(e) => set({ notes: e.target.value })} />
              </Field>
            </div>
          </details>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => edit({ type: "add-item", itemType: item.type, after: item.id })}
              className="h-11 flex-1 rounded-lg bg-signal-500 px-3 text-sm font-semibold text-ink-950 hover:bg-signal-400 sm:flex-none"
            >
              + Add another{item.type ? ` ${item.type}` : ""}
            </button>
            <button type="button" onClick={() => edit({ type: "duplicate-item", id: item.id })} className="h-11 rounded-lg border border-line-strong px-3 text-sm font-medium text-fg hover:bg-ink-800">
              Duplicate
            </button>
            <button
              type="button"
              onClick={() => edit({ type: "move-item", id: item.id, by: -1 })}
              disabled={index === 0}
              aria-label={`Move ${label} up`}
              className="h-11 w-11 rounded-lg border border-line-strong text-fg hover:bg-ink-800 disabled:opacity-30"
            >
              ↑
            </button>
            <button
              type="button"
              onClick={() => edit({ type: "move-item", id: item.id, by: 1 })}
              disabled={last}
              aria-label={`Move ${label} down`}
              className="h-11 w-11 rounded-lg border border-line-strong text-fg hover:bg-ink-800 disabled:opacity-30"
            >
              ↓
            </button>
            <button type="button" onClick={onRemove} className="h-11 rounded-lg px-3 text-sm font-medium text-fg-muted hover:text-fault">
              Remove
            </button>
          </div>
        </div>
      )}
    </li>
  );
}
