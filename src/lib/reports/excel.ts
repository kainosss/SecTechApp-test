/**
 * Builds the service report workbook (ExcelJS) from saved report data, in the
 * browser — nothing is uploaded.
 *
 * Design: a corporate inspection report. The Job Summary (A4 portrait) is the
 * customer-facing document; the Equipment Register, Outstanding Actions and
 * (only when needed) Full Text sheets are editable office registers (A4
 * landscape). One restrained palette and type scale is used throughout.
 *
 * Integrity: every cell is plain editable text, a number or a list value; no
 * formulas are written and formula-like user text stays text (`safeText`).
 * Long text is never truncated: narrative is split across consecutive rows,
 * and over-long register cells show a preview with a reference to the full
 * text on the Full Text sheet. Nothing is invented: summaries, defect and
 * action tables only re-use what the technician entered, and counts come from
 * the equipment entries.
 */
import type { Borders, Cell, Workbook as WorkbookType, Worksheet } from "exceljs";
import { draftSummary, itemLabel, outstandingActions, STATUS_LABEL, statusCounts } from "./report";
import { PRIORITIES, STATUSES, type ItemStatus, type JobType, type Report } from "./schema";
import { cleanText, displayDate, MAX_ROW_HEIGHT, rowHeight, safeText, splitText, textHeight } from "./xlsx-layout";

export { MAX_CELL, safeText } from "./xlsx-layout";

export interface ExcelModule {
  Workbook: new () => WorkbookType;
}

/* ------------------------------------------------------------ design system */

export const PALETTE = {
  navy: "FF17324D",
  blue: "FF285A7A",
  paleBlue: "FFEAF0F5",
  lightGrey: "FFF4F6F8",
  border: "FFD6DEE5",
  text: "FF243342",
  secondary: "FF64748B",
  white: "FFFFFFFF",
} as const;

/** Muted status colours — used only on status cells and status figures. */
export const STATUS_COLOURS: Record<ItemStatus, { fill: string; font: string }> = {
  pass: { fill: "FFE3F1E6", font: "FF2F6B3A" },
  fault: { fill: "FFFBE3E1", font: "FFA23B32" },
  recommendation: { fill: "FFFDF1D8", font: "FF8A5A00" },
  "not-tested": { fill: "FFEEF1F4", font: "FF64748B" },
};

const PRIORITY_COLOURS: Record<string, string> = { High: "FFA23B32", Medium: "FF8A5A00", Low: "FF64748B" };

/** Calibri (metric-compatible Carlito in LibreOffice) keeps layout predictable across Excel versions. */
const FONT = "Calibri";
export const TYPE = { title: 22, sheetTitle: 16, section: 11.5, subsection: 10.5, body: 10, label: 8.5, footer: 8 } as const;

export const JOB_TITLES: Record<JobType, string> = {
  cctv: "CCTV INSPECTION",
  intruder: "INTRUDER ALARM SERVICE",
  access: "ACCESS CONTROL SERVICE",
  general: "GENERAL SECURITY REPORT",
};
const JOB_NAMES: Record<JobType, string> = { cctv: "CCTV", intruder: "Intruder Alarm", access: "Access Control", general: "General Security" };

const rule = { style: "thin" as const, color: { argb: PALETTE.border } };

const font = (size: number = TYPE.body, extra: Partial<Cell["font"]> = {}): Cell["font"] => ({ name: FONT, size, color: { argb: PALETTE.text }, ...extra });
const fill = (argb: string): Cell["fill"] => ({ type: "pattern", pattern: "solid", fgColor: { argb } });

function setText(cell: Cell, text: string) {
  cell.value = safeText(text);
}

function colLetter(n: number): string {
  let s = "";
  for (let x = n; x > 0; x = Math.floor((x - 1) / 26)) s = String.fromCharCode(65 + ((x - 1) % 26)) + s;
  return s;
}

/** Text placed in header/footer codes: `&` must be doubled, and only a short single line is allowed. */
export function headerFooterText(value: string, max = 60): string {
  const s = cleanText(value).replace(/\s+/g, " ").trim();
  return (s.length > max ? `${s.slice(0, max - 1)}…` : s).replace(/&/g, "&&");
}

const muted = (size: number) => `&"${FONT},Regular"&${size}&K64748B`;

function footer(ws: Worksheet, report: Report) {
  const ref = report.reference.trim() ? `Job ref ${headerFooterText(report.reference, 40)}` : "";
  const text = `&L${muted(TYPE.footer)}Generated with Fieldwise&C${muted(TYPE.footer)}${ref}&R${muted(TYPE.footer)}Page &P of &N`;
  ws.headerFooter = { oddFooter: text, evenFooter: text };
}

/** Repeating page header for registers, so every printed page is identified (and nothing on-sheet gets clipped). */
function printHeader(ws: Worksheet, sheetTitle: string, report: Report) {
  const right = [report.siteName.trim() && headerFooterText(report.siteName, 50), report.reference.trim() && headerFooterText(report.reference, 30)].filter(Boolean).join("  ·  ");
  const text = `&L&"${FONT},Bold"&10&K17324D${sheetTitle}&R${muted(TYPE.footer)}${right}`;
  ws.headerFooter = { ...ws.headerFooter, oddHeader: text, evenHeader: text };
}

