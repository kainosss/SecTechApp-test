import { beforeEach, describe, expect, it } from "vitest";
import { applyEdit, createReport } from "@/lib/reports/report";
import { loadReports, saveReport } from "@/lib/reports/store";
import { linkedItem, linkReport, syncReportHistory } from "@/lib/sites/link";
import { BACKUP_FORMAT, createBackup, linkedReports, parseBackup, planImport, summarise } from "@/lib/techdocs/backup";
import { commitImport, loadRegisters, REGISTERS_KEY, saveRegister } from "@/lib/techdocs/store";
import type { TechRegister } from "@/lib/techdocs/schema";
import { accessSystem, cctvInstall, intruderSystem, mixedSite } from "./fixtures";

/** Three sites, two linked jobs with history, one standalone job. */
function dataset() {
  let cctv = cctvInstall();
  const access = accessSystem();
  const intruder = intruderSystem();
  let job1 = linkReport({ ...createReport("cctv", "Alex"), date: "2026-11-03" }, cctv, false);
  job1 = applyEdit(job1, { type: "add-items", items: [linkedItem(cctv, cctv.equipment[2]!)] });
  job1 = applyEdit(job1, { type: "update-item", id: job1.equipment[0]!.id, patch: { status: "fault", findings: "No video" } });
  cctv = syncReportHistory(cctv, job1);
  const job2 = linkReport(createReport("access"), access, false);
  const standalone = { ...createReport("general"), siteName: "Elsewhere" };
  return { registers: [cctv, access, intruder], reports: [job1, job2, standalone], cctv, access, intruder, job1, job2, standalone };
}
const roundTrip = (registers: TechRegister[], reports = dataset().reports) => {
  const parsed = parseBackup(JSON.stringify(createBackup(registers, reports, new Date(2026, 10, 4))));
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.backup;
};

