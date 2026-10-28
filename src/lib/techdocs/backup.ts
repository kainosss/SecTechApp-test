/**
 * Fieldwise backup and restore: a versioned JSON file made and read on this
 * device only.
 *
 * Version 2 ("fieldwise-backup") is a complete backup: every Technical Docs
 * register (equipment, custom fields, history), every service report (with
 * its links to register equipment) and the company branding, logo included.
 * Version 1 files ("fieldwise-techdocs-backup", v0.7.1) still import: they
 * hold registers plus their linked reports and no branding.
 *
 * Reading never executes anything: the file is parsed as JSON and every part
 * is validated against the app's schemas (logos by their real file signature
 * too); a file with any invalid part, an unknown format/version or duplicate
 * ids is rejected as a whole. Imports are planned in memory and previewed;
 * nothing on the device is overwritten silently — conflicting ids are
 * imported as copies, branding conflicts are the technician's choice, and
 * replacing data needs explicit confirmation.
 */
import { z } from "zod";
import { brandingSchema, checkLogoBytes, EMPTY_BRANDING, type Branding } from "@/lib/handover/branding";
import { newId } from "@/lib/reports/report";
import { reportSchema, type Report } from "@/lib/reports/schema";
import { registerTitle } from "./register";
import { registerSchema, type TechRegister } from "./schema";

export const BACKUP_FORMAT = "fieldwise-backup";
export const BACKUP_VERSION = 2;
/** The v0.7.1 Technical Docs backup format, still accepted. */
export const LEGACY_FORMAT = "fieldwise-techdocs-backup";
/** Larger files are refused before parsing. */
export const MAX_BACKUP_BYTES = 25 * 1024 * 1024;

export interface Backup {
  format: typeof BACKUP_FORMAT | typeof LEGACY_FORMAT;
  version: 1 | 2;
  exportedAt: string;
  /** True for complete (v2) backups; v1 files only hold reports linked to their registers. */
  complete: boolean;
  registers: TechRegister[];
  reports: Report[];
  branding: Branding | null;
}

const legacySchema = z.object({
  format: z.literal(LEGACY_FORMAT),
  version: z.literal(1),
  exportedAt: z.string().max(40),
  registers: z.array(registerSchema).max(1000),
  reports: z.array(reportSchema).max(5000).default([]),
});

const backupSchema = z.object({
  format: z.literal(BACKUP_FORMAT),
  version: z.literal(BACKUP_VERSION),
  exportedAt: z.string().max(40),
  registers: z.array(registerSchema).max(1000),
  reports: z.array(reportSchema).max(5000),
  branding: brandingSchema.nullable(),
});

/** Reports that belong with these registers: linked to one, or holding an item picked from one. */
export function linkedReports(registers: TechRegister[], reports: Report[]): Report[] {
  const ids = new Set(registers.map((r) => r.id));
  return reports.filter((r) => ids.has(r.registerId) || r.equipment.some((i) => i.source && ids.has(i.source.registerId)));
}

const isEmptyBranding = (b: Branding) => same(brandingSchema.parse(b), EMPTY_BRANDING);

/** A complete backup of everything Fieldwise stores for this technician. */
export function createBackup(registers: TechRegister[], reports: Report[], branding: Branding = EMPTY_BRANDING, now = new Date()): Backup {
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: now.toISOString(), complete: true, registers, reports, branding: isEmptyBranding(branding) ? null : branding };
}

/** The file content (the `complete` flag is derived when reading, so it isn't written). */
export function backupJson(b: Backup): string {
  const { complete: _complete, ...file } = b;
  void _complete;
  return JSON.stringify(file, null, 1);
}

