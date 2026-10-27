/**
 * Builds the service report workbook (ExcelJS) from saved report data, in the
 * browser — nothing is uploaded.
 *
 * Sheets: a customer-facing Job Summary (A4 portrait), a technical Equipment
 * Register and an Outstanding Actions register (A4 landscape), plus a Full
 * Text sheet only when a register cell is too long to show in a usable row.
 * Every cell is plain editable text, a number or a date; no formulas are
 * written and user text that looks like a formula stays text.
 *
 * Long text: Job Summary narrative is split across consecutive rows (at line
 * and word boundaries) so nothing exceeds Excel's row-height or cell limits.
 * In the registers a cell shows as much as fits a readable row, ends with a
 * pointer ("continued in Full Text, ref T1"), and the complete text is on the
 * Full Text sheet — so rows stay sortable and nothing is silently dropped.
 */
import type { Borders, Cell, Workbook as WorkbookType, Worksheet } from "exceljs";
import { itemLabel, outstandingActions, STATUS_LABEL, statusCounts } from "./report";
import { JOB_TYPES, PRIORITIES, STATUSES, type ItemStatus, type Report } from "./schema";
import { cleanText, displayDate, MAX_ROW_HEIGHT, rowHeight, safeText, splitText, textHeight } from "./xlsx-layout";

export { MAX_CELL, safeText } from "./xlsx-layout";

export interface ExcelModule {
  Workbook: new () => WorkbookType;
}

/* ------------------------------------------------------------------ style */

const NAVY = "FF1F3864";
const DIVIDER = "FFDDEBF7";
const RULE = "FFD0D5DD";
const TEXT = "FF1F2328";
const MUTED = "FF5B6573";
const WHITE = "FFFFFFFF";
const FONT = "Calibri";
const BODY = 10;

/** Muted status colours, used only on status cells. */
export const STATUS_COLOURS: Record<ItemStatus, { fill: string; font: string }> = {
  pass: { fill: "FFE2EFDA", font: "FF375623" },
  fault: { fill: "FFF8D7DA", font: "FF9C0006" },
  recommendation: { fill: "FFFFF2CC", font: "FF7F6000" },
  "not-tested": { fill: "FFEDEDED", font: "FF595959" },
};

const hairline = { style: "thin" as const, color: { argb: RULE } };
const grid: Partial<Borders> = { top: hairline, left: hairline, bottom: hairline, right: hairline };

const font = (size = BODY, extra: Partial<Cell["font"]> = {}): Cell["font"] => ({ name: FONT, size, color: { argb: TEXT }, ...extra });

function setText(cell: Cell, text: string) {
  cell.value = safeText(text);
}

function wrapTop(cell: Cell, horizontal: "left" | "center" | "right" = "left") {
  cell.alignment = { vertical: "top", horizontal, wrapText: true };
}

/** Report title (e.g. SERVICE REPORT) with a subtitle line; `span` wraps the subtitle across that many columns. */
function title(ws: Worksheet, text: string, sub: string, size: number, span?: { columns: number; width: number }) {
  const t = ws.getCell("A1");
  t.value = text;
  t.font = font(size, { bold: true, color: { argb: NAVY } });
  t.alignment = { vertical: "bottom" };
  ws.getRow(1).height = size + 12;
  if (span) ws.mergeCells(2, 1, 2, span.columns);
  const s = ws.getCell("A2");
  setText(s, sub);
  s.font = font(BODY, { color: { argb: MUTED } });
  s.alignment = { vertical: "top", wrapText: Boolean(span) };
  ws.getRow(2).height = span ? rowHeight([{ text: sub, width: span.width }], BODY) : 16;
}

const span = (columns: Column[]) => ({ columns: columns.length, width: columns.reduce((a, c) => a + c.width, 0) });

/** Light-blue divider row with a small navy caps heading. */
function sectionHeading(ws: Worksheet, row: number, lastCol: number, text: string) {
  ws.mergeCells(row, 1, row, lastCol);
  const c = ws.getCell(row, 1);
  c.value = text.toUpperCase();
  c.font = font(9, { bold: true, color: { argb: NAVY } });
  c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: DIVIDER } };
  c.alignment = { vertical: "middle", indent: 1 };
  ws.getRow(row).height = 18;
}

