/**
 * Technical register workbook (ExcelJS), built in the browser — nothing is
 * uploaded. Practical and information-dense rather than presentational:
 * plain tables (no merged cells), filters, frozen headings, wrapped text,
 * restrained colour, A4 landscape fitted to width.
 *
 * Sheets: Equipment Register · Network Configuration · Access & Maintenance ·
 * Full Equipment Details (every entered field, incl. custom fields, complete
 * text) · Site Information.
 *
 * Integrity: user text goes through `safeText` (formula-like text stays text),
 * no formulas or external links are written, blank fields stay blank, and
 * nothing is truncated — a cell too long for a readable row shows a preview
 * pointing to the Full Equipment Details sheet, which holds the whole text
 * (split across rows only where Excel's limits require it).
 */
import type { Workbook as WorkbookType, Worksheet } from "exceljs";
import { displayDate, finalizeXlsx, headerFooterText, MAX_ROW_HEIGHT, rowHeight, safeText, splitText, textHeight } from "@/lib/reports/xlsx-layout";
import { SECTIONS, NETWORK_CATEGORIES, FIELD_LABEL } from "./fields";
import { eventDay, HISTORY_LABEL, sortHistory } from "./history";
import { CATEGORY_LABEL, equipmentLabel, hasNetworkConfig, registerTitle, statusLabel } from "./register";
import { CATEGORIES, OP_STATUSES, type Equipment, type TechRegister } from "./schema";

export interface ExcelModule {
  Workbook: new () => WorkbookType;
}

const FONT = "Calibri";
const SIZE = 10;
const COLOURS = {
  title: "FF1F2D3A",
  text: "FF243342",
  muted: "FF64748B",
  headerFill: "FFE4EAF0",
  headerRule: "FF8A9AAB",
  rule: "FFD6DEE5",
  entryRule: "FF8A9AAB",
} as const;
/** Font colours only — enough to spot a problem without a colourful sheet. */
const STATUS_FONT: Record<string, string> = { Faulty: "FFA23B32", "Needs attention": "FF8A5A00", Offline: "FFA23B32" };

export const TABLE_ROW = 6;
/** Register cells taller than this show a preview; the full text is on Full Equipment Details. */
export const CELL_MAX_HEIGHT = 150;
export const SENSITIVE_NOTE = "Contains site equipment and network configuration details — share only with people who need them.";

const font = (extra: Record<string, unknown> = {}) => ({ name: FONT, size: SIZE, color: { argb: COLOURS.text }, ...extra });

interface Column {
  header: string;
  width: number;
  value: (e: Equipment, n: number) => string | number;
  kind?: "number" | "status" | "category" | "name";
}

/** Title block: register name, site context, technician/updated line and a sensitivity note. Plain cells, no merges. */
function titleBlock(ws: Worksheet, sheetTitle: string, r: TechRegister, line3: string) {
  const a1 = ws.getCell("A1");
  a1.value = safeText(`${sheetTitle} — ${registerTitle(r)}`);
  a1.font = font({ size: 14, bold: true, color: { argb: COLOURS.title } });
  ws.getRow(1).height = 22;
  const context = [r.siteName.trim(), r.customer.trim(), r.siteReference.trim() && `Site ref ${r.siteReference.trim()}`, r.siteAddress.trim().replace(/\s*\n\s*/g, ", ")]
    .filter(Boolean)
    .join("  ·  ");
  if (context) ws.getCell("A2").value = safeText(context);
  ws.getCell("A2").font = font({ bold: true });
  ws.getCell("A3").value = safeText(line3);
  ws.getCell("A3").font = font({ color: { argb: COLOURS.muted } });
  ws.getCell("A4").value = SENSITIVE_NOTE;
  ws.getCell("A4").font = font({ size: 9, italic: true, color: { argb: COLOURS.muted } });
  ws.getRow(5).height = 6;
}

function headerRow(ws: Worksheet, headers: string[]) {
  const row = ws.getRow(TABLE_ROW);
  headers.forEach((h, i) => {
    const c = row.getCell(i + 1);
    c.value = h;
    c.font = font({ bold: true, color: { argb: COLOURS.title } });
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOURS.headerFill } };
    c.alignment = { vertical: "middle", wrapText: true };
    c.border = { bottom: { style: "thin", color: { argb: COLOURS.headerRule } } };
  });
  row.height = 30;
}

