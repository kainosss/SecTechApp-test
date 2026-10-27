"use client";

import { useEffect, useMemo, useReducer, useState, useSyncExternalStore } from "react";
import { areaClass, Field, inputClass } from "@/components/reports/EquipmentCard";
import { Icon } from "@/components/ui/Icon";
import { useUrlSearch } from "@/lib/eol/use-url-selection";
import { loadTechnician } from "@/lib/reports/store";
import { downloadTechWorkbook } from "@/lib/techdocs/download";
import { applyRegisterEdit, blankEquipment, CATEGORY_LABEL, duplicateEquipment, equipmentLabel, filterEquipment, registerTitle, statusLabel, type EquipmentFilter, type RegisterEdit } from "@/lib/techdocs/register";
import { CATEGORIES, OP_STATUSES, type Category, type Equipment, type TechRegister } from "@/lib/techdocs/schema";
import { getRegister, parseRegisters, readRegistersRaw, saveRegister, subscribeRegisters } from "@/lib/techdocs/store";
import { historyFor, saveWithHistory } from "@/lib/techdocs/history";
import { duplicateIps } from "@/lib/techdocs/validation";
import { EquipmentForm, type SaveMode } from "./EquipmentForm";

interface Draft {
  item: Equipment;
  isNew: boolean;
  after?: string;
  duplicatedFrom?: string;
  /** The form added a history entry (so closing it goes Back). */
  pushed?: boolean;
}

interface State {
  register: TechRegister | null;
  loaded: boolean;
}

type Action =
  | { type: "load"; register: TechRegister | null }
  | { type: "edit"; edit: RegisterEdit }
  /** The form's Save: also records "added" or the changed fields in the equipment history. */
  | { type: "save"; item: Equipment; after?: string };

function reducer(state: State, action: Action): State {
  if (action.type === "load") return { loaded: true, register: action.register };
  if (!state.register) return state;
  if (action.type === "save") return { ...state, register: saveWithHistory(state.register, action.item, { after: action.after, technician: state.register.technician.trim() }) };
  return { ...state, register: applyRegisterEdit(state.register, action.edit) };
}

const STATUS_PILL: Record<string, string> = {
  operational: "bg-verified/15 text-verified",
  attention: "bg-amber-300/15 text-amber-300",
  faulty: "bg-fault/15 text-fault",
  offline: "bg-fault/15 text-fault",
  "not-tested": "bg-ink-800 text-fg-muted",
};

