/**
 * Technical Docs backup and restore: a versioned JSON file made and read on
 * this device only. A backup holds the site registers (equipment, custom
 * fields, history) plus the service reports linked to them, so links and
 * history stay valid after a restore.
 *
 * Reading never executes anything: the file is parsed as JSON and every
 * register and report is validated against the app's schemas; a file with
 * any invalid part, an unknown format/version or duplicate ids is rejected
 * as a whole. Imports are planned in memory first (previewed), and nothing
 * already on the device is overwritten silently — conflicting ids are
 * imported as copies with new ids.
 */
import { z } from "zod";
import { newId } from "@/lib/reports/report";
import { reportSchema, type Report } from "@/lib/reports/schema";
import { registerTitle } from "./register";
import { registerSchema, type TechRegister } from "./schema";

export const BACKUP_FORMAT = "fieldwise-techdocs-backup";
export const BACKUP_VERSION = 1;
/** Larger files are refused before parsing. */
export const MAX_BACKUP_BYTES = 25 * 1024 * 1024;

export interface Backup {
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_VERSION;
  exportedAt: string;
  registers: TechRegister[];
  reports: Report[];
}

const backupSchema = z.object({
  format: z.literal(BACKUP_FORMAT),
  version: z.literal(BACKUP_VERSION),
  exportedAt: z.string().max(40),
  registers: z.array(registerSchema).max(1000),
  reports: z.array(reportSchema).max(5000).default([]),
});

/** Reports that belong with these registers: linked to one, or holding an item picked from one. */
export function linkedReports(registers: TechRegister[], reports: Report[]): Report[] {
  const ids = new Set(registers.map((r) => r.id));
  return reports.filter((r) => ids.has(r.registerId) || r.equipment.some((i) => i.source && ids.has(i.source.registerId)));
}

export function createBackup(registers: TechRegister[], reports: Report[], now = new Date()): Backup {
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: now.toISOString(), registers, reports: linkedReports(registers, reports) };
}

export function backupFileName(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `Fieldwise-TechDocs-Backup-${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}.json`;
}

export type ParsedBackup = { ok: true; backup: Backup } | { ok: false; error: string };

/** Validates a backup file's text. Never throws; never evaluates content. */
export function parseBackup(text: string): ParsedBackup {
  if (text.length > MAX_BACKUP_BYTES) return { ok: false, error: "This file is too large to be a Fieldwise backup." };
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, error: "This file isn't valid JSON, so it can't be a Fieldwise backup." };
  }
  if (!json || typeof json !== "object" || (json as { format?: unknown }).format !== BACKUP_FORMAT) {
    return { ok: false, error: "This isn't a Fieldwise Technical Docs backup file." };
  }
  const version = (json as { version?: unknown }).version;
  if (version !== BACKUP_VERSION) {
    return { ok: false, error: `This backup uses format version ${String(version)}, which this version of Fieldwise can't read.` };
  }
  const parsed = backupSchema.safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: `The backup is damaged or incomplete (problem at ${issue?.path.join(".") || "top level"}). Nothing was imported.` };
  }
  const b = parsed.data as Backup;
  const dupe = (ids: string[]) => ids.find((id, i) => ids.indexOf(id) !== i);
  const dupeRegister = dupe(b.registers.map((r) => r.id));
  const dupeReport = dupe(b.reports.map((r) => r.id));
  if (dupeRegister || dupeReport) return { ok: false, error: "The backup contains duplicate ids, so it can't be imported safely. Nothing was imported." };
  for (const r of b.registers) {
    if (dupe(r.equipment.map((e) => e.id))) return { ok: false, error: `Register "${registerTitle(r)}" contains duplicate equipment ids. Nothing was imported.` };
  }
  return { ok: true, backup: b };
}

export interface BackupSummary {
  registers: number;
  equipment: number;
  historyEvents: number;
  reports: number;
  exportedAt: string;
  titles: string[];
}

export function summarise(b: Backup): BackupSummary {
  return {
    registers: b.registers.length,
    equipment: b.registers.reduce((n, r) => n + r.equipment.length, 0),
    historyEvents: b.registers.reduce((n, r) => n + r.history.length, 0),
    reports: b.reports.length,
    exportedAt: b.exportedAt,
    titles: b.registers.map(registerTitle),
  };
}

