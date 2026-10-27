/**
 * Pure register operations: create, edit and duplicate equipment, labels,
 * search and filters. Nothing is generated: no addresses, references or
 * values are ever assigned automatically.
 */
import { newId } from "@/lib/reports/report";
import { CATEGORIES, OP_STATUSES, REGISTER_VERSION, type Category, type Equipment, type EquipmentTextField, type OpStatus, type TechRegister } from "./schema";

export function createRegister(technician = "", now = new Date()): TechRegister {
  const iso = now.toISOString();
  return { id: newId(), version: REGISTER_VERSION, createdAt: iso, updatedAt: iso, name: "", siteName: "", customer: "", siteAddress: "", siteReference: "", technician, notes: "", equipment: [], history: [] };
}

const EMPTY_TEXT: Record<EquipmentTextField, string> = {
  name: "", type: "", location: "", assetId: "",
  make: "", model: "", serial: "", firmware: "", hardwareRevision: "",
  ip: "", subnet: "", gateway: "", dns1: "", dns2: "", vlan: "", mac: "", hostname: "",
  switchName: "", switchPort: "", poe: "", connectedTo: "", systemRef: "",
  ladderHeight: "", ladderType: "", mountingHeight: "", accessNotes: "",
  cameraNumber: "", doorNumber: "", zoneNumber: "", controller: "", nvrVms: "",
  fault: "", work: "", recommendations: "", notes: "", lastInspected: "",
};
export const TEXT_FIELDS = Object.keys(EMPTY_TEXT) as EquipmentTextField[];

export function blankEquipment(category: Category = "other"): Equipment {
  return { id: newId(), category, ...EMPTY_TEXT, status: "", customFields: [] };
}

/**
 * Cleared when an entry is duplicated: identifiers unique to one device, and
 * observations about that device. Make, model, firmware, network settings that
 * are usually shared (subnet, gateway, DNS, VLAN), switch, access details and
 * custom fields are kept.
 */
export const DUPLICATE_CLEARS: readonly (EquipmentTextField | "status")[] = [
  "name", "assetId", "serial", "ip", "mac", "hostname", "switchPort",
  "cameraNumber", "doorNumber", "zoneNumber", "status", "fault", "work", "recommendations", "lastInspected",
];
/** Unique identifiers — named in the UI so technicians know what a duplicate leaves blank. */
export const UNIQUE_IDENTIFIERS: readonly EquipmentTextField[] = ["assetId", "serial", "ip", "mac", "hostname"];

export function duplicateEquipment(item: Equipment): Equipment {
  const copy: Equipment = { ...item, id: newId(), customFields: item.customFields.map((f) => ({ ...f, id: newId() })) };
  for (const key of DUPLICATE_CLEARS) (copy as Record<string, unknown>)[key] = "";
  return copy;
}

/** Display name: the entered name, else "Type n" / "Category n" among unnamed entries of that kind. */
export function equipmentLabel(register: TechRegister, item: Equipment): string {
  if (item.name.trim()) return item.name.trim();
  const base = (e: Equipment) => e.type.trim() || CATEGORY_LABEL[e.category];
  const same = register.equipment.filter((e) => !e.name.trim() && base(e) === base(item));
  const n = same.findIndex((e) => e.id === item.id);
  return `${base(item)}${n >= 0 ? ` ${n + 1}` : ""}`;
}

/** How a register is identified in lists and file names. */
export function registerTitle(r: TechRegister): string {
  return r.name.trim() || r.siteName.trim() || "Untitled register";
}

export const CATEGORY_LABEL = Object.fromEntries(CATEGORIES.map((c) => [c.id, c.label])) as Record<Category, string>;
export const STATUS_LABEL = Object.fromEntries(OP_STATUSES.map((s) => [s.id, s.label])) as Record<OpStatus, string>;
export const statusLabel = (s: Equipment["status"]) => (s ? STATUS_LABEL[s] : "");