/** Edits one technical register. Register details save as you type; equipment saves from its form. */
export function RegisterEditor({ id, onClose }: { id: string; onClose: () => void }) {
  const [{ register, loaded }, dispatch] = useReducer(reducer, { register: null, loaded: false });
  const { search, setSearch } = useUrlSearch();
  const itemParam = new URLSearchParams(search).get("item");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [notice, setNotice] = useState<{ text: string; restore?: () => void } | null>(null);
  const [filter, setFilter] = useState<EquipmentFilter>({ query: "", category: "", status: "" });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState<boolean | null>(null);
  const [seenParam, setSeenParam] = useState<string | null>(null);
  const raw = useSyncExternalStore(subscribeRegisters, () => readRegistersRaw() ?? "", () => "");
  const stored = useMemo(() => parseRegisters(raw || null).registers.find((r) => r.id === id), [raw, id]);

  useEffect(() => {
    dispatch({ type: "load", register: getRegister(id) });
  }, [id]);

  // Autosave: every committed change goes straight to this device's storage.
  useEffect(() => {
    if (register) saveRegister(register);
  }, [register]);

  // Details start open for a new register and collapsed once it has a name (decided once, so typing doesn't collapse them).
  if (register && detailsOpen === null) setDetailsOpen(!(register.siteName || register.name));

  // The form is a history entry, so the phone's Back closes it (unsaved changes can be restored).
  // Synced while rendering when the URL changes, rather than in an effect.
  if (register && seenParam !== itemParam) {
    setSeenParam(itemParam);
    if (draft && itemParam !== draft.item.id) {
      const d = draft;
      setDraft(null);
      const changed = JSON.stringify(d.item) !== JSON.stringify(d.isNew ? null : register.equipment.find((e) => e.id === d.item.id));
      if (changed) setNotice({ text: `Unsaved changes to ${equipmentLabel(register, d.item)} were discarded.`, restore: () => openDraft(d) });
    } else if (!draft && itemParam) {
      // Reopened from a link or reload: open the saved entry (a stale "new entry" URL is ignored).
      const existing = register.equipment.find((e) => e.id === itemParam);
      if (existing) setDraft({ item: existing, isNew: false });
    }
  }

  if (!loaded) return <p className="text-sm text-fg-muted">Loading register…</p>;
  if (!register) {
    return (
      <div className="rounded-2xl border border-line bg-ink-900 p-4 text-sm" role="alert">
        <p className="font-semibold text-fg">This register isn&apos;t saved on this device.</p>
        <p className="mt-1 text-fg-muted">It may have been deleted, or saved in a different browser.</p>
        <button type="button" onClick={onClose} className="mt-3 h-11 rounded-lg border border-line-strong px-4 font-medium text-fg hover:bg-ink-800">
          Back to registers
        </button>
      </div>
    );
  }

  const edit = (e: RegisterEdit) => dispatch({ type: "edit", edit: e });
  const set = (patch: Extract<RegisterEdit, { type: "set" }>["patch"]) => edit({ type: "set", patch });
  const saved = stored?.updatedAt === register.updatedAt;

  function openDraft(d: Draft) {
    setNotice(null);
    const url = `?id=${encodeURIComponent(id)}&item=${encodeURIComponent(d.item.id)}`;
    setSearch(url, draft?.pushed ? "replace" : "push");
    setDraft({ ...d, pushed: true });
  }
  function closeDraft() {
    const wasPushed = draft?.pushed;
    setDraft(null);
    if (wasPushed) window.history.back();
    else setSearch(`?id=${encodeURIComponent(id)}`, "replace");
    window.scrollTo?.({ top: 0 });
  }
  const add = (category: Category) => openDraft({ item: blankEquipment(category), isNew: true });
  const duplicate = (e: Equipment) => openDraft({ item: duplicateEquipment(e), isNew: true, after: e.id, duplicatedFrom: equipmentLabel(register, e) });

  function save(item: Equipment, mode: SaveMode) {
    dispatch({ type: "save", item, after: draft?.isNew ? draft.after : undefined });
    const label = equipmentLabel(register!.equipment.some((e) => e.id === item.id) ? register! : { ...register!, equipment: [...register!.equipment, item] }, item);
    if (mode === "close") {
      closeDraft();
      setNotice({ text: `Saved ${label}.` });
    } else if (mode === "next") {
      // Keep the category and type for the next device; everything else starts blank.
      openDraft({ item: { ...blankEquipment(item.category), type: item.type }, isNew: true, after: item.id });
      setNotice({ text: `Saved ${label}.` });
    } else {
      openDraft({ item: duplicateEquipment(item), isNew: true, after: item.id, duplicatedFrom: label });
    }
  }

  if (draft) {
    return (
      <div className="flex flex-col gap-3">
        <button type="button" onClick={closeDraft} className="-ml-2 inline-flex h-10 items-center gap-1 self-start rounded-lg px-2 text-sm font-medium text-fg-muted hover:bg-ink-850 hover:text-fg">
          <Icon name="chevron-right" className="size-4 rotate-180" />
          {registerTitle(register)}
        </button>
        {notice && (
          <p className="rounded-lg bg-ink-850 px-3 py-2 text-sm text-verified" role="status">
            ✓ {notice.text}
          </p>
        )}
        <EquipmentForm
          key={draft.item.id}
          history={draft.isNew ? [] : historyFor(register, draft.item.id)}
          register={register}
          initial={draft.item}
          isNew={draft.isNew}
          duplicatedFrom={draft.duplicatedFrom}
          onSave={save}
          onCancel={(d, dirty) => {
            closeDraft();
            if (dirty) setNotice({ text: `Changes to ${equipmentLabel(register, d)} were not saved.`, restore: () => openDraft({ ...draft, item: d }) });
          }}
          onDelete={(item) => {
            const index = register.equipment.findIndex((e) => e.id === item.id);
            const original = register.equipment[index]!;
            edit({ type: "remove-item", id: item.id });
            closeDraft();
            setNotice({ text: `Deleted ${equipmentLabel(register, original)}.`, restore: () => edit({ type: "restore-item", item: original, index }) });
          }}
        />
      </div>
    );
  }

  const shown = filterEquipment(register, filter);
  const dupes = duplicateIps(register);
  const filtering = Boolean(filter.query || filter.category || filter.status);
  const showDetails = detailsOpen ?? true;

  async function exportXlsx() {
    setBusy(true);
    setMessage(null);
    try {
      setMessage(`Downloaded ${await downloadTechWorkbook(register!)}`);
    } catch {
      setMessage("Couldn't create the Excel file. Your register is still saved — try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 pb-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button type="button" onClick={onClose} className="-ml-2 inline-flex h-10 items-center gap-1 rounded-lg px-2 text-sm font-medium text-fg-muted hover:bg-ink-850 hover:text-fg">
          <Icon name="chevron-right" className="size-4 rotate-180" />
          All registers
        </button>
        <p className={`text-xs font-medium ${saved ? "text-verified" : "text-amber-300"}`} role="status" data-testid="save-status">
          {saved ? "✓ Saved on this device" : "Saving…"}
        </p>
      </div>

      <section aria-label="Register details" className="rounded-2xl border border-line bg-ink-900">
        <button type="button" onClick={() => setDetailsOpen(!showDetails)} aria-expanded={showDetails} className="flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left">
          <span className="min-w-0 flex-1">
            <span className="block truncate text-lg font-semibold text-fg">{registerTitle(register)}</span>
            <span className="block truncate text-xs text-fg-muted">
              {[register.siteName, register.customer, register.siteReference].filter(Boolean).join(" · ") || "Add site and customer details"}
            </span>
          </span>
          <span className="text-xs font-medium text-signal-400">{showDetails ? "Done" : "Edit details"}</span>
        </button>
        {showDetails && (
          <div className="grid gap-3 border-t border-line px-4 py-3 sm:grid-cols-2">
            <Field label="Register name">
              <input className={inputClass} value={register.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Building C CCTV" />
            </Field>
            <Field label="Site name">
              <input className={inputClass} value={register.siteName} onChange={(e) => set({ siteName: e.target.value })} />
            </Field>
            <Field label="Customer">
              <input className={inputClass} value={register.customer} onChange={(e) => set({ customer: e.target.value })} />
            </Field>
            <Field label="Site reference">
              <input className={inputClass} value={register.siteReference} onChange={(e) => set({ siteReference: e.target.value })} />
            </Field>
            <Field label="Technician">
              <input className={inputClass} value={register.technician} onChange={(e) => set({ technician: e.target.value })} />
            </Field>
            <Field label="Site address">
              <textarea className={areaClass} rows={2} value={register.siteAddress} onChange={(e) => set({ siteAddress: e.target.value })} />
            </Field>
            <div className="sm:col-span-2">
              <Field label="General site notes">
                <textarea className={areaClass} rows={3} value={register.notes} onChange={(e) => set({ notes: e.target.value })} />
              </Field>
            </div>
            <p className="text-xs text-fg-subtle sm:col-span-2">
              Created {new Date(register.createdAt).toLocaleDateString("en-AU")} · Updated {new Date(register.updatedAt).toLocaleString("en-AU")}
            </p>
          </div>
        )}
      </section>

      {notice && (
        <p className="flex items-center justify-between gap-2 rounded-lg bg-ink-850 px-3 py-2 text-sm text-fg" role="status">
          {notice.text}
          {notice.restore && (
            <button type="button" onClick={notice.restore} className="h-9 px-2 font-semibold text-signal-400 hover:text-signal-300">
              {notice.text.startsWith("Deleted") ? "Undo" : "Restore"}
            </button>
          )}
        </p>
      )}

      <section aria-labelledby="add-heading" className="rounded-2xl border border-line bg-ink-900 p-4">
        <h2 id="add-heading" className="text-[15px] font-semibold text-fg">
          Add equipment
        </h2>
        {/* One scrollable row on phones so the register itself stays near the top; wraps on wider screens. */}
        <div role="group" aria-label="Add equipment by category" className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
          {CATEGORIES.map((c) => (
            <button key={c.id} type="button" onClick={() => add(c.id)} className="h-11 shrink-0 rounded-xl border border-line-strong bg-ink-850 px-3 text-sm font-semibold whitespace-nowrap text-fg hover:border-signal-400 hover:bg-ink-800">
              + {c.label}
            </button>
          ))}
        </div>
      </section>

      <section aria-labelledby="equipment-heading" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end gap-2">
          <h2 id="equipment-heading" className="mr-auto text-[15px] font-semibold text-fg">
            Equipment ({filtering ? `${shown.length} of ${register.equipment.length}` : register.equipment.length})
          </h2>
        </div>
        {register.equipment.length > 0 && (
          <div className="grid gap-2 sm:grid-cols-[2fr_1fr_1fr]">
            <input
              type="search"
              aria-label="Search equipment"
              className={inputClass}
              placeholder="Search name, ref, location, make, model, IP, serial"
              value={filter.query}
              onChange={(e) => setFilter({ ...filter, query: e.target.value })}
            />
            <select aria-label="Filter by category" className={inputClass} value={filter.category} onChange={(e) => setFilter({ ...filter, category: e.target.value as Category | "" })}>
              <option value="">All categories</option>
              {CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
            <select aria-label="Filter by status" className={inputClass} value={filter.status} onChange={(e) => setFilter({ ...filter, status: e.target.value as EquipmentFilter["status"] })}>
              <option value="">All statuses</option>
              {OP_STATUSES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
              <option value="none">Status not recorded</option>
            </select>
          </div>
        )}
        {dupes.size > 0 && (
          <p className="text-sm text-amber-300" role="note">
            ⚠ {dupes.size} IP address{dupes.size === 1 ? " is" : "es are"} used by more than one entry: {[...dupes.keys()].slice(0, 5).join(", ")}
            {dupes.size > 5 ? "…" : ""}
          </p>
        )}

        {register.equipment.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line-strong px-4 py-6 text-center text-sm text-fg-muted">No equipment yet. Pick a category above to add the first entry.</p>
        ) : shown.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line-strong px-4 py-6 text-center text-sm text-fg-muted">
            No equipment matches.{" "}
            <button type="button" onClick={() => setFilter({ query: "", category: "", status: "" })} className="font-semibold text-signal-400">
              Clear search and filters
            </button>
          </p>
        ) : (
          <div className="rounded-2xl border border-line bg-ink-900">
            {/* Column headings for the wide (desktop) table layout. */}
            <div aria-hidden="true" className="hidden grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1.3fr)_8.5rem_7rem_7.5rem_5.5rem] gap-3 border-b border-line px-4 py-2 text-[11px] font-semibold tracking-wide text-fg-subtle uppercase xl:grid">
              <span>Name / ref</span>
              <span>Type</span>
              <span>Location</span>
              <span>Make / model</span>
              <span>IP address</span>
              <span>Firmware</span>
              <span>Status</span>
              <span />
            </div>
            <ul aria-label="Equipment register" className="divide-y divide-line">
              {shown.map((e) => {
                const label = equipmentLabel(register, e);
                const dupe = e.ip.trim() && dupes.has(e.ip.trim().toLowerCase());
                const status = statusLabel(e.status);
                return (
                  <li key={e.id} data-equipment={e.id} className="relative flex items-stretch gap-2 px-4 py-2 xl:grid xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1.3fr)_8.5rem_7rem_7.5rem_5.5rem] xl:items-start xl:gap-3 xl:py-3">
                    <button type="button" onClick={() => openDraft({ item: e, isNew: false })} className="min-h-11 min-w-0 flex-1 text-left xl:contents" aria-label={`Open ${label}`}>
                      <span className="block min-w-0">
                        <span className="block truncate text-[15px] font-semibold text-fg xl:text-sm xl:break-words xl:whitespace-normal">{label}</span>
                        {e.assetId && <span className="hidden font-mono text-xs break-all text-fg-muted xl:block">{e.assetId}</span>}
                      </span>
                      <span className="block truncate text-xs text-fg-muted xl:hidden">
                        {[e.assetId, e.type || CATEGORY_LABEL[e.category], e.location].filter(Boolean).join(" · ")}
                      </span>
                      <span className="block truncate text-xs text-fg-muted xl:hidden">
                        {[[e.make, e.model].filter(Boolean).join(" "), e.ip, e.firmware && `FW ${e.firmware}`].filter(Boolean).join(" · ")}
                        {dupe ? " ⚠ duplicate IP" : ""}
                      </span>
                      <span className="hidden text-sm break-words text-fg-muted xl:block">{e.type || CATEGORY_LABEL[e.category]}</span>
                      <span className="hidden text-sm break-words text-fg-muted xl:block">{e.location}</span>
                      <span className="hidden text-sm break-words text-fg-muted xl:block">
                        {e.make && <span className="block">{e.make}</span>}
                        {e.model && <span className="block text-fg">{e.model}</span>}
                      </span>
                      <span className={`hidden font-mono text-xs break-all xl:block ${dupe ? "text-amber-300" : "text-fg-muted"}`}>
                        {e.ip}
                        {dupe ? " ⚠" : ""}
                      </span>
                      <span className="hidden font-mono text-xs break-all text-fg-muted xl:block">{e.firmware}</span>
                    </button>
                    <span className="flex shrink-0 flex-col items-end justify-center gap-1 xl:contents">
                      {status ? (
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_PILL[e.status]}`} data-status={e.status}>
                          {status}
                        </span>
                      ) : (
                        <span className="text-xs text-fg-subtle">—</span>
                      )}
                      <button type="button" onClick={() => duplicate(e)} className="h-9 rounded-lg px-2 text-xs font-medium text-fg-muted hover:bg-ink-800 hover:text-fg" aria-label={`Duplicate ${label}`}>
                        Duplicate
                      </button>
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </section>

      <section aria-labelledby="export-heading" className="rounded-2xl border border-line bg-ink-900 p-4">
        <h2 id="export-heading" className="text-[15px] font-semibold text-fg">
          Export
        </h2>
        <p className="mt-1 text-sm text-fg-muted" role="note" data-testid="sensitive-notice">
          <span className="font-semibold text-amber-300">Sensitive:</span> the workbook can contain site network and access details. Share it only with people who need it.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button type="button" onClick={exportXlsx} disabled={busy} className="h-12 rounded-xl bg-signal-500 px-5 text-[15px] font-semibold text-ink-950 hover:bg-signal-400 disabled:opacity-60">
            {busy ? "Creating…" : "Export Excel"}
          </button>
          {message && (
            <span className="text-sm text-fg-muted" role="status">
              {message}
            </span>
          )}
        </div>
      </section>
    </div>
  );
}

/** Technician name remembered from service reports, used for new registers. */
export function defaultTechnician(): string {
  return loadTechnician().name;
}
