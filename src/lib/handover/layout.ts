/**
 * Page layout for client handover PDFs: turns the document model into a list
 * of A4 pages, each a list of simple drawing operations (text, rectangles,
 * lines, images) in points from the top-left. The same pages are drawn into
 * the PDF and into the on-screen preview, so the preview is the document.
 *
 * Rules: text is always wrapped (never clipped); headings stay with the start
 * of their content; table headers repeat on every page a table spans; table
 * rows only split when taller than a page; nothing is drawn outside the
 * margins; page numbers are added once the total is known.
 */
import { fitLogo, type Branding } from "./branding";
import type { Block, Cell, HandoverDocument, Tone } from "./content";

export type Font = "regular" | "bold";

export type Op =
  | {
      t: "text";
      x: number;
      y: number;
      s: string;
      font: Font;
      size: number;
      color: string;
      align?: "left" | "right" | "center";
      /** Set when part of the text uses the symbol fallback font: consecutive runs and their font. */
      runs?: { s: string; symbols: boolean }[];
    }
  | { t: "rect"; x: number; y: number; w: number; h: number; fill: string }
  | { t: "line"; x1: number; y1: number; x2: number; y2: number; color: string; w: number }
  | { t: "image"; x: number; y: number; w: number; h: number; data: string; format: "PNG" | "JPEG" };

export interface Page {
  ops: Op[];
}

/** Width of `text` in points at `size` in `font`. */
export type Measure = (text: string, font: Font, size: number) => number;

export const PAGE = { w: 595.28, h: 841.89 } as const;
export const MARGIN = 48;
export const CONTENT_W = PAGE.w - MARGIN * 2;
/** Where body content may start on the first and later pages, and must end. */
const FIRST_TOP = 44;
const NEXT_TOP = 70;
export const CONTENT_BOTTOM = PAGE.h - 62;
const FOOTER_RULE = PAGE.h - 46;
const FOOTER_BASE = PAGE.h - 32;

export const COLOURS = {
  navy: "#17324D",
  blue: "#285A7A",
  paleBlue: "#EAF0F5",
  neutral: "#F4F6F8",
  border: "#D6DEE5",
  text: "#243342",
  muted: "#64748B",
  white: "#FFFFFF",
} as const;

const TONE: Record<Tone, string> = {
  text: COLOURS.text,
  muted: COLOURS.muted,
  pass: "#2F6B3A",
  fault: "#A23B32",
  recommendation: "#8A5A00",
  "not-tested": COLOURS.muted,
  high: "#A23B32",
  medium: "#8A5A00",
  low: COLOURS.muted,
};

/** Type scale (pt). */
export const TYPE = {
  title: 19,
  titleUnbranded: 22,
  company: 12,
  heading: 10.5,
  subheading: 9.5,
  body: 10,
  bodyLead: 14.2,
  table: 9,
  tableLead: 12.2,
  sub: 8,
  subLead: 10.4,
  label: 7.5,
  small: 8.5,
  footer: 7.5,
} as const;

/** Baseline for a line box starting at `top`. */
const baseline = (top: number, lead: number, size: number) => top + (lead - size) / 2 + size * 0.8;

/** Greedy word wrap; honours line breaks; words longer than a line are broken. Blank source lines become "". */
export function wrap(text: string, font: Font, size: number, width: number, measure: Measure): string[] {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    const words = para.split(/ +/).filter((w) => w !== "");
    if (!words.length) {
      out.push("");
      continue;
    }
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (measure(candidate, font, size) <= width) {
        line = candidate;
        continue;
      }
      if (line) out.push(line);
      line = "";
      // Break a word that can't fit a line on its own.
      let rest = word;
      while (measure(rest, font, size) > width) {
        let n = rest.length - 1;
        while (n > 1 && measure(rest.slice(0, n), font, size) > width) n--;
        out.push(rest.slice(0, n));
        rest = rest.slice(n);
      }
      line = rest;
    }
    out.push(line);
  }
  // Collapse runs of blank lines and trim blank edges.
  return out.filter((l, i) => l !== "" || (i > 0 && out[i - 1] !== "")).filter((l, i, a) => !(l === "" && (i === 0 || i === a.length - 1)));
}

