import { describe, expect, it } from "vitest";
import { applyEdit, createReport, duplicateReport } from "@/lib/reports/report";
import { reportSchema, type Report } from "@/lib/reports/schema";
import {
  applyEquipmentUpdate,
  linkedEquipmentIds,
  linkedItem,
  linkReport,
  proposedChanges,
  serviceEvents,
  sitePopulation,
  snapshotDifferences,
  syncReportHistory,
  unlinkReport,
} from "@/lib/sites/link";
import { applyRegisterEdit } from "@/lib/techdocs/register";
import type { TechRegister } from "@/lib/techdocs/schema";
import { accessSystem, cctvInstall } from "../techdocs/fixtures";

const job = (patch: Partial<Report> = {}) => ({ ...createReport("cctv", "Alex Tech", new Date(2026, 10, 3, 9)), date: "2026-11-03", ...patch });
const cam = (r: TechRegister, name: string) => r.equipment.find((e) => e.name === name)!;
/** A linked report with CAM-01 and CAM-06 picked. */
function linkedJob(site = cctvInstall()) {
  let report = linkReport(job(), site, false);
  report = applyEdit(report, { type: "add-items", items: [linkedItem(site, cam(site, "CAM-01")), linkedItem(site, cam(site, "CAM-06"))] });
  return { site, report };
}

describe("linking a report to a site", () => {
  it("fills empty site details and records the link", () => {
    const site = cctvInstall();
    const r = linkReport(job(), site, false);
    expect(r).toMatchObject({ registerId: site.id, siteName: "Westgate Logistics — Building C", customer: "Westgate Logistics Pty Ltd", siteAddress: "12 Example Road\nEastern Creek NSW 2766" });
    expect(reportSchema.parse(r)).toEqual(r);
  });

  it("never overwrites existing report details without confirmation", () => {
    const site = cctvInstall();
    const typed = job({ siteName: "Westgate C", customer: "" });
    expect(sitePopulation(typed, site)).toEqual({
      fills: [
        { field: "customer", label: "Customer", current: "", incoming: "Westgate Logistics Pty Ltd" },
        { field: "siteAddress", label: "Site address", current: "", incoming: "12 Example Road\nEastern Creek NSW 2766" },
      ],
      conflicts: [{ field: "siteName", label: "Site name", current: "Westgate C", incoming: "Westgate Logistics — Building C" }],
    });
    expect(linkReport(typed, site, false).siteName).toBe("Westgate C");
    expect(linkReport(typed, site, true).siteName).toBe("Westgate Logistics — Building C");
  });

  it("unlinking keeps items and their recorded details", () => {
    const { report } = linkedJob();
    const u = unlinkReport(report);
    expect(u.registerId).toBe("");
    expect(u.equipment).toEqual(report.equipment);
  });

  it("standalone reports are unchanged", () => {
    const r = createReport("cctv");
    expect(r.registerId).toBe("");
    expect(applyEdit(r, { type: "add-item", itemType: "Camera" }).equipment[0]!.source).toBeNull();
  });
});