function tableHeader(ws: Worksheet, row: number, labels: string[]) {
  const r = ws.getRow(row);
  labels.forEach((label, i) => {
    const c = r.getCell(i + 1);
    c.value = label;
    c.font = font(BODY, { bold: true, color: { argb: WHITE } });
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
    c.alignment = { vertical: "middle", wrapText: true };
    c.border = grid;
  });
  r.height = 20;
}

function footer(ws: Worksheet) {
  // Only fixed text here: user text in header/footer codes would need escaping.
  ws.headerFooter = { oddFooter: "&L&8Generated with Fieldwise&R&8Page &P of &N", evenFooter: "&L&8Generated with Fieldwise&R&8Page &P of &N" };
}

type PrintOptions = { orientation: "portrait" | "landscape"; lastCol: number; lastRow: number; fitWidth?: boolean; scale?: number; titlesRow?: string; titlesColumn?: string };

function print(ws: Worksheet, o: PrintOptions) {
  ws.pageSetup = {
    paperSize: 9, // A4
    orientation: o.orientation,
    // Fit to the page width only when that keeps text readable; long reports flow onto more pages.
    fitToPage: Boolean(o.fitWidth),
    fitToWidth: 1,
    fitToHeight: 0,
    scale: o.scale ?? 100,
    pageOrder: "overThenDown",
    horizontalCentered: false,
    margins: { left: 0.5, right: 0.5, top: 0.55, bottom: 0.6, header: 0.3, footer: 0.3 },
    printArea: `A1:${colLetter(o.lastCol)}${o.lastRow}`,
    ...(o.titlesRow ? { printTitlesRow: o.titlesRow } : {}),
    ...(o.titlesColumn ? { printTitlesColumn: o.titlesColumn } : {}),
  };
  footer(ws);
}

function colLetter(n: number): string {
  let s = "";
  for (let x = n; x > 0; x = Math.floor((x - 1) / 26)) s = String.fromCharCode(65 + ((x - 1) % 26)) + s;
  return s;
}

const jobTypeLabel = (r: Report) => JOB_TYPES.find((j) => j.id === r.jobType)!.label;

/* -------------------------------------------------- Full Text overflow */

/** Register cells taller than this show a preview and point to the Full Text sheet. */
export const REGISTER_MAX_HEIGHT = 200;
const FULL_TEXT_WIDTH = 100;

interface OverflowEntry {
  ref: string;
  item: string;
  equipment: string;
  field: string;
  text: string;
}

class Overflow {
  entries: OverflowEntry[] = [];
  /** Text for a register cell: the whole text if it fits a readable row, otherwise a preview plus a pointer. */
  cell(text: string, width: number, ctx: { item: string; equipment: string; field: string }): string {
    const clean = cleanText(text);
    if (textHeight(clean, width, BODY) <= REGISTER_MAX_HEIGHT) return clean;
    const ref = `T${this.entries.length + 1}`;
    this.entries.push({ ref, ...ctx, text: clean });
    const note = `… continued in the Full Text sheet (ref ${ref}).`;
    const preview = splitText(clean, width, BODY, REGISTER_MAX_HEIGHT - textHeight(note, width, BODY))[0]!;
    return `${preview}\n${note}`;
  }
}

function fullTextSheet(wb: WorkbookType, report: Report, overflow: Overflow) {
  if (overflow.entries.length === 0) return;
  const ws = wb.addWorksheet("Full Text", { views: [{ state: "frozen", ySplit: 4, showGridLines: false }] });
  const columns: [string, number][] = [
    ["Ref", 6],
    ["Item", 6],
    ["Equipment", 22],
    ["Field", 16],
    ["Part", 8],
    ["Text", FULL_TEXT_WIDTH],
  ];
  ws.columns = columns.map(([, width]) => ({ width }));
  title(ws, "FULL TEXT", `Complete text for long register entries · ${metaLine(report)}`, 14, { columns: columns.length, width: columns.reduce((t, [, w]) => t + w, 0) });
  tableHeader(ws, 4, columns.map(([l]) => l));
  let row = 5;
  for (const e of overflow.entries) {
    const parts = splitText(e.text, FULL_TEXT_WIDTH, BODY, MAX_ROW_HEIGHT - 10);
    parts.forEach((part, i) => {
      const r = ws.getRow(row++);
      const values = [e.ref, e.item, e.equipment, e.field, parts.length > 1 ? `${i + 1} of ${parts.length}` : "1 of 1", part];
      values.forEach((v, c) => {
        const cell = r.getCell(c + 1);
        setText(cell, v);
        cell.font = font();
        cell.border = grid;
        wrapTop(cell);
      });
      r.height = rowHeight([{ text: part, width: FULL_TEXT_WIDTH }], BODY);
    });
  }
  ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: row - 1, column: columns.length } };
  print(ws, { orientation: "landscape", lastCol: columns.length, lastRow: row - 1, fitWidth: true, titlesRow: "4:4" });
}