/** Shortens `text` with an ellipsis to fit `width` (running headers only; the full text appears on page 1). */
function fit(text: string, font: Font, size: number, width: number, measure: Measure): string {
  if (measure(text, font, size) <= width) return text;
  let s = text;
  while (s.length > 1 && measure(`${s}…`, font, size) > width) s = s.slice(0, -1);
  return `${s.trimEnd()}…`;
}

interface Line {
  s: string;
  font: Font;
  size: number;
  lead: number;
  color: string;
}

class Pager {
  pages: Page[] = [];
  y = 0;
  constructor(readonly measure: Measure) {}
  get ops() {
    return this.pages.at(-1)!.ops;
  }
  newPage() {
    this.pages.push({ ops: [] });
    this.y = this.pages.length === 1 ? FIRST_TOP : NEXT_TOP;
  }
  /** Space left on this page. */
  get room() {
    return CONTENT_BOTTOM - this.y;
  }
  get atTop() {
    return this.y <= (this.pages.length === 1 ? FIRST_TOP : NEXT_TOP) + 0.01;
  }
  ensure(h: number) {
    if (h > this.room && !this.atTop) this.newPage();
  }
  text(x: number, top: number, l: Line, align: "left" | "right" | "center" = "left") {
    if (!l.s) return;
    this.ops.push({ t: "text", x, y: baseline(top, l.lead, l.size), s: l.s, font: l.font, size: l.size, color: l.color, align });
  }
}

const lines = (p: Pager, text: string, font: Font, size: number, lead: number, color: string, width: number): Line[] =>
  wrap(text, font, size, width, p.measure).map((s) => ({ s, font, size, lead, color }));

const height = (ls: Line[]) => ls.reduce((h, l) => h + (l.s ? l.lead : l.lead * 0.45), 0);

/* ------------------------------------------------------------- header */

function firstPageHeader(p: Pager, d: HandoverDocument, b: Branding, accent: string) {
  const top = p.y;
  const right = MARGIN + CONTENT_W;
  const branded = Boolean(b.companyName.trim() || b.logo || b.phone.trim() || b.email.trim() || b.address.trim() || b.abn.trim());
  let left = top;
  let rightY = top;

  const meta = (label: string, value: string) => {
    if (!value) return;
    const lead = 13;
    const vw = p.measure(value, "bold", 9.5);
    p.text(right, rightY, { s: value, font: "bold", size: 9.5, lead, color: COLOURS.text }, "right");
    p.text(right - vw - 7, rightY, { s: label, font: "regular", size: TYPE.small, lead, color: COLOURS.muted }, "right");
    rightY += lead;
  };

  if (branded) {
    const leftW = CONTENT_W * 0.52;
    if (b.logo) {
      const { w, h } = fitLogo(b.logo, { w: 170, h: 54 });
      p.ops.push({ t: "image", x: MARGIN, y: left, w, h, data: b.logo.dataUrl, format: b.logo.format });
      left += h + 9;
    }
    if (b.companyName.trim()) {
      for (const l of lines(p, b.companyName.trim(), "bold", TYPE.company, 15, COLOURS.navy, leftW)) {
        p.text(MARGIN, left, l);
        left += l.lead;
      }
      left += 2;
    }
    const contact = [b.address.trim().replace(/\s*\n\s*/g, ", "), [b.phone.trim(), b.email.trim()].filter(Boolean).join("   ·   "), b.abn.trim() && `ABN ${b.abn.trim()}`].filter(Boolean);
    for (const c of contact) {
      for (const l of lines(p, c, "regular", TYPE.small, 11.2, COLOURS.muted, leftW)) {
        p.text(MARGIN, left, l);
        left += l.lead;
      }
    }
    // Title block on the right.
    const titleW = CONTENT_W * 0.46;
    for (const l of lines(p, d.title, "bold", TYPE.title, 22, COLOURS.navy, titleW)) {
      p.text(right, rightY, l, "right");
      rightY += l.lead;
    }
    p.text(right, rightY, { s: d.subtitle, font: "bold", size: 9.5, lead: 15, color: COLOURS.blue }, "right");
    rightY += 19;
  } else {
    // Unbranded: the title leads on the left.
    for (const l of lines(p, d.title, "bold", TYPE.titleUnbranded, 25, COLOURS.navy, CONTENT_W * 0.6)) {
      p.text(MARGIN, left, l);
      left += l.lead;
    }
    p.text(MARGIN, left, { s: d.subtitle, font: "bold", size: 10, lead: 15, color: COLOURS.blue });
    left += 15;
    rightY += 6;
  }
  meta("Report date", d.date);
  meta("Job reference", d.reference);

  p.y = Math.max(left, rightY) + 10;
  p.ops.push({ t: "line", x1: MARGIN, y1: p.y, x2: right, y2: p.y, color: accent, w: 2 });
  // The first section heading adds its own space above.
  p.y += 6;
}

