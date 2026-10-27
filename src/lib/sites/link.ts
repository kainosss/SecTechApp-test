/**
 * Links service reports to Technical Docs site registers.
 *
 * - The register is the source of truth for equipment configuration. A report
 *   item only keeps a stable reference (register + equipment id) and a
 *   snapshot of identifying details as they were when added (no network
 *   settings), so the report stays historically accurate.
 * - Site details are copied into the report only into empty fields, unless
 *   the technician confirms replacing what's there.
 * - Service history events are derived from the report under fixed ids, so
 *   syncing again (reopening, editing, exporting) updates rather than duplicates.
 * - Master records change only through `applyEquipmentUpdate`, with the
 *   original values checked and only the confirmed fields written.
 */
import { blankItem, itemLabel, STATUS_LABEL } from "@/lib/reports/report";
import type { Report, ReportItem } from "@/lib/reports/schema";
import { FIELD_LABEL } from "@/lib/techdocs/fields";
import { changeEvents, withHistory } from "@/lib/techdocs/history";
import { CATEGORY_LABEL, equipmentLabel } from "@/lib/techdocs/register";
import type { Equipment, EquipmentTextField, HistoryChange, HistoryEvent, TechRegister } from "@/lib/techdocs/schema";

/* ------------------------------------------------------------ site link */

const SITE_FIELDS = [
  ["siteName", "Site name", (r: TechRegister) => r.siteName.trim() || r.name.trim()],
  ["customer", "Customer", (r: TechRegister) => r.customer.trim()],
  ["siteAddress", "Site address", (r: TechRegister) => r.siteAddress.trim()],
] as const;

export interface SiteField {
  field: (typeof SITE_FIELDS)[number][0];
  label: string;
  current: string;
  incoming: string;
}

/** What linking would copy: `fills` go into empty fields; `conflicts` differ from what the report already has. */
export function sitePopulation(report: Report, register: TechRegister): { fills: SiteField[]; conflicts: SiteField[] } {
  const fills: SiteField[] = [];
  const conflicts: SiteField[] = [];
  for (const [field, label, get] of SITE_FIELDS) {
    const incoming = get(register);
    const current = report[field].trim();
    if (!incoming || incoming === current) continue;
    (current ? conflicts : fills).push({ field, label, current, incoming });
  }
  return { fills, conflicts };
}

/** Links the report and copies site details into empty fields (and over existing ones only when `replace` is confirmed). */
export function linkReport(report: Report, register: TechRegister, replace: boolean, now = new Date()): Report {
  const { fills, conflicts } = sitePopulation(report, register);
  const patch: Partial<Report> = { registerId: register.id };
  for (const f of [...fills, ...(replace ? conflicts : [])]) patch[f.field] = f.incoming;
  return { ...report, ...patch, updatedAt: now.toISOString() };
}

/** Unlinks the report; its items keep their recorded details and source references. */
export function unlinkReport(report: Report, now = new Date()): Report {
  return { ...report, registerId: "", updatedAt: now.toISOString() };
}

export function reportLabel(report: Report): string {
  return [report.siteName.trim() || "Untitled report", report.reference.trim(), report.date].filter(Boolean).join(" · ");
}

/* -------------------------------------------------------- picked items */

export function equipmentSnapshot(register: TechRegister, e: Equipment, now = new Date()): NonNullable<ReportItem["source"]>["snapshot"] {
  return {
    name: equipmentLabel(register, e),
    category: CATEGORY_LABEL[e.category],
    type: e.type.trim(),
    location: e.location.trim(),
    assetId: e.assetId.trim(),
    make: e.make.trim(),
    model: e.model.trim(),
    serial: e.serial.trim(),
    firmware: e.firmware.trim(),
    capturedAt: now.toISOString(),
  };
}

/** A report item for a register entry: identifying details copied for the report, status and results left for the job. */
export function linkedItem(register: TechRegister, e: Equipment, now = new Date()): ReportItem {
  const snapshot = equipmentSnapshot(register, e, now);
  return {
    ...blankItem(snapshot.type || snapshot.category),
    name: snapshot.name,
    location: snapshot.location,
    makeModel: [snapshot.make, snapshot.model].filter(Boolean).join(" "),
    source: { registerId: register.id, equipmentId: e.id, snapshot, outcome: "", applied: [] },
  };
}

/** Equipment ids from this register already in the report (for duplicate prevention in the picker). */
export function linkedEquipmentIds(report: Report, registerId: string): Set<string> {
  return new Set(report.equipment.flatMap((i) => (i.source?.registerId === registerId ? [i.source.equipmentId] : [])));
}

const SNAPSHOT_FIELDS = ["name", "location", "assetId", "make", "model", "serial", "firmware"] as const;
const SNAPSHOT_LABEL: Record<(typeof SNAPSHOT_FIELDS)[number], string> = { name: "Name", location: "Location", assetId: "Asset ID", make: "Make", model: "Model", serial: "Serial number", firmware: "Firmware" };

/** Where the site record now differs from what this report recorded (the report keeps its own copy). */
export function snapshotDifferences(register: TechRegister, item: ReportItem): { label: string; recorded: string; now: string }[] {
  const e = item.source && register.equipment.find((x) => x.id === item.source!.equipmentId);
  if (!e || !item.source) return [];
  const current = equipmentSnapshot(register, e);
  return SNAPSHOT_FIELDS.filter((k) => current[k] !== item.source!.snapshot[k]).map((k) => ({ label: SNAPSHOT_LABEL[k], recorded: item.source!.snapshot[k], now: current[k] }));
}