interface PrintOptions {
  orientation: "portrait" | "landscape";
  area: string;
  fitWidth?: boolean;
  scale?: number;
  titlesRow?: string;
  titlesColumn?: string;
}

function print(ws: Worksheet, o: PrintOptions) {
  ws.pageSetup = {
    paperSize: 9, // A4
    orientation: o.orientation,
    // Fit to the page width only where that keeps text readable; long content flows onto further pages.
    fitToPage: Boolean(o.fitWidth),
    fitToWidth: 1,
    fitToHeight: 0,
    scale: o.scale ?? 100,
    pageOrder: "overThenDown",
    margins: { left: 0.55, right: 0.55, top: 0.7, bottom: 0.7, header: 0.3, footer: 0.3 },
    printArea: o.area,
    ...(o.titlesRow ? { printTitlesRow: o.titlesRow } : {}),
    ...(o.titlesColumn ? { printTitlesColumn: o.titlesColumn } : {}),
  };
}

/* ---------------------------------------------------- derived, never invented */

/** A factual one-paragraph overview built only from the equipment counts. */
export function inspectionOverview(report: Report): string {
  const n = report.equipment.length;
  if (n === 0) return "No equipment was recorded in this report.";
  const c = statusCounts(report);
  const plural = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`;
  const parts = [
    c.pass && `${c.pass} passed`,
    c.fault && `${plural(c.fault, "was", "were")} recorded with a fault`,
    c.recommendation && `${plural(c.recommendation, "has a recommendation", "have recommendations")}`,
    c["not-tested"] && `${plural(c["not-tested"], "was", "were")} not tested`,
  ].filter(Boolean) as string[];
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}` : parts[0]!;
  return `This report records ${plural(n, "item", "items")} of equipment: ${list}.`;
}

/** Summary text the technician wrote, unless it's just the unedited auto-fill of what a table already shows. */
const ownText = (written: string, autoFill: string) => {
  const w = written.trim();
  return w && w !== autoFill.trim() ? w : "";
};

/* --------------------------------------------------------------- Job Summary */

/** Ten equal columns: label/value pairs take 2 + 3, KPI tiles take 2 each, tables split 3 / 2 / 5. */
const COLS = 10;
const COL_W = 9.4;
const FULL_W = COLS * COL_W;
/** Usable A4 portrait height in points at 100 % (page minus margins, header and footer). */
const PAGE_HEIGHT = 700;
/** Narrative is split into rows of at most this height, so pages fill evenly and headings stay with text. */
const BLOCK = 220;

class SummaryWriter {
  row = 1;
  used = 0;
  section = 0;
  constructor(
    readonly ws: Worksheet,
    readonly report: Report,
  ) {}

  height(h: number) {
    this.ws.getRow(this.row).height = h;
    this.used += h;
    if (this.used > PAGE_HEIGHT) this.used = h; // Excel starts a new page here on its own
  }
  next(h: number) {
    this.height(h);
    this.row++;
  }
  /** Before a section: start a new page rather than leaving its heading stranded at the bottom. */
  keepWithNext(needed: number) {
    if (this.used + needed > PAGE_HEIGHT && this.row > 6) {
      this.ws.getRow(this.row - 1).addPageBreak();
      this.used = 0;
    }
  }
  merge(c1: number, c2: number, rows = 1) {
    if (c2 > c1 || rows > 1) this.ws.mergeCells(this.row, c1, this.row + rows - 1, c2);
    return this.ws.getCell(this.row, c1);
  }

  /** Numbered section heading: corporate-blue number, navy title, thin blue rule. */
  heading(title: string, firstBlock: number) {
    this.next(8);
    this.keepWithNext(23 + Math.min(firstBlock, BLOCK + 40));
    this.section++;
    const c = this.merge(1, COLS);
    c.value = {
      richText: [
        { text: `${this.section}   `, font: font(TYPE.section, { bold: true, color: { argb: PALETTE.blue } }) },
        { text: title.toUpperCase(), font: font(TYPE.section, { bold: true, color: { argb: PALETTE.navy } }) },
      ],
    };
    c.alignment = { vertical: "bottom" };
    for (let col = 1; col <= COLS; col++) this.ws.getCell(this.row, col).border = { bottom: { style: "thin", color: { argb: PALETTE.blue } } };
    this.next(20);
    this.next(3);
  }

  subheading(title: string) {
    const c = this.merge(1, COLS);
    c.value = title;
    c.font = font(TYPE.subsection, { bold: true, color: { argb: PALETTE.blue } });
    c.alignment = { vertical: "bottom" };
    this.next(18);
  }