const metaLine = (r: Report) =>
  [r.siteName && `Site: ${r.siteName}`, r.reference && `Job ref: ${r.reference}`, `Job type: ${jobTypeLabel(r)}`, r.date && `Date: ${displayDate(r.date)}`].filter(Boolean).join("   ·   ");

/* ----------------------------------------------------------- Job Summary */

/** Ten narrow columns give a flexible grid: two label/value pairs per row, or five status tiles. */
const SUMMARY_COLS = 10;
const SUMMARY_COL_WIDTH = 9.4;
const SUMMARY_WIDTH = SUMMARY_COLS * SUMMARY_COL_WIDTH;
/** Usable A4 portrait height in points at 100 % (page minus margins, header and footer). */
const PAGE_HEIGHT = 720;
/** Narrative text is split into rows of at most this height so pages fill evenly and headings stay with text. */
const NARRATIVE_BLOCK = 200;

function summarySheet(wb: WorkbookType, report: Report) {
  const ws = wb.addWorksheet("Job Summary", { views: [{ showGridLines: false }] });
  ws.columns = Array.from({ length: SUMMARY_COLS }, () => ({ width: SUMMARY_COL_WIDTH }));
  ws.properties.defaultRowHeight = 16;

  // Header: title left, date and reference right, a navy rule beneath.
  title(ws, "SERVICE REPORT", `Fieldwise  |  ${jobTypeLabel(report)}`, 18);
  ws.mergeCells("G1:J1");
  const date = ws.getCell("G1");
  setText(date, report.date ? displayDate(report.date) : "");
  date.font = font(12, { bold: true, color: { argb: NAVY } });
  date.alignment = { horizontal: "right", vertical: "bottom" };
  ws.mergeCells("G2:J2");
  const ref = ws.getCell("G2");
  setText(ref, report.reference ? `Ref: ${report.reference}` : "");
  ref.font = font(BODY, { color: { argb: MUTED } });
  ref.alignment = { horizontal: "right" };
  for (let c = 1; c <= SUMMARY_COLS; c++) ws.getCell(2, c).border = { bottom: { style: "medium", color: { argb: NAVY } } };

  let row = 4;
  let used = 30 + 16 + 16; // header rows so far
  const spacer = (h = 8) => {
    ws.getRow(row).height = h;
    used += h;
    row++;
  };
  /** Starts a section, moving it to a new printed page rather than stranding the heading at the bottom. */
  const heading = (text: string, firstRowHeight: number) => {
    // Keep the heading with its whole first block of text (blocks are at most NARRATIVE_BLOCK points).
    if (used + 18 + firstRowHeight > PAGE_HEIGHT && row > 4) {
      ws.getRow(row - 1).addPageBreak();
      used = 0;
    }
    sectionHeading(ws, row, SUMMARY_COLS, text);
    used += 18;
    row++;
  };
  const track = (h: number) => {
    used += h;
    if (used > PAGE_HEIGHT) used = h; // Excel breaks the page here on its own
  };

  // Job details: two label/value pairs per row.
  const label = (cell: Cell, text: string) => {
    cell.value = text.toUpperCase();
    cell.font = font(8.5, { bold: true, color: { argb: MUTED } });
    cell.alignment = { vertical: "top", wrapText: true };
  };
  const valueCell = (cell: Cell, text: string) => {
    setText(cell, text || "—");
    cell.font = text ? font(BODY) : font(BODY, { color: { argb: MUTED } });
    wrapTop(cell);
  };
  const ruleRow = (r: number) => {
    for (let c = 1; c <= SUMMARY_COLS; c++) ws.getCell(r, c).border = { bottom: hairline };
  };
  const pairs: [string, string, string, string][] = [
    ["Site", report.siteName, "Date", report.date ? displayDate(report.date) : ""],
    ["Customer", report.customer, "Technician", report.technician],
    ["Address", report.siteAddress, "Job ref", report.reference],
    ["Job type", jobTypeLabel(report), "", ""],
  ];
  heading("Job details", 18);
  for (const [l1, v1, l2, v2] of pairs) {
    ws.mergeCells(row, 1, row, 2);
    ws.mergeCells(row, 3, row, 5);
    ws.mergeCells(row, 6, row, 7);
    ws.mergeCells(row, 8, row, 10);
    label(ws.getCell(row, 1), l1);
    valueCell(ws.getCell(row, 3), cleanText(v1));
    if (l2) {
      label(ws.getCell(row, 6), l2);
      valueCell(ws.getCell(row, 8), cleanText(v2));
    }
    const h = rowHeight(
      [
        { text: v1, width: SUMMARY_COL_WIDTH * 3 },
        { text: v2, width: SUMMARY_COL_WIDTH * 3 },
      ],
      BODY,
      18,
    );
    ws.getRow(row).height = h;
    ruleRow(row);
    track(h);
    row++;
  }
  if (report.description.trim()) {
    const parts = splitText(cleanText(report.description.trim()), SUMMARY_COL_WIDTH * 8, BODY, NARRATIVE_BLOCK);
    parts.forEach((part, i) => {
      ws.mergeCells(row, 1, row, 2);
      ws.mergeCells(row, 3, row, SUMMARY_COLS);
      if (i === 0) label(ws.getCell(row, 1), "Job description");
      valueCell(ws.getCell(row, 3), part);
      const h = rowHeight([{ text: part, width: SUMMARY_COL_WIDTH * 8 }], BODY, 18);
      ws.getRow(row).height = h;
      if (i === parts.length - 1) ruleRow(row);
      track(h);
      row++;
    });
  }
  spacer(10);

  // Equipment status overview: five tiles across.
  heading("Equipment status", 40);
  const counts = statusCounts(report);
  const tiles: [string, number, string][] = [
    ...STATUSES.map((s) => [s.label.toUpperCase(), counts[s.id], STATUS_COLOURS[s.id].font] as [string, number, string]),
    ["TOTAL", report.equipment.length, NAVY],
  ];
  tiles.forEach(([text, n, colour], i) => {
    const c = i * 2 + 1;
    ws.mergeCells(row, c, row, c + 1);
    ws.mergeCells(row + 1, c, row + 1, c + 1);
    const l = ws.getCell(row, c);
    l.value = text;
    l.font = font(8.5, { bold: true, color: { argb: MUTED } });
    l.alignment = { horizontal: "center", vertical: "bottom" };
    const v = ws.getCell(row + 1, c);
    v.value = n;
    v.font = font(16, { bold: true, color: { argb: colour } });
    v.alignment = { horizontal: "center", vertical: "middle" };
    for (const col of [c, c + 1]) ws.getCell(row + 1, col).border = { bottom: { style: "medium", color: { argb: colour } } };
  });
  ws.getRow(row).height = 16;
  ws.getRow(row + 1).height = 26;
  track(42);
  row += 2;
  spacer(10);

  // Narrative: only sections the technician filled in.
  const sections: [string, string][] = [
    ["Work completed", report.summary.workCompleted],
    ["Faults identified", report.summary.faults],
    ["Recommendations", report.summary.recommendations],
    ["Outstanding work", report.summary.outstanding],
    ["Parts required", report.summary.parts],
    ["Additional site notes", report.summary.notes],
  ];
  const filled = sections.filter(([, text]) => text.trim());
  if (filled.length === 0) {
    heading("Report notes", 18);
    ws.mergeCells(row, 1, row, SUMMARY_COLS);
    const c = ws.getCell(row, 1);
    c.value = "No work summary, faults or recommendations were written for this report.";
    c.font = font(BODY, { italic: true, color: { argb: MUTED } });
    ws.getRow(row).height = 18;
    row++;
  }
  for (const [name, text] of filled) {
    const parts = splitText(cleanText(text.trim()), SUMMARY_WIDTH - 2, BODY, NARRATIVE_BLOCK);
    heading(name, rowHeight([{ text: parts[0]!, width: SUMMARY_WIDTH - 2 }], BODY, 18));
    for (const part of parts) {
      ws.mergeCells(row, 1, row, SUMMARY_COLS);
      const c = ws.getCell(row, 1);
      setText(c, part);
      c.font = font(BODY);
      c.alignment = { vertical: "top", wrapText: true, indent: 1 };
      const h = rowHeight([{ text: part, width: SUMMARY_WIDTH - 2 }], BODY, 18);
      ws.getRow(row).height = h;
      track(h);
      row++;
    }
    spacer(8);
  }

  print(ws, { orientation: "portrait", lastCol: SUMMARY_COLS, lastRow: row - 1, fitWidth: true });
}