function footer(ws: Worksheet, r: TechRegister) {
  const muted = `&"${FONT},Regular"&8&K64748B`;
  const text = `&L${muted}Fieldwise technical register — confidential site information&C${muted}${headerFooterText(registerTitle(r), 50)}&R${muted}Page &P of &N`;
  ws.headerFooter = { ...ws.headerFooter, oddFooter: text, evenFooter: text };
}

/** Printable width of A4 landscape with these margins, in points. */
const PRINT_WIDTH_PT = (11.69 - 0.8) * 72;
/** Never shrink a register below this when printing; wider sheets continue on further page widths instead. */
export const MIN_PRINT_SCALE = 85;
export const WIDE_PRINT_SCALE = 90;

/** Approximate printed width (pt) of columns at 100 %: Excel widths are in characters (7 px each + 5 px padding). */
export const columnsWidthPt = (widths: number[]) => widths.reduce((sum, w) => sum + (w * 7 + 5) * 0.75, 0);

/**
 * A4 landscape. Sheets that fit one page width at ≥ 85 % are fitted to width; wider sheets print at 90 % across
 * several page widths, repeating the heading row and the identification columns (No., equipment) on every page,
 * so text stays readable instead of shrinking to fit.
 */
function print(ws: Worksheet, area: string, opts: { widths?: number[]; idColumns?: number; header?: { title: string; register: TechRegister } } = {}) {
  const natural = opts.widths ? columnsWidthPt(opts.widths) : 0;
  const wide = natural > PRINT_WIDTH_PT / (MIN_PRINT_SCALE / 100);
  if (wide && opts.header) {
    // The on-sheet title block would be cut off at the repeated columns on continuation pages, so it's left out of
    // the print area and every printed page carries a header instead.
    area = area.replace(/^A1:/, `A${TABLE_ROW}:`);
    const r = opts.header.register;
    const right = [r.siteName.trim(), r.customer.trim(), r.siteReference.trim() && `Site ref ${r.siteReference.trim()}`].filter(Boolean).join("  ·  ");
    const text = `&L&"${FONT},Bold"&10&K1F2D3A${headerFooterText(`${opts.header.title} — ${registerTitle(r)}`, 70)}&R&"${FONT},Regular"&8&K64748B${headerFooterText(right, 70)}`;
    ws.headerFooter = { ...ws.headerFooter, oddHeader: text, evenHeader: text };
  }
  ws.pageSetup = {
    paperSize: 9, // A4
    orientation: "landscape",
    ...(wide
      ? { fitToPage: false, scale: WIDE_PRINT_SCALE, pageOrder: "overThenDown" as const, printTitlesColumn: `A:${colLetter(opts.idColumns ?? 2)}` }
      : { fitToPage: true, fitToWidth: 1, fitToHeight: 0 }),
    margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.6, header: 0.25, footer: 0.3 },
    printArea: area,
    printTitlesRow: `${TABLE_ROW}:${TABLE_ROW}`,
  };
}

function colLetter(n: number): string {
  let s = "";
  for (let x = n; x > 0; x = Math.floor((x - 1) / 26)) s = String.fromCharCode(65 + ((x - 1) % 26)) + s;
  return s;
}

/** The whole text if it fits a readable row, otherwise a preview plus a pointer to the details sheet. */
function fitCell(text: string, width: number): string {
  const t = text.trim();
  if (textHeight(t, width, SIZE) <= CELL_MAX_HEIGHT) return t;
  const note = "… full text on the Full Equipment Details sheet.";
  return `${splitText(t, width, SIZE, CELL_MAX_HEIGHT - textHeight(note, width, SIZE))[0]!}\n${note}`;
}

