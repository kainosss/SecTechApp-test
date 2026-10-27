/**
 * Equipment history: factual events from user actions (adding an entry,
 * changing technical details, applying an update from a service job) and from
 * linked service reports. Descriptions only restate what was entered —
 * nothing is inferred about repairs or causes.
 */
import { newId } from "@/lib/reports/report";
import { FIELD_LABEL } from "./fields";
import { applyRegisterEdit, CATEGORY_LABEL, equipmentLabel, statusLabel, TEXT_FIELDS } from "./register";
import { HISTORY_TYPES, type Equipment, type HistoryChange, type HistoryEvent, type HistoryType, type TechRegister } from "./schema";

export const HISTORY_LABEL = Object.fromEntries(HISTORY_TYPES.map((t) => [t.id, t.label])) as Record<HistoryType, string>;

const customText = (e: Equipment) =>
  e.customFields
    .filter((f) => f.name.trim() || f.value.trim())
    .map((f) => `${f.name.trim() || "(unnamed)"}: ${f.value.trim()}`)
    .join("; ");

/** Field-level differences between two versions of an entry (values compared trimmed, reported as entered). */
export function fieldChanges(before: Equipment, after: Equipment): HistoryChange[] {
  const out: HistoryChange[] = [];
  if (before.category !== after.category) out.push({ field: "category", label: "Category", from: CATEGORY_LABEL[before.category], to: CATEGORY_LABEL[after.category] });
  for (const k of TEXT_FIELDS) {
    if (before[k].trim() !== after[k].trim()) out.push({ field: k, label: FIELD_LABEL[k], from: before[k].trim(), to: after[k].trim() });
  }
  if (before.status !== after.status) out.push({ field: "status", label: FIELD_LABEL.status, from: statusLabel(before.status), to: statusLabel(after.status) });
  if (customText(before) !== customText(after)) out.push({ field: "customFields", label: "Custom fields", from: customText(before), to: customText(after) });
  return out;
}

const describe = (c: HistoryChange) => (c.from ? `${c.label}: ${c.from} → ${c.to || "(cleared)"}` : `${c.label}: ${c.to}`);

export interface EventContext {
  equipmentId: string;
  equipmentName: string;
  technician: string;
  now: Date;
  reportId?: string;
  reportLabel?: string;
  date?: string;
}

/** Events for a set of changes: firmware gets its own "Firmware updated" event; everything else one "details changed" event. */
export function changeEvents(changes: HistoryChange[], ctx: EventContext): HistoryEvent[] {
  const base = {
    equipmentId: ctx.equipmentId,
    equipmentName: ctx.equipmentName,
    reportId: ctx.reportId ?? "",
    reportLabel: ctx.reportLabel ?? "",
    at: ctx.now.toISOString(),
    date: ctx.date ?? "",
    technician: ctx.technician,
  };
  const out: HistoryEvent[] = [];
  const fw = changes.filter((c) => c.field === "firmware");
  const rest = changes.filter((c) => c.field !== "firmware");
  if (fw.length) out.push({ ...base, id: newId(), type: "firmware", description: fw.map(describe).join("; "), changes: fw });
  if (rest.length) out.push({ ...base, id: newId(), type: "details", description: rest.map(describe).join("; "), changes: rest });
  return out;
}

export function addedEvent(item: Equipment, name: string, technician: string, now: Date): HistoryEvent {
  return { id: newId(), equipmentId: item.id, equipmentName: name, reportId: "", reportLabel: "", at: now.toISOString(), date: "", technician, type: "added", description: "Added to register", changes: [] };
}

/** Adds events, replacing any with the same id (so re-recording never duplicates). */
export function withHistory(register: TechRegister, events: HistoryEvent[]): TechRegister {
  if (!events.length) return register;
  const ids = new Set(events.map((e) => e.id));
  return { ...register, history: [...register.history.filter((e) => !ids.has(e.id)), ...events] };
}

/** The day an event belongs to: the job date for service events, otherwise when it was recorded (local date). */
export function eventDay(e: HistoryEvent): string {
  if (e.date) return e.date;
  const d = new Date(e.at);
  if (Number.isNaN(d.getTime())) return e.at.slice(0, 10);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** One entry's events, newest first (by day, then recording time). */
export function historyFor(register: TechRegister, equipmentId: string): HistoryEvent[] {
  return sortHistory(register.history.filter((e) => e.equipmentId === equipmentId));
}

export function sortHistory(events: HistoryEvent[]): HistoryEvent[] {
  return [...events].sort((a, b) => eventDay(b).localeCompare(eventDay(a)) || b.at.localeCompare(a.at) || a.id.localeCompare(b.id));
}

/**
 * Saves an entry from the Technical Docs form and records what happened:
 * "Added to register" for a new entry, or the changed fields for an existing one.
 */
export function saveWithHistory(register: TechRegister, item: Equipment, opts: { after?: string; technician: string; now?: Date }): TechRegister {
  const now = opts.now ?? new Date();
  const before = register.equipment.find((e) => e.id === item.id);
  const next = applyRegisterEdit(register, { type: "save-item", item, after: opts.after }, now);
  const name = equipmentLabel(next, item);
  if (!before) return withHistory(next, [addedEvent(item, name, opts.technician, now)]);
  return withHistory(next, changeEvents(fieldChanges(before, item), { equipmentId: item.id, equipmentName: name, technician: opts.technician, now }));
}
