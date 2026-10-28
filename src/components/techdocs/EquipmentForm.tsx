"use client";

import { useRef, useState } from "react";
import { areaClass, Field, inputClass } from "@/components/reports/EquipmentCard";
import { newId } from "@/lib/reports/report";
import { QUICK_FIELDS, quickFields, SECTIONS, sectionOrder, TYPE_SUGGESTIONS, CATEGORY_PRIORITY, type FieldDef, type SectionId } from "@/lib/techdocs/fields";
import { equipmentLabel, UNIQUE_IDENTIFIERS } from "@/lib/techdocs/register";
import { CATEGORIES, OP_STATUSES, type Category, type Equipment, type TechRegister } from "@/lib/techdocs/schema";
import { equipmentWarnings } from "@/lib/techdocs/validation";
import { FIELD_LABEL } from "@/lib/techdocs/fields";
import { eventDay, HISTORY_LABEL } from "@/lib/techdocs/history";
import type { HistoryEvent } from "@/lib/techdocs/schema";
import { sourceState } from "@/lib/sites/link";
import { displayDate } from "@/lib/reports/xlsx-layout";

export type SaveMode = "close" | "next" | "duplicate";

export type EntryMode = "quick" | "full";
const MODE_KEY = "fieldwise:techdocs:entry-mode";
function readMode(): EntryMode {
  try {
    return window.localStorage.getItem(MODE_KEY) === "full" ? "full" : "quick";
  } catch {
    return "quick";
  }
}
function storeMode(m: EntryMode) {
  try {
    window.localStorage.setItem(MODE_KEY, m);
  } catch {
    // Preference not kept; the form still works.
  }
}

/** A section's fields as shown: in Quick Entry, the quick fields are shown together above, so they're left out here. */
const sectionFields = (id: SectionId, mode: EntryMode, category: Category) => {
  const quick = new Set<string>(mode === "quick" ? QUICK_FIELDS[category] : []);
  return SECTIONS.find((s) => s.id === id)!.fields.filter((f) => !quick.has(f.key));
};
const filled = (e: Equipment, id: SectionId, mode: EntryMode = "full") =>
  id === "custom" ? e.customFields.filter((f) => f.name.trim() || f.value.trim()).length : sectionFields(id, mode, e.category).filter((f) => e[f.key].trim()).length;

/**
 * Edits one equipment entry as a draft: nothing changes in the register until
 * Save. Sections are ordered by category (relevant ones open); every field
 * stays available and a category change never clears anything.
 * Keyboard: Enter moves to the next field, Ctrl/⌘+Enter saves, Esc cancels.
 */
