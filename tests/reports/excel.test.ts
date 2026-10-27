// @vitest-environment node
import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import {
  absolutePrintAreas,
  ACTION_COLUMNS,
  buildWorkbook,
  finalizeXlsx,
  headerFooterText,
  inspectionOverview,
  PALETTE,
  REGISTER_COLUMNS,
  REGISTER_MAX_HEIGHT,
  safeText,
  STATUS_COLOURS,
} from "@/lib/reports/excel";
import { applyEdit, createReport, draftSummary } from "@/lib/reports/report";
import type { Report } from "@/lib/reports/schema";
import { MAX_CELL, MAX_ROW_HEIGHT, splitText, textHeight, wrappedLines } from "@/lib/reports/xlsx-layout";
import { accessFaults, build, cctvFaults, emptyReport, intruderInspection, largeRegister, longText, shortCctv } from "./fixtures";

/** Builds, writes and post-processes the workbook exactly as the app does, then reopens the real file. */
async function open(report: Report) {
  const raw = (await buildWorkbook(report, ExcelJS, new Date(2026, 9, 27, 12)).xlsx.writeBuffer()) as ArrayBuffer;
  const buffer = await finalizeXlsx(raw);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  return { wb, buffer };
}
async function xml(buffer: ArrayBuffer, path: string) {
  return (await JSZip.loadAsync(buffer)).file(path)!.async("string");
}
const str = (v: unknown): string => {
  if (v === null || v === undefined) return "";
  if (typeof v === "object" && "richText" in v) return (v as { richText: { text: string }[] }).richText.map((r) => r.text).join("");
  return String(v);
};
const values = (ws: ExcelJS.Worksheet, row: number) => (ws.getRow(row).values as unknown[]).slice(1).map(str);
/** Finds the first cell whose text equals `text` (or matches a pattern). */
function find(ws: ExcelJS.Worksheet, text: string | RegExp): ExcelJS.Cell | null {
  let hit: ExcelJS.Cell | null = null;
  const match = (s: string) => (typeof text === "string" ? s === text : text.test(s));
  ws.eachRow((row) => row.eachCell((c) => (hit ??= match(str(c.value)) ? c : null)));
  return hit;
}
/** Value next to a Job Summary label (labels span 2 columns, values follow). */
const detail = (ws: ExcelJS.Worksheet, label: string) => {
  const c = find(ws, label.toUpperCase())!;
  return str(ws.getCell(Number(c.row), Number(c.col) + 2).value);
};
/** Numbered section heading cell, e.g. "5   IDENTIFIED DEFECTS". */
const heading = (ws: ExcelJS.Worksheet, title: string) => find(ws, new RegExp(`^\\d+\\s+${title.toUpperCase()}$`));
/** Rows of a summary section: from its heading to the next heading (or the end). */
function sectionRows(ws: ExcelJS.Worksheet, title: string): number[] {
  const start = Number(heading(ws, title)!.row);
  const rows: number[] = [];
  for (let r = start + 1; r <= ws.rowCount; r++) {
    if (/^\d+\s+[A-Z]/.test(str(ws.getCell(r, 1).value))) break;
    rows.push(r);
  }
  return rows;
}
/** Body rows of the summary table in a section, reading the given columns. */
function tableIn(ws: ExcelJS.Worksheet, title: string, cols: number[]) {
  const rows = sectionRows(ws, title);
  const head = rows.find((r) => str(ws.getCell(r, 1).value) === "EQUIPMENT")!;
  // Table rows have their own Location cell (column D); full-width paragraphs and subheadings are one merged cell.
  return rows.filter((r) => r > head && str(ws.getCell(r, 1).value) && ws.getCell(r, 4).master.address === `D${r}`).map((r) => cols.map((c) => str(ws.getCell(r, c).value)));
}
const sectionText = (ws: ExcelJS.Worksheet, title: string) => sectionRows(ws, title).map((r) => str(ws.getCell(r, 1).value)).filter(Boolean);
const allCells = (wb: ExcelJS.Workbook) => {
  const out: ExcelJS.Cell[] = [];
  for (const ws of wb.worksheets) ws.eachRow((row) => row.eachCell((c) => out.push(c)));
  return out;
};
const plainArea = (a: string | undefined) => (a ?? "").replace(/\$/g, "");
const passOnly = () => build("cctv", { siteName: "X" }, [{ type: "Camera", status: "pass" }]);