/** Writes a plain table from `items`; returns the last row used. */
function table(ws: Worksheet, columns: Column[], items: { e: Equipment; n: number }[], freezeCols: number, header?: { title: string; register: TechRegister }): number {
  ws.columns = columns.map((c) => ({ width: c.width }));
  headerRow(ws, columns.map((c) => c.header));
  items.forEach(({ e, n }, k) => {
    const row = ws.getRow(TABLE_ROW + 1 + k);
    const texts: { text: string; width: number }[] = [];
    columns.forEach((col, i) => {
      const cell = row.getCell(i + 1);
      const raw = col.value(e, n);
      const v = typeof raw === "number" ? raw : fitCell(raw, col.width - 1);
      if (v !== "") cell.value = typeof v === "number" ? v : safeText(v);
      texts.push({ text: String(v), width: col.width - 1 });
      cell.font = font(col.kind === "name" ? { bold: true } : col.kind === "number" ? { color: { argb: COLOURS.muted } } : {});
      cell.alignment = { vertical: "top", wrapText: true, horizontal: col.kind === "number" ? "center" : "left" };
      cell.border = { bottom: { style: "hair", color: { argb: COLOURS.rule } } };
      if (col.kind === "status") cell.dataValidation = { type: "list", allowBlank: true, showErrorMessage: false, formulae: [`"${OP_STATUSES.map((s) => s.label).join(",")}"`] };
    });
    row.height = rowHeight(texts, SIZE, 16);
  });
  const last = TABLE_ROW + Math.max(1, items.length);
  if (items.length) {
    ws.autoFilter = { from: { row: TABLE_ROW, column: 1 }, to: { row: last, column: columns.length } };
    const statusCol = columns.findIndex((c) => c.kind === "status") + 1;
    if (statusCol > 0) {
      const ref = `${colLetter(statusCol)}${TABLE_ROW + 1}:${colLetter(statusCol)}${last}`;
      ws.addConditionalFormatting({
        ref,
        rules: Object.entries(STATUS_FONT).map(([label, argb], i) => ({
          type: "cellIs" as const,
          operator: "equal" as const,
          priority: i + 1,
          formulae: [`"${label}"`],
          style: { font: { color: { argb }, bold: true } },
        })),
      });
    }
  } else {
    const c = ws.getCell(TABLE_ROW + 1, 1);
    c.value = "No entries.";
    c.font = font({ italic: true, color: { argb: COLOURS.muted } });
  }
  ws.views = [{ state: "frozen", xSplit: freezeCols, ySplit: TABLE_ROW, showGridLines: true, topLeftCell: `${colLetter(freezeCols + 1)}${TABLE_ROW + 1}` }];
  print(ws, `A1:${colLetter(columns.length)}${last}`, { widths: columns.map((c) => c.width), idColumns: freezeCols, header });
  return last;
}

const num: Column = { header: "No.", width: 5, value: (_e, n) => n, kind: "number" };