/** Running header and footer, added once the page count is known. */
function decorate(p: Pager, d: HandoverDocument, b: Branding) {
  const total = p.pages.length;
  const right = MARGIN + CONTENT_W;
  p.pages.forEach((page, i) => {
    const ops = page.ops;
    if (i > 0) {
      const left = b.companyName.trim() || "Security Service Report";
      const leftW = Math.min(p.measure(left, "bold", 8.5), CONTENT_W * 0.45);
      // The job reference is kept whole; a long site name is shortened before it (it appears in full on page 1).
      const ref = d.reference ? `Job ref ${d.reference}` : "";
      const room = CONTENT_W - leftW - 24;
      const refW = ref ? p.measure(`  ·  ${ref}`, "regular", 8) : 0;
      const site = d.siteName && room - refW > 40 ? fit(d.siteName, "regular", 8, room - refW, p.measure) : "";
      const ctx = fit([site, ref].filter(Boolean).join("  ·  "), "regular", 8, room, p.measure);
      ops.push({ t: "text", x: MARGIN, y: 40, s: fit(left, "bold", 8.5, CONTENT_W * 0.45, p.measure), font: "bold", size: 8.5, color: COLOURS.navy });
      if (ctx) ops.push({ t: "text", x: right, y: 40, s: ctx, font: "regular", size: 8, color: COLOURS.muted, align: "right" });
      ops.push({ t: "line", x1: MARGIN, y1: 48, x2: right, y2: 48, color: COLOURS.border, w: 0.6 });
    }
    ops.push({ t: "line", x1: MARGIN, y1: FOOTER_RULE, x2: right, y2: FOOTER_RULE, color: COLOURS.border, w: 0.6 });
    const leftText = d.reference ? `Job reference ${d.reference}` : d.siteName;
    if (leftText) ops.push({ t: "text", x: MARGIN, y: FOOTER_BASE, s: fit(leftText, "regular", TYPE.footer, CONTENT_W * 0.36, p.measure), font: "regular", size: TYPE.footer, color: COLOURS.muted });
    ops.push({ t: "text", x: MARGIN + CONTENT_W / 2, y: FOOTER_BASE, s: "Generated with Fieldwise", font: "regular", size: 7, color: "#94A3B8", align: "center" });
    ops.push({ t: "text", x: right, y: FOOTER_BASE, s: `Page ${i + 1} of ${total}`, font: "regular", size: TYPE.footer, color: COLOURS.muted, align: "right" });
  });
}

/* ------------------------------------------------------------- blocks */

const HEADING_H = 22;
const HEADING_GAP_BEFORE = 20;
const HEADING_GAP_AFTER = 9;

