/**
 * Generates the client handover PDF in the browser with jsPDF (loaded on
 * demand) and an embedded open-licence font (Carlito, OFL — metric-compatible
 * with Calibri, as used by the Excel export), served from this app. Nothing
 * is sent anywhere.
 *
 * One call produces both the page layout (drawn as the on-screen preview)
 * and the PDF bytes (downloaded), so the preview is exactly what's exported
 * and nothing is generated twice.
 */
import type { jsPDF as JsPDF } from "jspdf";
import type { Report } from "@/lib/reports/schema";
import type { Branding } from "./branding";
import { handoverDocument, mapDocumentText, documentText, type HandoverDocument, type HandoverOptions } from "./content";
import { layoutHandover, PAGE, type Font, type Page } from "./layout";

export interface FontData {
  regular: string;
  bold: string;
}
export type FontLoader = () => Promise<FontData>;

export const FONT_FAMILY = "Carlito";
export const FONT_FILES = { regular: "/fonts/Carlito-Regular.ttf", bold: "/fonts/Carlito-Bold.ttf" } as const;

function base64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

let fontCache: Promise<FontData> | null = null;
/** Fetches the bundled fonts from this app (same origin), once. */
export const browserFonts: FontLoader = () => {
  fontCache ??= Promise.all(
    [FONT_FILES.regular, FONT_FILES.bold].map(async (url) => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Font not available (${res.status})`);
      return base64(await res.arrayBuffer());
    }),
  )
    .then(([regular, bold]) => ({ regular: regular!, bold: bold! }))
    .catch((e) => {
      fontCache = null;
      throw e;
    });
  return fontCache;
};

export interface Handover {
  document: HandoverDocument;
  pages: Page[];
  bytes: ArrayBuffer;
  /** Characters the PDF font can't draw; shown as "?" (listed to the technician, never silently dropped). */
  unsupported: string[];
}

const style = (f: Font) => (f === "bold" ? "bold" : "normal");

async function createDoc(fonts: FontData): Promise<JsPDF> {
  const mod = await import("jspdf");
  const JsPDFClass = (mod as unknown as { jsPDF: typeof JsPDF }).jsPDF;
  const doc = new JsPDFClass({ unit: "pt", format: "a4", orientation: "portrait", compress: true });
  doc.addFileToVFS("Carlito-Regular.ttf", fonts.regular);
  doc.addFont("Carlito-Regular.ttf", FONT_FAMILY, "normal");
  doc.addFileToVFS("Carlito-Bold.ttf", fonts.bold);
  doc.addFont("Carlito-Bold.ttf", FONT_FAMILY, "bold");
  return doc;
}

/** Characters (code points) the regular or bold font has no glyph for. */
function unsupportedChars(doc: JsPDF, texts: string[]): Set<string> {
  const missing = new Set<string>();
  const fonts = (["normal", "bold"] as const).map((s) => {
    doc.setFont(FONT_FAMILY, s);
    return (doc.getFont() as unknown as { metadata: { characterToGlyph: (c: number) => number } }).metadata;
  });
  const seen = new Set<string>();
  for (const t of texts) {
    for (const ch of t) {
      if (seen.has(ch) || ch === "\n") continue;
      seen.add(ch);
      const cp = ch.codePointAt(0)!;
      if (fonts.some((f) => !f.characterToGlyph(cp))) missing.add(ch);
    }
  }
  return missing;
}

/** Draws laid-out pages into the PDF. */
function render(doc: JsPDF, pages: Page[]) {
  pages.forEach((page, i) => {
    if (i > 0) doc.addPage("a4", "portrait");
    for (const op of page.ops) {
      switch (op.t) {
        case "text":
          doc.setFont(FONT_FAMILY, style(op.font));
          doc.setFontSize(op.size);
          doc.setTextColor(op.color);
          doc.text(op.s, op.x, op.y, { align: op.align ?? "left", baseline: "alphabetic" });
          break;
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
export async function fontMeasure(loadFonts: FontLoader = browserFonts): Promise<(text: string, font: Font, size: number) => number> {
  const doc = await createDoc(await loadFonts());
  return (text, font, size) => {
    doc.setFont(FONT_FAMILY, style(font));
    doc.setFontSize(size);
    return doc.getTextWidth(text);
  };
}

export async function generateHandover(report: Report, options: HandoverOptions, branding: Branding, loadFonts: FontLoader = browserFonts): Promise<Handover> {
  const doc = await createDoc(await loadFonts());
  let document = handoverDocument(report, options);
  const brandText = [branding.companyName, branding.address, branding.phone, branding.email, branding.abn];
  const missing = unsupportedChars(doc, [...documentText(document), ...brandText, "Generated with Fieldwise", "Page of …·"]);
  const sub = (s: string) => (missing.size ? Array.from(s, (ch) => (missing.has(ch) ? "?" : ch)).join("") : s);
  if (missing.size) document = mapDocumentText(document, sub);
  const brand: Branding = { ...branding, companyName: sub(branding.companyName), address: sub(branding.address), phone: sub(branding.phone), email: sub(branding.email), abn: sub(branding.abn) };

  const measure = (text: string, font: Font, size: number) => {
    doc.setFont(FONT_FAMILY, style(font));
    doc.setFontSize(size);
    return doc.getTextWidth(text);
  };
  const pages = layoutHandover(document, { measure, branding: brand });
  doc.setProperties({ title: `${document.title} — ${document.siteName || "Service report"}`, subject: document.subtitle, creator: "Fieldwise", author: brand.companyName || "" });
  render(doc, pages);
  return { document, pages, bytes: doc.output("arraybuffer"), unsupported: [...missing] };
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