/* ------------------------------------------------------ data registers */

interface Column {
  label: string;
  width: number;
  kind?: "number" | "status" | "priority";
}

function register(ws: Worksheet, columns: Column[], rows: { values: (string | number)[]; status: ItemStatus }[]) {
  ws.columns = columns.map((c) => ({ width: c.width }));
  tableHeader(ws, 4, columns.map((c) => c.label));
  rows.forEach(({ values }, r) => {
    const row = ws.getRow(r + 5);
    values.forEach((v, i) => {
      const col = columns[i]!;
      const cell = row.getCell(i + 1);
      if (typeof v === "number") cell.value = v;
      else setText(cell, v);
      cell.font = font();
      cell.border = grid;
      wrapTop(cell, col.kind === "number" || col.kind === "priority" ? "center" : "left");
      if (col.kind === "status") {
        cell.dataValidation = { type: "list", allowBlank: true, showErrorMessage: true, formulae: [`"${STATUSES.map((s) => s.label).join(",")}"`] };
        cell.alignment = { vertical: "top", horizontal: "center" };
        cell.font = font(BODY, { bold: true });
      }
      if (col.kind === "priority") {
        cell.dataValidation = { type: "list", allowBlank: true, showErrorMessage: true, formulae: [`"${PRIORITIES.filter(Boolean).join(",")}"`] };
      }
    });
    row.height = rowHeight(
      values.map((v, i) => ({ text: String(v), width: columns[i]!.width })),
      BODY,
      18,
    );
  });
  const last = 4 + rows.length;
  const statusCol = columns.findIndex((c) => c.kind === "status") + 1;
  if (statusCol > 0 && rows.length > 0) {
    // Colour follows the value, so it stays right when office staff change a status from the list.
    const ref = `${colLetter(statusCol)}5:${colLetter(statusCol)}${last}`;
    ws.addConditionalFormatting({
      ref,
      rules: STATUSES.map((s, priority) => ({
        type: "cellIs" as const,
        operator: "equal" as const,
        priority: priority + 1,
        formulae: [`"${s.label}"`],
        style: {
          fill: { type: "pattern" as const, pattern: "solid" as const, bgColor: { argb: STATUS_COLOURS[s.id].fill } },
          font: { color: { argb: STATUS_COLOURS[s.id].font }, bold: true },
        },
      })),
    });
  }
  ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: Math.max(last, 4), column: columns.length } };
  ws.views = [{ state: "frozen", ySplit: 4, xSplit: 2, showGridLines: false, topLeftCell: "C5" }];
  return last;
}

