/**
 * Builds the service report workbook (ExcelJS) from saved report data, in the
 * browser — nothing is uploaded. Every cell is plain, editable text or a
 * number; no formulas are written and user text that looks like a formula is
 * neutralised.
 */
import type { Borders, Cell, Workbook as WorkbookType, Worksheet } from "exceljs";
import { JOB_TYPES, STATUSES, type Report } from "./schema";
import { itemLabel, outstandingActions, STATUS_LABEL, statusCounts } from "./report";

export interface ExcelModule {
  Workbook: new () => WorkbookType;
}

/* --------------------------------------------------------- cell safety */

// Characters XML 1.0 forbids (they would corrupt the file), and unpaired UTF-16 surrogates.
const INVALID_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;
/** Leading characters spreadsheet apps may treat as a formula (OWASP CSV/formula injection list). */
const FORMULA_START = /^\s*[=+\-@＝＋－＠]/;
export const MAX_CELL = 32767;

/**
 * Makes user text safe for a cell: strips characters that would corrupt the
 * file, prefixes formula-like text with an apostrophe so it stays text in any
 * spreadsheet app, and keeps within Excel's per-cell limit.
 */
export function safeText(value: string): string {
  let s = value.replace(INVALID_XML, "").replace(LONE_SURROGATE, "").replace(/\r\n?/g, "\n");
  if (FORMULA_START.test(s)) s = `'${s}`;
  return s.length > MAX_CELL ? `${s.slice(0, MAX_CELL - 1)}…` : s;
}

/* -------------------------------------------------------------- styling */

const NAVY = "FF1F3864";
const DIVIDER = "FFDDEBF7";
const BORDER = "FFBFBFBF";
const MUTED = "FF595959";
const FONT = "Calibri";

const thin = { style: "thin" as const, color: { argb: BORDER } };
const box: Partial<Borders> = { top: thin, left: thin, bottom: thin, right: thin };

function header(cell: Cell) {
  cell.font = { name: FONT, size: 11, bold: true, color: { argb: "FFFFFFFF" } };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
  cell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
  cell.border = box;
}

function body(cell: Cell) {
  cell.font = { name: FONT, size: 11 };
  cell.alignment = { vertical: "top", horizontal: "left", wrapText: true };
  cell.border = box;
}

/** Row height that fits wrapped text: Excel doesn't auto-size rows written by a library. */
function fitRow(values: string[], widths: number[]): number {
  const lines = Math.max(
    1,
    ...values.map((v, i) =>
      v
        .split("\n")
        .reduce((n, line) => n + Math.max(1, Math.ceil((line.length * 1.1) / Math.max(widths[i] ?? 10, 4))), 0),
    ),
  );
  return Math.min(409, 15 * lines + 3);
}

function printSetup(ws: Worksheet, landscape: boolean) {
  ws.pageSetup = {
    paperSize: 9, // A4
    orientation: landscape ? "landscape" : "portrait",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: { left: 0.5, right: 0.5, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 },
  };
  ws.headerFooter = { oddFooter: "&L&8Fieldwise service report&R&8Page &P of &N" };
}

/* ---------------------------------------------------------------- sheets */

const jobTypeLabel = (r: Report) => JOB_TYPES.find((j) => j.id === r.jobType)!.label;

function summarySheet(wb: WorkbookType, report: Report, generatedAt: Date) {
  const ws = wb.addWorksheet("Job Summary", { views: [{ showGridLines: false }] });
  const widths = [26, 28, 28, 28];
  ws.columns = widths.map((width) => ({ width }));
  printSetup(ws, false);
  const wide = widths.slice(1).reduce((a, b) => a + b, 0);

  ws.mergeCells("A1:D1");
  const title = ws.getCell("A1");
  title.value = "Fieldwise Service Report";
  title.font = { name: FONT, size: 18, bold: true, color: { argb: NAVY } };
  ws.getRow(1).height = 30;
  ws.mergeCells("A2:D2");
  const sub = ws.getCell("A2");
  sub.value = `${jobTypeLabel(report)} · generated ${generatedAt.toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" })}`;
  sub.font = { name: FONT, size: 10, color: { argb: MUTED } };

  let row = 4;
  const section = (label: string) => {
    ws.mergeCells(row, 1, row, 4);
    const c = ws.getCell(row, 1);
    c.value = label;
    c.font = { name: FONT, size: 12, bold: true, color: { argb: NAVY } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: DIVIDER } };
    c.border = { bottom: { style: "thin", color: { argb: NAVY } } };
    ws.getRow(row).height = 20;
    row++;
  };
  const field = (label: string, value: string) => {
    ws.mergeCells(row, 2, row, 4);
    const l = ws.getCell(row, 1);
    l.value = label;
    body(l);
    l.font = { name: FONT, size: 11, bold: true };
    const v = ws.getCell(row, 2);
    v.value = safeText(value);
    body(v);
    for (const col of [3, 4]) ws.getCell(row, col).border = box;
    ws.getRow(row).height = fitRow([value], [wide]);
    row++;
  };

  section("Job details");
  field("Site", report.siteName);
  field("Site address", report.siteAddress);
  field("Customer", report.customer);
  field("Technician", report.technician);
  field("Job reference", report.reference);
  field("Date", report.date);
  field("Job type", jobTypeLabel(report));
  field("Job description", report.description);
  row++;

  section("Equipment totals");
  const counts = statusCounts(report);
  const totals: [string, number][] = [...STATUSES.map((s) => [s.label, counts[s.id]] as [string, number]), ["Total items", report.equipment.length]];
  for (const [label, n] of totals) {
    const l = ws.getCell(row, 1);
    l.value = label;
    body(l);
    l.font = { name: FONT, size: 11, bold: label === "Total items" };
    const v = ws.getCell(row, 2);
    v.value = n;
    body(v);
    v.alignment = { horizontal: "right", vertical: "top" };
    v.font = { name: FONT, size: 11, bold: label === "Total items" };
    row++;
  }
  row++;

  const blocks: [string, string][] = [
    ["Work summary", report.summary.workCompleted],
    ["Fault summary", report.summary.faults],
    ["Recommendations", report.summary.recommendations],
    ["Outstanding work", report.summary.outstanding],
    ["Parts required", report.summary.parts],
    ["Additional site notes", report.summary.notes],
  ];
  for (const [label, value] of blocks) {
    section(label);
    ws.mergeCells(row, 1, row, 4);
    const c = ws.getCell(row, 1);
    const empty = !value.trim();
    c.value = empty ? "Not recorded" : safeText(value);
    body(c);
    if (empty) c.font = { name: FONT, size: 11, italic: true, color: { argb: MUTED } };
    for (const col of [2, 3, 4]) ws.getCell(row, col).border = box;
    ws.getRow(row).height = fitRow([value], [widths.reduce((a, b) => a + b, 0)]);
    row += 2;
  }
}

