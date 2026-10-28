/**
 * Generates the client handover PDF in the browser with jsPDF (loaded on
 * demand) and embedded fonts served from this app — nothing is sent anywhere.
 *
 * Fonts: Carlito (OFL; metric-compatible with Calibri, as in the Excel
 * export) for text, plus "Fieldwise Symbols" (a renamed subset of DejaVu
 * Sans) for characters Carlito lacks — ticks and crosses, arrows, maths and
 * technical symbols, Greek, Cyrillic. The fallback is only fetched when a
 * report needs it. jsPDF embeds only the glyphs used and adds Unicode maps,
 * so files stay small and text can be copied/searched.
 *
 * Characters neither font has (e.g. emoji, CJK) are shown as "?" and listed,
 * with where they occur, so the technician is warned before export.
 *
 * One call produces both the page layout (drawn as the on-screen preview)
 * and the PDF bytes (downloaded): the preview is exactly what's exported.
 */
import type { jsPDF as JsPDF } from "jspdf";
import type { Report } from "@/lib/reports/schema";
import type { Branding } from "./branding";
import { handoverDocument, labelledText, mapDocumentText, documentText, type HandoverDocument, type HandoverOptions } from "./content";
import { layoutHandover, PAGE, type Font, type Op, type Page } from "./layout";

export interface FontPair {
  regular: string;
  bold: string;
}
/** Loads a font set as base64 TTF data: the main text fonts, or the symbol fallback. */
export type FontLoader = (set?: "text" | "symbols") => Promise<FontPair>;

export const FONT_FAMILY = "Carlito";
export const SYMBOL_FAMILY = "FieldwiseSymbols";
export const FONT_FILES = {
  text: { regular: "/fonts/Carlito-Regular.ttf", bold: "/fonts/Carlito-Bold.ttf" },
  symbols: { regular: "/fonts/FieldwiseSymbols.ttf", bold: "/fonts/FieldwiseSymbols-Bold.ttf" },
} as const;

function base64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

