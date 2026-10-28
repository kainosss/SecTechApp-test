/**
 * What goes into a client handover, built only from the service report's
 * client-facing fields. Nothing is invented: counts come from the entries,
 * narrative is the technician's own text, and empty sections are left out.
 *
 * Deliberately excluded: item notes, Technical Docs links and snapshots
 * (serials, firmware, asset IDs), and anything from a site register — network
 * settings, access details and equipment history never reach the client
 * document. No compliance, certification or approval statements are made.
 */
import { inspectionOverview, JOB_TITLES } from "@/lib/reports/excel";
import { draftSummary, itemLabel, STATUS_LABEL, statusCounts } from "@/lib/reports/report";
import type { ItemStatus, Report, ReportItem } from "@/lib/reports/schema";
import { cleanText, displayDate } from "@/lib/reports/xlsx-layout";

export const SECTION_OPTIONS = [
  { id: "overview", label: "Inspection overview" },
  { id: "work", label: "Work completed" },
  { id: "defects", label: "Identified defects" },
  { id: "recommendations", label: "Recommendations" },
  { id: "schedule", label: "Equipment inspection schedule" },
  { id: "notes", label: "Additional information" },
] as const;
export type SectionId = (typeof SECTION_OPTIONS)[number]["id"];
export type HandoverOptions = Record<SectionId, boolean>;
export const DEFAULT_OPTIONS: HandoverOptions = { overview: true, work: true, defects: true, recommendations: true, schedule: true, notes: true };

export type Tone = "text" | "muted" | "pass" | "fault" | "recommendation" | "not-tested" | "high" | "medium" | "low";

export interface Cell {
  text: string;
  bold?: boolean;
  tone?: Tone;
  /** Secondary line under the main text (e.g. make/model). */
  sub?: string;
}

export interface Column {
  header: string;
  /** Share of the table width. */
  width: number;
  align?: "left" | "center";
}

export type Block =
  | { kind: "heading"; number: number; text: string }
  | { kind: "pairs"; pairs: { label: string; value: string }[]; wide: { label: string; value: string }[] }
  | { kind: "kpis"; tiles: { label: string; value: number; tone: Tone; emphasis?: boolean }[] }
  | { kind: "paragraph"; text: string; tone?: Tone }
  | { kind: "subheading"; text: string }
  | { kind: "table"; columns: Column[]; rows: Cell[][] };

export interface HandoverDocument {
  title: string;
  subtitle: string;
  date: string;
  reference: string;
  siteName: string;
  blocks: Block[];
  /** Sections included, in order (for the review list). */
  included: SectionId[];
  /** Sections that were selected but have nothing to show. */
  empty: SectionId[];
}

export const DOCUMENT_TITLE = "SECURITY SERVICE REPORT";

const STATUS_TONE: Record<ItemStatus, Tone> = { pass: "pass", fault: "fault", recommendation: "recommendation", "not-tested": "not-tested" };
const PRIORITY_TONE: Record<string, Tone> = { High: "high", Medium: "medium", Low: "low" };

/** Report text, cleaned of characters a document can't hold, with tabs as spaces; content is otherwise unchanged. */
const t = (s: string) => cleanText(s).replace(/\t/g, "    ").trim();
/** Narrative the technician wrote, unless it's only the unedited auto-fill of what a table already shows. */
const own = (written: string, autoFill: string) => (t(written) && t(written) !== t(autoFill) ? t(written) : "");

/** Which optional sections have something to show for this report. */
export function availableSections(report: Report): Record<SectionId, boolean> {
  const has = report.equipment.length > 0;
  const draft = draftSummary(report);
  return {
    overview: true,
    work: Boolean(t(report.summary.workCompleted) || t(draft.workCompleted)),
    defects: has || Boolean(t(report.summary.faults)),
    recommendations: report.equipment.some((i) => t(i.recommendations)) || Boolean(own(report.summary.recommendations, draft.recommendations)),
    schedule: has,
    notes: Boolean(t(report.summary.parts) || t(report.summary.outstanding) || t(report.summary.notes)),
  };
}