describe("Job Summary", () => {
  it("has a corporate header: title, job-type subtitle, report date and job reference on the right", async () => {
    const ws = (await open(intruderInspection())).wb.getWorksheet("Job Summary")!;
    expect(str(ws.getCell("A1").value)).toBe("SERVICE REPORT");
    expect(ws.getCell("A1").font).toMatchObject({ bold: true, size: 22, name: "Calibri", color: { argb: PALETTE.navy } });
    expect(str(ws.getCell("A2").value)).toBe("INTRUDER ALARM SERVICE");
    expect(ws.getCell("A2").font).toMatchObject({ color: { argb: PALETTE.blue } });
    expect(str(ws.getCell("G1").value)).toBe("REPORT DATE");
    expect(str(ws.getCell("I1").value)).toBe("27 Oct 2026");
    expect(str(ws.getCell("G2").value)).toBe("JOB REFERENCE");
    expect(str(ws.getCell("I2").value)).toBe("INSP-2026-118");
    expect(ws.getCell("I2").alignment).toMatchObject({ horizontal: "right" });
    expect(ws.getCell("A2").border?.bottom).toMatchObject({ style: "medium", color: { argb: PALETTE.navy } });
    expect(ws.views[0]).toMatchObject({ showGridLines: false });
  });

  it("identifies the report in a label/value panel", async () => {
    const ws = (await open(intruderInspection())).wb.getWorksheet("Job Summary")!;
    expect(detail(ws, "Site")).toBe("Riverside Medical Centre");
    expect(detail(ws, "Inspection date")).toBe("27 Oct 2026");
    expect(detail(ws, "Customer")).toBe("Riverside Health Pty Ltd");
    expect(detail(ws, "Job reference")).toBe("INSP-2026-118");
    expect(detail(ws, "Site address")).toBe("Level 2, 45 River Street\nParramatta NSW 2150"); // line break kept
    expect(detail(ws, "Job type")).toBe("Intruder Alarm");
    expect(detail(ws, "Technician")).toBe("Sam Nguyen");
    expect(detail(ws, "Job description")).toMatch(/^Six-monthly preventative maintenance/);
    expect(find(ws, "SITE")!.row).toBe(find(ws, "INSPECTION DATE")!.row);
    expect(find(ws, "SITE")!.fill).toMatchObject({ fgColor: { argb: PALETTE.lightGrey } });
  });

  it("numbers sections in order and shows only those with content", async () => {
    const ws = (await open(intruderInspection())).wb.getWorksheet("Job Summary")!;
    const titles: string[] = [];
    ws.eachRow((row) => {
      const s = str(row.getCell(1).value);
      if (/^\d+\s+[A-Z]/.test(s)) titles.push(s.replace(/\s+/, " "));
    });
    expect(titles).toEqual([
      "1 REPORT IDENTIFICATION",
      "2 INSPECTION OVERVIEW",
      "3 INSPECTION SUMMARY",
      "4 WORK COMPLETED",
      "5 IDENTIFIED DEFECTS",
      "6 RECOMMENDATIONS & FOLLOW-UP",
      "7 ADDITIONAL INFORMATION",
    ]);
    const ws2 = (await open(passOnly())).wb.getWorksheet("Job Summary")!;
    expect(heading(ws2, "Recommendations & follow-up")).toBeNull();
    expect(heading(ws2, "Additional information")).toBeNull();
    expect(heading(ws2, "Work completed")).toBeNull();
    expect(heading(ws2, "Identified defects")).not.toBeNull(); // always stated, even when there are none
  });

  it("shows inspection overview tiles calculated from the entries", async () => {
    const ws = (await open(intruderInspection())).wb.getWorksheet("Job Summary")!;
    const tiles = ["TOTAL INSPECTED", "PASSED", "FAULTS", "RECOMMENDATIONS", "NOT TESTED"].map((t) => find(ws, t)!);
    expect(new Set(tiles.map((c) => c.row)).size).toBe(1);
    const count = (c: ExcelJS.Cell) => ws.getCell(Number(c.row) + 1, Number(c.col)).value;
    expect(tiles.map(count)).toEqual([8, 6, 1, 1, 1]); // total inspected excludes not tested
    const faults = tiles[2]!;
    expect(ws.getCell(Number(faults.row) + 1, Number(faults.col)).font).toMatchObject({ color: { argb: STATUS_COLOURS.fault.font } });
    expect(faults.fill).toMatchObject({ fgColor: { argb: STATUS_COLOURS.fault.fill } });
    const none = (await open(passOnly())).wb.getWorksheet("Job Summary")!;
    expect(find(none, "FAULTS")!.fill).toMatchObject({ fgColor: { argb: PALETTE.lightGrey } });
  });

  it("states the inspection summary factually from the counts", async () => {
    const report = intruderInspection();
    const ws = (await open(report)).wb.getWorksheet("Job Summary")!;
    expect(inspectionOverview(report)).toBe("This report records 9 items of equipment: 6 passed, 1 was recorded with a fault, 1 has a recommendation and 1 was not tested.");
    expect(sectionText(ws, "Inspection summary")).toEqual([`${inspectionOverview(report)} Total inspected excludes items not tested.`]);
    const empty = (await open(emptyReport())).wb.getWorksheet("Job Summary")!;
    expect(sectionText(empty, "Inspection summary")).toEqual(["No equipment was recorded in this report."]);
  });

  it("keeps the technician's work summary with its line breaks", async () => {
    const ws = (await open(intruderInspection())).wb.getWorksheet("Job Summary")!;
    expect(sectionText(ws, "Work completed")).toEqual(["• Walk tested all detectors\n• Tested siren/strobe\n• Battery load test\n• Communicator test signal confirmed"]);
  });

  it("lists identified defects as a table of the fault entries", async () => {
    const ws = (await open(cctvFaults())).wb.getWorksheet("Job Summary")!;
    expect(tableIn(ws, "Identified defects", [1, 4, 6])).toEqual([
      ["NVR 1", "Security office", "Drive 2 reporting SMART errors; recording gaps overnight"],
      ["Camera 1", "Car park level 1", "Image out of focus after bracket was knocked"],
      ["Camera 3", "Loading dock", "No IR at night"],
    ]);
    const blank = (await open(build("cctv", { siteName: "X" }, [{ type: "Camera", status: "fault" }]))).wb.getWorksheet("Job Summary")!;
    expect(tableIn(blank, "Identified defects", [1, 4, 6])).toEqual([["Camera 1", "", "No finding written"]]);
  });

  it("uses restrained wording when there are no faults, and never infers one from Not Tested", async () => {
    const ws = (await open(build("cctv", { siteName: "X" }, [{ type: "Camera", status: "pass" }, { type: "Camera", status: "not-tested" }]))).wb.getWorksheet("Job Summary")!;
    expect(sectionText(ws, "Identified defects")).toEqual(["No equipment was recorded as faulty in this report. 1 item was not tested, so its condition was not assessed."]);
    expect(find(ws, "EQUIPMENT")).toBeNull();
  });

  it("does not repeat narrative that only restates the auto-fill", async () => {
    const r = cctvFaults();
    const auto = draftSummary(r).faults;
    const ws = (await open(applyEdit(r, { type: "summary", patch: { faults: auto } }))).wb.getWorksheet("Job Summary")!;
    expect(find(ws, auto)).toBeNull();
    expect(tableIn(ws, "Identified defects", [1]).length).toBe(3);
    // Text the technician wrote themselves is kept.
    const own = (await open(intruderInspection())).wb.getWorksheet("Job Summary")!;
    expect(sectionText(own, "Identified defects")[0]).toBe("• Reed switch 1 (Rear door): fails to seal");
  });

  it("gives recommendations, an action table with entered priorities, and outstanding work", async () => {
    const ws = (await open(intruderInspection())).wb.getWorksheet("Job Summary")!;
    expect(sectionText(ws, "Recommendations & follow-up")[0]).toBe("• Replace rear door reed switch\n• Relocate Consult 2 PIR");
    expect(tableIn(ws, "Recommendations & follow-up", [1, 4, 6, 10])).toEqual([
      ["PIR 3", "Consult 2", "Relocate detector or move shelving", ""], // no invented priority
      ["Reed switch 1", "Rear door", "Replace reed switch and magnet", "Medium"],
    ]);
    expect(find(ws, "Medium")!.font).toMatchObject({ color: { argb: "FF8A5A00" } });
    const out = find(ws, "Outstanding work")!;
    expect(str(ws.getCell(Number(out.row) + 1, 1).value)).toBe("• Duress device not tested — staff unavailable");
  });

  it("shows only additional information that was entered", async () => {
    const intruder = (await open(intruderInspection())).wb.getWorksheet("Job Summary")!;
    expect(sectionText(intruder, "Additional information")).toEqual(["Additional site notes", "Site contact: practice manager. Access via rear lane."]);
    const short = (await open(shortCctv())).wb.getWorksheet("Job Summary")!;
    expect(sectionText(short, "Additional information")).toEqual(["Parts required", "1 × PoE injector"]);
  });

  it("marks missing details as not recorded, without inventing anything", async () => {
    const ws = (await open(createReport("general", ""))).wb.getWorksheet("Job Summary")!;
    expect(detail(ws, "Customer")).toBe("Not recorded");
    expect(detail(ws, "Technician")).toBe("Not recorded");
    expect(str(ws.getCell("I2").value)).toBe("—");
    expect(find(ws, "JOB DESCRIPTION")).toBeNull();
    for (const t of [/signature/i, /approved/i, /pty ltd/i, /\babn\b/i]) expect(find(ws, t)).toBeNull();
  });

  it("prints on A4 portrait, fitted to width only, with footer, job ref and page numbers", async () => {
    const r = shortCctv();
    r.reference = "A&B 12";
    const ws = (await open(r)).wb.getWorksheet("Job Summary")!;
    expect(ws.pageSetup).toMatchObject({ paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0 });
    expect(plainArea(ws.pageSetup.printArea)).toMatch(/^A1:J\d+$/);
    const f = ws.headerFooter.oddFooter!;
    expect(f).toContain("Generated with Fieldwise");
    expect(f).toContain("Job ref A&&B 12"); // & escaped so it isn't read as a code
    expect(f).toContain("Page &P of &N");
  });

  it("splits very long narrative into rows within Excel's limits without losing text", async () => {
    const report = longText();
    const ws = (await open(report)).wb.getWorksheet("Job Summary")!;
    const parts = sectionText(ws, "Work completed");
    for (const r of sectionRows(ws, "Work completed")) expect(ws.getRow(r).height ?? 15).toBeLessThanOrEqual(MAX_ROW_HEIGHT);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.join(" ").replace(/\s+/g, " ")).toBe(report.summary.workCompleted.replace(/\s+/g, " "));
  });
});