  /** Narrative paragraph(s), split into rows that fit, preserving line breaks. */
  paragraph(text: string, opts: { italic?: boolean; colour?: string } = {}) {
    const width = FULL_W - 2;
    for (const part of splitText(cleanText(text.trim()), width, TYPE.body, BLOCK)) {
      const c = this.merge(1, COLS);
      setText(c, part);
      c.font = font(TYPE.body, { italic: opts.italic, color: { argb: opts.colour ?? PALETTE.text } });
      c.alignment = { vertical: "top", wrapText: true };
      this.next(rowHeight([{ text: part, width }], TYPE.body, 16));
    }
  }

  /** A compact borderless table: pale header band, hairline rules between rows. */
  table(columns: { label: string; span: [number, number] }[], rows: string[][]) {
    const header = () => {
      for (const col of columns) {
        const c = this.merge(col.span[0], col.span[1]);
        c.value = col.label.toUpperCase();
        c.font = font(TYPE.label, { bold: true, color: { argb: PALETTE.navy } });
        c.alignment = { vertical: "middle", wrapText: true };
      }
      for (let col = 1; col <= COLS; col++) this.ws.getCell(this.row, col).fill = fill(PALETTE.paleBlue);
      this.next(18);
    };
    header();
    for (const values of rows) {
      const widths = columns.map((c) => (c.span[1] - c.span[0] + 1) * COL_W - 1);
      // A very long cell continues on further rows rather than exceeding the row limit.
      const pieces = values.map((v, i) => splitText(cleanText(v), widths[i]!, TYPE.body, BLOCK));
      const lines = Math.max(...pieces.map((p) => p.length));
      for (let k = 0; k < lines; k++) {
        const texts = pieces.map((p) => p[k] ?? "");
        columns.forEach((col, i) => {
          const c = this.merge(col.span[0], col.span[1]);
          setText(c, texts[i]!);
          c.font = font(TYPE.body, i === 0 ? { bold: true } : {});
          c.alignment = { vertical: "top", wrapText: true };
          const pr = PRIORITY_COLOURS[texts[i]!];
          if (col.label === "Priority" && pr) c.font = font(TYPE.body, { bold: true, color: { argb: pr } });
        });
        if (k === lines - 1) for (let col = 1; col <= COLS; col++) this.ws.getCell(this.row, col).border = { bottom: rule };
        this.next(rowHeight(texts.map((t, i) => ({ text: t, width: widths[i]! })), TYPE.body, 18));
      }
    }
  }
}