export function handoverDocument(report: Report, options: HandoverOptions = DEFAULT_OPTIONS): HandoverDocument {
  const blocks: Block[] = [];
  const included: SectionId[] = [];
  const empty: SectionId[] = [];
  const available = availableSections(report);
  const draft = draftSummary(report);
  const counts = statusCounts(report);
  const label = (i: ReportItem) => t(itemLabel(report, i));
  let n = 0;
  let defectsSection = 0;
  const heading = (text: string) => blocks.push({ kind: "heading", number: ++n, text });

  /* Site and customer details — only what was entered. */
  const pair = (l: string, v: string) => ({ label: l, value: t(v) });
  const pairs = [
    pair("Customer", report.customer),
    pair("Site", report.siteName),
    pair("Site address", report.siteAddress),
    pair("Technician", report.technician),
    pair("Inspection date", report.date ? displayDate(report.date) : ""),
    pair("Job reference", report.reference),
  ].filter((p) => p.value);
  const wide = [pair("Job description", report.description)].filter((p) => p.value);
  if (pairs.length || wide.length) {
    heading("Site and customer details");
    blocks.push({ kind: "pairs", pairs, wide });
  }

  for (const { id } of SECTION_OPTIONS) {
    if (!options[id]) continue;
    if (!available[id]) {
      empty.push(id);
      continue;
    }
    included.push(id);
    switch (id) {
      case "overview": {
        heading("Inspection overview");
        if (report.equipment.length) {
          blocks.push({
            kind: "kpis",
            tiles: [
              { label: "Inspected", value: counts.pass + counts.fault + counts.recommendation, tone: "text", emphasis: true },
              { label: "Passed", value: counts.pass, tone: "pass" },
              { label: "Faults", value: counts.fault, tone: counts.fault ? "fault" : "text" },
              { label: "Recommendations", value: counts.recommendation, tone: counts.recommendation ? "recommendation" : "text" },
              { label: "Not tested", value: counts["not-tested"], tone: "not-tested" },
            ],
          });
        }
        const nt = counts["not-tested"];
        blocks.push({ kind: "paragraph", text: `${inspectionOverview(report)}${nt ? ` Items not tested were not assessed and are not included in the inspected total.` : ""}` });
        break;
      }
      case "work":
        heading("Work completed");
        blocks.push({ kind: "paragraph", text: t(report.summary.workCompleted) || t(draft.workCompleted) });
        break;
      case "defects": {
        heading("Identified defects");
        defectsSection = n;
        const narrative = own(report.summary.faults, draft.faults);
        if (narrative) blocks.push({ kind: "paragraph", text: narrative });
        const faults = report.equipment.filter((i) => i.status === "fault");
        if (faults.length) {
          const withPriority = faults.some((i) => i.priority);
          const withWork = faults.some((i) => t(i.work));
          blocks.push({
            kind: "table",
            columns: [
              { header: "Equipment", width: 0.2 },
              { header: "Location", width: 0.16 },
              { header: "Finding", width: withWork ? 0.3 : 0.5 },
              ...(withWork ? [{ header: "Work performed", width: 0.24 }] : []),
              ...(withPriority ? [{ header: "Priority", width: 0.1, align: "center" as const }] : []),
            ].map((c, _i, all) => ({ ...c, width: c.width / all.reduce((s, x) => s + x.width, 0) })),
            rows: faults.map((i) => [
              { text: label(i), bold: true, sub: t(i.makeModel) },
              { text: t(i.location) },
              { text: t(i.findings) || "No finding recorded", tone: t(i.findings) ? "text" : "muted" },
              ...(withWork ? [{ text: t(i.work) }] : []),
              ...(withPriority ? [{ text: i.priority, bold: true, tone: PRIORITY_TONE[i.priority] ?? "text" }] : []),
            ]),
          });
        } else if (!narrative) {
          const nt = counts["not-tested"];
          blocks.push({
            kind: "paragraph",
            tone: "muted",
            text: `No equipment was recorded as faulty during this service.${nt ? ` ${nt} item${nt === 1 ? " was" : "s were"} not tested, so ${nt === 1 ? "its" : "their"} condition was not assessed.` : ""}`,
          });
        }
        break;
      }
      case "recommendations": {
        heading("Recommendations");
        const narrative = own(report.summary.recommendations, draft.recommendations);
        if (narrative) blocks.push({ kind: "paragraph", text: narrative });
        const items = report.equipment.filter((i) => t(i.recommendations));
        if (items.length) {
          const withPriority = items.some((i) => i.priority);
          blocks.push({
            kind: "table",
            columns: withPriority
              ? [{ header: "Equipment", width: 0.22 }, { header: "Location", width: 0.18 }, { header: "Recommendation", width: 0.48 }, { header: "Priority", width: 0.12, align: "center" }]
              : [{ header: "Equipment", width: 0.24 }, { header: "Location", width: 0.2 }, { header: "Recommendation", width: 0.56 }],
            rows: items.map((i) => [
              { text: label(i), bold: true },
              { text: t(i.location) },
              { text: t(i.recommendations) },
              ...(withPriority ? [{ text: i.priority, bold: true, tone: PRIORITY_TONE[i.priority] ?? ("text" as Tone) }] : []),
            ]),
          });
        }
        break;
      }
      case "schedule":
        heading("Equipment inspection schedule");
        blocks.push({
          kind: "table",
          columns: [
            { header: "No.", width: 0.06, align: "center" },
            { header: "Equipment", width: 0.25 },
            { header: "Location", width: 0.19 },
            { header: "Status", width: 0.17 },
            { header: "Finding", width: 0.33 },
          ],
          rows: report.equipment.map((i, k) => [
            { text: String(k + 1), tone: "muted" },
            { text: label(i), bold: true, sub: t(i.makeModel) },
            { text: t(i.location) },
            { text: STATUS_LABEL[i.status], bold: true, tone: STATUS_TONE[i.status] },
            // A fault's finding is already set out under Identified defects, so it isn't repeated here.
            i.status === "fault" && defectsSection && t(i.findings) ? { text: `Refer to section ${defectsSection}`, tone: "muted" as Tone } : { text: t(i.findings) },
          ]),
        });
        break;
      case "notes":
        heading("Additional information");
        for (const [title, value] of [
          ["Outstanding work", report.summary.outstanding],
          ["Parts required", report.summary.parts],
          ["Site notes", report.summary.notes],
        ] as const) {
          if (!t(value)) continue;
          blocks.push({ kind: "subheading", text: title }, { kind: "paragraph", text: t(value) });
        }
        break;
    }
  }

  return {
    title: DOCUMENT_TITLE,
    subtitle: JOB_TITLES[report.jobType],
    date: report.date ? displayDate(report.date) : "",
    reference: t(report.reference),
    siteName: t(report.siteName),
    blocks,
    included,
    empty,
  };
}