export type ImportMode = "merge" | "replace";

export interface ImportPlan {
  mode: ImportMode;
  /** Final lists to store if the import is confirmed. */
  registers: TechRegister[];
  reports: Report[];
  added: string[];
  /** Already on this device exactly as in the backup. */
  unchanged: string[];
  /** Same id but different content: imported as copies with new ids (existing data untouched). */
  copied: string[];
  /** Replace mode: registers on this device that will be removed. */
  removed: string[];
  reportsAdded: number;
  reportsCopied: number;
  /** Existing reports whose linked register won't exist after the import (they keep their recorded details). */
  orphanedReports: number;
}

/** JSON with object keys sorted, so equal content compares equal whatever the key order. */
function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (v && typeof v === "object") {
    return `{${Object.keys(v)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v) ?? "null";
}
const same = (a: unknown, b: unknown) => canonical(a) === canonical(b);

/** Plans an import against what's on the device. Pure: nothing is written. */
export function planImport(backup: Backup, existing: { registers: TechRegister[]; reports: Report[] }, mode: ImportMode, now = new Date()): ImportPlan {
  const plan: ImportPlan = { mode, registers: [], reports: [], added: [], unchanged: [], copied: [], removed: [], reportsAdded: 0, reportsCopied: 0, orphanedReports: 0 };
  const base = mode === "replace" ? [] : existing.registers;
  if (mode === "replace") plan.removed = existing.registers.map(registerTitle);
  const byId = new Map(base.map((r) => [r.id, r]));
  const usedRegisterIds = new Set([...existing.registers.map((r) => r.id), ...backup.registers.map((r) => r.id)]);
  const remap = new Map<string, string>();
  const incoming: TechRegister[] = [];

  for (const r of backup.registers) {
    const current = byId.get(r.id);
    if (!current) {
      incoming.push(r);
      plan.added.push(registerTitle(r));
    } else if (same(current, r)) {
      plan.unchanged.push(registerTitle(r));
    } else {
      let id = newId();
      while (usedRegisterIds.has(id)) id = newId();
      usedRegisterIds.add(id);
      remap.set(r.id, id);
      incoming.push({ ...r, id, name: `${registerTitle(r)} (imported ${now.toISOString().slice(0, 10)})` });
      plan.copied.push(registerTitle(r));
    }
  }
  plan.registers = [...base, ...incoming];

  // Reports: never overwrite one already on the device.
  const reportsById = new Map(existing.reports.map((r) => [r.id, r]));
  const usedReportIds = new Set([...existing.reports.map((r) => r.id), ...backup.reports.map((r) => r.id)]);
  const reportRemap = new Map<string, string>();
  const newReports: Report[] = [];
  for (const raw of backup.reports) {
    const r = remapReport(raw, remap);
    const current = reportsById.get(r.id);
    if (!current) {
      newReports.push(r);
      plan.reportsAdded++;
    } else if (!same(current, r)) {
      let id = newId();
      while (usedReportIds.has(id)) id = newId();
      usedReportIds.add(id);
      reportRemap.set(r.id, id);
      newReports.push({ ...r, id, reference: r.reference ? `${r.reference} (imported)` : "(imported)" });
      plan.reportsCopied++;
    }
  }
  // History in imported registers follows any report that was given a new id.
  if (reportRemap.size) {
    plan.registers = plan.registers.map((reg) =>
      incoming.includes(reg) ? { ...reg, history: reg.history.map((e) => (reportRemap.has(e.reportId) ? { ...e, reportId: reportRemap.get(e.reportId)! } : e)) } : reg,
    );
  }
  plan.reports = [...existing.reports, ...newReports];
  const finalIds = new Set(plan.registers.map((r) => r.id));
  plan.orphanedReports = existing.reports.filter((r) => r.registerId && !finalIds.has(r.registerId)).length;
  return plan;
}

function remapReport(r: Report, remap: Map<string, string>): Report {
  if (!remap.size) return r;
  const id = (x: string) => remap.get(x) ?? x;
  return { ...r, registerId: r.registerId && id(r.registerId), equipment: r.equipment.map((i) => (i.source ? { ...i, source: { ...i.source, registerId: id(i.source.registerId) } } : i)) };
}
