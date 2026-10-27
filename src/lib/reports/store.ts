/**
 * Report drafts and the technician profile, stored in this browser only.
 * Each saved report is validated on read; corrupted or outdated entries are
 * skipped (and counted) rather than breaking the list. Nothing is sent anywhere.
 */
import { z } from "zod";
import { reportSchema, technicianSchema, type Report, type TechnicianProfile } from "./schema";

export const REPORTS_KEY = "fieldwise:reports:v1";
export const TECHNICIAN_KEY = "fieldwise:technician:v1";
export const REPORTS_EVENT = "fieldwise:reports";

const containerSchema = z.object({ version: z.literal(1), reports: z.record(z.string(), z.unknown()) });

export interface LoadedReports {
  reports: Report[];
  /** Saved entries that couldn't be read (corrupted or from an unsupported version). */
  skipped: number;
}

export function parseReports(raw: string | null): LoadedReports {
  if (!raw) return { reports: [], skipped: 0 };
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { reports: [], skipped: 1 };
  }
  const c = containerSchema.safeParse(json);
  if (!c.success) return { reports: [], skipped: 1 };
  const reports: Report[] = [];
  let skipped = 0;
  for (const value of Object.values(c.data.reports)) {
    const r = reportSchema.safeParse(value);
    if (r.success) reports.push(r.data);
    else skipped++;
  }
  reports.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return { reports, skipped };
}

export function readRaw(): string | null {
  try {
    return window.localStorage.getItem(REPORTS_KEY);
  } catch {
    return null;
  }
}

/** Writes all reports; returns false if storage is unavailable or full. */
export function writeAll(reports: Report[]): boolean {
  let ok = true;
  try {
    window.localStorage.setItem(REPORTS_KEY, JSON.stringify({ version: 1, reports: Object.fromEntries(reports.map((r) => [r.id, r])) }));
  } catch {
    ok = false;
  }
  window.dispatchEvent(new Event(REPORTS_EVENT));
  return ok;
}

export function loadReports(): LoadedReports {
  return parseReports(readRaw());
}

export function getReport(id: string): Report | null {
  return loadReports().reports.find((r) => r.id === id) ?? null;
}

/** Saves (inserts or replaces) one report. Unreadable entries already in storage are kept out. */
export function saveReport(report: Report): boolean {
  const { reports } = loadReports();
  return writeAll([report, ...reports.filter((r) => r.id !== report.id)]);
}

export function deleteReport(id: string): boolean {
  return writeAll(loadReports().reports.filter((r) => r.id !== id));
}

export function clearReports() {
  try {
    window.localStorage.removeItem(REPORTS_KEY);
  } catch {
    // Nothing stored or storage unavailable.
  }
  window.dispatchEvent(new Event(REPORTS_EVENT));
}

export function subscribeReports(cb: () => void) {
  window.addEventListener(REPORTS_EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(REPORTS_EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

export function loadTechnician(): TechnicianProfile {
  try {
    const r = technicianSchema.safeParse(JSON.parse(window.localStorage.getItem(TECHNICIAN_KEY) ?? "null"));
    return r.success ? r.data : { name: "", company: "" };
  } catch {
    return { name: "", company: "" };
  }
}

export function saveTechnician(profile: TechnicianProfile) {
  try {
    window.localStorage.setItem(TECHNICIAN_KEY, JSON.stringify(profile));
  } catch {
    // Won't persist.
  }
}
