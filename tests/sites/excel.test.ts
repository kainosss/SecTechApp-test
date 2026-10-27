// @vitest-environment node
import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { buildWorkbook } from "@/lib/reports/excel";
import { applyEdit, createReport } from "@/lib/reports/report";
import { finalizeXlsx } from "@/lib/reports/xlsx-layout";
import { applyEquipmentUpdate, linkedItem, linkReport, proposedChanges, syncReportHistory } from "@/lib/sites/link";
import { buildTechWorkbook, TABLE_ROW } from "@/lib/techdocs/excel";
import type { TechRegister } from "@/lib/techdocs/schema";
import type { Report } from "@/lib/reports/schema";
import { cctvInstall } from "../techdocs/fixtures";

async function reopen(wb: ExcelJS.Workbook) {
  const out = new ExcelJS.Workbook();
  await out.xlsx.load(await finalizeXlsx((await wb.xlsx.writeBuffer()) as ArrayBuffer));
  return out;
}
const text = (wb: ExcelJS.Workbook) => {
  const all: string[] = [];
  for (const ws of wb.worksheets) ws.eachRow((row) => row.eachCell((c) => all.push(String(c.value ?? ""))));
  return all.join("\n");
};

function linkedJob(): { site: TechRegister; report: Report } {
  let site = cctvInstall();
  let report = linkReport({ ...createReport("cctv", "Alex"), date: "2026-11-03", reference: "JOB-7" }, site, false);
  report = applyEdit(report, { type: "add-items", items: [linkedItem(site, site.equipment[2]!), linkedItem(site, site.equipment[7]!)] });
  report = applyEdit(report, { type: "update-item", id: report.equipment[0]!.id, patch: { status: "fault", findings: "No video", work: "Replaced camera", recommendations: "Monitor" } });
  report = applyEdit(report, { type: "add-item", itemType: "Camera" });
  site = syncReportHistory(site, report);
  return { site, report };
}

describe("service report export with linked equipment", () => {
  it("shows linked items like any other, without network configuration", async () => {
    const { report } = linkedJob();
    const wb = await reopen(buildWorkbook(report, ExcelJS));
    const reg = wb.getWorksheet("Equipment Register")!;
    const row = (r: number) => (reg.getRow(r).values as unknown[]).slice(1, 7).map((v) => String(v ?? ""));
    expect(row(7)).toEqual(["1", "CAM-01", "Dome camera", "Gate 1", "ExampleVision DM-4MP", "Fault"]);
    expect(row(8)).toEqual(["2", "CAM-06", "Dome camera", "Car park north", "ExampleVision DM-4MP", "Not Tested"]);
    expect(row(9).slice(0, 2)).toEqual(["3", "Camera 1"]);
    const all = text(wb);
    for (const secret of ["10.20.0.", "255.255.255.0", "00:11:22", "VLAN", "SW-CAM-01", "EVD4-"]) expect(all).not.toContain(secret);
  });

  it("historical reports keep their recorded details after the master record changes", async () => {
    const { site, report } = linkedJob();
    const cam = site.equipment[2]!;
    const res = applyEquipmentUpdate(site, cam.id, proposedChanges(cam, { model: "DM-8MP", location: "Gate 1 (moved)" }), report);
    expect(res.applied).toHaveLength(2);
    const wb = await reopen(buildWorkbook(report, ExcelJS));
    const reg = wb.getWorksheet("Equipment Register")!;
    expect(reg.getCell("D7").value).toBe("Gate 1");
    expect(reg.getCell("E7").value).toBe("ExampleVision DM-4MP");
  });
});

describe("technical workbook with history", () => {
  it("adds an Equipment History sheet with events newest first and previous → new values", async () => {
    const { site, report } = linkedJob();
    const cam = site.equipment[2]!;
    const updated = applyEquipmentUpdate(site, cam.id, proposedChanges(cam, { serial: "NEW-1" }), report, new Date(2026, 10, 3, 12)).register;
    const wb = await reopen(buildTechWorkbook(updated, ExcelJS));
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Equipment Register", "Network Configuration", "Access & Maintenance", "Full Equipment Details", "Equipment History", "Site Information"]);
    const h = wb.getWorksheet("Equipment History")!;
    const headers = (h.getRow(TABLE_ROW).values as unknown[]).slice(1);
    expect(headers).toEqual(["Date", "Equipment", "Event", "Description", "Previous → new values", "Service report", "Technician"]);
    const rows = [];
    for (let r = TABLE_ROW + 1; r <= h.rowCount; r++) rows.push((h.getRow(r).values as unknown[]).slice(1).map((v) => String(v ?? "")));
    expect(rows.map((r) => [r[1], r[2]])).toEqual(expect.arrayContaining([["CAM-01", "Fault recorded"], ["CAM-06", "Service inspection"], ["CAM-01", "Technical details changed"]]));
    const detail = rows.find((r) => r[2] === "Technical details changed")!;
    expect(detail[4]).toBe("Serial number: EVD4-1000 → NEW-1");
    expect(detail[5]).toContain("JOB-7");
    expect(detail[6]).toBe("Alex");
    expect(h.autoFilter).toBe(`A6:G${h.rowCount}`);
  });

  it("registers without history keep the five-sheet layout", async () => {
    const wb = await reopen(buildTechWorkbook(cctvInstall(), ExcelJS));
    expect(wb.worksheets).toHaveLength(5);
  });
});
