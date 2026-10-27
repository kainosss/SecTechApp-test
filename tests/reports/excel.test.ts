// @vitest-environment node
import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { buildWorkbook, MAX_CELL, safeText } from "@/lib/reports/excel";
import { applyEdit, createReport } from "@/lib/reports/report";
import type { Report } from "@/lib/reports/schema";

function sample(): Report {
  let r = createReport("cctv", "Sam Tech", new Date("2026-03-04T10:00:00"));
  r = applyEdit(r, { type: "set", patch: { siteName: "Harbour Depot", customer: "Acme Logistics", reference: "JOB-1042", siteAddress: "1 Wharf Rd\nSydney NSW" } });
  r = applyEdit(r, { type: "add-item", itemType: "Camera" });
  r = applyEdit(r, { type: "update-item", id: r.equipment[0]!.id, patch: { location: "Gate 2", status: "fault", findings: "No video", recommendations: "Replace PoE injector", priority: "High" } });
  r = applyEdit(r, { type: "add-item", itemType: "NVR" });
  r = applyEdit(r, { type: "update-item", id: r.equipment[1]!.id, patch: { status: "pass", work: "Firmware checked", makeModel: "Generic 16ch" } });
  r = applyEdit(r, { type: "add-item", itemType: "Camera" });
  r = applyEdit(r, { type: "update-item", id: r.equipment[2]!.id, patch: { status: "recommendation", findings: "Lens dirty" } });
  r = applyEdit(r, { type: "summary", patch: { workCompleted: "Checked all cameras", parts: "1x PoE injector" } });
  return r;
}

async function roundTrip(report: Report) {
  const buffer = await buildWorkbook(report, ExcelJS, new Date("2026-03-04T12:00:00")).xlsx.writeBuffer();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as ArrayBuffer);
  return { wb, bytes: (buffer as ArrayBuffer).byteLength };
}
const text = (ws: ExcelJS.Worksheet, ref: string) => {
  const v = ws.getCell(ref).value;
  return v === null || v === undefined ? "" : String(v);
};
const rowValues = (ws: ExcelJS.Worksheet, n: number) => (ws.getRow(n).values as unknown[]).slice(1).map((v) => (v === null || v === undefined ? "" : v));
const findRow = (ws: ExcelJS.Worksheet, label: string) => {
  let found = -1;
  ws.eachRow((row, n) => {
    if (found < 0 && row.getCell(1).value === label) found = n;
  });
  return found;
};