function heading(p: Pager, number: number, text: string, accent: string, keep: number) {
  if (!p.atTop) p.y += HEADING_GAP_BEFORE;
  // Keep the heading with the start of its content.
  if (HEADING_H + HEADING_GAP_AFTER + keep > p.room && !p.atTop) p.newPage();
  const num = `${number}`;
  p.text(MARGIN, p.y, { s: num, font: "bold", size: TYPE.heading, lead: 16, color: accent });
  p.text(MARGIN + 18, p.y, { s: text.toUpperCase(), font: "bold", size: TYPE.heading, lead: 16, color: COLOURS.navy });
  p.y += 18;
  p.ops.push({ t: "line", x1: MARGIN, y1: p.y, x2: MARGIN + CONTENT_W, y2: p.y, color: COLOURS.border, w: 0.8 });
  p.ops.push({ t: "line", x1: MARGIN, y1: p.y, x2: MARGIN + 40, y2: p.y, color: accent, w: 1.6 });
  p.y += HEADING_H - 18 + HEADING_GAP_AFTER;
}

function paragraph(p: Pager, text: string, tone: Tone = "text", indent = 0) {
  const ls = lines(p, text, "regular", TYPE.body, TYPE.bodyLead, TONE[tone], CONTENT_W - indent);
  // Avoid a single stranded first line at the foot of a page.
  if (ls.length > 1 && p.room < TYPE.bodyLead * 2) p.newPage();
  for (const l of ls) {
    const h = l.s ? l.lead : l.lead * 0.45;
    if (h > p.room) p.newPage();
    p.text(MARGIN + indent, p.y, l);
    p.y += h;
  }
}

function paragraphKeep(p: Pager, text: string) {
  return Math.min(2, wrap(text, "regular", TYPE.body, CONTENT_W, p.measure).length) * TYPE.bodyLead;
}

function pairsBlock(p: Pager, b: Extract<Block, { kind: "pairs" }>) {
  const pad = 12;
  const gap = 22;
  const colW = (CONTENT_W - pad * 2 - gap) / 2;
  const cell = (label: string, value: string, width: number) => [
    { s: label.toUpperCase(), font: "bold" as Font, size: TYPE.label, lead: 11, color: COLOURS.muted },
    ...lines(p, value, "regular", TYPE.body, 13.6, COLOURS.text, width),
  ];
  // Strips are placed one after another; each carries its own share of the panel background, so the panel
  // continues seamlessly onto the next page. Wide values (e.g. a long description) go line by line.
  const rowGap = 9;
  const strips: { cols: Line[][]; h: number; gapAfter: number }[] = [];
  for (let i = 0; i < b.pairs.length; i += 2) {
    const cols = b.pairs.slice(i, i + 2).map((x) => cell(x.label, x.value, colW));
    strips.push({ cols, h: Math.max(...cols.map(height)), gapAfter: rowGap });
  }
  for (const w of b.wide) {
    const ls = cell(w.label, w.value, CONTENT_W - pad * 2);
    // The label travels with the first line of its value.
    strips.push({ cols: [ls.slice(0, 2)], h: height(ls.slice(0, 2)), gapAfter: 0 });
    for (const l of ls.slice(2)) strips.push({ cols: [[l]], h: height([l]), gapAfter: 0 });
    strips.at(-1)!.gapAfter = rowGap;
  }
  if (!strips.length) return;
  strips.at(-1)!.gapAfter = pad;
  strips.forEach((st, k) => {
    let top = k === 0 ? pad : 0;
    if (top + st.h + st.gapAfter > p.room) {
      p.newPage();
      top = pad;
    }
    const startY = p.y;
    p.ops.push({ t: "rect", x: MARGIN, y: startY, w: CONTENT_W, h: top + st.h + st.gapAfter, fill: COLOURS.neutral });
    st.cols.forEach((col, c) => {
      let y = startY + top;
      for (const l of col) {
        p.text(MARGIN + pad + c * (colW + gap), y, l);
        y += l.s ? l.lead : l.lead * 0.45;
      }
    });
    p.y = startY + top + st.h + st.gapAfter;
  });
}

