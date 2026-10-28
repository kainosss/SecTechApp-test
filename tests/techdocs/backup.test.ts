import { beforeEach, describe, expect, it } from "vitest";
import { BRANDING_KEY, EMPTY_BRANDING, loadBranding, saveBranding } from "@/lib/handover/branding";
import { applyEdit, createReport } from "@/lib/reports/report";
import { loadReports, saveReport } from "@/lib/reports/store";
import { linkedItem, linkReport, syncReportHistory } from "@/lib/sites/link";
import { BACKUP_FORMAT, backupJson, createBackup, LEGACY_FORMAT, linkedReports, parseBackup, planImport, summarise, type Backup } from "@/lib/techdocs/backup";
import { commitImport, loadRegisters, REGISTERS_KEY, saveRegister } from "@/lib/techdocs/store";
import type { TechRegister } from "@/lib/techdocs/schema";
import type { Report } from "@/lib/reports/schema";
import { sampleBranding, sampleLogoPng } from "../handover/fixtures";
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
const read = (text: string) => {
  const parsed = parseBackup(text);
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.backup;
};
const roundTrip = (registers: TechRegister[], reports: Report[], branding = EMPTY_BRANDING) => read(backupJson(createBackup(registers, reports, branding, new Date(2026, 10, 4))));
/** A v0.7.1 backup file, as that version wrote it. */
const legacyFile = (registers: TechRegister[], reports: Report[]) =>
  JSON.stringify({ format: LEGACY_FORMAT, version: 1, exportedAt: "2026-10-30T00:00:00.000Z", registers, reports: linkedReports(registers, reports) });