function summarySheet(wb: WorkbookType, report: Report) {
  const ws = wb.addWorksheet("Job Summary", { views: [{ showGridLines: false }], properties: { tabColor: { argb: PALETTE.navy } } });
  ws.columns = Array.from({ length: COLS }, () => ({ width: COL_W }));
  const w = new SummaryWriter(ws, report);

  /* Header: title and job type left; report date and job reference right; one accent rule. */
  const title = w.merge(1, 6);
  title.value = "SERVICE REPORT";
  title.font = font(TYPE.title, { bold: true, color: { argb: PALETTE.navy } });
  title.alignment = { vertical: "bottom" };
  const metaLabel = (col: number, text: string) => {
    const c = ws.getCell(w.row, col);
    ws.mergeCells(w.row, col, w.row, col + 1);
    c.value = text;
    c.font = font(TYPE.label, { color: { argb: PALETTE.secondary } });
    c.alignment = { horizontal: "right", vertical: "bottom" };
  };
  const metaValue = (col: number, text: string, bold = false) => {
    ws.mergeCells(w.row, col, w.row, col + 1);
    const c = ws.getCell(w.row, col);
    setText(c, text || "—");
    c.font = font(TYPE.body + 0.5, { bold, color: { argb: text ? PALETTE.navy : PALETTE.secondary } });
    c.alignment = { horizontal: "right", vertical: "bottom" };
  };
  metaLabel(7, "REPORT DATE");
  metaValue(9, report.date ? displayDate(report.date) : "", true);
  w.next(34);
  const sub = w.merge(1, 6);
  sub.value = JOB_TITLES[report.jobType];
  sub.font = font(TYPE.subsection, { bold: true, color: { argb: PALETTE.blue } });
  sub.alignment = { vertical: "top" };
  metaLabel(7, "JOB REFERENCE");
  metaValue(9, cleanText(report.reference));
  for (let col = 1; col <= COLS; col++) ws.getCell(w.row, col).border = { bottom: { style: "medium", color: { argb: PALETTE.navy } } };
  w.next(20);

  /* 1 Report identification: a light panel of label/value pairs. */
  w.heading("Report identification", 80);
  const panel = (h: number) => {
    for (let col = 1; col <= COLS; col++) ws.getCell(w.row, col).fill = fill(PALETTE.lightGrey);
    w.next(h);
  };
  const label = (cell: Cell, text: string, indent = 1) => {
    cell.value = text.toUpperCase();
    cell.font = font(TYPE.label, { color: { argb: PALETTE.secondary } });
    cell.alignment = { horizontal: "left", vertical: "top", indent };
  };
  const value = (cell: Cell, text: string) => {
    setText(cell, text || "Not recorded");
    cell.font = text ? font(TYPE.body + 0.5) : font(TYPE.body, { italic: true, color: { argb: PALETTE.secondary } });
    cell.alignment = { vertical: "top", wrapText: true };
  };
  panel(6);
  const pairs: [string, string, string, string][] = [
    ["Site", report.siteName, "Inspection date", report.date ? displayDate(report.date) : ""],
    ["Customer", report.customer, "Job reference", report.reference],
    ["Site address", report.siteAddress, "Job type", JOB_NAMES[report.jobType]],
    ["Technician", report.technician, "", ""],
  ];
  for (const [l1, v1, l2, v2] of pairs) {
    const a = cleanText(v1.trim());
    const b = cleanText(v2.trim());
    // Left values (site, customer, address) can be long, so they get four columns; right values are short.
    ws.mergeCells(w.row, 1, w.row, 2);
    ws.mergeCells(w.row, 3, w.row, 6);
    ws.mergeCells(w.row, 7, w.row, 8);
    ws.mergeCells(w.row, 9, w.row, 10);
    label(ws.getCell(w.row, 1), l1);
    value(ws.getCell(w.row, 3), a);
    if (l2) {
      // Extra indent keeps a long wrapped left value visually clear of the right-hand label.
      label(ws.getCell(w.row, 7), l2, 3);
      value(ws.getCell(w.row, 9), b);
    }
    panel(rowHeight([{ text: a || "Not recorded", width: COL_W * 4 - 2 }, { text: b, width: COL_W * 2 - 1 }], TYPE.body + 0.5, 18));
  }
  if (report.description.trim()) {
    const parts = splitText(cleanText(report.description.trim()), COL_W * 8 - 1, TYPE.body, BLOCK);
    parts.forEach((part, i) => {
      ws.mergeCells(w.row, 1, w.row, 2);
      ws.mergeCells(w.row, 3, w.row, COLS);
      if (i === 0) label(ws.getCell(w.row, 1), "Job description");
      const c = ws.getCell(w.row, 3);
      setText(c, part);
      c.font = font(TYPE.body);
      c.alignment = { vertical: "top", wrapText: true };
      panel(rowHeight([{ text: part, width: COL_W * 8 - 1 }], TYPE.body, 18));
    });
  }
  panel(6);

  /* 2 Inspection overview: five compact figures. */
  const counts = statusCounts(report);
  const inspected = counts.pass + counts.fault + counts.recommendation;
  w.heading("Inspection overview", 50);
  const tiles: [string, number, string, boolean][] = [
    ["Total inspected", inspected, PALETTE.navy, false],
    ["Passed", counts.pass, STATUS_COLOURS.pass.font, false],
    ["Faults", counts.fault, counts.fault ? STATUS_COLOURS.fault.font : PALETTE.text, counts.fault > 0],
    ["Recommendations", counts.recommendation, counts.recommendation ? STATUS_COLOURS.recommendation.font : PALETTE.text, false],
    ["Not tested", counts["not-tested"], STATUS_COLOURS["not-tested"].font, false],
  ];
  const tileRow = w.row;
  tiles.forEach(([text, n, colour, alert], i) => {
    const c = i * 2 + 1;
    ws.mergeCells(tileRow, c, tileRow, c + 1);
    ws.mergeCells(tileRow + 1, c, tileRow + 1, c + 1);
    const l = ws.getCell(tileRow, c);
    l.value = text.toUpperCase();
    l.font = font(TYPE.label, { bold: true, color: { argb: PALETTE.secondary } });
    l.alignment = { horizontal: "center", vertical: "bottom" };
    const v = ws.getCell(tileRow + 1, c);
    v.value = n;
    v.font = font(18, { bold: true, color: { argb: colour } });
    v.alignment = { horizontal: "center", vertical: "middle" };
    for (const col of [c, c + 1]) {
      const bg = alert ? STATUS_COLOURS.fault.fill : i === 0 ? PALETTE.paleBlue : PALETTE.lightGrey;
      // White side borders separate the tiles; a faults tile carries a red top edge when there are faults.
      const sides: Partial<Borders> = { left: col === c ? { style: "thick", color: { argb: PALETTE.white } } : undefined, right: col === c + 1 ? { style: "thick", color: { argb: PALETTE.white } } : undefined };
      ws.getCell(tileRow, col).fill = fill(bg);
      ws.getCell(tileRow + 1, col).fill = fill(bg);
      ws.getCell(tileRow, col).border = { ...sides, top: alert ? { style: "medium", color: { argb: STATUS_COLOURS.fault.font } } : undefined };
      ws.getCell(tileRow + 1, col).border = sides;
    }
  });
  w.next(18);
  w.next(28);

  /* 3 Inspection summary: a factual statement from the counts (nothing inferred). */
  const draft = draftSummary(report);
  const overview = `${inspectionOverview(report)}${counts["not-tested"] ? " Total inspected excludes items not tested." : ""}`;
  w.heading("Inspection summary", 30);
  w.paragraph(overview);

  /* Work completed: the technician's summary, otherwise their per-item work entries. */
  const work = report.summary.workCompleted.trim() || draft.workCompleted;
  if (work) {
    w.heading("Work completed", textHeight(work.slice(0, 600), FULL_W - 2, TYPE.body));
    w.paragraph(work);
  }

  /* Identified defects: own narrative (if not just the auto-fill) plus a structured table of fault entries. */
  const faults = report.equipment.filter((i) => i.status === "fault");
  const faultText = ownText(report.summary.faults, draft.faults);
  w.heading("Identified defects", faults.length ? 60 : 30);
  if (faultText) w.paragraph(faultText);
  if (faults.length) {
    if (faultText) w.next(6);
    w.table(
      [
        { label: "Equipment", span: [1, 3] },
        { label: "Location", span: [4, 5] },
        { label: "Finding", span: [6, 10] },
      ],
      faults.map((i) => [itemLabel(report, i), i.location.trim(), i.findings.trim() || "No finding written"]),
    );
  } else if (!faultText) {
    const nt = counts["not-tested"];
    w.paragraph(
      `No equipment was recorded as faulty in this report.${nt ? ` ${nt} item${nt === 1 ? " was" : "s were"} not tested, so ${nt === 1 ? "its" : "their"} condition was not assessed.` : ""}`,
      { italic: true, colour: PALETTE.secondary },
    );
  }

  /* Recommendations & follow-up: own narrative, outstanding work, and an action table from entered recommendations. */
  const recItems = report.equipment.filter((i) => i.recommendations.trim());
  const recText = ownText(report.summary.recommendations, draft.recommendations);
  const outstanding = report.summary.outstanding.trim();
  if (recItems.length || recText || outstanding) {
    w.heading("Recommendations & follow-up", 60);
    if (recText) w.paragraph(recText);
    if (recItems.length) {
      if (recText) w.next(6);
      w.table(
        [
          { label: "Equipment", span: [1, 3] },
          { label: "Location", span: [4, 5] },
          { label: "Recommended action", span: [6, 9] },
          { label: "Priority", span: [10, 10] },
        ],
        recItems.map((i) => [itemLabel(report, i), i.location.trim(), i.recommendations.trim(), i.priority]),
      );
    }
    if (outstanding) {
      w.next(8);
      w.subheading("Outstanding work");
      w.paragraph(outstanding);
    }
  }

  /* Additional information: only fields with content. */
  const extra = (
    [
      ["Parts required", report.summary.parts],
      ["Additional site notes", report.summary.notes],
    ] as [string, string][]
  ).filter(([, t]) => t.trim());
  if (extra.length) {
    w.heading("Additional information", 50);
    extra.forEach(([name, text], i) => {
      if (i > 0) w.next(8);
      w.subheading(name);
      w.paragraph(text);
    });
  }

  print(ws, { orientation: "portrait", area: `A1:${colLetter(COLS)}${w.row - 1}`, fitWidth: true });
  footer(ws, report);
}