function kpis(p: Pager, b: Extract<Block, { kind: "kpis" }>, accent: string) {
  const gap = 6;
  const w = (CONTENT_W - gap * (b.tiles.length - 1)) / b.tiles.length;
  const h = 54;
  p.ensure(h + 10);
  b.tiles.forEach((tile, i) => {
    const x = MARGIN + i * (w + gap);
    p.ops.push({ t: "rect", x, y: p.y, w, h, fill: tile.emphasis ? COLOURS.paleBlue : COLOURS.neutral });
    const alert = tile.tone === "fault" && tile.value > 0;
    if (alert) p.ops.push({ t: "rect", x, y: p.y, w, h: 2.2, fill: TONE.fault });
    else if (tile.emphasis) p.ops.push({ t: "rect", x, y: p.y, w, h: 2.2, fill: accent });
    p.text(x + w / 2, p.y + 8, { s: String(tile.value), font: "bold", size: 19, lead: 24, color: tile.value ? TONE[tile.tone] : COLOURS.muted }, "center");
    p.text(x + w / 2, p.y + 34, { s: tile.label.toUpperCase(), font: "bold", size: TYPE.label, lead: 11, color: COLOURS.muted }, "center");
  });
  p.y += h + 10;
}

interface CellLayout {
  lines: Line[];
}

const PAD_X = 6;
const PAD_Y = 5;

/** Measures a table: column positions, wrapped header and cell lines, and how much it needs to start on a page. */
function prepareTable(p: Pager, b: Extract<Block, { kind: "table" }>) {
  const widths = b.columns.map((c) => c.width * CONTENT_W);
  const xs = widths.map((_, i) => MARGIN + widths.slice(0, i).reduce((a, w) => a + w, 0));
  const headerCells = b.columns.map((c, i) => lines(p, c.header.toUpperCase(), "bold", TYPE.label, 10, COLOURS.navy, widths[i]! - PAD_X * 2));
  const headerH = Math.max(...headerCells.map(height)) + PAD_Y * 2;
  const layoutCell = (c: Cell, i: number): CellLayout => ({
    lines: [
      ...lines(p, c.text, c.bold ? "bold" : "regular", TYPE.table, TYPE.tableLead, TONE[c.tone ?? "text"], widths[i]! - PAD_X * 2),
      ...(c.sub ? lines(p, c.sub, "regular", TYPE.sub, TYPE.subLead, COLOURS.muted, widths[i]! - PAD_X * 2) : []),
    ],
  });
  const rows = b.rows.map((r) => r.map(layoutCell));
  const rowH = (r: CellLayout[]) => Math.max(...r.map((c) => height(c.lines))) + PAD_Y * 2;
  const fresh = CONTENT_BOTTOM - NEXT_TOP - headerH;
  // Start with at least the first three rows (or the whole table if shorter) so a table never begins with a
  // single orphaned row; a first row taller than a page splits, so a few of its lines are enough.
  const first = rows[0] ? rowH(rows[0]) : 0;
  const opening = rows.slice(0, 3).reduce((h, r) => h + rowH(r), 0);
  const startH = headerH + (opening <= fresh ? opening : first <= fresh ? first : TYPE.tableLead * 3 + PAD_Y * 2);
  return { widths, xs, headerCells, headerH, rows, rowH, fresh, startH };
}