export function buildTechWorkbook(register: TechRegister, excel: ExcelModule, generatedAt = new Date()): WorkbookType {
  const wb = new excel.Workbook();
  wb.creator = "Fieldwise";
  wb.lastModifiedBy = "Fieldwise";
  wb.created = generatedAt;
  wb.modified = generatedAt;
  wb.title = safeText(`Technical register — ${registerTitle(register)}`);
  const all = register.equipment.map((e, i) => ({ e, n: i + 1 }));
  const label = (e: Equipment) => equipmentLabel(register, e);
  const name: Column = { header: "Equipment", width: 22, value: label, kind: "name" };
  const location: Column = { header: "Location", width: 22, value: (e) => e.location };
  const status: Column = { header: "Status", width: 14, value: (e) => statusLabel(e.status), kind: "status" };
  const inspected: Column = { header: "Last inspected", width: 12, value: (e) => e.lastInspected };
  const updated = `Technician ${register.technician.trim() || "not recorded"}  ·  Updated ${displayDate(register.updatedAt.slice(0, 10))}  ·  ${register.equipment.length} entr${register.equipment.length === 1 ? "y" : "ies"}`;

  /* 1 Equipment Register: core identification and status. */
  const reg = wb.addWorksheet("Equipment Register");
  titleBlock(reg, "Equipment Register", register, updated);
  table(
    reg,
    [
      num,
      { header: "Asset ID", width: 12, value: (e) => e.assetId },
      name,
      { header: "Category", width: 17, value: (e) => CATEGORY_LABEL[e.category], kind: "category" },
      { header: "Type", width: 16, value: (e) => e.type },
      location,
      { header: "Make", width: 14, value: (e) => e.make },
      { header: "Model", width: 16, value: (e) => e.model },
      { header: "Serial no.", width: 16, value: (e) => e.serial },
      { header: "Firmware", width: 14, value: (e) => e.firmware },
      { header: "IP address", width: 16, value: (e) => e.ip },
      status,
      inspected,
    ],
    all,
    3,
    { title: "Equipment Register", register },
  );
  // Category is a list too, so office staff can re-categorise from the sheet.
  for (let r = TABLE_ROW + 1; r <= TABLE_ROW + all.length; r++) {
    reg.getCell(r, 4).dataValidation = { type: "list", allowBlank: true, showErrorMessage: false, formulae: [`"${CATEGORIES.map((c) => c.label).join(",")}"`] };
  }

  /* 2 Network Configuration: network-capable categories and anything with a network value entered. */
  const net = wb.addWorksheet("Network Configuration");
  const networked = all.filter(({ e }) => NETWORK_CATEGORIES.has(e.category) || hasNetworkConfig(e));
  titleBlock(net, "Network Configuration", register, `${networked.length} network entr${networked.length === 1 ? "y" : "ies"}  ·  values exactly as recorded — not checked against the live network`);
  table(
    net,
    [
      num,
      name,
      location,
      { header: "IP address", width: 16, value: (e) => e.ip },
      { header: "Subnet / prefix", width: 15, value: (e) => e.subnet },
      { header: "Gateway", width: 15, value: (e) => e.gateway },
      { header: "Primary DNS", width: 15, value: (e) => e.dns1 },
      { header: "Secondary DNS", width: 15, value: (e) => e.dns2 },
      { header: "VLAN", width: 7, value: (e) => e.vlan },
      { header: "MAC address", width: 18, value: (e) => e.mac },
      { header: "Hostname", width: 16, value: (e) => e.hostname },
      { header: "Switch", width: 15, value: (e) => e.switchName },
      { header: "Switch port", width: 9, value: (e) => e.switchPort },
      { header: "PoE", width: 12, value: (e) => e.poe },
    ],
    networked,
    2,
    { title: "Network Configuration", register },
  );

  /* 3 Access & Maintenance. */
  const acc = wb.addWorksheet("Access & Maintenance");
  titleBlock(acc, "Access & Maintenance", register, "Ladder and mounting heights as recorded — not an assessment of ladder suitability");
  table(
    acc,
    [
      num,
      name,
      location,
      { header: "Ladder height", width: 11, value: (e) => e.ladderHeight },
      { header: "Ladder type", width: 15, value: (e) => e.ladderType },
      { header: "Mounting height", width: 12, value: (e) => e.mountingHeight },
      { header: "Access notes", width: 26, value: (e) => e.accessNotes },
      status,
      { header: "Fault", width: 26, value: (e) => e.fault },
      { header: "Work completed", width: 26, value: (e) => e.work },
      { header: "Recommendations", width: 26, value: (e) => e.recommendations },
      inspected,
    ],
    all,
    2,
    { title: "Access & Maintenance", register },
  );

  for (const ws of [reg, net, acc]) footer(ws, register);
  detailsSheet(wb, register, all, label);
  if (register.history.length) historySheet(wb, register);
  siteSheet(wb, register, updated);
  wb.views = [{ x: 0, y: 0, width: 20000, height: 12000, firstSheet: 0, activeTab: 0, visibility: "visible" }];
  return wb;
}

const DETAIL_WIDTH = 70;