export function EquipmentForm({
  register,
  initial,
  isNew,
  duplicatedFrom,
  onSave,
  onCancel,
  onDelete,
  history = [],
  reportIds = new Set<string>(),
}: {
  register: TechRegister;
  initial: Equipment;
  isNew: boolean;
  /** Label of the entry this draft was duplicated from (shows what was cleared). */
  duplicatedFrom?: string;
  onSave: (item: Equipment, mode: SaveMode) => void;
  onCancel: (draft: Equipment, dirty: boolean) => void;
  onDelete: (item: Equipment) => void;
  /** This entry's history, newest first (read-only). */
  history?: HistoryEvent[];
  /** Service reports on this device, so history only links to reports that can be opened. */
  reportIds?: ReadonlySet<string>;
}) {
  const [item, setItem] = useState(initial);
  const [mode, setModeState] = useState<EntryMode>(readMode);
  // Sections open by default: in full mode the category's priority sections; always any section holding values.
  const [open, setOpen] = useState<Set<SectionId>>(() => {
    const m = readMode();
    return new Set([...(m === "full" ? CATEGORY_PRIORITY[initial.category] : []), ...sectionOrder(initial.category).filter((id) => filled(initial, id, m) > 0)]);
  });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const dirty = JSON.stringify(item) !== JSON.stringify(initial);
  const warnings = equipmentWarnings(item, register);
  const warningFor = (key: string) => warnings.filter((w) => w.field === key);
  const set = (patch: Partial<Equipment>) => setItem((e) => ({ ...e, ...patch }));
  const label = equipmentLabel({ ...register, equipment: register.equipment.some((e) => e.id === item.id) ? register.equipment.map((e) => (e.id === item.id ? item : e)) : [...register.equipment, item] }, item);
  const categoryLabel = CATEGORIES.find((c) => c.id === item.category)!.label;

  const setCategory = (category: Category) => {
    set({ category });
    // Open the new category's sections (and any holding values) without closing anything the technician opened.
    const next = { ...item, category };
    setOpen((o) => new Set([...o, ...(mode === "full" ? CATEGORY_PRIORITY[category] : []), ...sectionOrder(category).filter((id) => filled(next, id, mode) > 0)]));
  };
  // Switching mode never changes values; sections holding values open so nothing is out of sight.
  const setMode = (m: EntryMode) => {
    setModeState(m);
    storeMode(m);
    setOpen((o) => new Set([...o, ...(m === "full" ? CATEGORY_PRIORITY[item.category] : []), ...sectionOrder(item.category).filter((id) => filled(item, id, m) > 0)]));
  };
  const toggle = (id: SectionId, next: boolean) => setOpen((o) => {
    const s = new Set(o);
    if (next) s.add(id);
    else s.delete(id);
    return s;
  });

  function onKeyDown(e: React.KeyboardEvent<HTMLFormElement>) {
    const target = e.target as HTMLElement;
    if (e.key === "Escape") {
      e.preventDefault();
      onCancel(item, dirty);
    } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      onSave(item, e.shiftKey ? "next" : "close");
    } else if (e.key === "Enter" && target.tagName === "INPUT") {
      // Enter steps to the next field (like a spreadsheet) instead of submitting.
      e.preventDefault();
      const fields = [...formRef.current!.querySelectorAll<HTMLElement>("input, select, textarea")].filter((el) => !el.closest("details:not([open])"));
      fields[fields.indexOf(target) + 1]?.focus();
    }
  }

  const renderField = (f: FieldDef) => {
    const id = `f-${f.key}`;
    const w = warningFor(f.key);
    const describedBy = w.length ? `${id}-warn` : undefined;
    const common = { id, "aria-describedby": describedBy, "aria-invalid": w.length ? true : undefined } as const;
    let control: React.ReactNode;
    if (f.kind === "status") {
      control = (
        <select {...common} className={inputClass} value={item.status} onChange={(e) => set({ status: e.target.value as Equipment["status"] })}>
          <option value="">Not recorded</option>
          {OP_STATUSES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      );
    } else if (f.kind === "area") {
      control = <textarea {...common} className={areaClass} rows={Math.min(8, Math.max(2, item[f.key].split("\n").length + 1))} value={item[f.key]} onChange={(e) => set({ [f.key]: e.target.value })} />;
    } else {
      const suggestions = f.key === "type" ? TYPE_SUGGESTIONS[item.category] : f.suggestions;
      control = (
        <>
          <input
            {...common}
            className={`${inputClass} ${f.mono ? "font-mono" : ""}`}
            type={f.kind === "date" ? "date" : "text"}
            value={item[f.key]}
            placeholder={f.placeholder}
            list={suggestions?.length ? `${id}-list` : undefined}
            autoComplete="off"
            autoCapitalize={f.mono ? "off" : undefined}
            spellCheck={f.mono ? false : undefined}
            onChange={(e) => set({ [f.key]: e.target.value })}
          />
          {suggestions?.length ? (
            <datalist id={`${id}-list`}>
              {suggestions.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          ) : null}
        </>
      );
    }
    return (
      <div key={f.key} className={f.kind === "area" ? "sm:col-span-2" : ""}>
        <label htmlFor={id} className="mb-1 block text-xs font-medium text-fg-muted">
          {f.label}
        </label>
        {control}
        {w.length > 0 && (
          <p id={`${id}-warn`} className="mt-1 text-xs text-amber-300" data-warning={f.key}>
            <span aria-hidden="true">⚠ </span>
            {w.map((x) => x.message).join(" ")}
          </p>
        )}
      </div>
    );
  };

  return (
    <form
      ref={formRef}
      aria-label={isNew ? `New ${categoryLabel}` : `Edit ${label}`}
      onSubmit={(e) => {
        e.preventDefault();
        onSave(item, "close");
      }}
      onKeyDown={onKeyDown}
      className="flex flex-col gap-3 pb-40 lg:pb-28"
      data-testid="equipment-form"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold text-fg">{isNew ? `New entry — ${label}` : label}</h2>
        <p className="hidden text-xs text-fg-subtle lg:block">Enter: next field · Ctrl+Enter: save · Ctrl+Shift+Enter: save &amp; add another · Esc: cancel</p>
      </div>
      {duplicatedFrom && (
        <p className="rounded-xl border border-signal-400/30 bg-signal-500/[0.06] px-3 py-2 text-sm text-fg" role="status">
          Copied from {duplicatedFrom}. Name, {UNIQUE_IDENTIFIERS.map((k) => FIELD_LABEL[k].toLowerCase()).join(", ")}, switch port, system numbers and maintenance notes were left blank — enter this device&apos;s own values.
        </p>
      )}

      <Field label="Equipment category">
        <select className={inputClass} value={item.category} onChange={(e) => setCategory(e.target.value as Category)}>
          {CATEGORIES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </Field>

      <div role="radiogroup" aria-label="Entry mode" className="grid grid-cols-2 gap-1 rounded-xl border border-line bg-ink-900 p-1 sm:max-w-sm">
        {(
          [
            ["quick", "Quick entry"],
            ["full", "All fields"],
          ] as const
        ).map(([id, text]) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={mode === id}
            onClick={() => setMode(id)}
            className={`h-11 rounded-lg text-sm font-semibold ${mode === id ? "bg-signal-500/15 text-signal-300" : "text-fg-muted hover:text-fg"}`}
          >
            {text}
          </button>
        ))}
      </div>

      {mode === "quick" && (
        <section aria-label="Quick entry" className="rounded-2xl border border-signal-400/40 bg-ink-900 px-4 py-3" data-section="quick">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{quickFields(item.category).map(renderField)}</div>
          <p className="mt-3 text-xs text-fg-muted">Everything else is in the sections below. Ladder and mounting heights are recorded as entered — Fieldwise doesn&apos;t assess ladder suitability.</p>
        </section>
      )}
      {mode === "quick" && <h3 className="-mb-1 text-xs font-semibold tracking-wide text-fg-muted uppercase">More details</h3>}

      {sectionOrder(item.category).map((id) => {
        const s = SECTIONS.find((x) => x.id === id)!;
        const fields = sectionFields(id, mode, item.category);
        if (id !== "custom" && fields.length === 0) return null;
        const n = filled(item, id, mode);
        const warn = id === "custom" ? 0 : warnings.filter((w) => fields.some((f) => f.key === w.field)).length;
        return (
          <details key={id} open={open.has(id)} onToggle={(e) => toggle(id, (e.currentTarget as HTMLDetailsElement).open)} className="rounded-2xl border border-line bg-ink-900" data-section={id}>
            <summary className="flex min-h-12 cursor-pointer items-center justify-between gap-2 px-4 py-2 text-[15px] font-semibold text-fg">
              <span>{s.title}</span>
              <span className="flex items-center gap-2 text-xs font-medium">
                {warn > 0 && <span className="text-amber-300">⚠ {warn}</span>}
                {n > 0 && <span className="text-fg-muted">{n} filled</span>}
              </span>
            </summary>
            <div className="border-t border-line px-4 py-3">
              {s.note && <p className="mb-3 text-xs leading-relaxed text-fg-muted">{s.note}</p>}
              {id === "custom" ? (
                <div className="flex flex-col gap-2">
                  {item.customFields.map((cf, i) => (
                    <div key={cf.id} className="grid grid-cols-[1fr_1fr_auto] items-end gap-2" data-custom-field>
                      <Field label={`Field name ${i + 1}`}>
                        <input className={inputClass} value={cf.name} onChange={(e) => set({ customFields: item.customFields.map((x) => (x.id === cf.id ? { ...x, name: e.target.value } : x)) })} />
                      </Field>
                      <Field label={`Value ${i + 1}`}>
                        <input className={inputClass} value={cf.value} onChange={(e) => set({ customFields: item.customFields.map((x) => (x.id === cf.id ? { ...x, value: e.target.value } : x)) })} />
                      </Field>
                      <button
                        type="button"
                        aria-label={`Remove custom field ${cf.name || i + 1}`}
                        onClick={() => set({ customFields: item.customFields.filter((x) => x.id !== cf.id) })}
                        className="h-11 w-11 rounded-lg border border-line-strong text-fg-muted hover:text-fault"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => set({ customFields: [...item.customFields, { id: newId(), name: "", value: "" }] })}
                    disabled={item.customFields.length >= 50}
                    className="h-11 self-start rounded-lg border border-line-strong px-3 text-sm font-medium text-fg hover:bg-ink-800 disabled:opacity-40"
                  >
                    + Add custom field
                  </button>
                  <p className="text-xs text-fg-muted">For anything else worth recording. Don&apos;t store passwords or access codes here.</p>
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">{fields.map(renderField)}</div>
              )}
            </div>
          </details>
        );
      })}

      {!isNew && (
        <details className="rounded-2xl border border-line bg-ink-900" data-section="history" open={history.length > 0 && history.length <= 5}>
          <summary className="flex min-h-12 cursor-pointer items-center justify-between gap-2 px-4 py-2 text-[15px] font-semibold text-fg">
            <span>Equipment history</span>
            <span className="text-xs font-medium text-fg-muted">{history.length ? `${history.length} event${history.length === 1 ? "" : "s"} · newest first` : "No events yet"}</span>
          </summary>
          <div className="border-t border-line px-4 py-3">
            {history.length === 0 ? (
              <p className="text-sm text-fg-muted">Changes saved here and service jobs linked to this site will appear here.</p>
            ) : (
              <ol className="flex flex-col gap-3" aria-label="Equipment history">
                {history.map((h) => (
                  <li key={h.id} className="border-l-2 border-signal-400/40 pl-3 text-sm" data-history={h.type}>
                    <p className="text-xs text-fg-muted">
                      {displayDate(eventDay(h))}
                      {h.technician ? ` · ${h.technician}` : ""}
                    </p>
                    <p className="font-semibold text-fg">{HISTORY_LABEL[h.type]}</p>
                    <p className="text-fg-muted">{h.description}</p>
                    {sourceState(h, reportIds) === "available" && (
                      <a href={`/reports?id=${encodeURIComponent(h.reportId)}`} className="text-xs font-medium text-signal-400 hover:text-signal-300">
                        Service report: {h.reportLabel || "open"}
                      </a>
                    )}
                    {sourceState(h, reportIds) === "deleted" && (
                      <p className="text-xs text-fg-subtle" data-source="deleted">
                        From service report {h.reportLabel ? `“${h.reportLabel}” ` : ""}— report since deleted
                      </p>
                    )}
                    {sourceState(h, reportIds) === "missing" && (
                      <p className="text-xs text-fg-subtle" data-source="missing">
                        From service report {h.reportLabel ? `“${h.reportLabel}” ` : ""}— not on this device
                      </p>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </div>
        </details>
      )}

      {!isNew && (
        <div className="rounded-2xl border border-line px-4 py-3">
          {confirmDelete ? (
            <p className="flex flex-wrap items-center gap-2 text-sm text-fg" role="alert">
              Delete {label} from this register?
              <button type="button" onClick={() => onDelete(item)} className="h-11 rounded-lg border border-fault/50 px-3 font-medium text-fault hover:bg-fault/10">
                Delete entry
              </button>
              <button type="button" onClick={() => setConfirmDelete(false)} className="h-11 rounded-lg border border-line-strong px-3 font-medium text-fg hover:bg-ink-800">
                Keep
              </button>
            </p>
          ) : (
            <button type="button" onClick={() => setConfirmDelete(true)} className="h-11 text-sm font-medium text-fg-muted hover:text-fault">
              Delete this entry…
            </button>
          )}
        </div>
      )}

      {/* Always reachable above the mobile bottom navigation. */}
      <div className="fixed inset-x-0 bottom-16 z-30 border-t border-line-strong bg-ink-900/95 px-4 py-3 backdrop-blur lg:bottom-0 lg:left-64">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-2">
          <button type="submit" className="h-11 rounded-lg bg-signal-500 px-5 text-[15px] font-semibold text-ink-950 hover:bg-signal-400">
            Save
          </button>
          <button type="button" onClick={() => onSave(item, "next")} className="h-11 rounded-lg border border-signal-400/60 px-3 text-sm font-semibold text-signal-300 hover:bg-signal-500/10">
            Save &amp; add another
          </button>
          <button type="button" onClick={() => onSave(item, "duplicate")} className="h-11 rounded-lg border border-line-strong px-3 text-sm font-medium text-fg hover:bg-ink-800">
            Save &amp; duplicate
          </button>
          <button type="button" onClick={() => onCancel(item, dirty)} className="ml-auto h-11 rounded-lg px-3 text-sm font-medium text-fg-muted hover:bg-ink-800 hover:text-fg">
            Cancel
          </button>
        </div>
      </div>
    </form>
  );
}