describe("Equipment Register", () => {
  it("has a title block and every equipment field, with the table at row 6", async () => {
    const ws = (await open(intruderInspection())).wb.getWorksheet("Equipment Register")!;
    expect(str(ws.getCell("A1").value)).toBe("EQUIPMENT REGISTER");
    expect(str(ws.getCell("A2").value)).toBe("Riverside Medical Centre   ·   Intruder Alarm   ·   Job ref INSP-2026-118   ·   27 Oct 2026");
    expect(str(ws.getCell("A3").value)).toBe("9 items   ·   Pass 6   ·   Fault 1   ·   Recommendation 1   ·   Not Tested 1");
    expect(values(ws, 6)).toEqual(REGISTER_COLUMNS.map((c) => c.label));
    expect(values(ws, 6)).toEqual(["No.", "Equipment", "Type", "Location", "Make/model", "Status", "Findings", "Work completed", "Recommendations", "Priority", "Additional notes"]);
    expect(values(ws, 12)).toEqual([
      "6",
      "Reed switch 1",
      "Reed switch",
      "Rear door",
      "",
      "Fault",
      "Zone fails to seal; reed gap too wide after door realignment",
      "Adjusted magnet, still intermittent",
      "Replace reed switch and magnet",
      "Medium",
      "",
    ]);
    expect(values(ws, 15)[10]).toBe("Staff unavailable to test during visit");
    expect(ws.getCell("A12").value).toBe(6); // a real number, so sorting works
  });

  it("freezes headings and identification columns, filters, and keeps status and priority drop-downs", async () => {
    const ws = (await open(intruderInspection())).wb.getWorksheet("Equipment Register")!;
    expect(ws.views[0]).toMatchObject({ state: "frozen", ySplit: 6, xSplit: 2 });
    expect(ws.autoFilter).toBe("A6:K15");
    expect(ws.getCell("F7").dataValidation).toMatchObject({ type: "list", formulae: ['"Pass,Fault,Recommendation,Not Tested"'] });
    expect(ws.getCell("J7").dataValidation).toMatchObject({ type: "list", formulae: ['"High,Medium,Low"'] });
    expect(ws.getCell("A6").fill).toMatchObject({ fgColor: { argb: PALETTE.navy } });
    expect(ws.getCell("A6").font).toMatchObject({ bold: true, color: { argb: PALETTE.white } });
    expect(ws.getCell("B7").font).toMatchObject({ bold: true });
    expect(ws.getCell("G12").alignment).toMatchObject({ wrapText: true, vertical: "top" });
    expect(ws.getCell("F7").fill ?? { pattern: "none" }).toMatchObject({ pattern: "none" }); // colour comes from the rule
  });

  it("colours status and priority cells via rules that follow edits", async () => {
    const { buffer } = await open(intruderInspection());
    const sheet = await xml(buffer, "xl/worksheets/sheet2.xml");
    expect(sheet).toContain('<conditionalFormatting sqref="F7:F15">');
    expect(sheet).toContain('<conditionalFormatting sqref="J7:J15">');
    for (const label of ["Pass", "Fault", "Recommendation", "Not Tested", "High", "Medium", "Low"]) expect(sheet).toContain(`&quot;${label}&quot;`);
    expect((sheet.match(/<conditionalFormatting /g) ?? []).length).toBe(2);
  });

  it("prints all columns on A4 landscape, repeating the heading row, with a page header and absolute print area", async () => {
    const { wb, buffer } = await open(intruderInspection());
    const ws = wb.getWorksheet("Equipment Register")!;
    expect(ws.pageSetup).toMatchObject({ orientation: "landscape", paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: "6:6" });
    expect(plainArea(ws.pageSetup.printArea)).toBe("A6:K15"); // the title block is identified by the page header instead
    expect(ws.headerFooter.oddHeader).toContain("EQUIPMENT REGISTER");
    expect(ws.headerFooter.oddHeader).toContain("Riverside Medical Centre");
    expect(ws.headerFooter.oddFooter).toContain("Job ref INSP-2026-118");
    expect(await xml(buffer, "xl/workbook.xml")).toContain("&apos;Equipment Register&apos;!$A$6:$K$15");
  });

  it("handles 100+ items with sequential numbering, filters and rules over every row", async () => {
    const { wb, buffer } = await open(largeRegister());
    const ws = wb.getWorksheet("Equipment Register")!;
    expect(ws.rowCount).toBe(6 + 120);
    for (let i = 1; i <= 120; i++) expect(ws.getCell(6 + i, 1).value).toBe(i);
    expect(ws.autoFilter).toBe("A6:K126");
    const sheet = await xml(buffer, "xl/worksheets/sheet2.xml");
    expect(sheet).toContain('sqref="F7:F126"');
    expect(sheet).toContain('sqref="J7:J126"');
    expect(wb.getWorksheet("Outstanding Actions")!.rowCount).toBe(6 + 40);
  });

  it("keeps rows readable: long cells show a preview and the full text goes to the Full Text sheet", async () => {
    const report = longText();
    const { wb } = await open(report);
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Job Summary", "Equipment Register", "Outstanding Actions", "Full Text"]);
    const reg = wb.getWorksheet("Equipment Register")!;
    expect(str(reg.getCell("G7").value)).toMatch(/… continued in the Full Text sheet \(ref T1\)\.$/);
    expect(reg.getRow(7).height).toBeLessThanOrEqual(REGISTER_MAX_HEIGHT + 20);
    const full = wb.getWorksheet("Full Text")!;
    expect(str(full.getCell("A1").value)).toBe("FULL TEXT");
    expect(values(full, 6)).toEqual(["Ref", "No.", "Equipment", "Field", "Part", "Text"]);
    const parts: string[] = [];
    full.eachRow((row, n) => {
      if (n > 6 && row.getCell(1).value === "T1") parts.push(str(row.getCell(6).value));
    });
    expect(parts.join(" ").replace(/\s+/g, " ")).toBe(report.equipment[0]!.findings.replace(/\s+/g, " "));
    expect(values(full, 7).slice(0, 5)).toEqual(["T1", "1", "Camera 1", "Findings", `1 of ${parts.length}`]);
    expect(full.views[0]).toMatchObject({ state: "frozen", ySplit: 6 });
    expect(full.autoFilter).toMatch(/^A6:F\d+$/);
    // The same issue appears in Outstanding Actions with its own reference.
    expect(str(wb.getWorksheet("Outstanding Actions")!.getCell("D7").value)).toMatch(/ref T\d+\)\.$/);
  });

  it("adds no Full Text sheet when nothing overflows", async () => {
    const { wb } = await open(cctvFaults());
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Job Summary", "Equipment Register", "Outstanding Actions"]);
  });

  it("says so briefly when there is no equipment", async () => {
    const ws = (await open(emptyReport())).wb.getWorksheet("Equipment Register")!;
    expect(str(ws.getCell("A6").value)).toBe("No equipment was recorded in this report.");
    expect(ws.autoFilter).toBeFalsy();
    expect(ws.rowCount).toBe(6);
  });
});

