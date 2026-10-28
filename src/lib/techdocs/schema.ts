/**
 * Technical Documentation: standalone site equipment registers (independent of
 * service reports). Everything is entered by the technician and stored on this
 * device only; values are kept exactly as typed (warnings never rewrite them).
 * Credentials, passwords and access codes are deliberately not fields.
 */
import { z } from "zod";

export const CATEGORIES = [
  { id: "ip-camera", label: "IP camera" },
  { id: "nvr", label: "NVR / server" },
  { id: "network", label: "Network switch / device" },
  { id: "alarm-panel", label: "Alarm panel / controller" },
  { id: "detector", label: "Alarm detector" },
  { id: "access-reader", label: "Access reader / door hardware" },
  { id: "access-controller", label: "Access controller" },
  { id: "power", label: "Power supply" },
  { id: "other", label: "Other" },
] as const;
export type Category = (typeof CATEGORIES)[number]["id"];

/** Operational status; "" means not recorded (never assumed). */
export const OP_STATUSES = [
  { id: "operational", label: "Operational" },
  { id: "attention", label: "Needs attention" },
  { id: "faulty", label: "Faulty" },
  { id: "offline", label: "Offline" },
  { id: "not-tested", label: "Not tested" },
] as const;
export type OpStatus = (typeof OP_STATUSES)[number]["id"];

/** Long notes are fine; a runaway paste can't fill storage. */
const text = (max = 5000) => z.string().max(max).default("");
const short = () => text(200);

export const customFieldSchema = z.object({
  id: z.string().min(1).max(64),
  name: text(100),
  value: text(2000),
});
export type CustomField = z.infer<typeof customFieldSchema>;

export const equipmentSchema = z.object({
  id: z.string().min(1).max(64),
  category: z.enum(CATEGORIES.map((c) => c.id) as [Category, ...Category[]]).default("other"),
  // Identification
  name: short(),
  type: short(),
  location: short(),
  assetId: text(100),
  // Hardware
  make: short(),
  model: short(),
  serial: text(100),
  firmware: text(100),
  hardwareRevision: text(100),
  // Networking (kept as typed; see validation.ts for warnings)
  ip: text(100),
  subnet: text(100),
  gateway: text(100),
  dns1: text(100),
  dns2: text(100),
  vlan: text(20),
  mac: text(50),
  hostname: short(),
  // Connectivity
  switchName: short(),
  switchPort: text(50),
  poe: short(),
  connectedTo: short(),
  systemRef: short(),
  // Site access — ladder and mounting height are separate; neither is inferred from the other.
  ladderHeight: text(100),
  ladderType: text(100),
  mountingHeight: text(100),
  accessNotes: text(),
  // Security system references
  cameraNumber: text(50),
  doorNumber: text(50),
  zoneNumber: text(50),
  controller: short(),
  nvrVms: short(),
  // Maintenance
  status: z.union([z.literal(""), z.enum(OP_STATUSES.map((s) => s.id) as [OpStatus, ...OpStatus[]])]).default(""),
  fault: text(),
  work: text(),
  recommendations: text(),
  notes: text(),
  /** YYYY-MM-DD, or empty. */
  lastInspected: z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]).default(""),
  customFields: z.array(customFieldSchema).max(50).default([]),
});
export type Equipment = z.infer<typeof equipmentSchema>;
/** Every editable text field of an equipment entry. */
export type EquipmentTextField = Exclude<keyof Equipment, "id" | "category" | "status" | "customFields">;

export const HISTORY_TYPES = [
  { id: "added", label: "Added to register" },
  { id: "inspection", label: "Service inspection" },
  { id: "fault", label: "Fault recorded" },
  { id: "repaired", label: "Repair completed" },
  { id: "replaced", label: "Equipment replaced" },
  { id: "firmware", label: "Firmware updated" },
  { id: "details", label: "Technical details changed" },
] as const;
export type HistoryType = (typeof HISTORY_TYPES)[number]["id"];

export const historyChangeSchema = z.object({ field: z.string().max(40), label: text(100), from: text(2000), to: text(2000) });
export type HistoryChange = z.infer<typeof historyChangeSchema>;

/** A factual event in an equipment entry's history (from a user action or a linked service report). */
export const historyEventSchema = z.object({
  id: z.string().min(1).max(200),
  equipmentId: z.string().min(1).max(64),
  /** Equipment name at the time, so history stays readable if the entry is renamed or removed. */
  equipmentName: text(200),
  reportId: z.string().max(64).default(""),
  /** Short report description (site · reference) at the time of the event. */
  reportLabel: text(300),
  /** When it was recorded (ISO). */
  at: z.string().max(40),
  /** Job date for service events (YYYY-MM-DD), or "". */
  date: z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]).default(""),
  technician: text(200),
  type: z.enum(HISTORY_TYPES.map((t) => t.id) as [HistoryType, ...HistoryType[]]),
  description: text(5000),
  changes: z.array(historyChangeSchema).max(100).default([]),
  /**
   * Set (ISO) when the service report this event came from was deleted. The event stays — it records what
   * happened — but it no longer points to a report.
   */
  sourceDeletedAt: z.string().max(40).default(""),
});
export type HistoryEvent = z.infer<typeof historyEventSchema>;

export const REGISTER_VERSION = 1;

export const registerSchema = z.object({
  id: z.string().min(1).max(64),
  version: z.literal(REGISTER_VERSION),
  createdAt: z.string(),
  updatedAt: z.string(),
  name: short(),
  siteName: short(),
  customer: short(),
  siteAddress: text(500),
  siteReference: text(100),
  technician: short(),
  notes: text(10000),
  equipment: z.array(equipmentSchema).max(2000).default([]),
  /** Equipment service and change history (optional, so v0.7.0 registers load unchanged). */
  history: z.array(historyEventSchema).max(20000).default([]),
});
export type TechRegister = z.infer<typeof registerSchema>;