/* ------------------------------------------------------------ data registers */

interface Column {
  label: string;
  width: number;
  kind?: "number" | "status" | "priority" | "name" | "secondary";
}

/** Register cells taller than this show a preview and point to the Full Text sheet. */
export const REGISTER_MAX_HEIGHT = 200;
const FULL_TEXT_WIDTH = 110;

interface OverflowEntry {
  ref: string;
  item: string;
  equipment: string;
  field: string;
  text: string;
}

class Overflow {
  entries: OverflowEntry[] = [];
  /** The whole text if it fits a readable row, otherwise a preview plus a pointer to the Full Text sheet. */
  cell(text: string, width: number, ctx: { item: string; equipment: string; field: string }): string {
    const clean = cleanText(text.trim());
    if (textHeight(clean, width, TYPE.body) <= REGISTER_MAX_HEIGHT) return clean;
    const ref = `T${this.entries.length + 1}`;
    this.entries.push({ ref, ...ctx, text: clean });
    const note = `… continued in the Full Text sheet (ref ${ref}).`;
    const preview = splitText(clean, width, TYPE.body, REGISTER_MAX_HEIGHT - textHeight(note, width, TYPE.body))[0]!;
    return `${preview}\n${note}`;
  }
}

const TABLE_ROW = 6;

/** Sheet title block for registers: title, context line, status line; the table starts at row 6. */
function registerTitle(ws: Worksheet, title: string, report: Report, statusLine: string) {
  ws.getCell("A1").value = title;
  ws.getCell("A1").font = font(TYPE.sheetTitle, { bold: true, color: { argb: PALETTE.navy } });
  ws.getCell("A1").alignment = { vertical: "bottom" };
  ws.getRow(1).height = 28;
  const context = [report.siteName.trim(), JOB_NAMES[report.jobType], report.reference.trim() && `Job ref ${report.reference.trim()}`, report.date && displayDate(report.date)]
    .filter(Boolean)
    .join("   ·   ");
  const ctx = ws.getCell("A2");
  setText(ctx, context);
  ctx.font = font(TYPE.body, { bold: true, color: { argb: PALETTE.blue } });
  ws.getRow(2).height = 16;
  const st = ws.getCell("A3");
  st.value = statusLine;
  st.font = font(TYPE.label + 0.5, { color: { argb: PALETTE.secondary } });
  ws.getRow(3).height = 15;
  ws.getRow(4).height = 6;
  ws.getRow(5).height = 4;
}