describe("complete backup file (v2)", () => {
  it("holds every register, every report and the branding with its logo", () => {
    const d = dataset();
    const mixed = mixedSite();
    const branding = sampleBranding();
    const b = createBackup([...d.registers, mixed], d.reports, branding, new Date(2026, 10, 4));
    expect(b).toMatchObject({ format: BACKUP_FORMAT, version: 2, complete: true });
    expect(b.reports.map((r) => r.id)).toEqual([d.job1.id, d.job2.id, d.standalone.id]); // standalone included too
    const back = read(backupJson(b));
    expect(back.registers).toEqual([...d.registers, mixed]);
    expect(back.registers[3]!.equipment[0]!.customFields).toHaveLength(2);
    expect(back.registers[0]!.history).toHaveLength(1);
    expect(back.reports.find((r) => r.id === d.job1.id)!.equipment[0]!.source!.equipmentId).toBe(d.cctv.equipment[2]!.id);
    expect(back.branding).toEqual(branding);
    expect(summarise(back)).toMatchObject({ registers: 4, reports: 3, historyEvents: 1, complete: true, branding: { companyName: "Example Security Services", logo: true } });
    expect(JSON.parse(backupJson(b))).not.toHaveProperty("complete");
  });

  it("leaves branding out when none is set", () => {
    const d = dataset();
    expect(createBackup(d.registers, d.reports).branding).toBeNull();
    expect(summarise(roundTrip(d.registers, d.reports)).branding).toBeNull();
  });

  it("still reads v0.7.1 backups (registers + linked reports, no branding)", () => {
    const d = dataset();
    const b = read(legacyFile(d.registers, d.reports));
    expect(b).toMatchObject({ format: LEGACY_FORMAT, version: 1, complete: false, branding: null });
    expect(b.registers).toEqual(d.registers);
    expect(b.reports.map((r) => r.id)).toEqual([d.job1.id, d.job2.id]);
  });

  it("rejects malformed, foreign, unsupported and inconsistent files without throwing", () => {
    const good = JSON.parse(backupJson(createBackup(dataset().registers, dataset().reports)));
    const cases: [string, RegExp][] = [
      ["{not json", /valid JSON/],
      ["null", /isn't a Fieldwise backup/],
      [JSON.stringify({ hello: "world" }), /isn't a Fieldwise backup/],
      [JSON.stringify({ ...good, version: 3 }), /version 3/],
      [JSON.stringify({ ...good, format: LEGACY_FORMAT, version: 2 }), /version 2/],
      [JSON.stringify({ ...good, registers: [{ ...good.registers[0], equipment: [{ id: 5 }] }] }), /damaged or incomplete/],
      [JSON.stringify({ ...good, reports: "nope" }), /damaged/],
      [JSON.stringify({ ...good, branding: { companyName: 42 } }), /damaged/],
      [JSON.stringify({ ...good, registers: [good.registers[0], good.registers[0]] }), /duplicate ids/],
      [JSON.stringify({ ...good, registers: [{ ...good.registers[0], equipment: [good.registers[0].equipment[0], good.registers[0].equipment[0]] }] }), /duplicate equipment ids/],
      ["x".repeat(26 * 1024 * 1024), /too large/],
    ];
    for (const [text, msg] of cases) {
      const res = parseBackup(text);
      expect(res.ok, text.slice(0, 40)).toBe(false);
      if (!res.ok) expect(res.error).toMatch(msg);
    }
  });

  it("validates the logo by its real content", () => {
    const d = dataset();
    const b = JSON.parse(backupJson(createBackup(d.registers, d.reports, sampleBranding())));
    const fake = { ...b, branding: { ...b.branding, logo: { ...b.branding.logo, dataUrl: `data:image/png;base64,${btoa("<svg onload=alert(1)>")}` } } };
    expect(parseBackup(JSON.stringify(fake))).toMatchObject({ ok: false, error: expect.stringMatching(/logo/) });
    const mislabelled = { ...b, branding: { ...b.branding, logo: { ...b.branding.logo, format: "JPEG" } } };
    expect(parseBackup(JSON.stringify(mislabelled))).toMatchObject({ ok: false });
    const html = { ...b, branding: { ...b.branding, logo: { ...b.branding.logo, dataUrl: "data:text/html;base64,PHNjcmlwdD4=" } } };
    expect(parseBackup(JSON.stringify(html))).toMatchObject({ ok: false });
    expect(parseBackup(JSON.stringify(b))).toMatchObject({ ok: true });
    expect(sampleLogoPng().length).toBeGreaterThan(0);
  });

  it("treats content as data only (no prototype pollution, unknown keys dropped)", () => {
    const text = backupJson(createBackup([cctvInstall()], [])).replace('"format"', '"__proto__":{"polluted":true},"script":"alert(1)","format"');
    const res = parseBackup(text);
    expect(res.ok).toBe(true);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    if (res.ok) expect(res.backup).not.toHaveProperty("script");
  });
});

describe("import planning", () => {
  it("merge adds new registers, skips identical ones and imports changed ones as copies with links repointed", () => {
    const d = dataset();
    const b = roundTrip(d.registers, d.reports);
    const changedCctv = { ...d.cctv, notes: "Edited on this device" };
    const plan = planImport(b, { registers: [changedCctv, d.access], reports: [d.job2] }, "merge", { now: new Date(2026, 10, 5) });
    expect(plan.added).toEqual(["Riverside Medical — intruder"]);
    expect(plan.unchanged).toEqual(["Northgate access control"]);
    expect(plan.copied).toEqual(["Building C CCTV"]);
    expect(plan.registers[0]).toBe(changedCctv);
    const copy = plan.registers.find((r) => r.name.startsWith("Building C CCTV (imported"))!;
    expect(copy.id).not.toBe(d.cctv.id);
    const importedJob = plan.reports.find((r) => r.id === d.job1.id)!;
    expect(importedJob.registerId).toBe(copy.id);
    expect(importedJob.equipment[0]!.source!.registerId).toBe(copy.id);
    expect(plan.reportsAdded).toBe(2); // job1 and the standalone report
    expect(new Set(plan.registers.map((r) => r.id)).size).toBe(plan.registers.length);
    expect(new Set(plan.reports.map((r) => r.id)).size).toBe(plan.reports.length);
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

  it("re-importing the same backup changes nothing (no duplicates)", () => {
    const d = dataset();
    const b = roundTrip(d.registers, d.reports, sampleBranding());
    const plan = planImport(b, { registers: d.registers, reports: d.reports, branding: sampleBranding() }, "merge");
    expect(plan).toMatchObject({ added: [], copied: [], reportsAdded: 0, reportsCopied: 0, brandingAction: "unchanged", brandingConflict: false });
    expect(plan.registers).toEqual(d.registers);
    expect(plan.reports).toEqual(d.reports);
  });

  describe("branding", () => {
    const d = dataset();
    const backup = roundTrip(d.registers, [], sampleBranding());
    const mine = { ...EMPTY_BRANDING, companyName: "My Company" };

    it("is added when the device has none", () => {
      expect(planImport(backup, { registers: [], reports: [] }, "merge")).toMatchObject({ brandingAction: "added", brandingConflict: false, branding: sampleBranding() });
    });
    it("on a merge conflict follows the technician's choice (keep by default)", () => {
      const keep = planImport(backup, { registers: [], reports: [], branding: mine }, "merge");
      expect(keep).toMatchObject({ brandingConflict: true, brandingAction: "kept", branding: mine });
      const take = planImport(backup, { registers: [], reports: [], branding: mine }, "merge", { brandingChoice: "import" });
      expect(take).toMatchObject({ brandingConflict: true, brandingAction: "replaced", branding: sampleBranding() });
    });
    it("is replaced by replace mode, and never removed by a backup without branding", () => {
      expect(planImport(backup, { registers: [], reports: [], branding: mine }, "replace")).toMatchObject({ brandingAction: "replaced", branding: sampleBranding() });
      const none = roundTrip(d.registers, []);
      expect(planImport(none, { registers: [], reports: [], branding: mine }, "replace")).toMatchObject({ brandingAction: "none", branding: mine });
    });
  });

  it("replace with a complete backup replaces registers and reports (counted for confirmation)", () => {
    const d = dataset();
    const b = roundTrip([d.intruder], [d.standalone]);
    const other = { ...createReport("cctv"), siteName: "Old job" };
    const plan = planImport(b, { registers: [d.cctv, d.access], reports: [d.job1, other] }, "replace");
    expect(plan.registers).toEqual([d.intruder]);
    expect(plan.removed).toEqual(["Building C CCTV", "Northgate access control"]);
    expect(plan.reportsRemoved).toBe(2);
    expect(plan.reports).toEqual([d.standalone]);
  });

  it("replace with a v0.7.1 backup keeps service reports and reports orphaned links", () => {
    const d = dataset();
    const b = read(legacyFile([d.intruder], []));
    const plan = planImport(b, { registers: [d.cctv, d.access], reports: d.reports }, "replace");
    expect(plan.registers).toEqual([d.intruder]);
    expect(plan.reports).toEqual(d.reports);
    expect(plan.reportsRemoved).toBe(0);
    expect(plan.orphanedReports).toBe(2);
  });
});

describe("committing an import", () => {
  beforeEach(() => window.localStorage.clear());

  it("writes registers, reports and branding together", () => {
    const d = dataset();
    saveReport(d.standalone);
    const b: Backup = roundTrip(d.registers, d.reports, sampleBranding());
    const plan = planImport(b, { registers: [], reports: loadReports().reports, branding: loadBranding() }, "merge");
    expect(commitImport(plan.registers, plan.reports, plan.branding)).toBe(true);
    expect(loadRegisters().registers).toHaveLength(3);
    expect(loadReports().reports.map((r) => r.id).sort()).toEqual([d.job1.id, d.job2.id, d.standalone.id].sort());
    expect(loadBranding()).toEqual(sampleBranding());
  });

  it("rolls everything back — registers, reports and branding — if any write fails", () => {
    const d = dataset();
    saveRegister(d.access);
    saveReport(d.standalone);
    saveBranding({ ...EMPTY_BRANDING, companyName: "Mine" });
    const before = [window.localStorage.getItem(REGISTERS_KEY), JSON.stringify(loadReports()), window.localStorage.getItem(BRANDING_KEY)];
    for (const failAt of [1, 2, 3]) {
      const original = Storage.prototype.setItem;
      let calls = 0;
      Storage.prototype.setItem = function (k: string, v: string) {
        calls++;
        if (calls === failAt) throw new DOMException("full", "QuotaExceededError");
        return original.call(this, k, v);
      };
      try {
        expect(commitImport([d.cctv, d.intruder], [d.job1], sampleBranding())).toBe(false);
      } finally {
        Storage.prototype.setItem = original;
      }
      expect([window.localStorage.getItem(REGISTERS_KEY), JSON.stringify(loadReports()), window.localStorage.getItem(BRANDING_KEY)], `fail at write ${failAt}`).toEqual(before);
    }
  });
});