/* ------------------------------------------------------- service history */

const SERVICE_TYPES = new Set<HistoryEvent["type"]>(["inspection", "fault", "repaired", "replaced"]);

const sentence = (label: string, text: string) => {
  const t = text.trim().replace(/\s*\n\s*/g, "; ").replace(/[.;\s]+$/, "");
  return t ? ` ${label}: ${t}.` : "";
};

/** Service events for the report's linked items in this register (factual restatement of what was entered). */
export function serviceEvents(report: Report, register: TechRegister): HistoryEvent[] {
  if (report.registerId !== register.id) return [];
  const ids = new Set(register.equipment.map((e) => e.id));
  const events: HistoryEvent[] = [];
  for (const item of report.equipment) {
    const src = item.source;
    if (!src || src.registerId !== register.id || !ids.has(src.equipmentId)) continue;
    const base = {
      equipmentId: src.equipmentId,
      equipmentName: itemLabel(report, item),
      reportId: report.id,
      reportLabel: reportLabel(report),
      at: report.updatedAt,
      date: report.date,
      technician: report.technician.trim(),
      changes: [] as HistoryChange[],
    };
    const fault = item.status === "fault";
    const outcome = src.outcome;
    events.push({
      ...base,
      id: `${report.id}:${item.id}:service`,
      type: fault ? "fault" : "inspection",
      description: `${fault ? "Fault recorded" : `Service inspection — ${STATUS_LABEL[item.status]}`}.${sentence("Findings", item.findings)}${outcome ? "" : sentence("Work completed", item.work)}${sentence("Recommendations", item.recommendations)}`,
    });
    if (outcome) {
      events.push({
        ...base,
        id: `${report.id}:${item.id}:${outcome}`,
        type: outcome,
        description: `${outcome === "replaced" ? "Equipment replaced" : "Repair completed"}.${sentence("Work completed", item.work)}`,
      });
    }
  }
  return events;
}

const comparable = (e: HistoryEvent) => JSON.stringify({ ...e, at: "" });

/**
 * Brings the register's history in line with the report: this report's
 * service events are replaced by freshly derived ones (fixed ids, so no
 * duplicates); events from applied updates and other reports are kept.
 * Returns the same register object when nothing changed.
 */
export function syncReportHistory(register: TechRegister, report: Report): TechRegister {
  const mine = (e: HistoryEvent) => e.reportId === report.id && SERVICE_TYPES.has(e.type);
  const existing = register.history.filter(mine);
  const derived = serviceEvents(report, register);
  const byId = new Map(existing.map((e) => [e.id, e]));
  // Keep the original recording time when an event's content hasn't changed.
  const next = derived.map((e) => {
    const old = byId.get(e.id);
    return old && comparable(old) === comparable(e) ? old : e;
  });
  if (existing.length === next.length && existing.every((e, i) => e === next[i])) return register;
  return { ...register, history: [...register.history.filter((e) => !mine(e)), ...next] };
}

/* -------------------------------------------------- proposed updates */

/** Master fields a service job may propose changes to (shown with the original value before anything is applied). */
export const UPDATABLE_FIELDS: EquipmentTextField[] = [
  "make", "model", "serial", "firmware", "hardwareRevision", "assetId", "location",
  "ip", "subnet", "gateway", "dns1", "dns2", "vlan", "mac", "hostname",
  "switchName", "switchPort", "poe", "connectedTo",
  "ladderHeight", "ladderType", "mountingHeight", "accessNotes",
];

/** Turns entered proposals into changes against the current master values; unchanged or blank proposals are ignored. */
export function proposedChanges(current: Equipment, proposed: Partial<Record<EquipmentTextField, string>>): HistoryChange[] {
  return UPDATABLE_FIELDS.flatMap((k) => {
    const to = proposed[k]?.trim();
    if (!to || to === current[k].trim()) return [];
    return [{ field: k, label: FIELD_LABEL[k], from: current[k].trim(), to }];
  });
}

export interface UpdateResult {
  register: TechRegister;
  applied: HistoryChange[];
  /** Fields whose master value changed since the proposal was reviewed — not applied. */
  conflicts: HistoryChange[];
}

/**
 * Applies confirmed changes to one master entry: only the given fields, and
 * only where the master value still matches the reviewed original. Records
 * history events linked to the report.
 */
export function applyEquipmentUpdate(register: TechRegister, equipmentId: string, changes: HistoryChange[], report: Report, now = new Date()): UpdateResult {
  const i = register.equipment.findIndex((e) => e.id === equipmentId);
  if (i < 0) return { register, applied: [], conflicts: changes };
  const current = register.equipment[i]!;
  const applied: HistoryChange[] = [];
  const conflicts: HistoryChange[] = [];
  const next: Equipment = { ...current };
  for (const c of changes) {
    const key = c.field as EquipmentTextField;
    if (!UPDATABLE_FIELDS.includes(key) || current[key].trim() !== c.from) conflicts.push(c);
    else {
      next[key] = c.to;
      applied.push(c);
    }
  }
  if (!applied.length) return { register, applied, conflicts };
  const updated: TechRegister = { ...register, equipment: register.equipment.map((e, k) => (k === i ? next : e)), updatedAt: now.toISOString() };
  const events = changeEvents(applied, {
    equipmentId,
    equipmentName: equipmentLabel(updated, next),
    technician: report.technician.trim(),
    now,
    reportId: report.id,
    reportLabel: reportLabel(report),
    date: report.date,
  });
  return { register: withHistory(updated, events), applied, conflicts };
}
