// @vitest-environment node
import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { buildWorkbook, REGISTER_MAX_HEIGHT, safeText, STATUS_COLOURS } from "@/lib/reports/excel";
import { applyEdit, createReport } from "@/lib/reports/report";
import type { Report } from "@/lib/reports/schema";
import { MAX_CELL, MAX_ROW_HEIGHT, splitText, textHeight, wrappedLines } from "@/lib/reports/xlsx-layout";
import { accessFaults, build, intruderInspection, largeRegister, longText, shortCctv } from "./fixtures";

async function open(report: Report) {
  const buffer = (await buildWorkbook(report, ExcelJS, new Date(2026, 9, 27, 12)).xlsx.writeBuffer()) as ArrayBuffer;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  return { wb, buffer };
}
const str = (v: unknown) => (v === null || v === undefined ? "" : typeof v === "object" && v && "richText" in v ? "" : String(v));
const values = (ws: ExcelJS.Worksheet, row: number) => (ws.getRow(row).values as unknown[]).slice(1).map(str);
/** Finds the first cell whose text equals `text`. */
function find(ws: ExcelJS.Worksheet, text: string): ExcelJS.Cell | null {
  let hit: ExcelJS.Cell | null = null;
  ws.eachRow((row) => row.eachCell((c) => (hit ??= str(c.value) === text ? c : null)));
  return hit;
}
/** Value next to a Job Summary label (labels span 2 columns, values follow). */
const detail = (ws: ExcelJS.Worksheet, label: string) => {
  const c = find(ws, label.toUpperCase())!;
  return str(ws.getCell(Number(c.row), Number(c.col) + 2).value);
};
const allCells = (wb: ExcelJS.Workbook) => {
  const out: ExcelJS.Cell[] = [];
  for (const ws of wb.worksheets) ws.eachRow((row) => row.eachCell((c) => out.push(c)));
  return out;
};