describe("picking site equipment", () => {
  it("copies identifying details into the item and keeps a stable reference + snapshot (no network settings)", () => {
    const site = cctvInstall();
    const item = linkedItem(site, cam(site, "CAM-06"), new Date(2026, 10, 3));
    expect(item).toMatchObject({ name: "CAM-06", type: "Dome camera", location: "Car park north", makeModel: "ExampleVision DM-4MP", status: "not-tested", findings: "" });
    expect(item.source).toMatchObject({ registerId: site.id, equipmentId: cam(site, "CAM-06").id, outcome: "", applied: [] });
    expect(item.source!.snapshot).toMatchObject({ name: "CAM-06", assetId: "WG-CAM-06", serial: "EVD4-1005", firmware: "V5.7.3", category: "IP camera" });
    expect(JSON.stringify(item)).not.toContain("10.20.0.106");
    expect(JSON.stringify(item)).not.toContain("00:11:22");
  });

  it("prevents duplicates and keeps existing items, statuses and findings", () => {
    const job = linkedJob();
    const site = job.site;
    let report = job.report;
    report = applyEdit(report, { type: "update-item", id: report.equipment[0]!.id, patch: { status: "fault", findings: "No video" } });
    report = applyEdit(report, { type: "add-item", itemType: "Camera" }); // manual item
    const again = applyEdit(report, { type: "add-items", items: [linkedItem(site, cam(site, "CAM-01")), linkedItem(site, cam(site, "CAM-02"))] });
    expect(again.equipment.map((i) => i.name)).toEqual(["CAM-01", "CAM-06", "", "CAM-02"]);
    expect(again.equipment[0]).toMatchObject({ status: "fault", findings: "No video" });
    expect([...linkedEquipmentIds(again, site.id)]).toEqual([cam(site, "CAM-01").id, cam(site, "CAM-06").id, cam(site, "CAM-02").id]);
    // Picking the same entry twice in one go adds it once.
    const twice = applyEdit(report, { type: "add-items", items: [linkedItem(site, cam(site, "CAM-03")), linkedItem(site, cam(site, "CAM-03"))] });
    expect(twice.equipment.filter((i) => i.name === "CAM-03")).toHaveLength(1);
  });

  it("keeps the report's snapshot when the master record changes later", () => {
    const job = linkedJob();
    let site = job.site;
    const report = job.report;
    const c6 = cam(site, "CAM-06");
    site = applyRegisterEdit(site, { type: "save-item", item: { ...c6, firmware: "V5.7.10", serial: "NEW-1" } });
    const item = report.equipment[1]!;
    expect(item.source!.snapshot.firmware).toBe("V5.7.3");
    expect(snapshotDifferences(site, item)).toEqual([
      { label: "Serial number", recorded: "EVD4-1005", now: "NEW-1" },
      { label: "Firmware", recorded: "V5.7.3", now: "V5.7.10" },
    ]);
  });

  it("duplicating a report or an item doesn't carry over job outcomes or create duplicate links", () => {
    let { report } = linkedJob();
    const id = report.equipment[0]!.id;
    report = applyEdit(report, { type: "update-item", id, patch: { source: { ...report.equipment[0]!.source!, outcome: "repaired" } } });
    expect(duplicateReport(report).equipment[0]!.source).toMatchObject({ outcome: "", applied: [] });
    const dup = applyEdit(report, { type: "duplicate-item", id });
    expect(dup.equipment[1]!.source).toBeNull();
  });
});

describe("service history from linked reports", () => {
  it("records factual events per linked item", () => {
    const job = linkedJob();
    const site = job.site;
    let report = job.report;
    const [a, b] = report.equipment;
    report = applyEdit(report, { type: "update-item", id: a!.id, patch: { status: "fault", findings: "No video on channel 1.", work: "Replaced camera", source: { ...a!.source!, outcome: "replaced" } } });
    report = applyEdit(report, { type: "update-item", id: b!.id, patch: { status: "pass", work: "Cleaned dome", recommendations: "Update firmware" } });
    const events = serviceEvents(report, site);
    expect(events.map((e) => [e.type, e.equipmentName, e.description])).toEqual([
      ["fault", "CAM-01", "Fault recorded. Findings: No video on channel 1."],
      ["replaced", "CAM-01", "Equipment replaced. Work completed: Replaced camera."],
      ["inspection", "CAM-06", "Service inspection — Pass. Work completed: Cleaned dome. Recommendations: Update firmware."],
    ]);
    expect(events[0]).toMatchObject({ reportId: report.id, date: "2026-11-03", technician: "Alex Tech", equipmentId: cam(site, "CAM-01").id });
    expect(events[0]!.reportLabel).toContain("Westgate Logistics — Building C");
  });

  it("syncing again never duplicates and follows edits", () => {
    let { site, report } = linkedJob();
    site = syncReportHistory(site, report);
    expect(site.history).toHaveLength(2);
    expect(syncReportHistory(site, report)).toBe(site); // nothing changed → same object (no write)
    report = applyEdit(report, { type: "update-item", id: report.equipment[0]!.id, patch: { status: "fault", findings: "Lens cracked" } });
    site = syncReportHistory(site, report);
    expect(site.history).toHaveLength(2);
    expect(site.history.find((e) => e.equipmentName === "CAM-01")).toMatchObject({ type: "fault", description: "Fault recorded. Findings: Lens cracked." });
    report = applyEdit(report, { type: "remove-item", id: report.equipment[1]!.id });
    site = syncReportHistory(site, report);
    expect(site.history.map((e) => e.equipmentName)).toEqual(["CAM-01"]);
  });

  it("ignores unlinked reports, manual items and other registers", () => {
    const { site, report } = linkedJob();
    expect(serviceEvents(unlinkReport(report), site)).toEqual([]);
    expect(serviceEvents(report, accessSystem())).toEqual([]);
    const manual = applyEdit(report, { type: "add-item", itemType: "Camera" });
    expect(serviceEvents(manual, site)).toHaveLength(2);
  });
});

