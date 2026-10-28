import { beforeEach, describe, expect, it } from "vitest";
import { BACKUP_META_KEY, parseMeta, readMetaRaw, recordBackup, shouldRemind, snoozeReminder } from "@/lib/backup/meta";

const now = new Date("2026-11-20T10:00:00.000Z");
const days = (n: number) => new Date(now.getTime() - n * 864e5).toISOString();

beforeEach(() => window.localStorage.clear());

describe("backup reminder rules", () => {
  it("stays quiet with no data", () => {
    expect(shouldRemind({ lastBackupAt: "", snoozedUntil: "" }, "", now)).toBe(false);
  });
  it("reminds when there has never been a backup", () => {
    expect(shouldRemind({ lastBackupAt: "", snoozedUntil: "" }, days(0), now)).toBe(true);
  });
  it("doesn't remind when nothing changed since the last backup", () => {
    expect(shouldRemind({ lastBackupAt: days(30), snoozedUntil: "" }, days(31), now)).toBe(false);
  });
  it("reminds a week after a backup when there are newer changes", () => {
    expect(shouldRemind({ lastBackupAt: days(3), snoozedUntil: "" }, days(1), now)).toBe(false);
    expect(shouldRemind({ lastBackupAt: days(8), snoozedUntil: "" }, days(1), now)).toBe(true);
  });
  it("respects a snooze", () => {
    expect(shouldRemind({ lastBackupAt: "", snoozedUntil: new Date(now.getTime() + 864e5).toISOString() }, days(0), now)).toBe(false);
    expect(shouldRemind({ lastBackupAt: "", snoozedUntil: days(1) }, days(0), now)).toBe(true);
  });
  it("records dates only, and survives damaged storage", () => {
    recordBackup(now);
    expect(parseMeta(readMetaRaw())).toEqual({ lastBackupAt: now.toISOString(), snoozedUntil: "" });
    snoozeReminder(now);
    expect(parseMeta(readMetaRaw()).snoozedUntil > now.toISOString()).toBe(true);
    window.localStorage.setItem(BACKUP_META_KEY, "{broken");
    expect(parseMeta(readMetaRaw())).toEqual({ lastBackupAt: "", snoozedUntil: "" });
  });
});