describe("Outstanding Actions", () => {
  it("is a corrective-action schedule with register numbers and no invented actions or priorities", async () => {
    const ws = (await open(intruderInspection())).wb.getWorksheet("Outstanding Actions")!;
    expect(str(ws.getCell("A1").value)).toBe("OUTSTANDING ACTIONS");
    expect(str(ws.getCell("A3").value)).toBe("2 items requiring attention (marked Fault or Recommendation)");
    expect(values(ws, 6)).toEqual(ACTION_COLUMNS.map((c) => c.label));
    expect(values(ws, 6)).toEqual(["No.", "Equipment", "Location", "Finding", "Recommended action", "Priority", "Status"]);
    expect(values(ws, 7)).toEqual(["5", "PIR 3", "Consult 2", "Detector partially blocked by new shelving", "Relocate detector or move shelving", "", "Recommendation"]);
    expect(values(ws, 8)).toEqual(["6", "Reed switch 1", "Rear door", "Zone fails to seal; reed gap too wide after door realignment", "Replace reed switch and magnet", "Medium", "Fault"]);
    expect(ws.rowCount).toBe(8);
    expect(ws.views[0]).toMatchObject({ state: "frozen", ySplit: 6 });
    expect(ws.autoFilter).toBe("A6:G8");
    expect(ws.getCell("G7").dataValidation).toMatchObject({ type: "list" });
    expect(ws.pageSetup).toMatchObject({ orientation: "landscape", paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: "6:6" });
  });

  it("covers multiple faults", async () => {
    const ws = (await open(accessFaults())).wb.getWorksheet("Outstanding Actions")!;
    expect([7, 8, 9, 10].map((r) => values(ws, r)[0])).toEqual(["2", "3", "5", "6"]);
    expect(values(ws, 9)).toEqual(["5", "Electric strike 1", "Store room", "Strike binds under door load", "Adjust door closer / strike alignment", "", "Fault"]);
  });

  it("shows a concise message instead of an empty table", async () => {
    const ws = (await open(passOnly())).wb.getWorksheet("Outstanding Actions")!;
    expect(str(ws.getCell("A6").value)).toBe("No outstanding actions — no equipment was marked Fault or Recommendation.");
    expect(ws.rowCount).toBe(6);
    expect(ws.pageSetup).toMatchObject({ orientation: "landscape", paperSize: 9 });
  });
});