function tableHeader(ws: Worksheet, row: number, columns: Column[]) {
  const r = ws.getRow(row);
  columns.forEach((col, i) => {
    const c = r.getCell(i + 1);
    c.value = col.label;
    c.font = font(9.5, { bold: true, color: { argb: PALETTE.white } });
    c.fill = fill(PALETTE.navy);
    c.alignment = { vertical: "middle", horizontal: col.kind === "number" || col.kind === "status" || col.kind === "priority" ? "center" : "left", wrapText: true };
    c.border = { right: { style: "thin", color: { argb: PALETTE.blue } } };
  });
  r.height = 24;
}

function register(ws: Worksheet, columns: Column[], rows: (string | number)[][]) {
  ws.columns = columns.map((c) => ({ width: c.width }));
  tableHeader(ws, TABLE_ROW, columns);
  rows.forEach((values, n) => {
    const row = ws.getRow(TABLE_ROW + 1 + n);
    values.forEach((v, i) => {
      const col = columns[i]!;
      const cell = row.getCell(i + 1);
      if (typeof v === "number") cell.value = v;
      else setText(cell, v);
      cell.font = font(TYPE.body);
      cell.alignment = { vertical: "top", wrapText: true };
      cell.border = { bottom: rule };
      if (col.kind === "number") {
        cell.alignment = { vertical: "top", horizontal: "center" };
        cell.font = font(TYPE.body, { color: { argb: PALETTE.secondary } });
      }
      if (col.kind === "name") cell.font = font(TYPE.body, { bold: true });
      if (col.kind === "secondary") cell.font = font(TYPE.body, { color: { argb: PALETTE.secondary } });
      if (col.kind === "status") {
        cell.alignment = { vertical: "top", horizontal: "center" };
        cell.dataValidation = { type: "list", allowBlank: true, showErrorMessage: true, formulae: [`"${STATUSES.map((s) => s.label).join(",")}"`] };
      }
      if (col.kind === "priority") {
        cell.alignment = { vertical: "top", horizontal: "center" };
        cell.dataValidation = { type: "list", allowBlank: true, showErrorMessage: true, formulae: [`"${PRIORITIES.filter(Boolean).join(",")}"`] };
      }
    });
    row.height = rowHeight(
      values.map((v, i) => ({ text: String(v), width: columns[i]!.width - 1 })),
      TYPE.body,
      20,
    );
  });
  const last = TABLE_ROW + rows.length;
  const colOf = (kind: Column["kind"]) => columns.findIndex((c) => c.kind === kind) + 1;
  const range = (col: number) => `${colLetter(col)}${TABLE_ROW + 1}:${colLetter(col)}${last}`;
  // Colours follow the value, so they stay right when office staff change a status or priority from the list.
  ws.addConditionalFormatting({
    ref: range(colOf("status")),
    rules: STATUSES.map((s, i) => ({
      type: "cellIs" as const,
      operator: "equal" as const,
      priority: i + 1,
      formulae: [`"${s.label}"`],
      style: { fill: { type: "pattern" as const, pattern: "solid" as const, bgColor: { argb: STATUS_COLOURS[s.id].fill } }, font: { color: { argb: STATUS_COLOURS[s.id].font }, bold: true } },
    })),
  });
  ws.addConditionalFormatting({
    ref: range(colOf("priority")),
    rules: (["High", "Medium", "Low"] as const).map((p, i) => ({
      type: "cellIs" as const,
      operator: "equal" as const,
      priority: 10 + i,
      formulae: [`"${p}"`],
      style: { font: { color: { argb: PRIORITY_COLOURS[p] }, bold: p !== "Low" } },
    })),
  });
  ws.autoFilter = { from: { row: TABLE_ROW, column: 1 }, to: { row: last, column: columns.length } };
  ws.views = [{ state: "frozen", ySplit: TABLE_ROW, xSplit: 2, showGridLines: false, topLeftCell: `C${TABLE_ROW + 1}` }];
  return last;
}

function emptyState(ws: Worksheet, columns: Column[], text: string) {
  ws.columns = columns.map((c) => ({ width: c.width }));
  ws.mergeCells(TABLE_ROW, 1, TABLE_ROW, Math.min(columns.length, 6));
  const c = ws.getCell(TABLE_ROW, 1);
  c.value = text;
  c.font = font(TYPE.body, { italic: true, color: { argb: PALETTE.secondary } });
  c.fill = fill(PALETTE.lightGrey);
  c.alignment = { vertical: "middle", indent: 1 };
  ws.getRow(TABLE_ROW).height = 26;
  ws.views = [{ showGridLines: false }];
}