/** One row per entered field (long text split into parts), grouped by entry. */
function detailsSheet(wb: WorkbookType, register: TechRegister, all: { e: Equipment; n: number }[], label: (e: Equipment) => string) {
  const ws = wb.addWorksheet("Full Equipment Details");
  titleBlock(ws, "Full Equipment Details", register, "Every entered field, including custom fields. Blank fields are not listed.");
  const columns = [
    { header: "No.", width: 5 },
    { header: "Equipment", width: 22 },
    { header: "Section", width: 20 },
    { header: "Field", width: 26 },
    { header: "Value", width: DETAIL_WIDTH },
  ];
  ws.columns = columns.map((c) => ({ width: c.width }));
  headerRow(ws, columns.map((c) => c.header));
  let row = TABLE_ROW + 1;
  for (const { e, n } of all) {
    const fields: [string, string, string][] = [["Basic details", "Category", CATEGORY_LABEL[e.category]]];
    for (const s of SECTIONS) {
      for (const f of s.fields) {
        const v = f.key === "status" ? statusLabel(e.status) : e[f.key].trim();
        if (v) fields.push([s.title, FIELD_LABEL[f.key], v]);
      }
    }
    for (const c of e.customFields) if (c.name.trim() || c.value.trim()) fields.push(["Custom fields", c.name.trim() || "(unnamed field)", c.value.trim()]);
    const first = row;
    for (const [section, field, value] of fields) {
      const parts = splitText(value, DETAIL_WIDTH - 1, SIZE, MAX_ROW_HEIGHT - 10);
      parts.forEach((part, i) => {
        const r = ws.getRow(row++);
        const values: (string | number)[] = [n, label(e), section, parts.length > 1 ? `${field} (part ${i + 1} of ${parts.length})` : field, part];
        values.forEach((v, c) => {
          const cell = r.getCell(c + 1);
          if (v !== "") cell.value = typeof v === "number" ? v : safeText(v);
          cell.font = font(c === 1 ? { bold: true } : c === 0 || c === 2 ? { color: { argb: COLOURS.muted } } : {});
          cell.alignment = { vertical: "top", wrapText: true, horizontal: c === 0 ? "center" : "left" };
          cell.border = { bottom: { style: "hair", color: { argb: COLOURS.rule } } };
        });
        r.height = rowHeight([{ text: part, width: DETAIL_WIDTH - 1 }, { text: String(values[3]), width: 25 }], SIZE, 16);
      });
    }
    // A firmer rule closes each entry's group of rows.
    if (row > first) for (let c = 1; c <= columns.length; c++) ws.getCell(row - 1, c).border = { bottom: { style: "thin", color: { argb: COLOURS.entryRule } } };
  }
  const last = Math.max(row - 1, TABLE_ROW + 1);
  if (row > TABLE_ROW + 1) ws.autoFilter = { from: { row: TABLE_ROW, column: 1 }, to: { row: last, column: columns.length } };
  else {
    ws.getCell(TABLE_ROW + 1, 1).value = "No entries.";
    ws.getCell(TABLE_ROW + 1, 1).font = font({ italic: true, color: { argb: COLOURS.muted } });
  }
  ws.views = [{ state: "frozen", ySplit: TABLE_ROW, xSplit: 2, topLeftCell: `C${TABLE_ROW + 1}` }];
  print(ws, `A1:E${last}`);
  footer(ws, register);
}

