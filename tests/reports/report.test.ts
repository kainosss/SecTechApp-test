import { describe, expect, it } from "vitest";
import {
  applyEdit,
  checkReport,
  createReport,
  draftSummary,
  duplicateReport,
  fillEmptySummary,
  itemLabel,
  outstandingActions,
  statusCounts,
  today,
  workbookFileName,
} from "@/lib/reports/report";
import { deleteReport, getReport, loadReports, loadTechnician, parseReports, REPORTS_KEY, saveReport, saveTechnician, clearReports } from "@/lib/reports/store";
import type { Report } from "@/lib/reports/schema";

const add = (r: Report, type: string, patch: Partial<Report["equipment"][number]> = {}) => {
  const next = applyEdit(r, { type: "add-item", itemType: type });
  return applyEdit(next, { type: "update-item", id: next.equipment.at(-1)!.id, patch });
};

describe("creating and editing a report", () => {
  it("starts with today's local date, the job type and the saved technician", () => {
    const r = createReport("intruder", "Alex", new Date(2026, 6, 9, 23, 30));
    expect(r).toMatchObject({ jobType: "intruder", technician: "Alex", date: "2026-07-09", equipment: [] });
    expect(today(new Date(2026, 0, 2))).toBe("2026-01-02");
  });

  it("adds, edits, duplicates, moves and removes equipment", () => {
    let r = createReport("cctv");
    r = add(r, "Camera", { location: "Gate", makeModel: "Model X", status: "fault", findings: "No video", work: "Rebooted" });
    r = add(r, "NVR");
    const [cam, nvr] = r.equipment;
    r = applyEdit(r, { type: "duplicate-item", id: cam!.id });
    expect(r.equipment).toHaveLength(3);
    const copy = r.equipment[1]!;
    // A duplicate copies what the equipment is, not its results.
    expect(copy).toMatchObject({ type: "Camera", location: "Gate", makeModel: "Model X", status: "not-tested", findings: "", work: "" });
    expect(copy.id).not.toBe(cam!.id);
    r = applyEdit(r, { type: "move-item", id: nvr!.id, by: -1 });
    expect(r.equipment.map((i) => i.type)).toEqual(["Camera", "NVR", "Camera"]);
    expect(applyEdit(r, { type: "move-item", id: cam!.id, by: -1 })).toBe(r); // already first
    const removed = r.equipment[0]!;
    r = applyEdit(r, { type: "remove-item", id: removed.id });
    expect(r.equipment).toHaveLength(2);
    r = applyEdit(r, { type: "restore-item", item: removed, index: 0 }); // undo
    expect(r.equipment[0]!.id).toBe(removed.id);
    expect(applyEdit(r, { type: "update-item", id: "missing", patch: { name: "x" } })).toBe(r);
  });

  it("labels unnamed items by type and position", () => {
    let r = createReport("cctv");
    r = add(r, "Camera");
    r = add(r, "Camera", { name: "Front door cam" });
    r = add(r, "Camera");
    r = add(r, "");
    expect(r.equipment.map((i) => itemLabel(r, i))).toEqual(["Camera 1", "Front door cam", "Camera 2", "Item 1"]);
  });

  it("duplicating a report gives new ids throughout", () => {
    let r = add(createReport("access"), "Controller");
    r = applyEdit(r, { type: "set", patch: { reference: "J-1" } });
    const d = duplicateReport(r);
    expect(d.id).not.toBe(r.id);
    expect(d.equipment[0]!.id).not.toBe(r.equipment[0]!.id);
    expect(d.reference).toBe("J-1 (copy)");
  });
});