const statusLine = (report: Report) => {
  const c = statusCounts(report);
  return `${report.equipment.length} item${report.equipment.length === 1 ? "" : "s"}   ·   ${STATUSES.map((s) => `${s.label} ${c[s.id]}`).join("   ·   ")}`;
};

export const REGISTER_COLUMNS: Column[] = [
  { label: "No.", width: 5, kind: "number" },
  { label: "Equipment", width: 18, kind: "name" },
  { label: "Type", width: 12, kind: "secondary" },
  { label: "Location", width: 16 },
  { label: "Make/model", width: 14, kind: "secondary" },
  { label: "Status", width: 13.5, kind: "status" },
  { label: "Findings", width: 27 },
  { label: "Work completed", width: 25 },
  { label: "Recommendations", width: 25 },
  { label: "Priority", width: 9, kind: "priority" },
  { label: "Additional notes", width: 21 },
];

function registerSheet(wb: WorkbookType, report: Report, overflow: Overflow) {
  const ws = wb.addWorksheet("Equipment Register", { properties: { tabColor: { argb: PALETTE.blue } } });
  registerTitle(ws, "EQUIPMENT REGISTER", report, statusLine(report));
  if (report.equipment.length === 0) {
    emptyState(ws, REGISTER_COLUMNS, "No equipment was recorded in this report.");
    print(ws, { orientation: "landscape", area: `A1:K${TABLE_ROW}`, fitWidth: true });
    footer(ws, report);
    return;
  }
  const width = (label: string) => REGISTER_COLUMNS.find((c) => c.label === label)!.width - 1;
  const rows = report.equipment.map((item, n) => {
    const name = itemLabel(report, item);
    const long = (field: string, text: string) => overflow.cell(text, width(field), { item: String(n + 1), equipment: name, field });
    return [
      n + 1,
      name,
      item.type.trim(),
      item.location.trim(),
      item.makeModel.trim(),
      STATUS_LABEL[item.status],
      long("Findings", item.findings),
      long("Work completed", item.work),
      long("Recommendations", item.recommendations),
      item.priority,
      long("Additional notes", item.notes),
    ];
  });
  const last = register(ws, REGISTER_COLUMNS, rows);
  // All eleven columns fit one A4 landscape width (compact widths keep the scale near 80 %), so each row prints on one
  // page; long registers flow down with the heading row repeated. The on-sheet title block is left out of the print
  // area: a page header identifies every page instead.
  print(ws, { orientation: "landscape", area: `A${TABLE_ROW}:K${last}`, fitWidth: true, titlesRow: `${TABLE_ROW}:${TABLE_ROW}` });
  footer(ws, report);
  printHeader(ws, "EQUIPMENT REGISTER", report);
}

export const ACTION_COLUMNS: Column[] = [
  { label: "No.", width: 5.5, kind: "number" },
  { label: "Equipment", width: 22, kind: "name" },
  { label: "Location", width: 18 },
  { label: "Finding", width: 36 },
  { label: "Recommended action", width: 36 },
  { label: "Priority", width: 10, kind: "priority" },
  { label: "Status", width: 15, kind: "status" },
];

function actionsSheet(wb: WorkbookType, report: Report, overflow: Overflow) {
  const ws = wb.addWorksheet("Outstanding Actions", { properties: { tabColor: { argb: PALETTE.blue } } });
  const actions = outstandingActions(report);
  registerTitle(
    ws,
    "OUTSTANDING ACTIONS",
    report,
    actions.length ? `${actions.length} item${actions.length === 1 ? "" : "s"} requiring attention (marked Fault or Recommendation)` : "Corrective-action schedule",
  );
  if (actions.length === 0) {
    emptyState(ws, ACTION_COLUMNS, "No outstanding actions — no equipment was marked Fault or Recommendation.");
    print(ws, { orientation: "landscape", area: `A1:G${TABLE_ROW}`, fitWidth: true });
    footer(ws, report);
    return;
  }
  const width = (label: string) => ACTION_COLUMNS.find((c) => c.label === label)!.width - 1;
  const last = register(
    ws,
    ACTION_COLUMNS,
    actions.map((a) => {
      const long = (field: string, text: string) => overflow.cell(text, width(field), { item: String(a.number), equipment: a.item, field });
      return [a.number, a.item, a.location, long("Finding", a.issue), long("Recommended action", a.action), a.priority, a.status];
    }),
  );
  print(ws, { orientation: "landscape", area: `A1:G${last}`, fitWidth: true, titlesRow: `${TABLE_ROW}:${TABLE_ROW}` });
  footer(ws, report);
}