/** Every piece of text in the document (for glyph checks and tests). */
export function documentText(d: HandoverDocument): string[] {
  const out = [d.title, d.subtitle, d.date, d.reference, d.siteName];
  for (const b of d.blocks) {
    if (b.kind === "heading" || b.kind === "subheading" || b.kind === "paragraph") out.push(b.text);
    else if (b.kind === "pairs") for (const p of [...b.pairs, ...b.wide]) out.push(p.label, p.value);
    else if (b.kind === "kpis") for (const k of b.tiles) out.push(k.label);
    else if (b.kind === "table") {
      out.push(...b.columns.map((c) => c.header));
      for (const r of b.rows) for (const c of r) out.push(c.text, c.sub ?? "");
    }
  }
  return out.filter(Boolean);
}

/** Applies `fn` to every piece of document text (used to substitute characters the PDF font can't show). */
export function mapDocumentText(d: HandoverDocument, fn: (s: string) => string): HandoverDocument {
  const cell = (c: Cell): Cell => ({ ...c, text: fn(c.text), sub: c.sub === undefined ? undefined : fn(c.sub) });
  const pair = (p: { label: string; value: string }) => ({ label: fn(p.label), value: fn(p.value) });
  return {
    ...d,
    title: fn(d.title),
    subtitle: fn(d.subtitle),
    date: fn(d.date),
    reference: fn(d.reference),
    siteName: fn(d.siteName),
    blocks: d.blocks.map((b): Block => {
      switch (b.kind) {
        case "heading":
        case "subheading":
        case "paragraph":
          return { ...b, text: fn(b.text) };
        case "pairs":
          return { ...b, pairs: b.pairs.map(pair), wide: b.wide.map(pair) };
        case "kpis":
          return { ...b, tiles: b.tiles.map((k) => ({ ...k, label: fn(k.label) })) };
        case "table":
          return { ...b, columns: b.columns.map((c) => ({ ...c, header: fn(c.header) })), rows: b.rows.map((r) => r.map(cell)) };
      }
    }),
  };
}