function emptyMessage(ws: Worksheet, lastCol: number, text: string) {
  ws.mergeCells(4, 1, 4, lastCol);
  const c = ws.getCell(4, 1);
  c.value = text;
  c.font = font(BODY, { italic: true, color: { argb: MUTED } });
  ws.getRow(4).height = 20;
}

const REGISTER_COLUMNS: Column[] = [
  { label: "Item", width: 6, kind: "number" },
  { label: "Equipment", width: 22 },
  { label: "Type", width: 16 },
  { label: "Location", width: 18 },
  { label: "Make/model", width: 18 },
  { label: "Status", width: 15, kind: "status" },
  { label: "Findings", width: 30 },
  { label: "Work completed", width: 30 },
  { label: "Recommendations", width: 30 },
  { label: "Priority", width: 10, kind: "priority" },
  { label: "Additional notes", width: 26 },
];

function registerSheet(wb: WorkbookType, report: Report, overflow: Overflow) {
  const ws = wb.addWorksheet("Equipment Register");
  title(ws, "EQUIPMENT REGISTER", metaLine(report), 14, span(REGISTER_COLUMNS));
  ws.getRow(3).height = 6;
  if (report.equipment.length === 0) {
    ws.columns = REGISTER_COLUMNS.map((c) => ({ width: c.width }));
    emptyMessage(ws, REGISTER_COLUMNS.length, "No equipment was recorded in this report.");
    print(ws, { orientation: "landscape", lastCol: REGISTER_COLUMNS.length, lastRow: 4, scale: 85 });
    return;
  }
  const width = (label: string) => REGISTER_COLUMNS.find((c) => c.label === label)!.width;
  const rows = report.equipment.map((item, n) => {
    const name = itemLabel(report, item);
    const long = (field: string, text: string) => overflow.cell(text, width(field), { item: String(n + 1), equipment: name, field });
    return {
      status: item.status,
      values: [
        n + 1,
        name,
        item.type,
        item.location,
        item.makeModel,
        STATUS_LABEL[item.status],
        long("Findings", item.findings),
        long("Work completed", item.work),
        long("Recommendations", item.recommendations),
        item.priority,
        long("Additional notes", item.notes),
      ],
    };
  });
  const last = register(ws, REGISTER_COLUMNS, rows);
  // Eleven columns can't be read on one A4 page width: print at 85 % (item to work completed on the first page
  // across, the rest on the next) and repeat the heading row and item/equipment columns on every page.
  print(ws, { orientation: "landscape", lastCol: REGISTER_COLUMNS.length, lastRow: last, scale: 85, titlesRow: "4:4", titlesColumn: "A:B" });
}