describe("generated workbook", () => {
  it("is a real XLSX with the three sheets in order", async () => {
    const { wb, bytes } = await roundTrip(sample());
    expect(bytes).toBeGreaterThan(4000);
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Job Summary", "Equipment Register", "Outstanding Actions"]);
    expect(wb.creator).toBe("Fieldwise");
  });

  it("Job Summary shows the job details, totals and summaries", async () => {
    const { wb } = await roundTrip(sample());
    const ws = wb.getWorksheet("Job Summary")!;
    expect(text(ws, "A1")).toBe("Fieldwise Service Report");
    const value = (label: string) => String(ws.getRow(findRow(ws, label)).getCell(2).value ?? "");
    expect(value("Site")).toBe("Harbour Depot");
    expect(value("Site address")).toBe("1 Wharf Rd\nSydney NSW");
    expect(value("Customer")).toBe("Acme Logistics");
    expect(value("Technician")).toBe("Sam Tech");
    expect(value("Job reference")).toBe("JOB-1042");
    expect(value("Date")).toBe("2026-03-04");
    expect(value("Job type")).toBe("CCTV");
    expect(ws.getRow(findRow(ws, "Pass")).getCell(2).value).toBe(1);
    expect(ws.getRow(findRow(ws, "Fault")).getCell(2).value).toBe(1);
    expect(ws.getRow(findRow(ws, "Recommendation")).getCell(2).value).toBe(1);
    expect(ws.getRow(findRow(ws, "Not Tested")).getCell(2).value).toBe(0);
    expect(ws.getRow(findRow(ws, "Total items")).getCell(2).value).toBe(3);
    expect(ws.getRow(findRow(ws, "Work summary") + 1).getCell(1).value).toBe("Checked all cameras");
    expect(ws.getRow(findRow(ws, "Fault summary") + 1).getCell(1).value).toBe("Not recorded"); // not invented
    expect(ws.getRow(findRow(ws, "Parts required") + 1).getCell(1).value).toBe("1x PoE injector");
    expect(ws.getCell("A4").fill).toMatchObject({ fgColor: { argb: "FFDDEBF7" } }); // section divider
    expect(ws.pageSetup).toMatchObject({ paperSize: 9, fitToWidth: 1 });
  });

  it("Equipment Register has every item, frozen headings, a filter and editable status", async () => {
    const { wb } = await roundTrip(sample());
    const ws = wb.getWorksheet("Equipment Register")!;
    expect(rowValues(ws, 1)).toEqual(["Item", "Equipment", "Type", "Location", "Make/model", "Status", "Findings", "Work completed", "Recommendations", "Notes"]);
    expect(rowValues(ws, 2)).toEqual([1, "Camera 1", "Camera", "Gate 2", "", "Fault", "No video", "", "Replace PoE injector", ""]);
    expect(rowValues(ws, 3).slice(0, 6)).toEqual([2, "NVR 1", "NVR", "", "Generic 16ch", "Pass"]);
    expect(rowValues(ws, 4)[1]).toBe("Camera 2");
    expect(ws.rowCount).toBe(4);
    expect(ws.views[0]).toMatchObject({ state: "frozen", ySplit: 1 });
    expect(ws.autoFilter).toBeTruthy();
    expect(ws.getCell("A1").fill).toMatchObject({ fgColor: { argb: "FF1F3864" } });
    expect(ws.getCell("A1").font).toMatchObject({ bold: true, color: { argb: "FFFFFFFF" } });
    expect(ws.getCell("G2").alignment).toMatchObject({ wrapText: true });
    expect(ws.getCell("F2").dataValidation).toMatchObject({ type: "list" });
    expect(ws.getColumn(7).width).toBe(40);
    expect(ws.pageSetup.orientation).toBe("landscape");
  });

  it("Outstanding Actions lists only items needing attention, with the technician's own priority", async () => {
    const { wb } = await roundTrip(sample());
    const ws = wb.getWorksheet("Outstanding Actions")!;
    expect(rowValues(ws, 1)).toEqual(["Equipment", "Location", "Issue", "Recommended action", "Priority", "Status"]);
    expect(rowValues(ws, 2)).toEqual(["Camera 1", "Gate 2", "No video", "Replace PoE injector", "High", "Fault"]);
    expect(rowValues(ws, 3)).toEqual(["Camera 2", "", "Lens dirty", "", "", "Recommendation"]); // no invented action or priority
    expect(ws.rowCount).toBe(3);
  });

  it("an empty report still produces a valid workbook with clear placeholders", async () => {
    const { wb } = await roundTrip(createReport("general", ""));
    expect(text(wb.getWorksheet("Equipment Register")!, "A2")).toBe("No equipment recorded.");
    expect(text(wb.getWorksheet("Outstanding Actions")!, "A2")).toBe("No outstanding actions recorded.");
  });

  it("never writes formulas, even when users type them", async () => {
    let r = sample();
    r = applyEdit(r, { type: "set", patch: { siteName: '=HYPERLINK("http://evil.example","click")', customer: "+61 2 9999 0000", reference: "@SUM(A1)" } });
    r = applyEdit(r, { type: "update-item", id: r.equipment[0]!.id, patch: { findings: "=1+1", notes: "-2+3", location: "\t=cmd" } });
    const { wb } = await roundTrip(r);
    const all: unknown[] = [];
    for (const ws of wb.worksheets) ws.eachRow((row) => row.eachCell((c) => all.push(c.value)));
    expect(all.some((v) => typeof v === "object" && v !== null && ("formula" in v || "sharedFormula" in v))).toBe(false);
    const reg = wb.getWorksheet("Equipment Register")!;
    expect(text(reg, "G2")).toBe("'=1+1");
    expect(text(reg, "J2")).toBe("'-2+3");
    expect(text(reg, "D2")).toBe("'\t=cmd");
    const sum = wb.getWorksheet("Job Summary")!;
    expect(String(sum.getRow(findRow(sum, "Site")).getCell(2).value)).toBe(`'=HYPERLINK("http://evil.example","click")`);
  });

  it("handles long text, unusual characters and control characters without corrupting the file", async () => {
    let r = sample();
    const long = "Long note. ".repeat(4000); // 44 000 chars, beyond Excel's cell limit
    r = applyEdit(r, { type: "update-item", id: r.equipment[1]!.id, patch: { notes: long, findings: "Ünïcödé ✓ 日本語 😀 <tag> & \"quotes\" \u0007bell \uD800lone" } });
    const { wb } = await roundTrip(r);
    const reg = wb.getWorksheet("Equipment Register")!;
    expect(text(reg, "J3").length).toBe(MAX_CELL);
    expect(text(reg, "G3")).toBe('Ünïcödé ✓ 日本語 😀 <tag> & "quotes" bell lone');
    expect(reg.getRow(3).height).toBeLessThanOrEqual(409);
  });
});

describe("safeText", () => {
  it("neutralises formula starts and leaves ordinary text alone", () => {
    for (const s of ["=A1", "+1", "-1", "@x", "\t=1", "\r=1", "＝A1"]) expect(safeText(s).startsWith("'")).toBe(true);
    for (const s of ["Camera 1", "1 = one", "Replace lens", "2.2 kΩ", ""]) expect(safeText(s)).toBe(s);
  });
});