/* ------------------------------------------------------------- edits */

export type RegisterEdit =
  | { type: "set"; patch: Partial<Omit<TechRegister, "id" | "version" | "equipment" | "createdAt" | "updatedAt">> }
  /** Inserts a new entry, or replaces the entry with the same id (the form's Save). */
  | { type: "save-item"; item: Equipment; after?: string }
  | { type: "remove-item"; id: string }
  | { type: "restore-item"; item: Equipment; index: number };

export function applyRegisterEdit(register: TechRegister, edit: RegisterEdit, now = new Date()): TechRegister {
  const touch = (r: TechRegister) => ({ ...r, updatedAt: now.toISOString() });
  const eq = register.equipment;
  switch (edit.type) {
    case "set":
      return touch({ ...register, ...edit.patch });
    case "save-item": {
      const i = eq.findIndex((e) => e.id === edit.item.id);
      if (i >= 0) return touch({ ...register, equipment: eq.map((e, k) => (k === i ? edit.item : e)) });
      const after = edit.after ? eq.findIndex((e) => e.id === edit.after) : -1;
      return touch({ ...register, equipment: after < 0 ? [...eq, edit.item] : [...eq.slice(0, after + 1), edit.item, ...eq.slice(after + 1)] });
    }
    case "remove-item":
      return eq.some((e) => e.id === edit.id) ? touch({ ...register, equipment: eq.filter((e) => e.id !== edit.id) }) : register;
    case "restore-item": {
      if (eq.some((e) => e.id === edit.item.id)) return register;
      const i = Math.max(0, Math.min(edit.index, eq.length));
      return touch({ ...register, equipment: [...eq.slice(0, i), edit.item, ...eq.slice(i)] });
    }
  }
}

/** A copy of a whole register (new id, " (copy)" name), e.g. to start the next site from a template. */
export function duplicateRegister(r: TechRegister, now = new Date()): TechRegister {
  const iso = now.toISOString();
  // History belongs to the original site's equipment, so the copy starts without it.
  return { ...structuredClone(r), id: newId(), name: `${registerTitle(r)} (copy)`, createdAt: iso, updatedAt: iso, history: [] };
}

/* ------------------------------------------------------- search, filters */

/** Fields searched: name, reference, location, make, model, IP, serial (plus type, hostname, MAC and display name). */
const SEARCH_FIELDS: EquipmentTextField[] = ["name", "assetId", "location", "make", "model", "ip", "serial", "type", "hostname", "mac"];

export interface EquipmentFilter {
  query?: string;
  category?: Category | "";
  /** "none" = status not recorded. */
  status?: Equipment["status"] | "none";
}

export function filterEquipment(register: TechRegister, f: EquipmentFilter): Equipment[] {
  // The query is matched as a phrase ("dock 2" finds Dock 2, not every dock with a 2 somewhere).
  const q = (f.query ?? "").toLowerCase().replace(/\s+/g, " ").trim();
  return register.equipment.filter((e) => {
    if (f.category && e.category !== f.category) return false;
    if (f.status === "none" ? e.status !== "" : f.status && e.status !== f.status) return false;
    if (!q) return true;
    return [...SEARCH_FIELDS.map((k) => e[k]), equipmentLabel(register, e)].some((v) => v.toLowerCase().replace(/\s+/g, " ").includes(q));
  });
}

/** True when the entry has any network value entered. */
export function hasNetworkConfig(e: Equipment): boolean {
  return [e.ip, e.subnet, e.gateway, e.dns1, e.dns2, e.vlan, e.mac, e.hostname, e.switchName, e.switchPort].some((v) => v.trim());
}

export function exportFileName(r: TechRegister, now = new Date()): string {
  const base = registerTitle(r)
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  const p = (n: number) => String(n).padStart(2, "0");
  return `Fieldwise-Technical-${base || "Register"}-${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}.xlsx`;
}
