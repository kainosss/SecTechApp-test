import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

vi.mock("next/navigation", () => ({ usePathname: () => "/reports" }));
vi.mock("@/lib/reports/download", () => ({ downloadWorkbook: async () => "report.xlsx" }));

import ExcelJS from "exceljs";
import { ReportsApp } from "@/components/reports/ReportsApp";
import { TechDocsApp } from "@/components/techdocs/TechDocsApp";
import { applyEdit, createReport, duplicateReport } from "@/lib/reports/report";
import { loadReports, saveReport } from "@/lib/reports/store";
import { linkedItem, linkReport, markReportDeleted, markReportRestored, serviceEvents, sourceState, syncReportHistory } from "@/lib/sites/link";
import { buildTechWorkbook, TABLE_ROW } from "@/lib/techdocs/excel";
import { applyRegisterEdit } from "@/lib/techdocs/register";
import { getRegister, saveRegister } from "@/lib/techdocs/store";
import { cctvInstall } from "../techdocs/fixtures";

/** A site with one linked job that recorded a fault on CAM-01. */
function setup() {
  let site = cctvInstall();
  let job = linkReport({ ...createReport("cctv", "Alex"), date: "2026-11-03", reference: "JOB-7" }, site, false);
  job = applyEdit(job, { type: "add-items", items: [linkedItem(site, site.equipment[2]!)] });
  job = applyEdit(job, { type: "update-item", id: job.equipment[0]!.id, patch: { status: "fault", findings: "No video" } });
  site = syncReportHistory(site, job);
  return { site, job };
}

beforeEach(() => {
  window.localStorage.clear();
  window.history.replaceState(null, "", "/reports");
});

describe("history and deleted reports", () => {
  it("keeps events from a deleted report, marked, and unmarks them on undo", () => {
    const { site, job } = setup();
    const deleted = markReportDeleted(site, job.id, new Date("2026-11-10T00:00:00Z"));
    expect(deleted.history).toHaveLength(1);
    expect(deleted.history[0]).toMatchObject({ type: "fault", description: "Fault recorded. Findings: No video.", sourceDeletedAt: "2026-11-10T00:00:00.000Z" });
    expect(markReportDeleted(deleted, job.id)).toBe(deleted); // idempotent
    expect(markReportDeleted(site, "other")).toBe(site);
    expect(markReportRestored(deleted, job.id).history[0]!.sourceDeletedAt).toBe("");
  });

  it("knows whether a source report can be opened", () => {
    const { site, job } = setup();
    const e = site.history[0]!;
    expect(sourceState(e, new Set([job.id]))).toBe("available");
    expect(sourceState(e, new Set())).toBe("missing");
    expect(sourceState({ ...e, sourceDeletedAt: "x" }, new Set([job.id]))).toBe("deleted");
    expect(sourceState({ ...e, reportId: "" }, new Set())).toBe("none");
  });

  it("deleting, undoing and clearing reports in the app updates the site history accordingly", () => {
    const { site, job } = setup();
    saveRegister(site);
    saveReport(job);
    render(<ReportsApp />);
    const card = screen.getAllByRole("listitem").find((li) => li.getAttribute("data-report") === job.id)!;
    fireEvent.click(within(card).getByRole("button", { name: "Delete" }));
    expect(getRegister(site.id)!.history[0]!.sourceDeletedAt).not.toBe("");
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(loadReports().reports).toHaveLength(1);
    expect(getRegister(site.id)!.history[0]!.sourceDeletedAt).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "Clear saved reports" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete all" }));
    expect(getRegister(site.id)!.history).toHaveLength(1); // history kept
    expect(getRegister(site.id)!.history[0]!.sourceDeletedAt).not.toBe("");
  });

  it("shows deleted and missing sources without broken links", () => {
    const { site, job } = setup();
    const other = { ...site.history[0]!, id: "x2", reportId: "not-here", reportLabel: "Imported job" };
    saveRegister({ ...markReportDeleted(site, job.id), history: [...markReportDeleted(site, job.id).history, other] });
    window.history.replaceState(null, "", `/tech-docs?id=${site.id}`);
    render(<TechDocsApp />);
    fireEvent.click(screen.getByRole("button", { name: "Open CAM-01" }));
    const hist = screen.getByRole("list", { name: "Equipment history" });
    expect(within(hist).queryByRole("link")).toBeNull();
    expect(hist.querySelector('[data-source="deleted"]')).toHaveTextContent("report since deleted");
    expect(hist.querySelector('[data-source="missing"]')).toHaveTextContent("not on this device");
  });

  it("a duplicated linked report starts with blank results, so it adds no history of its own until work is recorded", () => {
    const { site, job } = setup();
    const copy = duplicateReport(job);
    expect(copy.equipment[0]).toMatchObject({ status: "not-tested", findings: "", work: "", recommendations: "", priority: "" });
    expect(copy.equipment[0]!.source!.equipmentId).toBe(job.equipment[0]!.source!.equipmentId);
    expect(serviceEvents(copy, site).map((e) => e.type)).toEqual(["inspection"]);
    expect(serviceEvents(copy, site)[0]!.description).toBe("Service inspection — Not Tested.");
    // Standalone items keep their content when duplicated (unchanged behaviour).
    const plain = applyEdit(createReport("cctv"), { type: "add-item", itemType: "Camera" });
    const p2 = applyEdit(plain, { type: "update-item", id: plain.equipment[0]!.id, patch: { status: "pass", findings: "ok" } });
    expect(duplicateReport(p2).equipment[0]).toMatchObject({ status: "pass", findings: "ok" });
  });

  it("re-syncing after deletion marks never duplicates, and the Excel history labels deleted sources and removed equipment", async () => {
    const { site, job } = setup();
    let s = markReportDeleted(site, job.id);
    s = applyRegisterEdit(s, { type: "remove-item", id: site.equipment[2]!.id });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await buildTechWorkbook(s, ExcelJS).xlsx.writeBuffer());
    const h = wb.getWorksheet("Equipment History")!;
    const row = (h.getRow(TABLE_ROW + 1).values as unknown[]).slice(1).map(String);
    expect(row[1]).toBe("CAM-01 (removed from register)");
    expect(row[5]).toMatch(/JOB-7.*\(report deleted\)$/);
    expect(syncReportHistory(site, job)).toBe(site);
  });
});