function tableBlock(p: Pager, b: Extract<Block, { kind: "table" }>) {
  const padX = PAD_X;
  const padY = PAD_Y;
  const { widths, xs, headerCells, headerH, rows, startH } = prepareTable(p, b);
  const drawHeader = () => {
    p.ops.push({ t: "rect", x: MARGIN, y: p.y, w: CONTENT_W, h: headerH, fill: COLOURS.paleBlue });
    headerCells.forEach((ls, i) => {
      let y = p.y + padY;
      for (const l of ls) {
        const align = b.columns[i]!.align === "center" ? "center" : "left";
        p.text(align === "center" ? xs[i]! + widths[i]! / 2 : xs[i]! + padX, y, l, align);
        y += l.lead;
      }
    });
    p.y += headerH;
  };
  // The header must start with (at least the beginning of) its first row.
  p.ensure(startH);
  drawHeader();
  rows.forEach((row) => {
    let pending = row.map((c) => c.lines);
    while (pending.some((ls) => ls.length)) {
      const need = Math.max(...pending.map(height)) + padY * 2;
      if (need > p.room) {
        // A row taller than the space left: move it whole if it fits on a fresh page, otherwise split it.
        const fresh = CONTENT_BOTTOM - NEXT_TOP - headerH;
        if (need <= fresh || p.room < TYPE.tableLead * 3 + padY * 2) {
          p.newPage();
          drawHeader();
          continue;
        }
      }
      const avail = p.room - padY * 2;
      const take = pending.map((ls) => {
        let h = 0;
        let n = 0;
        while (n < ls.length && h + (ls[n]!.s ? ls[n]!.lead : ls[n]!.lead * 0.45) <= avail) h += ls[n++]!.s ? ls[n - 1]!.lead : ls[n - 1]!.lead * 0.45;
        return n;
      });
      const chunk = pending.map((ls, i) => ls.slice(0, take[i]));
      const h = Math.max(...chunk.map(height)) + padY * 2;
      chunk.forEach((ls, i) => {
        let y = p.y + padY;
        const align = b.columns[i]!.align === "center" ? "center" : "left";
        for (const l of ls) {
          p.text(align === "center" ? xs[i]! + widths[i]! / 2 : xs[i]! + padX, y, l, align);
          y += l.s ? l.lead : l.lead * 0.45;
        }
      });
      p.y += h;
      p.ops.push({ t: "line", x1: MARGIN, y1: p.y, x2: MARGIN + CONTENT_W, y2: p.y, color: COLOURS.border, w: 0.5 });
      pending = pending.map((ls, i) => ls.slice(take[i]));
      if (pending.some((ls) => ls.length)) {
        p.newPage();
        drawHeader();
      }
    }
  });
  p.y += 4;
}

/** Height the first part of a block needs, so its heading isn't left alone at the foot of a page. */
function keepHeight(p: Pager, b: Block | undefined): number {
  if (!b) return 0;
  switch (b.kind) {
    case "paragraph":
      return paragraphKeep(p, b.text);
    case "kpis":
      return 64;
    case "pairs":
      return 60;
    case "subheading":
      return 20;
    case "table":
      return prepareTable(p, b).startH;
    default:
      return 0;
  }
}

export interface LayoutOptions {
  measure: Measure;
  branding: Branding;
}

export function layoutHandover(d: HandoverDocument, { measure, branding }: LayoutOptions): Page[] {
  const accent = branding.accent || COLOURS.navy;
  const p = new Pager(measure);
  p.newPage();
  firstPageHeader(p, d, branding, accent);
  d.blocks.forEach((b, i) => {
    const next = d.blocks[i + 1];
    switch (b.kind) {
      case "heading": {
        // Keep the heading with its first block, and a subheading with the paragraph after it.
        const after = d.blocks[i + 2];
        heading(p, b.number, b.text, accent, keepHeight(p, next) + (next?.kind === "subheading" ? keepHeight(p, after) : 0));
        break;
      }
      case "subheading": {
        const keep = keepHeight(p, next);
        if (!p.atTop) p.y += 6;
        if (16 + keep > p.room) p.newPage();
        p.text(MARGIN, p.y, { s: b.text, font: "bold", size: TYPE.subheading, lead: 15, color: COLOURS.blue });
        p.y += 17;
        break;
      }
      case "paragraph":
        paragraph(p, b.text, b.tone);
        p.y += 4;
        break;
      case "pairs":
        pairsBlock(p, b);
        break;
      case "kpis":
        kpis(p, b, accent);
        break;
      case "table":
        if (i > 0 && d.blocks[i - 1]!.kind === "paragraph") p.y += 4;
        tableBlock(p, b);
        break;
    }
  });
  decorate(p, d, branding);
  return p.pages;
}