function fullTextSheet(wb: WorkbookType, report: Report, overflow: Overflow) {
  if (overflow.entries.length === 0) return;
  const ws = wb.addWorksheet("Full Text", { properties: { tabColor: { argb: PALETTE.secondary } } });
  const columns: Column[] = [
    { label: "Ref", width: 6, kind: "number" },
    { label: "No.", width: 5.5, kind: "number" },
    { label: "Equipment", width: 20, kind: "name" },
    { label: "Field", width: 16, kind: "secondary" },
    { label: "Part", width: 8, kind: "number" },
    { label: "Text", width: FULL_TEXT_WIDTH },
  ];
  registerTitle(ws, "FULL TEXT", report, "Complete text for register entries too long to show in full. Each ref matches the note in the register cell.");
  ws.columns = columns.map((c) => ({ width: c.width }));
  tableHeader(ws, TABLE_ROW, columns);
  let row = TABLE_ROW + 1;
  for (const e of overflow.entries) {
    // Large blocks, split at paragraph boundaries first, so text reads naturally.
    const parts = splitText(e.text, FULL_TEXT_WIDTH - 1, TYPE.body, MAX_ROW_HEIGHT - 10);
    parts.forEach((part, i) => {
      const r = ws.getRow(row++);
      const values = [e.ref, e.item, e.equipment, e.field, `${i + 1} of ${parts.length}`, part];
      values.forEach((v, c) => {
        const cell = r.getCell(c + 1);
        setText(cell, v);
        cell.font = c === 2 ? font(TYPE.body, { bold: true }) : c === 3 || c === 4 ? font(TYPE.body, { color: { argb: PALETTE.secondary } }) : font(TYPE.body);
        cell.alignment = { vertical: "top", wrapText: true, horizontal: c === 0 || c === 1 || c === 4 ? "center" : "left" };
        // A stronger rule after the last part of each entry groups an entry's parts together.
        cell.border = { bottom: i === parts.length - 1 ? { style: "thin", color: { argb: PALETTE.blue } } : rule };
      });
      r.height = rowHeight([{ text: part, width: FULL_TEXT_WIDTH - 1 }], TYPE.body, 20);
    });
  }
  ws.autoFilter = { from: { row: TABLE_ROW, column: 1 }, to: { row: row - 1, column: columns.length } };
  ws.views = [{ state: "frozen", ySplit: TABLE_ROW, showGridLines: false }];
  print(ws, { orientation: "landscape", area: `A${TABLE_ROW}:F${row - 1}`, fitWidth: true, titlesRow: `${TABLE_ROW}:${TABLE_ROW}` });
  footer(ws, report);
  printHeader(ws, "FULL TEXT", report);
}

/* -------------------------------------------------------------------- build */

export function buildWorkbook(report: Report, excel: ExcelModule, generatedAt = new Date()): WorkbookType {
  const wb = new excel.Workbook();
  wb.creator = "Fieldwise";
  wb.lastModifiedBy = "Fieldwise";
  wb.created = generatedAt;
  wb.modified = generatedAt;
  wb.title = safeText(`Service report${report.siteName ? ` — ${report.siteName}` : ""}`);
  wb.subject = JOB_TITLES[report.jobType];
  const overflow = new Overflow();
  summarySheet(wb, report);
  registerSheet(wb, report, overflow);
  actionsSheet(wb, report, overflow);
  fullTextSheet(wb, report, overflow);
  wb.views = [{ x: 0, y: 0, width: 20000, height: 12000, firstSheet: 0, activeTab: 0, visibility: "visible" }];
  return wb;
}

/**
 * ExcelJS writes print areas as `$A6:$K13` (column-absolute only). Excel's own form is fully absolute, and
 * LibreOffice ignores the mixed form — printing the whole sheet — so print areas are rewritten as `$A$6:$K$13`.
 */
export function absolutePrintAreas(workbookXml: string): string {
  return workbookXml.replace(
    /(<definedName name="_xlnm\.Print_Area"[^>]*>[^<]*!)\$([A-Z]+)\$?(\d+):\$([A-Z]+)\$?(\d+)(?=<)/g,
    (_m, pre: string, c1: string, r1: string, c2: string, r2: string) => `${pre}$${c1}$${r1}:$${c2}$${r2}`,
  );
}

/** Applies post-write fixes to the XLSX package. */
export async function finalizeXlsx(buffer: ArrayBuffer): Promise<ArrayBuffer> {
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(buffer);
  const path = "xl/workbook.xml";
  const xml = await zip.file(path)!.async("string");
  zip.file(path, absolutePrintAreas(xml));
  return zip.generateAsync({ type: "arraybuffer", compression: "DEFLATE", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

/** Generates the workbook bytes. ExcelJS is loaded on demand so it isn't in every page's bundle. */
export async function workbookBytes(report: Report, generatedAt = new Date()): Promise<ArrayBuffer> {
  const mod = await import("exceljs");
  const excel = ((mod as unknown as { default?: ExcelModule }).default ?? mod) as ExcelModule;
  const buffer = (await buildWorkbook(report, excel, generatedAt).xlsx.writeBuffer()) as ArrayBuffer;
  return finalizeXlsx(buffer);
}