/** Equipment history, newest first: one row per event, with previous → new values where recorded. */
function historySheet(wb: WorkbookType, r: TechRegister) {
  const ws = wb.addWorksheet("Equipment History");
  titleBlock(ws, "Equipment History", r, `${r.history.length} event${r.history.length === 1 ? "" : "s"}, newest first — recorded from changes in Fieldwise and linked service reports`);
  const columns = [
    { header: "Date", width: 12 },
    { header: "Equipment", width: 20 },
    { header: "Event", width: 20 },
    { header: "Description", width: 50 },
    { header: "Previous → new values", width: 40 },
    { header: "Service report", width: 26 },
    { header: "Technician", width: 16 },
  ];
  ws.columns = columns.map((c) => ({ width: c.width }));
  headerRow(ws, columns.map((c) => c.header));
  const names = new Map(r.equipment.map((e) => [e.id, equipmentLabel(r, e)]));
  let row = TABLE_ROW + 1;
  for (const h of sortHistory(r.history)) {
    const changes = h.changes.map((c) => `${c.label}: ${c.from || "(blank)"} → ${c.to || "(cleared)"}`).join("\n");
    // Events outlive deleted reports and removed equipment; say so rather than imply they still exist.
    const equipment = names.get(h.equipmentId) ?? `${h.equipmentName || "Equipment"} (removed from register)`;
    const source = h.reportId ? `${h.reportLabel || "Service report"}${h.sourceDeletedAt ? " (report deleted)" : ""}` : "";
    const values = [eventDay(h), equipment, HISTORY_LABEL[h.type], h.description, changes, source, h.technician];
    // Long text continues on further rows (date and equipment repeated so filters still work); nothing is cut.
    const pieces = values.map((v, i) => splitText(v, columns[i]!.width - 1, SIZE, MAX_ROW_HEIGHT - 10));
    const lines = Math.max(...pieces.map((p) => p.length));
    for (let k = 0; k < lines; k++) {
      const x = ws.getRow(row++);
      const texts = pieces.map((p, i) => ({ text: i < 2 ? p[0]! : (p[k] ?? ""), width: columns[i]!.width - 1 }));
      texts.forEach(({ text }, i) => {
        const cell = x.getCell(i + 1);
        if (text) cell.value = safeText(text);
        cell.font = font(i === 1 ? { bold: true } : i === 0 ? { color: { argb: COLOURS.muted } } : {});
        cell.alignment = { vertical: "top", wrapText: true };
        cell.border = { bottom: { style: "hair", color: { argb: COLOURS.rule } } };
      });
      x.height = rowHeight(texts, SIZE, 16);
    }
  }
  ws.autoFilter = { from: { row: TABLE_ROW, column: 1 }, to: { row: row - 1, column: columns.length } };
  ws.views = [{ state: "frozen", ySplit: TABLE_ROW, xSplit: 2, topLeftCell: `C${TABLE_ROW + 1}` }];
  print(ws, `A1:G${row - 1}`);
  footer(ws, r);
}

/** Register details and general site notes as Field / Value rows. */
function siteSheet(wb: WorkbookType, r: TechRegister, updated: string) {
  const ws = wb.addWorksheet("Site Information");
  titleBlock(ws, "Site Information", r, updated);
  const width = 90;
  ws.columns = [{ width: 22 }, { width }];
  headerRow(ws, ["Field", "Value"]);
  const rows: [string, string][] = [
    ["Register name", r.name.trim()],
    ["Site name", r.siteName.trim()],
    ["Customer", r.customer.trim()],
    ["Site address", r.siteAddress.trim()],
    ["Site reference", r.siteReference.trim()],
    ["Technician", r.technician.trim()],
    ["Created", displayDate(r.createdAt.slice(0, 10))],
    ["Last updated", displayDate(r.updatedAt.slice(0, 10))],
    ["Equipment entries", String(r.equipment.length)],
  ];
  let row = TABLE_ROW + 1;
  const write = (field: string, value: string) => {
    const x = ws.getRow(row++);
    x.getCell(1).value = field;
    x.getCell(1).font = font({ bold: true });
    if (value) x.getCell(2).value = safeText(value);
    x.getCell(2).font = font();
    for (const c of [1, 2]) {
      x.getCell(c).alignment = { vertical: "top", wrapText: true };
      x.getCell(c).border = { bottom: { style: "hair", color: { argb: COLOURS.rule } } };
    }
    x.height = rowHeight([{ text: value, width: width - 1 }], SIZE, 16);
  };
  for (const [f, v] of rows) write(f, v);
  const notes = splitText(r.notes.trim(), width - 1, SIZE, MAX_ROW_HEIGHT - 10);
  notes.forEach((part, i) => write(notes.length > 1 ? `Site notes (part ${i + 1} of ${notes.length})` : "Site notes", part));
  ws.views = [{ state: "frozen", ySplit: TABLE_ROW }];
  print(ws, `A1:B${row - 1}`);
  footer(ws, r);
}

/** Generates the workbook bytes. ExcelJS is loaded on demand so it isn't in every page's bundle. */
export async function techWorkbookBytes(register: TechRegister, generatedAt = new Date()): Promise<ArrayBuffer> {
  const mod = await import("exceljs");
  const excel = ((mod as unknown as { default?: ExcelModule }).default ?? mod) as ExcelModule;
  const buffer = (await buildTechWorkbook(register, excel, generatedAt).xlsx.writeBuffer()) as ArrayBuffer;
  return finalizeXlsx(buffer);
}
