import { loadBranding } from "@/lib/handover/branding";
import { loadReports } from "@/lib/reports/store";
import { backupFileName, backupJson, createBackup } from "@/lib/techdocs/backup";
import { loadRegisters } from "@/lib/techdocs/store";
import { recordBackup } from "./meta";

/** Downloads a complete backup (registers, reports, branding) and records the date locally. Returns the file name. */
export function downloadFullBackup(now = new Date()): string {
  const name = backupFileName(now);
  const backup = createBackup(loadRegisters().registers, loadReports().reports, loadBranding(), now);
  const url = URL.createObjectURL(new Blob([backupJson(backup)], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  recordBackup(now);
  return name;
}

/** Newest change across registers and reports (ISO), or "" when there is no data. */
export function latestChange(registers: { updatedAt: string }[], reports: { updatedAt: string }[]): string {
  return [...registers, ...reports].reduce((m, x) => (x.updatedAt > m ? x.updatedAt : m), "");
}
