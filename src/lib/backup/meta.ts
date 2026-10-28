/**
 * Local backup bookkeeping: when a complete backup was last downloaded on
 * this device, and whether the reminder is snoozed. Only dates are stored —
 * no copy of any data — and nothing leaves the device.
 */
import { onWorkspaceChange, scopedKey } from "@/lib/workspace";
import { z } from "zod";

export const BACKUP_META_KEY = "fieldwise:backup-meta:v1";
export const BACKUP_META_EVENT = "fieldwise:backup-meta";
/** Remind when changes are older than this since the last backup. */
export const REMIND_AFTER_DAYS = 7;
export const SNOOZE_DAYS = 7;

const metaSchema = z.object({ lastBackupAt: z.string().max(40).default(""), snoozedUntil: z.string().max(40).default("") });
export type BackupMeta = z.infer<typeof metaSchema>;
const EMPTY: BackupMeta = { lastBackupAt: "", snoozedUntil: "" };

export function readMetaRaw(): string {
  try {
    return window.localStorage.getItem(scopedKey(BACKUP_META_KEY)) ?? "";
  } catch {
    return "";
  }
}

export function parseMeta(raw: string): BackupMeta {
  try {
    const r = metaSchema.safeParse(JSON.parse(raw || "null"));
    return r.success ? r.data : EMPTY;
  } catch {
    return EMPTY;
  }
}

function write(meta: BackupMeta) {
  try {
    window.localStorage.setItem(scopedKey(BACKUP_META_KEY), JSON.stringify(meta));
  } catch {
    // Not stored: the reminder simply shows again.
  }
  window.dispatchEvent(new Event(BACKUP_META_EVENT));
}

export function recordBackup(now = new Date()) {
  write({ ...parseMeta(readMetaRaw()), lastBackupAt: now.toISOString(), snoozedUntil: "" });
}

export function snoozeReminder(now = new Date()) {
  write({ ...parseMeta(readMetaRaw()), snoozedUntil: new Date(now.getTime() + SNOOZE_DAYS * 864e5).toISOString() });
}

export function subscribeMeta(cb: () => void) {
  window.addEventListener(BACKUP_META_EVENT, cb);
  window.addEventListener("storage", cb);
  const offWorkspace = onWorkspaceChange(cb);
  return () => {
    window.removeEventListener(BACKUP_META_EVENT, cb);
    window.removeEventListener("storage", cb);
    offWorkspace();
  };
}

/**
 * Remind only when there is data changed since the last backup, that change is
 * at least a week old (or there has never been a backup), and the reminder
 * isn't snoozed — so it doesn't appear on every visit.
 */
export function shouldRemind(meta: BackupMeta, latestChange: string, now = new Date()): boolean {
  if (!latestChange) return false;
  if (meta.snoozedUntil && meta.snoozedUntil > now.toISOString()) return false;
  if (!meta.lastBackupAt) return true;
  if (latestChange <= meta.lastBackupAt) return false;
  return now.getTime() - new Date(meta.lastBackupAt).getTime() >= REMIND_AFTER_DAYS * 864e5;
}