describe("proposed equipment updates", () => {
  it("lists only changed, non-blank proposals with the original value", () => {
    const site = cctvInstall();
    const c = cam(site, "CAM-06");
    expect(proposedChanges(c, { firmware: "V5.7.10", serial: "EVD4-1005", ip: "", switchPort: " 7 ", ladderType: "Platform ladder" })).toEqual([
      { field: "firmware", label: "Firmware / software version", from: "V5.7.3", to: "V5.7.10" },
      { field: "switchPort", label: "Switch port", from: "6", to: "7" },
      { field: "ladderType", label: "Ladder type required", from: "Platform ladder", to: "Platform ladder" },
    ].filter((c) => c.from !== c.to));
  });

  it("applies only confirmed fields, preserves everything else and records history", () => {
    const { site, report } = linkedJob();
    const c = cam(site, "CAM-06");
    const changes = proposedChanges(c, { firmware: "V5.7.10", serial: "EVD4-9999", ip: "10.20.0.150" });
    const confirmed = changes.filter((x) => x.field !== "ip"); // technician unticked the IP change
    const res = applyEquipmentUpdate(site, c.id, confirmed, report, new Date(2026, 10, 3, 11));
    const after = cam(res.register, "CAM-06");
    expect(after).toEqual({ ...c, firmware: "V5.7.10", serial: "EVD4-9999" });
    expect(after.ip).toBe("10.20.0.106");
    expect(res.applied.map((x) => x.field)).toEqual(["serial", "firmware"]);
    expect(res.conflicts).toEqual([]);
    const events = res.register.history;
    expect(events.map((e) => [e.type, e.description])).toEqual([
      ["firmware", "Firmware / software version: V5.7.3 → V5.7.10"],
      ["details", "Serial number: EVD4-1005 → EVD4-9999"],
    ]);
    expect(events[0]).toMatchObject({ reportId: report.id, technician: "Alex Tech", date: "2026-11-03", changes: [{ field: "firmware", from: "V5.7.3", to: "V5.7.10" }] });
    // Other equipment untouched.
    expect(res.register.equipment.filter((e) => e.id !== c.id)).toEqual(site.equipment.filter((e) => e.id !== c.id));
  });

  it("refuses a change if the master value changed since it was reviewed", () => {
    const { site, report } = linkedJob();
    const c = cam(site, "CAM-06");
    const changes = proposedChanges(c, { firmware: "V5.7.10" });
    const moved = applyRegisterEdit(site, { type: "save-item", item: { ...c, firmware: "V6.0" } });
    const res = applyEquipmentUpdate(moved, c.id, changes, report);
    expect(res.applied).toEqual([]);
    expect(res.conflicts).toEqual(changes);
    expect(res.register).toBe(moved);
    expect(applyEquipmentUpdate(site, "missing", changes, report).conflicts).toEqual(changes);
  });

  it("never touches fields outside the updatable list", () => {
    const { site, report } = linkedJob();
    const c = cam(site, "CAM-06");
    const res = applyEquipmentUpdate(site, c.id, [{ field: "name", label: "Name", from: "CAM-06", to: "X" }], report);
    expect(res.applied).toEqual([]);
    expect(cam(res.register, "CAM-06").name).toBe("CAM-06");
  });
});