const ACTION_COLUMNS: Column[] = [
  { label: "Item", width: 6, kind: "number" },
  { label: "Equipment", width: 22 },
  { label: "Location", width: 18 },
  { label: "Identified issue", width: 38 },
  { label: "Recommended action", width: 38 },
  { label: "Priority", width: 10, kind: "priority" },
  { label: "Status", width: 16, kind: "status" },
];

function actionsSheet(wb: WorkbookType, report: Report, overflow: Overflow) {
  const ws = wb.addWorksheet("Outstanding Actions");
  title(ws, "OUTSTANDING ACTIONS", metaLine(report), 14, span(ACTION_COLUMNS));
  ws.getRow(3).height = 6;
  const actions = outstandingActions(report);
  if (actions.length === 0) {
    ws.columns = ACTION_COLUMNS.map((c) => ({ width: c.width }));
    emptyMessage(ws, ACTION_COLUMNS.length, "No outstanding actions — no equipment was marked Fault or Recommendation.");
    print(ws, { orientation: "landscape", lastCol: ACTION_COLUMNS.length, lastRow: 4, fitWidth: true });
    return;
  }
  const width = (label: string) => ACTION_COLUMNS.find((c) => c.label === label)!.width;
  const last = register(
    ws,
    ACTION_COLUMNS,
    actions.map((a) => {
      const item = report.equipment[a.number - 1]!;
      const long = (field: string, text: string) => overflow.cell(text, width(field), { item: String(a.number), equipment: a.item, field });
      return { status: item.status, values: [a.number, a.item, a.location, long("Identified issue", a.issue), long("Recommended action", a.action), a.priority, a.status] };
    }),
  );
  print(ws, { orientation: "landscape", lastCol: ACTION_COLUMNS.length, lastRow: last, fitWidth: true, titlesRow: "4:4" });
}

/* ---------------------------------------------------------------- build */

export function buildWorkbook(report: Report, excel: ExcelModule, generatedAt = new Date()): WorkbookType {
  const wb = new excel.Workbook();
  wb.creator = "Fieldwise";
  wb.lastModifiedBy = "Fieldwise";
  wb.created = generatedAt;
  wb.modified = generatedAt;
  wb.title = safeText(`Service report${report.siteName ? ` — ${report.siteName}` : ""}`);
  wb.subject = jobTypeLabel(report);
  const overflow = new Overflow();
  summarySheet(wb, report);
  registerSheet(wb, report, overflow);
  actionsSheet(wb, report, overflow);
  fullTextSheet(wb, report, overflow);
  wb.views = [{ x: 0, y: 0, width: 20000, height: 12000, firstSheet: 0, activeTab: 0, visibility: "visible" }];
  return wb;
}

/** Generates the workbook bytes. ExcelJS is loaded on demand so it isn't in every page's bundle. */
export async function workbookBytes(report: Report, generatedAt = new Date()): Promise<ArrayBuffer> {
  const mod = await import("exceljs");
  const excel = ((mod as unknown as { default?: ExcelModule }).default ?? mod) as ExcelModule;
  const buffer = await buildWorkbook(report, excel, generatedAt).xlsx.writeBuffer();
  return buffer as ArrayBuffer;
}

