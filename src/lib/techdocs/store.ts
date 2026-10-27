/**
 * Technical registers, stored in this browser only (same approach as report
 * drafts). Each register is validated on read; damaged or outdated entries are
 * skipped and counted rather than breaking the list. Nothing is sent anywhere,
 * and register contents are never logged.
 */
import { z } from "zod";
import { readRaw as readReportsRaw, REPORTS_KEY, writeAll as writeReports } from "@/lib/reports/store";
import type { Report } from "@/lib/reports/schema";
import { registerSchema, type TechRegister } from "./schema";

export const REGISTERS_KEY = "fieldwise:techdocs:v1";
export const REGISTERS_EVENT = "fieldwise:techdocs";

const containerSchema = z.object({ version: z.literal(1), registers: z.record(z.string(), z.unknown()) });

export interface LoadedRegisters {
  registers: TechRegister[];
  skipped: number;
}

export function parseRegisters(raw: string | null): LoadedRegisters {
  if (!raw) return { registers: [], skipped: 0 };
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { registers: [], skipped: 1 };
  }
  const c = containerSchema.safeParse(json);
  if (!c.success) return { registers: [], skipped: 1 };
  const registers: TechRegister[] = [];
  let skipped = 0;
  for (const value of Object.values(c.data.registers)) {
    const r = registerSchema.safeParse(value);
    if (r.success) registers.push(r.data);
    else skipped++;
  }
  registers.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return { registers, skipped };
}

export function readRegistersRaw(): string | null {
  try {
    return window.localStorage.getItem(REGISTERS_KEY);
  } catch {
    return null;
  }
}

/** Writes all registers; returns false if storage is unavailable or full. */
export function writeAll(registers: TechRegister[]): boolean {
  let ok = true;
  try {
    window.localStorage.setItem(REGISTERS_KEY, JSON.stringify({ version: 1, registers: Object.fromEntries(registers.map((r) => [r.id, r])) }));
  } catch {
    ok = false;
  }
  window.dispatchEvent(new Event(REGISTERS_EVENT));
  return ok;
}

export function loadRegisters(): LoadedRegisters {
  return parseRegisters(readRegistersRaw());
}

export function getRegister(id: string): TechRegister | null {
  return loadRegisters().registers.find((r) => r.id === id) ?? null;
}

/** Saves (inserts or replaces) one register. */
export function saveRegister(register: TechRegister): boolean {
  const { registers } = loadRegisters();
  return writeAll([register, ...registers.filter((r) => r.id !== register.id)]);
}

export function deleteRegister(id: string): boolean {
  return writeAll(loadRegisters().registers.filter((r) => r.id !== id));
}

export function subscribeRegisters(cb: () => void) {
  window.addEventListener(REGISTERS_EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(REGISTERS_EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

function restoreRaw(key: string, raw: string | null) {
  try {
    if (raw === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, raw);
  } catch {
    // Storage unavailable: nothing more can be done.
  }
}

/**
 * Stores the result of a confirmed import: registers, then reports. If either
 * write fails (e.g. storage full), both are put back exactly as they were.
 */
export function commitImport(registers: TechRegister[], reports: Report[]): boolean {
  const prevRegisters = readRegistersRaw();
  const prevReports = readReportsRaw();
  if (!writeAll(registers)) {
    restoreRaw(REGISTERS_KEY, prevRegisters);
    window.dispatchEvent(new Event(REGISTERS_EVENT));
    return false;
  }
  if (!writeReports(reports)) {
    restoreRaw(REGISTERS_KEY, prevRegisters);
    restoreRaw(REPORTS_KEY, prevReports);
    window.dispatchEvent(new Event(REGISTERS_EVENT));
    return false;
  }
  return true;
}

/** Saves a register only if it changed (used when service reports update history). */
export function updateRegister(id: string, fn: (r: TechRegister) => TechRegister): TechRegister | null {
  const current = getRegister(id);
  if (!current) return null;
  const next = fn(current);
  if (next !== current) saveRegister(next);
  return next;
}
