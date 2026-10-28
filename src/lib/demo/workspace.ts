/**
 * Entering, resetting and leaving the demo workspace. Demo records are only
 * ever written to the "fieldwise:demo:…" keys; the technician's real records
 * are never read, changed or copied by anything here.
 */
import { BACKUP_META_KEY } from "@/lib/backup/meta";
import { BRANDING_KEY } from "@/lib/handover/branding";
import { REPORTS_KEY, TECHNICIAN_KEY, writeAll as writeReports } from "@/lib/reports/store";
import { REGISTERS_KEY, writeAll as writeRegisters } from "@/lib/techdocs/store";
import { demoKey, isDemoWorkspace, setDemoWorkspace } from "@/lib/workspace";
import { buildDemoData } from "./seed";

export const DEMO_KEYS = [REGISTERS_KEY, REPORTS_KEY, TECHNICIAN_KEY, BRANDING_KEY, BACKUP_META_KEY].map(demoKey);

/**
 * Switches to the demo workspace and writes a fresh copy of the demo site
 * through the normal stores, which then address the demo keys only. If the
 * switch can't be stored, nothing is written. Returns false on failure.
 */
function seedDemo(): boolean {
  setDemoWorkspace(true);
  if (!isDemoWorkspace()) return false;
  const { registers, reports } = buildDemoData();
  try {
    for (const key of DEMO_KEYS) window.localStorage.removeItem(key);
  } catch {
    return false;
  }
  return writeRegisters(registers) && writeReports(reports);
}

function hasDemoData(): boolean {
  try {
    return window.localStorage.getItem(demoKey(REGISTERS_KEY)) !== null;
  } catch {
    return false;
  }
}

/** Switches to the demo workspace, creating the demo site the first time. Changes made earlier in the demo are kept. */
export function enterDemo(): boolean {
  if (hasDemoData()) {
    setDemoWorkspace(true);
    return isDemoWorkspace();
  }
  return seedDemo();
}

/** Discards every change made in the demo and restores the original demo site. Real records are untouched. */
export function resetDemo(): boolean {
  return seedDemo();
}

/** Back to the technician's own records. Demo data stays in its own keys for next time. */
export function exitDemo() {
  setDemoWorkspace(false);
}