describe("backup file", () => {
  it("includes registers, equipment, custom fields, history, ids and linked reports only", () => {
    const d = dataset();
    const mixed = mixedSite();
    const b = createBackup([...d.registers, mixed], d.reports, new Date(2026, 10, 4));
    expect(b).toMatchObject({ format: BACKUP_FORMAT, version: 1, exportedAt: "2026-11-04T00:00:00.000Z".replace("00:00:00", b.exportedAt.slice(11, 19)) });
    expect(b.reports.map((r) => r.id)).toEqual([d.job1.id, d.job2.id]); // standalone report not included
    expect(linkedReports(d.registers, d.reports)).toHaveLength(2);
    const back = roundTrip([...d.registers, mixed], d.reports);
    expect(back.registers).toEqual([...d.registers, mixed]);
    expect(back.registers[3]!.equipment[0]!.customFields).toHaveLength(2);
    expect(back.registers[0]!.history).toHaveLength(1);
    expect(summarise(back)).toMatchObject({ registers: 4, equipment: 14 + 10 + 10 + 8, historyEvents: 1, reports: 2 });
  });

  it("rejects malformed, foreign, unsupported and inconsistent files without throwing", () => {
    const good = createBackup(dataset().registers, dataset().reports);
    const cases: [string, RegExp][] = [
      ["{not json", /valid JSON/],
      ["null", /isn't a Fieldwise/],
      [JSON.stringify({ hello: "world" }), /isn't a Fieldwise/],
      [JSON.stringify({ ...good, version: 2 }), /version 2/],
      [JSON.stringify({ ...good, registers: [{ ...good.registers[0], equipment: [{ id: 5 }] }] }), /damaged or incomplete/],
      [JSON.stringify({ ...good, registers: "nope" }), /damaged/],
      [JSON.stringify({ ...good, registers: [good.registers[0], good.registers[0]] }), /duplicate ids/],
      [JSON.stringify({ ...good, registers: [{ ...good.registers[0], equipment: [good.registers[0]!.equipment[0], good.registers[0]!.equipment[0]] }] }), /duplicate equipment ids/],
      ["x".repeat(26 * 1024 * 1024), /too large/],
    ];
    for (const [text, msg] of cases) {
      const res = parseBackup(text);
      expect(res.ok, text.slice(0, 40)).toBe(false);
      if (!res.ok) expect(res.error).toMatch(msg);
    }
  });

  it("treats content as data only (no prototype pollution, unknown keys dropped)", () => {
    const good = createBackup([cctvInstall()], []);
    const text = JSON.stringify(good).replace('"format"', '"__proto__":{"polluted":true},"script":"alert(1)","format"');
    const res = parseBackup(text);
    expect(res.ok).toBe(true);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    if (res.ok) expect(res.backup).not.toHaveProperty("script");
  });
});

describe("import planning", () => {
  it("merge adds new registers, skips identical ones and imports changed ones as copies", () => {
    const d = dataset();
    const b = roundTrip(d.registers, d.reports);
    const changedCctv = { ...d.cctv, notes: "Edited on this device" };
    const existing = { registers: [changedCctv, d.access], reports: [d.job2] };
    const plan = planImport(b, existing, "merge", new Date(2026, 10, 5));
    expect(plan.added).toEqual(["Riverside Medical — intruder"]);
    expect(plan.unchanged).toEqual(["Northgate access control"]);
    expect(plan.copied).toEqual(["Building C CCTV"]);
    expect(plan.removed).toEqual([]);
    // Existing data untouched; the copy has a new id and its linked report follows it.
    expect(plan.registers[0]).toBe(changedCctv);
    const copy = plan.registers.find((r) => r.name.startsWith("Building C CCTV (imported"))!;
    expect(copy.id).not.toBe(d.cctv.id);
    expect(copy.equipment).toEqual(d.cctv.equipment);
    const importedJob = plan.reports.find((r) => r.id === d.job1.id)!;
    expect(importedJob.registerId).toBe(copy.id);
    expect(importedJob.equipment[0]!.source!.registerId).toBe(copy.id);
    expect(plan.reportsAdded).toBe(1);
    expect(plan.reports).toHaveLength(2);
    expect(new Set(plan.registers.map((r) => r.id)).size).toBe(plan.registers.length);
  });

  it("merge never overwrites a report with the same id; it imports a copy and repoints history", () => {
    const d = dataset();
    const b = roundTrip([d.cctv], [d.job1]);
    const editedJob = { ...d.job1, reference: "EDITED" };
    const plan = planImport(b, { registers: [], reports: [editedJob] }, "merge");
    expect(plan.reports[0]).toBe(editedJob);
    expect(plan.reportsCopied).toBe(1);
    const copy = plan.reports[1]!;
    expect(copy.id).not.toBe(d.job1.id);
    expect(plan.registers[0]!.history[0]!.reportId).toBe(copy.id);
  });

  it("replace swaps the registers, keeps service reports and reports orphaned links", () => {
    const d = dataset();
    const b = roundTrip([d.intruder], []);
    const plan = planImport(b, { registers: [d.cctv, d.access], reports: d.reports }, "replace");
    expect(plan.registers).toEqual([d.intruder]);
    expect(plan.removed).toEqual(["Building C CCTV", "Northgate access control"]);
    expect(plan.reports).toEqual(d.reports);
    expect(plan.orphanedReports).toBe(2);
  });

  it("re-importing the same backup changes nothing (no duplicates)", () => {
    const d = dataset();
    const b = roundTrip(d.registers, d.reports);
    const plan = planImport(b, { registers: d.registers, reports: d.reports }, "merge");
    expect(plan.added).toEqual([]);
    expect(plan.copied).toEqual([]);
    expect(plan.registers).toEqual(d.registers);
    expect(plan.reports).toEqual(d.reports);
  });
});

describe("committing an import", () => {
  beforeEach(() => window.localStorage.clear());

  it("writes registers and reports together", () => {
    const d = dataset();
    saveReport(d.standalone);
    const plan = planImport(roundTrip(d.registers, d.reports), { registers: [], reports: loadReports().reports }, "merge");
    expect(commitImport(plan.registers, plan.reports)).toBe(true);
    expect(loadRegisters().registers).toHaveLength(3);
    expect(loadReports().reports.map((r) => r.id).sort()).toEqual([d.job1.id, d.job2.id, d.standalone.id].sort());
  });

  it("leaves existing data exactly as it was if storage fails", () => {
    const d = dataset();
    saveRegister(d.access);
    saveReport(d.standalone);
    const before = [window.localStorage.getItem(REGISTERS_KEY), JSON.stringify(loadReports())];
    const original = Storage.prototype.setItem;
    let calls = 0;
    Storage.prototype.setItem = function (k: string, v: string) {
      calls++;
      if (calls === 2) throw new DOMException("full", "QuotaExceededError"); // reports write fails
      return original.call(this, k, v);
    };
    try {
      expect(commitImport([d.cctv, d.intruder], [d.job1])).toBe(false);
    } finally {
      Storage.prototype.setItem = original;
    }
    expect([window.localStorage.getItem(REGISTERS_KEY), JSON.stringify(loadReports())]).toEqual(before);
  });
});