describe("derived data never invents content", () => {
  const report = () => {
    let r = createReport("intruder");
    r = add(r, "PIR", { location: "Hall", status: "fault", findings: "Fails walk test", recommendations: "Replace detector" });
    r = add(r, "Keypad", { status: "pass", work: "Cleaned and tested" });
    r = add(r, "Siren/strobe", { status: "recommendation", recommendations: "Replace battery", priority: "Low" });
    r = add(r, "Reed switch", { status: "fault" });
    r = add(r, "Expander");
    return r;
  };

  it("counts statuses", () => {
    expect(statusCounts(report())).toEqual({ pass: 1, fault: 2, recommendation: 1, "not-tested": 1 });
  });

  it("outstanding actions come only from faults and recommendations, blank where nothing was entered", () => {
    expect(outstandingActions(report())).toEqual([
      { number: 1, item: "PIR 1", location: "Hall", issue: "Fails walk test", action: "Replace detector", priority: "", status: "Fault" },
      { number: 3, item: "Siren/strobe 1", location: "", issue: "", action: "Replace battery", priority: "Low", status: "Recommendation" },
      { number: 4, item: "Reed switch 1", location: "", issue: "", action: "", priority: "", status: "Fault" },
    ]);
  });

  it("draft summary re-uses entered text only", () => {
    const d = draftSummary(report());
    expect(d.workCompleted).toBe("• Keypad 1: Cleaned and tested");
    expect(d.faults).toBe("• PIR 1 (Hall): Fails walk test");
    expect(d.recommendations).toBe("• PIR 1 (Hall): Replace detector\n• Siren/strobe 1: Replace battery");
    expect(d.outstanding).toBe("• PIR 1 (Hall): fault recorded — Fails walk test; no work recorded\n• Reed switch 1: fault recorded; no work recorded");
    expect(d.parts).toBe("");
    expect(d.notes).toBe("");
    expect(draftSummary(createReport("cctv"))).toMatchObject({ workCompleted: "", faults: "", recommendations: "", outstanding: "" });
  });

  it("filling the summary never overwrites what the technician wrote", () => {
    const r = applyEdit(report(), { type: "summary", patch: { workCompleted: "My own words" } });
    const fill = fillEmptySummary(r);
    expect(fill.workCompleted).toBeUndefined();
    expect(fill.faults).toContain("Fails walk test");
    expect(fill.parts).toBeUndefined();
  });

  it("validation only warns — nothing blocks generating", () => {
    expect(checkReport(createReport("cctv")).warnings).toEqual(["No site name — the workbook will show it as blank.", "No equipment recorded."]);
    expect(checkReport(report()).warnings).toEqual([
      "No site name — the workbook will show it as blank.",
      "1 item is marked Not Tested.",
      "1 fault has no findings written.",
    ]);
  });

  it("builds a safe file name", () => {
    const r = applyEdit(createReport("cctv", "", new Date(2026, 2, 4)), { type: "set", patch: { siteName: "Café / Depot: <North>" } });
    expect(workbookFileName(r)).toBe("Fieldwise-Cafe-Depot-North-2026-03-04.xlsx");
    expect(workbookFileName(applyEdit(r, { type: "set", patch: { reference: "JOB 77", date: "" } }))).toBe("Fieldwise-JOB-77.xlsx");
    expect(workbookFileName(applyEdit(r, { type: "set", patch: { siteName: "" } }))).toBe("Fieldwise-Service-Report-2026-03-04.xlsx");
  });
});

describe("saved drafts", () => {
  it("saves, restores, lists newest first and deletes", () => {
    const a = createReport("cctv", "", new Date("2026-01-01T00:00:00Z"));
    const b = createReport("access", "", new Date("2026-01-02T00:00:00Z"));
    saveReport(a);
    saveReport(b);
    expect(loadReports().reports.map((r) => r.id)).toEqual([b.id, a.id]);
    expect(getReport(a.id)).toEqual(a);
    deleteReport(a.id);
    expect(loadReports().reports.map((r) => r.id)).toEqual([b.id]);
    clearReports();
    expect(loadReports().reports).toEqual([]);
  });

  it("skips corrupted or outdated entries without losing the good ones", () => {
    const good = createReport("cctv");
    window.localStorage.setItem(
      REPORTS_KEY,
      JSON.stringify({ version: 1, reports: { [good.id]: good, bad: { id: "bad", version: 99 }, junk: "x", broken: { ...good, id: "b", equipment: [{ id: "i", status: "exploded" }] } } }),
    );
    expect(loadReports()).toMatchObject({ reports: [{ id: good.id }], skipped: 3 });
    expect(parseReports("{not json")).toEqual({ reports: [], skipped: 1 });
    expect(parseReports(JSON.stringify({ version: 2, reports: {} }))).toEqual({ reports: [], skipped: 1 });
    expect(parseReports(null)).toEqual({ reports: [], skipped: 0 });
  });

  it("remembers the technician's details", () => {
    expect(loadTechnician()).toEqual({ name: "", company: "" });
    saveTechnician({ name: "Sam Tech", company: "Secure Co" });
    expect(loadTechnician()).toEqual({ name: "Sam Tech", company: "Secure Co" });
  });
});