describe("data integrity and safety", () => {
  it("never writes formulas, and formula-like text stays text", async () => {
    let r = shortCctv();
    r = applyEdit(r, { type: "set", patch: { siteName: '=HYPERLINK("http://evil.example","x")', customer: "+61 2 9999 0000", reference: "@SUM(A1)" } });
    r = applyEdit(r, { type: "update-item", id: r.equipment[0]!.id, patch: { findings: "=1+1", notes: "-2+3", location: "\t=cmd", priority: "High" } });
    const { wb } = await open(r);
    expect(allCells(wb).some((c) => c.type === ExcelJS.ValueType.Formula || (typeof c.value === "object" && c.value !== null && "formula" in c.value))).toBe(false);
    const reg = wb.getWorksheet("Equipment Register")!;
    expect(str(reg.getCell("G7").value)).toBe("'=1+1");
    expect(str(reg.getCell("K7").value)).toBe("'-2+3");
    expect(str(reg.getCell("D7").value)).toBe("'=cmd"); // trimmed, still neutralised
    expect(str(reg.getCell("A2").value)).toBe(`'=HYPERLINK("http://evil.example","x")   ·   CCTV   ·   Job ref @SUM(A1)   ·   27 Oct 2026`);
    const sum = wb.getWorksheet("Job Summary")!;
    expect(detail(sum, "Site")).toBe(`'=HYPERLINK("http://evil.example","x")`);
    expect(detail(sum, "Customer")).toBe("'+61 2 9999 0000");
    expect(str(sum.getCell("I2").value)).toBe("'@SUM(A1)");
    // Summary tables carry the same protection.
    expect(tableIn(sum, "Identified defects", [6])).toEqual([["'=1+1"]]);
  });

  it("keeps special characters, removes only characters XLSX can't store", async () => {
    const r = build("general", { siteName: "Ünïcödé ✓ 日本語 😀 <tag> & \"quotes\" \u0007bell \uD800lone" }, [{ type: "Camera", findings: "tab\there & <b>" }]);
    const { wb } = await open(r);
    expect(detail(wb.getWorksheet("Job Summary")!, "Site")).toBe('Ünïcödé ✓ 日本語 😀 <tag> & "quotes" bell lone');
    expect(str(wb.getWorksheet("Equipment Register")!.getCell("G7").value)).toBe("tab\there & <b>");
  });

  it("text beyond Excel's per-cell limit is kept in full across Full Text rows", async () => {
    const r = shortCctv();
    const huge = "x".repeat(40_000); // larger than any field allows today, to prove nothing is cut
    r.equipment[0]!.notes = huge;
    const { wb } = await open(r);
    const full = wb.getWorksheet("Full Text")!;
    let joined = "";
    full.eachRow((row, n) => {
      if (n > 6) {
        const text = str(row.getCell(6).value);
        expect(text.length).toBeLessThanOrEqual(MAX_CELL);
        joined += text;
      }
    });
    expect(joined).toBe(huge);
    expect(allCells(wb).every((c) => str(c.value).length <= MAX_CELL)).toBe(true);
  });

  it("all row heights stay within Excel's limit", async () => {
    for (const make of [shortCctv, cctvFaults, intruderInspection, accessFaults, longText, largeRegister, emptyReport]) {
      const { wb } = await open(make());
      for (const ws of wb.worksheets) ws.eachRow((row) => expect(row.height ?? 15).toBeLessThanOrEqual(MAX_ROW_HEIGHT));
    }
  });

  it("works for every job type, with a matching subtitle", async () => {
    const subtitles = { cctv: "CCTV INSPECTION", intruder: "INTRUDER ALARM SERVICE", access: "ACCESS CONTROL SERVICE", general: "GENERAL SECURITY REPORT" };
    for (const jobType of ["cctv", "intruder", "access", "general"] as const) {
      const { wb } = await open(build(jobType, { siteName: "S" }, [{ type: "Item", status: "fault", findings: "f" }]));
      expect(wb.worksheets.map((w) => w.name)).toEqual(["Job Summary", "Equipment Register", "Outstanding Actions"]);
      expect(str(wb.getWorksheet("Job Summary")!.getCell("A2").value)).toBe(subtitles[jobType]);
    }
  });
});