describe("Job Summary", () => {
  it("has a compact professional header with date and reference on the right", async () => {
    const ws = (await open(shortCctv())).wb.getWorksheet("Job Summary")!;
    expect(str(ws.getCell("A1").value)).toBe("SERVICE REPORT");
    expect(ws.getCell("A1").font).toMatchObject({ bold: true, color: { argb: "FF1F3864" } });
    expect(str(ws.getCell("A2").value)).toBe("Fieldwise  |  CCTV");
    expect(str(ws.getCell("G1").value)).toBe("27 Oct 2026");
    expect(ws.getCell("G1").alignment).toMatchObject({ horizontal: "right" });
    expect(str(ws.getCell("G2").value)).toBe("Ref: JOB-1042");
    expect(ws.getCell("A2").border?.bottom).toMatchObject({ style: "medium" });
    expect(ws.views[0]).toMatchObject({ showGridLines: false });
  });

  it("lays job details out in two label/value columns", async () => {
    const ws = (await open(intruderInspection())).wb.getWorksheet("Job Summary")!;
    expect(detail(ws, "Site")).toBe("Riverside Medical Centre");
    expect(detail(ws, "Date")).toBe("27 Oct 2026");
    expect(detail(ws, "Customer")).toBe("Riverside Health Pty Ltd");
    expect(detail(ws, "Technician")).toBe("Sam Nguyen");
    expect(detail(ws, "Address")).toBe("Level 2, 45 River Street\nParramatta NSW 2150"); // line break kept
    expect(detail(ws, "Job ref")).toBe("INSP-2026-118");
    expect(detail(ws, "Job type")).toBe("Intruder Alarm");
    expect(detail(ws, "Job description")).toMatch(/^Six-monthly preventative maintenance/);
    // Site and Date share a row.
    expect(find(ws, "SITE")!.row).toBe(find(ws, "DATE")!.row);
    expect(find(ws, "CUSTOMER")!.row).toBe(find(ws, "TECHNICIAN")!.row);
  });

  it("shows equipment totals as a horizontal overview calculated from the entries", async () => {
    const ws = (await open(intruderInspection())).wb.getWorksheet("Job Summary")!;
    const tiles = ["PASS", "FAULT", "RECOMMENDATION", "NOT TESTED", "TOTAL"].map((t) => find(ws, t)!);
    expect(new Set(tiles.map((c) => c.row)).size).toBe(1);
    const count = (c: ExcelJS.Cell) => ws.getCell(Number(c.row) + 1, Number(c.col)).value;
    expect(tiles.map(count)).toEqual([6, 1, 1, 1, 9]);
    expect(ws.getCell(Number(tiles[1]!.row) + 1, Number(tiles[1]!.col)).font).toMatchObject({ color: { argb: STATUS_COLOURS.fault.font } });
  });

  it("includes only narrative sections that have content, keeping line breaks", async () => {
    const ws = (await open(shortCctv())).wb.getWorksheet("Job Summary")!;
    for (const heading of ["WORK COMPLETED", "FAULTS IDENTIFIED", "PARTS REQUIRED"]) expect(find(ws, heading), heading).not.toBeNull();
    for (const heading of ["RECOMMENDATIONS", "OUTSTANDING WORK", "ADDITIONAL SITE NOTES"]) expect(find(ws, heading), heading).toBeNull();
    const intruder = (await open(intruderInspection())).wb.getWorksheet("Job Summary")!;
    const work = find(intruder, "WORK COMPLETED")!;
    expect(str(intruder.getCell(Number(work.row) + 1, 1).value)).toBe("• Walk tested all detectors\n• Tested siren/strobe\n• Battery load test\n• Communicator test signal confirmed");
    expect(intruder.getCell(Number(work.row) + 1, 1).alignment).toMatchObject({ wrapText: true, vertical: "top" });
    expect(work.fill).toMatchObject({ fgColor: { argb: "FFDDEBF7" } });
  });

  it("says so briefly when no narrative was written, and shows dashes for empty details", async () => {
    const ws = (await open(createReport("general", ""))).wb.getWorksheet("Job Summary")!;
    expect(find(ws, "No work summary, faults or recommendations were written for this report.")).not.toBeNull();
    expect(detail(ws, "Site")).toBe("—");
    expect(find(ws, "JOB DESCRIPTION")).toBeNull();
  });

  it("prints on A4 portrait, fitted to width only, with a footer and page numbers", async () => {
    const ws = (await open(shortCctv())).wb.getWorksheet("Job Summary")!;
    expect(ws.pageSetup).toMatchObject({ paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0 });
    expect(ws.pageSetup.printArea).toMatch(/^A1:J\d+$/);
    expect(ws.headerFooter.oddFooter).toContain("Generated with Fieldwise");
    expect(ws.headerFooter.oddFooter).toContain("Page &P of &N");
  });

  it("splits very long narrative into rows within Excel's limits without losing text", async () => {
    const report = longText();
    const ws = (await open(report)).wb.getWorksheet("Job Summary")!;
    const start = Number(find(ws, "WORK COMPLETED")!.row) + 1;
    const parts: string[] = [];
    for (let r = start; str(ws.getCell(r, 1).value); r++) {
      parts.push(str(ws.getCell(r, 1).value));
      expect(ws.getRow(r).height).toBeLessThanOrEqual(MAX_ROW_HEIGHT);
    }
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.join(" ").replace(/\s+/g, " ")).toBe(report.summary.workCompleted.replace(/\s+/g, " "));
  });
});