const fontCache = new Map<string, Promise<FontPair>>();
/** Fetches a bundled font set from this app (same origin), once. */
export const browserFonts: FontLoader = (set = "text") => {
  let p = fontCache.get(set);
  if (!p) {
    const files = FONT_FILES[set];
    p = Promise.all(
      [files.regular, files.bold].map(async (url) => {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Font not available (${res.status})`);
        return base64(await res.arrayBuffer());
      }),
    )
      .then(([regular, bold]) => ({ regular: regular!, bold: bold! }))
      .catch((e) => {
        fontCache.delete(set);
        throw e;
      });
    fontCache.set(set, p);
  }
  return p;
};

export interface Unsupported {
  /** Characters neither font can draw (shown as "?"). */
  chars: string[];
  /** Where they occur (label and a short excerpt), so the technician can fix the text. */
  places: { where: string; excerpt: string }[];
}

export interface Handover {
  document: HandoverDocument;
  pages: Page[];
  bytes: ArrayBuffer;
  unsupported: Unsupported;
  /** True when the symbol fallback font was needed. */
  usedSymbols: boolean;
}

const style = (f: Font) => (f === "bold" ? "bold" : "normal");
type Metadata = { characterToGlyph: (c: number) => number };

async function createDoc(fonts: FontPair): Promise<JsPDF> {
  const mod = await import("jspdf");
  const JsPDFClass = (mod as unknown as { jsPDF: typeof JsPDF }).jsPDF;
  const doc = new JsPDFClass({ unit: "pt", format: "a4", orientation: "portrait", compress: true });
  addFonts(doc, FONT_FAMILY, fonts, "Carlito");
  return doc;
}

function addFonts(doc: JsPDF, family: string, fonts: FontPair, file: string) {
  doc.addFileToVFS(`${file}-Regular.ttf`, fonts.regular);
  doc.addFont(`${file}-Regular.ttf`, family, "normal");
  doc.addFileToVFS(`${file}-Bold.ttf`, fonts.bold);
  doc.addFont(`${file}-Bold.ttf`, family, "bold");
}

/** Glyph lookup for both weights of a family: a character counts as covered only if both weights have it. */
function coverage(doc: JsPDF, family: string): (ch: string) => boolean {
  const meta = (["normal", "bold"] as const).map((s) => {
    doc.setFont(family, s);
    return (doc.getFont() as unknown as { metadata: Metadata }).metadata;
  });
  const cache = new Map<string, boolean>();
  return (ch) => {
    let v = cache.get(ch);
    if (v === undefined) {
      const cp = ch.codePointAt(0)!;
      v = meta.every((m) => m.characterToGlyph(cp) !== 0);
      cache.set(ch, v);
    }
    return v;
  };
}

/** Splits text into runs of main-font and fallback-font characters. */
function splitRuns(text: string, inMain: (ch: string) => boolean): { s: string; symbols: boolean }[] {
  const runs: { s: string; symbols: boolean }[] = [];
  for (const ch of text) {
    const symbols = !inMain(ch);
    const last = runs.at(-1);
    if (last && last.symbols === symbols) last.s += ch;
    else runs.push({ s: ch, symbols });
  }
  return runs;
}

interface Fonts {
  doc: JsPDF;
  inMain: (ch: string) => boolean;
  symbols: boolean;
}

function width(f: Fonts, text: string, font: Font, size: number): number {
  const runs = f.symbols ? splitRuns(text, f.inMain) : [{ s: text, symbols: false }];
  let w = 0;
  for (const r of runs) {
    f.doc.setFont(r.symbols ? SYMBOL_FAMILY : FONT_FAMILY, style(font));
    f.doc.setFontSize(size);
    w += f.doc.getTextWidth(r.s);
  }
  return w;
}

/** Draws laid-out pages into the PDF. */
function render(f: Fonts, pages: Page[]) {
  const { doc } = f;
  pages.forEach((page, i) => {
    if (i > 0) doc.addPage("a4", "portrait");
    for (const op of page.ops) {
      switch (op.t) {
        case "text": {
          doc.setFontSize(op.size);
          doc.setTextColor(op.color);
          if (!op.runs) {
            doc.setFont(FONT_FAMILY, style(op.font));
            doc.text(op.s, op.x, op.y, { align: op.align ?? "left", baseline: "alphabetic" });
            break;
          }
          // Mixed fonts: place each run after the previous one, honouring the alignment of the whole line.
          const total = width(f, op.s, op.font, op.size);
          let x = op.align === "right" ? op.x - total : op.align === "center" ? op.x - total / 2 : op.x;
          for (const r of op.runs) {
            doc.setFont(r.symbols ? SYMBOL_FAMILY : FONT_FAMILY, style(op.font));
            doc.setFontSize(op.size);
            doc.text(r.s, x, op.y, { baseline: "alphabetic" });
            x += doc.getTextWidth(r.s);
          }
          break;
        }
        case "rect":
          doc.setFillColor(op.fill);
          doc.rect(op.x, op.y, op.w, op.h, "F");
          break;
        case "line":
          doc.setDrawColor(op.color);
          doc.setLineWidth(op.w);
          doc.line(op.x1, op.y1, op.x2, op.y2);
          break;
        case "image":
          doc.addImage(op.data, op.format, op.x, op.y, op.w, op.h, "logo", "MEDIUM");
          break;
      }
    }
  });
}

/** Text measurement with the PDF fonts (the same widths the layout uses). */
export async function fontMeasure(loadFonts: FontLoader = browserFonts, withSymbols = false): Promise<(text: string, font: Font, size: number) => number> {
  const doc = await createDoc(await loadFonts("text"));
  const inMain = coverage(doc, FONT_FAMILY);
  if (withSymbols) addFonts(doc, SYMBOL_FAMILY, await loadFonts("symbols"), "FieldwiseSymbols");
  const f: Fonts = { doc, inMain, symbols: withSymbols };
  return (text, font, size) => width(f, text, font, size);
}

const FIXED_TEXT = ["Generated with Fieldwise", "Page of 0123456789 …·", "Job reference", "Report date"];

export async function generateHandover(report: Report, options: HandoverOptions, branding: Branding, loadFonts: FontLoader = browserFonts): Promise<Handover> {
  const doc = await createDoc(await loadFonts("text"));
  const inMain = coverage(doc, FONT_FAMILY);
  let document = handoverDocument(report, options);
  const brandFields = [
    ["Company name", branding.companyName],
    ["Company address", branding.address],
    ["Company phone", branding.phone],
    ["Company email", branding.email],
    ["ABN", branding.abn],
  ] as const;
  const texts = [...documentText(document), ...brandFields.map(([, v]) => v), ...FIXED_TEXT];

  // Load the symbol fallback only when the main font is missing something.
  const needed = new Set<string>();
  for (const t of texts) for (const ch of t) if (ch !== "\n" && !inMain(ch)) needed.add(ch);
  let inSymbols: (ch: string) => boolean = () => false;
  if (needed.size) {
    addFonts(doc, SYMBOL_FAMILY, await loadFonts("symbols"), "FieldwiseSymbols");
    inSymbols = coverage(doc, SYMBOL_FAMILY);
  }
  const missing = new Set([...needed].filter((ch) => !inSymbols(ch)));
  const usedSymbols = needed.size > missing.size;

  // Locate unsupported characters before substituting, so the warning can point at the text.
  const places: Unsupported["places"] = [];
  if (missing.size) {
    const sources = [...labelledText(document), ...brandFields.map(([where, text]) => ({ where, text }))];
    for (const { where, text } of sources) {
      const chars = Array.from(text);
      const i = chars.findIndex((ch) => missing.has(ch));
      if (i < 0) continue;
      const excerpt = chars.slice(Math.max(0, i - 20), i + 20).join("").replace(/\s+/g, " ").trim();
      if (!places.some((p) => p.where === where && p.excerpt === excerpt)) places.push({ where, excerpt });
      if (places.length >= 12) break;
    }
  }
  const sub = (s: string) => (missing.size ? Array.from(s, (ch) => (missing.has(ch) ? "?" : ch)).join("") : s);
  if (missing.size) document = mapDocumentText(document, sub);
  const brand: Branding = { ...branding, companyName: sub(branding.companyName), address: sub(branding.address), phone: sub(branding.phone), email: sub(branding.email), abn: sub(branding.abn) };

  const fonts: Fonts = { doc, inMain, symbols: usedSymbols };
  const pages = layoutHandover(document, { measure: (t, font, size) => width(fonts, t, font, size), branding: brand });
  if (usedSymbols) {
    // Record font runs on lines that need the fallback, so the preview draws exactly the same fonts.
    for (const page of pages) {
      page.ops = page.ops.map((op): Op => {
        if (op.t !== "text" || Array.from(op.s).every(inMain)) return op;
        return { ...op, runs: splitRuns(op.s, inMain) };
      });
    }
  }
  doc.setProperties({ title: `${document.title} — ${document.siteName || "Service report"}`, subject: document.subtitle, creator: "Fieldwise", author: brand.companyName || "" });
  render(fonts, pages);
  return { document, pages, bytes: doc.output("arraybuffer"), unsupported: { chars: [...missing], places }, usedSymbols };
}

export function handoverFileName(report: Report): string {
  const clean = (s: string) =>
    s
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 50);
  return `Service-Report-${[clean(report.siteName), clean(report.reference), report.date].filter(Boolean).join("-") || "Untitled"}.pdf`;
}

export { PAGE };