export function backupFileName(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `Fieldwise-Backup-${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}.json`;
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
  const format = json && typeof json === "object" ? (json as { format?: unknown }).format : undefined;
  if (format !== BACKUP_FORMAT && format !== LEGACY_FORMAT) return { ok: false, error: "This isn't a Fieldwise backup file." };
  const version = (json as { version?: unknown }).version;
  if ((format === LEGACY_FORMAT && version !== 1) || (format === BACKUP_FORMAT && version !== BACKUP_VERSION)) {
    return { ok: false, error: `This backup uses format version ${String(version)}, which this version of Fieldwise can't read.` };
  }
  const parsed = format === LEGACY_FORMAT ? legacySchema.safeParse(json) : backupSchema.safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: `The backup is damaged or incomplete (problem at ${issue?.path.join(".") || "top level"}). Nothing was imported.` };
  }
  const data = parsed.data as z.infer<typeof backupSchema> | z.infer<typeof legacySchema>;
  const branding = "branding" in data ? data.branding : null;
  if (branding?.logo) {
    // The logo must really be the image type it claims to be.
    const b64 = branding.logo.dataUrl.slice(branding.logo.dataUrl.indexOf(",") + 1);
    let bytes: Uint8Array;
    try {
      const bin = atob(b64);
      bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    } catch {
      return { ok: false, error: "The company logo in this backup is damaged. Nothing was imported." };
    }
    const check = checkLogoBytes(bytes);
    if (!check.ok || check.format !== branding.logo.format) return { ok: false, error: "The company logo in this backup isn't a valid PNG or JPEG image. Nothing was imported." };
  }
  const b: Backup = { ...data, complete: format === BACKUP_FORMAT, branding } as Backup;
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
  complete: boolean;
  /** Company name in the backup's branding ("" if unnamed), or null when it has no branding. */
  branding: { companyName: string; logo: boolean } | null;
}

export function summarise(b: Backup): BackupSummary {
  return {
    registers: b.registers.length,
    equipment: b.registers.reduce((n, r) => n + r.equipment.length, 0),
    historyEvents: b.registers.reduce((n, r) => n + r.history.length, 0),
    reports: b.reports.length,
    exportedAt: b.exportedAt,
    titles: b.registers.map(registerTitle),
    complete: b.complete,
    branding: b.branding ? { companyName: b.branding.companyName.trim(), logo: Boolean(b.branding.logo) } : null,
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
  /** Replace mode with a complete backup: reports on this device that will be removed. */
  reportsRemoved: number;
  /** Branding to store, and what happens to it. */
  branding: Branding;
  brandingAction: "none" | "added" | "unchanged" | "replaced" | "kept";
  /** Merge with different branding on both sides: the technician chooses (`brandingChoice`). */
  brandingConflict: boolean;
}

export interface ExistingData {
  registers: TechRegister[];
  reports: Report[];
  branding?: Branding;
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
export function planImport(backup: Backup, existing: ExistingData, mode: ImportMode, opts: { brandingChoice?: "keep" | "import"; now?: Date } = {}): ImportPlan {
  const now = opts.now ?? new Date();
  const currentBranding = existing.branding ?? EMPTY_BRANDING;
  const plan: ImportPlan = {
    mode,
    registers: [],
    reports: [],
    added: [],
    unchanged: [],
    copied: [],
    removed: [],
    reportsAdded: 0,
    reportsCopied: 0,
    orphanedReports: 0,
    reportsRemoved: 0,
    branding: currentBranding,
    brandingAction: "none",
    brandingConflict: false,
  };
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

  // Reports: never overwrite one already on the device. Replacing with a complete backup replaces the reports too
  // (confirmed by the technician); a v1 backup only adds its linked reports.
  const keptReports = mode === "replace" && backup.complete ? [] : existing.reports;
  if (mode === "replace" && backup.complete) plan.reportsRemoved = existing.reports.length;
  const reportsById = new Map(keptReports.map((r) => [r.id, r]));
  const usedReportIds = new Set([...keptReports.map((r) => r.id), ...backup.reports.map((r) => r.id)]);
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
  plan.reports = [...keptReports, ...newReports];
  const finalIds = new Set(plan.registers.map((r) => r.id));
  plan.orphanedReports = keptReports.filter((r) => r.registerId && !finalIds.has(r.registerId)).length;

  // Branding: added when there is none here; on a conflict, merge follows the technician's choice and replace
  // takes the backup's. A backup without branding never removes the branding on this device.
  if (backup.branding) {
    if (isEmptyBranding(currentBranding)) {
      plan.branding = backup.branding;
      plan.brandingAction = "added";
    } else if (same(brandingSchema.parse(currentBranding), backup.branding)) {
      plan.brandingAction = "unchanged";
    } else {
      plan.brandingConflict = mode === "merge";
      const take = mode === "replace" || opts.brandingChoice === "import";
      plan.branding = take ? backup.branding : currentBranding;
      plan.brandingAction = take ? "replaced" : "kept";
    }
  }
  return plan;
}

function remapReport(r: Report, remap: Map<string, string>): Report {
  if (!remap.size) return r;
  const id = (x: string) => remap.get(x) ?? x;
  return { ...r, registerId: r.registerId && id(r.registerId), equipment: r.equipment.map((i) => (i.source ? { ...i, source: { ...i.source, registerId: id(i.source.registerId) } } : i)) };
}