describe("Equipment Register", () => {
  it("has a compact header and every equipment field", async () => {
    const ws = (await open(intruderInspection())).wb.getWorksheet("Equipment Register")!;
    expect(str(ws.getCell("A1").value)).toBe("EQUIPMENT REGISTER");
    expect(str(ws.getCell("A2").value)).toBe("Site: Riverside Medical Centre   ·   Job ref: INSP-2026-118   ·   Job type: Intruder Alarm   ·   Date: 27 Oct 2026");
    expect(values(ws, 4)).toEqual(["Item", "Equipment", "Type", "Location", "Make/model", "Status", "Findings", "Work completed", "Recommendations", "Priority", "Additional notes"]);
    expect(values(ws, 10)).toEqual([
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
    expect(values(ws, 13)[10]).toBe("Staff unavailable to test during visit");
    expect(ws.getCell("A10").value).toBe(6); // a real number, so sorting works
  });

  it("freezes the headings and item columns, filters, and keeps status and priority drop-downs", async () => {
    const ws = (await open(intruderInspection())).wb.getWorksheet("Equipment Register")!;
    expect(ws.views[0]).toMatchObject({ state: "frozen", ySplit: 4, xSplit: 2 });
    expect(ws.autoFilter).toBe("A4:K13");
    expect(ws.getCell("F5").dataValidation).toMatchObject({ type: "list", formulae: ['"Pass,Fault,Recommendation,Not Tested"'] });
    expect(ws.getCell("J5").dataValidation).toMatchObject({ type: "list", formulae: ['"High,Medium,Low"'] });
    expect(ws.getCell("A4").fill).toMatchObject({ fgColor: { argb: "FF1F3864" } });
    expect(ws.getCell("G10").alignment).toMatchObject({ wrapText: true, vertical: "top" });
    expect(ws.getCell("G5").fill ?? { pattern: "none" }).toMatchObject({ pattern: "none" }); // no row colouring
    expect(ws.getCell("F5").fill ?? { pattern: "none" }).toMatchObject({ pattern: "none" }); // status colour comes from the rule, not a fixed fill
  });

  it("colours only the status cells, via rules that follow edits", async () => {
    const { buffer } = await open(intruderInspection());
    const zip = await JSZip.loadAsync(buffer);
    const sheet = await zip.file("xl/worksheets/sheet2.xml")!.async("string");
    expect(sheet).toContain('<conditionalFormatting sqref="F5:F13">');
    for (const label of ["Pass", "Fault", "Recommendation", "Not Tested"]) expect(sheet).toContain(`&quot;${label}&quot;`);
    expect((sheet.match(/<conditionalFormatting /g) ?? []).length).toBe(1);
  });

  it("prints landscape at a readable scale, repeating headings and item columns", async () => {
    const ws = (await open(intruderInspection())).wb.getWorksheet("Equipment Register")!;
    expect(ws.pageSetup).toMatchObject({ orientation: "landscape", paperSize: 9, fitToPage: false, scale: 85, printTitlesRow: "4:4", printTitlesColumn: "A:B" });
  });

  it("handles 100+ items with sequential numbering, filters and status rules over every row", async () => {
    const report = largeRegister();
    const { wb, buffer } = await open(report);
    const ws = wb.getWorksheet("Equipment Register")!;
    expect(ws.rowCount).toBe(4 + 120);
    for (let i = 1; i <= 120; i++) expect(ws.getCell(4 + i, 1).value).toBe(i);
    expect(ws.autoFilter).toBe("A4:K124");
    const sheet = await (await JSZip.loadAsync(buffer)).file("xl/worksheets/sheet2.xml")!.async("string");
    expect(sheet).toContain('sqref="F5:F124"');
    expect(wb.getWorksheet("Outstanding Actions")!.rowCount).toBe(4 + 40);
  });

  it("keeps rows readable: long cells show a preview and the full text goes to the Full Text sheet", async () => {
    const report = longText();
    const { wb } = await open(report);
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Job Summary", "Equipment Register", "Outstanding Actions", "Full Text"]);
    const reg = wb.getWorksheet("Equipment Register")!;
    const findings = str(reg.getCell("G5").value);
    expect(findings).toMatch(/… continued in the Full Text sheet \(ref T1\)\.$/);
    expect(reg.getRow(5).height).toBeLessThanOrEqual(REGISTER_MAX_HEIGHT + 20);
    const full = wb.getWorksheet("Full Text")!;
    expect(values(full, 4)).toEqual(["Ref", "Item", "Equipment", "Field", "Part", "Text"]);
    const parts: string[] = [];
    full.eachRow((row, n) => {
      if (n > 4 && row.getCell(1).value === "T1") parts.push(str(row.getCell(6).value));
    });
    expect(parts.join(" ").replace(/\s+/g, " ")).toBe(report.equipment[0]!.findings.replace(/\s+/g, " "));
    expect(values(full, 5).slice(0, 4)).toEqual(["T1", "1", "Camera 1", "Findings"]);
    // The same issue appears in Outstanding Actions with its own reference.
    expect(str(wb.getWorksheet("Outstanding Actions")!.getCell("D5").value)).toMatch(/ref T\d+\)\.$/);
  });

  it("says so briefly when there is no equipment", async () => {
    const ws = (await open(createReport("cctv", ""))).wb.getWorksheet("Equipment Register")!;
    expect(str(ws.getCell("A4").value)).toBe("No equipment was recorded in this report.");
    expect(ws.autoFilter).toBeFalsy();
  });
});

describe("Outstanding Actions", () => {
  it("lists items needing attention with their register numbers and no invented actions or priorities", async () => {
    const ws = (await open(intruderInspection())).wb.getWorksheet("Outstanding Actions")!;
    expect(str(ws.getCell("A1").value)).toBe("OUTSTANDING ACTIONS");
    expect(values(ws, 4)).toEqual(["Item", "Equipment", "Location", "Identified issue", "Recommended action", "Priority", "Status"]);
    expect(values(ws, 5)).toEqual(["5", "PIR 3", "Consult 2", "Detector partially blocked by new shelving", "Relocate detector or move shelving", "", "Recommendation"]);
    expect(values(ws, 6)).toEqual(["6", "Reed switch 1", "Rear door", "Zone fails to seal; reed gap too wide after door realignment", "Replace reed switch and magnet", "Medium", "Fault"]);
    expect(ws.rowCount).toBe(6);
    expect(ws.views[0]).toMatchObject({ state: "frozen", ySplit: 4 });
    expect(ws.autoFilter).toBe("A4:G6");
    expect(ws.pageSetup).toMatchObject({ orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: "4:4" });
  });

  it("covers multiple faults", async () => {
    const ws = (await open(accessFaults())).wb.getWorksheet("Outstanding Actions")!;
    expect([5, 6, 7, 8].map((r) => values(ws, r)[0])).toEqual(["2", "3", "5", "6"]);
    expect(values(ws, 7)).toEqual(["5", "Electric strike 1", "Store room", "Strike binds under door load", "Adjust door closer / strike alignment", "", "Fault"]);
  });

  it("shows a concise message instead of an empty table", async () => {
    const ws = (await open(build("cctv", { siteName: "X" }, [{ type: "Camera", status: "pass" }]))).wb.getWorksheet("Outstanding Actions")!;
    expect(str(ws.getCell("A4").value)).toBe("No outstanding actions — no equipment was marked Fault or Recommendation.");
    expect(ws.rowCount).toBe(4);
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
    expect(str(reg.getCell("G5").value)).toBe("'=1+1");
    expect(str(reg.getCell("K5").value)).toBe("'-2+3");
    expect(str(reg.getCell("D5").value)).toBe("'\t=cmd");
    const sum = wb.getWorksheet("Job Summary")!;
    expect(detail(sum, "Site")).toBe(`'=HYPERLINK("http://evil.example","x")`);
    expect(str(sum.getCell("G2").value)).toBe("Ref: @SUM(A1)"); // not at the start of the cell
  });

  it("keeps special characters, removes only characters XLSX can't store", async () => {
    const r = build("general", { siteName: "Ünïcödé ✓ 日本語 😀 <tag> & \"quotes\" \u0007bell \uD800lone" }, [{ type: "Camera", findings: "tab\there & <b>" }]);
    const { wb } = await open(r);
    expect(detail(wb.getWorksheet("Job Summary")!, "Site")).toBe('Ünïcödé ✓ 日本語 😀 <tag> & "quotes" bell lone');
    expect(str(wb.getWorksheet("Equipment Register")!.getCell("G5").value)).toBe("tab\there & <b>");
  });

  it("text beyond Excel's per-cell limit is kept in full across Full Text rows", async () => {
    const r = shortCctv();
    const huge = "x".repeat(40_000); // larger than any field allows today, to prove nothing is cut
    r.equipment[0]!.notes = huge;
    const { wb } = await open(r);
    const full = wb.getWorksheet("Full Text")!;
    let joined = "";
    full.eachRow((row, n) => {
      if (n > 4) {
        const text = str(row.getCell(6).value);
        expect(text.length).toBeLessThanOrEqual(MAX_CELL);
        joined += text;
      }
    });
    expect(joined).toBe(huge);
    expect(allCells(wb).every((c) => str(c.value).length <= MAX_CELL)).toBe(true);
  });

  it("all row heights stay within Excel's limit", async () => {
    for (const make of [shortCctv, intruderInspection, accessFaults, longText, largeRegister]) {
      const { wb } = await open(make());
      for (const ws of wb.worksheets) ws.eachRow((row) => expect(row.height ?? 15).toBeLessThanOrEqual(MAX_ROW_HEIGHT));
    }
  });

  it("works for every job type", async () => {
    for (const jobType of ["cctv", "intruder", "access", "general"] as const) {
      const { wb } = await open(build(jobType, { siteName: "S" }, [{ type: "Item", status: "fault", findings: "f" }]));
      expect(wb.worksheets.map((w) => w.name)).toEqual(["Job Summary", "Equipment Register", "Outstanding Actions"]);
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
});