describe("layout helpers", () => {
  it("estimates wrapped lines from width and explicit breaks", () => {
    expect(wrappedLines("short", 30, 10)).toBe(1);
    expect(wrappedLines("a\nb\nc", 30, 10)).toBe(3);
    expect(wrappedLines("word ".repeat(40).trim(), 30, 10)).toBeGreaterThan(3);
    expect(wrappedLines("x".repeat(200), 30, 10)).toBeGreaterThan(4); // unbroken text wraps too
    expect(textHeight("a\nb", 30, 10)).toBeGreaterThan(textHeight("a", 30, 10));
  });
  it("splits text into chunks that fit and reassemble to the original", () => {
    const text = Array.from({ length: 80 }, (_, i) => `Line ${i} with some words to wrap across the column`).join("\n") + " " + "y".repeat(5000);
    const parts = splitText(text, 40, 10, 150);
    for (const p of parts) {
      expect(textHeight(p, 40, 10)).toBeLessThanOrEqual(150);
      expect(p.length).toBeLessThanOrEqual(MAX_CELL);
    }
    expect(parts.join("").replace(/\s+/g, "")).toBe(text.replace(/\s+/g, ""));
    expect(splitText("fits", 40, 10, 150)).toEqual(["fits"]);
  });
  it("safeText neutralises formula starts only", () => {
    for (const s of ["=A1", "+1", "-1", "@x", "\t=1", "\r=1", " =1", "＝A1"]) expect(safeText(s).startsWith("'")).toBe(true);
    for (const s of ["Camera 1", "1 = one", "Replace lens", "2.2 kΩ", "", "• bullet"]) expect(safeText(s)).toBe(s);
  });
  it("header/footer text escapes codes and stays on one short line", () => {
    expect(headerFooterText("A & B")).toBe("A && B");
    expect(headerFooterText("line\nbreak")).toBe("line break");
    expect(headerFooterText("x".repeat(100), 20)).toBe(`${"x".repeat(19)}…`);
  });
  it("makes print areas fully absolute", () => {
    const xmlIn = `<definedName name="_xlnm.Print_Area" localSheetId="1">'Equipment Register'!$A6:$K13</definedName>`;
    expect(absolutePrintAreas(xmlIn)).toBe(`<definedName name="_xlnm.Print_Area" localSheetId="1">'Equipment Register'!$A$6:$K$13</definedName>`);
    expect(absolutePrintAreas(absolutePrintAreas(xmlIn))).toBe(absolutePrintAreas(xmlIn));
  });
});