const REGISTER_COLUMNS: [string, number][] = [
  ["Item", 7],
  ["Equipment", 24],
  ["Type", 18],
  ["Location", 22],
  ["Make/model", 22],
  ["Status", 15],
  ["Findings", 40],
  ["Work completed", 40],
  ["Recommendations", 40],
  ["Notes", 32],
];

function table(ws: Worksheet, columns: [string, number][], rows: (string | number)[][], empty: string, statusColumn?: number) {
  ws.columns = columns.map(([, width]) => ({ width }));
  const head = ws.getRow(1);
  columns.forEach(([label], i) => {
    const c = head.getCell(i + 1);
    c.value = label;
    header(c);
  });
  head.height = 22;
  ws.views = [{ state: "frozen", ySplit: 1, showGridLines: false }];
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
  printSetup(ws, true);
  ws.pageSetup.printTitlesRow = "1:1";

  if (rows.length === 0) {
    ws.mergeCells(2, 1, 2, columns.length);
    const c = ws.getCell(2, 1);
    c.value = empty;
    body(c);
    c.font = { name: FONT, size: 11, italic: true, color: { argb: MUTED } };
    return;
  }
  rows.forEach((values, r) => {
    const row = ws.getRow(r + 2);
    values.forEach((v, i) => {
      const c = row.getCell(i + 1);
      c.value = typeof v === "number" ? v : safeText(v);
      body(c);
      if (typeof v === "number") c.alignment = { horizontal: "center", vertical: "top" };
      if (statusColumn === i) {
        // Office staff can change the status from a list after export.
        c.dataValidation = { type: "list", allowBlank: true, formulae: [`"${STATUSES.map((s) => s.label).join(",")}"`] };
      }
    });
    row.height = fitRow(
      values.map((v) => String(v)),
      columns.map(([, w]) => w),
    );
  });
}

function registerSheet(wb: WorkbookType, report: Report) {
  const ws = wb.addWorksheet("Equipment Register");
  table(
    ws,
    REGISTER_COLUMNS,
    report.equipment.map((i, n) => [
      n + 1,
      itemLabel(report, i),
      i.type,
      i.location,
      i.makeModel,
      STATUS_LABEL[i.status],
      i.findings,
      i.work,
      i.recommendations,
      i.notes,
    ]),
    "No equipment recorded.",
    5,
  );
}

function actionsSheet(wb: WorkbookType, report: Report) {
  const ws = wb.addWorksheet("Outstanding Actions");
  table(
    ws,
    [
      ["Equipment", 26],
      ["Location", 22],
      ["Issue", 44],
      ["Recommended action", 44],
      ["Priority", 12],
      ["Status", 16],
    ],
    outstandingActions(report).map((a) => [a.item, a.location, a.issue, a.action, a.priority, a.status]),
    "No outstanding actions recorded.",
  );
}

export function buildWorkbook(report: Report, excel: ExcelModule, generatedAt = new Date()): WorkbookType {
  const wb = new excel.Workbook();
  wb.creator = "Fieldwise";
  wb.created = generatedAt;
  wb.modified = generatedAt;
  wb.title = safeText(`Service report${report.siteName ? ` — ${report.siteName}` : ""}`);
  summarySheet(wb, report, generatedAt);
  registerSheet(wb, report);
  actionsSheet(wb, report);
  return wb;
}

/** Generates the workbook bytes. ExcelJS is loaded on demand so it isn't in every page's bundle. */
export async function workbookBytes(report: Report, generatedAt = new Date()): Promise<ArrayBuffer> {
  const mod = await import("exceljs");
  const excel = ((mod as unknown as { default?: ExcelModule }).default ?? mod) as ExcelModule;
  const buffer = await buildWorkbook(report, excel, generatedAt).xlsx.writeBuffer();
  return buffer as ArrayBuffer;
}
