/**
 * Text layout helpers for the workbook. ExcelJS can't auto-fit rows (Excel
 * only does that when a person edits a cell), so heights are estimated from
 * the text, column width and font size with a greedy word-wrap. Text that
 * would need a row taller than Excel's limit is split, never dropped.
 */

/** Excel's maximum characters in one cell. */
export const MAX_CELL = 32767;
/** Excel's maximum row height, in points. */
export const MAX_ROW_HEIGHT = 409;

// Characters XML 1.0 forbids (they would corrupt the file), and unpaired UTF-16 surrogates.
const INVALID_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;
/** Leading characters spreadsheet apps may treat as a formula (OWASP formula-injection list, incl. full-width forms). */
const FORMULA_START = /^\s*[=+\-@＝＋－＠]/;

/**
 * Makes user text safe for a cell without losing content: removes only
 * characters that are invalid in XLSX, normalises line breaks and prefixes
 * formula-like text with an apostrophe so it always stays text. Length is
 * handled by the callers (split across rows or the Full Text sheet).
 */
export function safeText(value: string): string {
  const s = cleanText(value);
  return FORMULA_START.test(s) ? `'${s}` : s;
}

/** Removes only characters that can't be stored in XLSX and normalises line breaks. */
export function cleanText(value: string): string {
  return value.replace(INVALID_XML, "").replace(LONE_SURROGATE, "").replace(/\r\n?/g, "\n");
}

/** Approximate characters per line for a column width (Excel width units ≈ Calibri 11 digit widths). */
export function charsPerLine(width: number, fontSize: number): number {
  // Average prose is ~10 % narrower than digits; smaller fonts fit proportionally more.
  return Math.max(4, Math.floor(width * (11 / fontSize) * 1.18));
}

/** Number of wrapped lines a text needs, using greedy word-wrap and honouring explicit line breaks. */
export function wrappedLines(text: string, width: number, fontSize: number): number {
  const cpl = charsPerLine(width, fontSize);
  let lines = 0;
  for (const para of text.split("\n")) {
    let line = 0;
    let count = 1;
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const w = word.length;
      if (line > 0 && line + 1 + w <= cpl) {
        line += 1 + w;
        continue;
      }
      if (line > 0) count++; // word starts a new line
      // A word longer than a line breaks across lines.
      count += Math.ceil(w / cpl) - 1;
      line = w % cpl || cpl;
    }
    lines += count;
  }
  return Math.max(1, lines);
}

/** Row height (points) for wrapped text in a cell. */
export function textHeight(text: string, width: number, fontSize: number): number {
  const lineHeight = fontSize * 1.28;
  return Math.ceil(wrappedLines(text, width, fontSize) * lineHeight + 5);
}

/** Height for a row of cells: the tallest cell decides, within Excel's limit and never below `min`. */
export function rowHeight(cells: { text: string; width: number }[], fontSize: number, min = 16): number {
  return Math.min(MAX_ROW_HEIGHT, Math.max(min, ...cells.map((c) => (c.text ? textHeight(c.text, c.width, fontSize) : 0))));
}

/**
 * Splits text into chunks that each fit within `maxHeight` points at the given
 * width (and within Excel's cell limit), breaking at line ends, then at word
 * boundaries. Concatenating the chunks with "\n" (or " " for mid-paragraph
 * splits) reproduces the text; nothing is dropped.
 */
export function splitText(text: string, width: number, fontSize: number, maxHeight: number): string[] {
  if (textHeight(text, width, fontSize) <= maxHeight && text.length <= MAX_CELL) return [text];
  const fits = (s: string) => textHeight(s, width, fontSize) <= maxHeight && s.length <= MAX_CELL;
  const chunks: string[] = [];
  let current = "";
  const pushPiece = (piece: string, sep: string) => {
    const candidate = current ? `${current}${sep}${piece}` : piece;
    if (fits(candidate)) {
      current = candidate;
      return true;
    }
    return false;
  };
  for (const para of text.split("\n")) {
    if (pushPiece(para, "\n")) continue;
    if (current) {
      chunks.push(current);
      current = "";
    }
    if (pushPiece(para, "\n")) continue;
    // A single paragraph too long for one row: split at word boundaries.
    for (const word of para.split(" ")) {
      if (pushPiece(word, " ")) continue;
      if (current) chunks.push(current);
      current = "";
      // A single "word" longer than a whole row (e.g. a pasted blob): hard split.
      let w = word;
      while (!fits(w)) {
        let n = Math.max(1, Math.floor(w.length / 2));
        while (n > 1 && !fits(w.slice(0, n))) n = Math.floor(n * 0.8);
        chunks.push(w.slice(0, n));
        w = w.slice(n);
      }
      current = w;
    }
  }
  if (current || chunks.length === 0) chunks.push(current);
  return chunks;
}

/** "2026-03-04" → "4 Mar 2026"; anything else is returned unchanged. */
export function displayDate(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${Number(m[3])} ${months[Number(m[2]) - 1]} ${m[1]}`;
}
