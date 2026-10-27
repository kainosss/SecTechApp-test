/**
 * Pure report operations: create, edit equipment, derive counts, outstanding
 * actions and a draft summary. Derived text only ever re-uses what the
 * technician entered — no work, results, priorities or actions are invented.
 */
import { REPORT_VERSION, STATUSES, type ItemStatus, type JobType, type Report, type ReportItem, type ReportSummary } from "./schema";

export function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  }
}

/** Local date as YYYY-MM-DD (not UTC — a job on the evening of the 3rd is still the 3rd on site). */
export function today(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

export function createReport(jobType: JobType, technician = "", now = new Date()): Report {
  const iso = now.toISOString();
  return {
    id: newId(),
    version: REPORT_VERSION,
    createdAt: iso,
    updatedAt: iso,
    jobType,
    siteName: "",
    siteAddress: "",
    customer: "",
    technician,
    reference: "",
    date: today(now),
    description: "",
    equipment: [],
    summary: { workCompleted: "", faults: "", outstanding: "", recommendations: "", parts: "", notes: "" },
  };
}

export function blankItem(type = ""): ReportItem {
  return { id: newId(), name: "", type, location: "", makeModel: "", status: "not-tested", findings: "", work: "", recommendations: "", notes: "", priority: "" };
}

/** Default display name: "Camera 3" when the item has a type but no name. */
export function itemLabel(report: Report, item: ReportItem): string {
  if (item.name.trim()) return item.name.trim();
  const base = item.type.trim() || "Item";
  const sameType = report.equipment.filter((i) => (i.type.trim() || "Item") === base && !i.name.trim());
  return `${base} ${sameType.indexOf(item) + 1}`;
}

/* ------------------------------------------------------------- edits */

export type ReportEdit =
  | { type: "set"; patch: Partial<Omit<Report, "id" | "version" | "equipment" | "summary">> }
  | { type: "summary"; patch: Partial<ReportSummary> }
  | { type: "add-item"; itemType?: string; after?: string }
  | { type: "update-item"; id: string; patch: Partial<Omit<ReportItem, "id">> }
  | { type: "duplicate-item"; id: string }
  | { type: "remove-item"; id: string }
  | { type: "restore-item"; item: ReportItem; index: number }
  | { type: "move-item"; id: string; by: -1 | 1 };

/** Applies an edit; returns the report unchanged for edits that don't apply. */
export function applyEdit(report: Report, edit: ReportEdit, now = new Date()): Report {
  const touch = (r: Report) => ({ ...r, updatedAt: now.toISOString() });
  const eq = report.equipment;
  const at = (id: string) => eq.findIndex((i) => i.id === id);
  switch (edit.type) {
    case "set":
      return touch({ ...report, ...edit.patch });
    case "summary":
      return touch({ ...report, summary: { ...report.summary, ...edit.patch } });
    case "add-item": {
      const item = blankItem(edit.itemType ?? "");
      const i = edit.after ? at(edit.after) : -1;
      return touch({ ...report, equipment: i < 0 ? [...eq, item] : [...eq.slice(0, i + 1), item, ...eq.slice(i + 1)] });
    }
    case "update-item": {
      const i = at(edit.id);
      if (i < 0) return report;
      return touch({ ...report, equipment: eq.map((x) => (x.id === edit.id ? { ...x, ...edit.patch } : x)) });
    }
    case "duplicate-item": {
      const i = at(edit.id);
      if (i < 0) return report;
      // Copies what describes the equipment; the status and results belong to the original, so they start fresh.
      const src = eq[i]!;
      const copy: ReportItem = { ...blankItem(src.type), name: src.name ? `${src.name} (copy)` : "", location: src.location, makeModel: src.makeModel };
      return touch({ ...report, equipment: [...eq.slice(0, i + 1), copy, ...eq.slice(i + 1)] });
    }
    case "remove-item":
      return at(edit.id) < 0 ? report : touch({ ...report, equipment: eq.filter((x) => x.id !== edit.id) });
    case "restore-item": {
      if (at(edit.item.id) >= 0) return report;
      const i = Math.max(0, Math.min(edit.index, eq.length));
      return touch({ ...report, equipment: [...eq.slice(0, i), edit.item, ...eq.slice(i)] });
    }
    case "move-item": {
      const i = at(edit.id);
      const j = i + edit.by;
      if (i < 0 || j < 0 || j >= eq.length) return report;
      const next = [...eq];
      [next[i], next[j]] = [next[j]!, next[i]!];
      return touch({ ...report, equipment: next });
    }
  }
}

export function duplicateReport(report: Report, now = new Date()): Report {
  const iso = now.toISOString();
  return {
    ...structuredClone(report),
    id: newId(),
    createdAt: iso,
    updatedAt: iso,
    reference: report.reference ? `${report.reference} (copy)` : "",
    equipment: report.equipment.map((i) => ({ ...i, id: newId() })),
  };
}

/* ----------------------------------------------------------- derived */

export function statusCounts(report: Report): Record<ItemStatus, number> {
  const counts = Object.fromEntries(STATUSES.map((s) => [s.id, 0])) as Record<ItemStatus, number>;
  for (const i of report.equipment) counts[i.status]++;
  return counts;
}

export const STATUS_LABEL = Object.fromEntries(STATUSES.map((s) => [s.id, s.label])) as Record<ItemStatus, string>;

export interface OutstandingAction {
  item: string;
  location: string;
  issue: string;
  action: string;
  /** Blank unless the technician set one. */
  priority: string;
  status: string;
}

/** Items that need attention: marked Fault or Recommendation. Text comes only from what was entered. */
export function outstandingActions(report: Report): OutstandingAction[] {
  return report.equipment
    .filter((i) => i.status === "fault" || i.status === "recommendation")
    .map((i) => ({
      item: itemLabel(report, i),
      location: i.location.trim(),
      issue: i.findings.trim(),
      action: i.recommendations.trim(),
      priority: i.priority,
      status: STATUS_LABEL[i.status],
    }));
}

const bullet = (lines: string[]) => lines.map((l) => `• ${l}`).join("\n");

/**
 * A draft summary assembled from the equipment entries. Each section lists only
 * items where the technician wrote something; sections with nothing entered are
 * left empty rather than filled with generic text.
 */
export function draftSummary(report: Report): ReportSummary {
  const label = (i: ReportItem) => `${itemLabel(report, i)}${i.location.trim() ? ` (${i.location.trim()})` : ""}`;
  const pick = (f: (i: ReportItem) => string, filter: (i: ReportItem) => boolean = () => true) =>
    bullet(report.equipment.filter((i) => filter(i) && f(i).trim()).map((i) => `${label(i)}: ${f(i).trim()}`));
  return {
    workCompleted: pick((i) => i.work),
    faults: pick((i) => i.findings, (i) => i.status === "fault"),
    outstanding: bullet(
      report.equipment
        .filter((i) => i.status === "fault" && !i.work.trim())
        .map((i) => `${label(i)}: fault recorded${i.findings.trim() ? ` — ${i.findings.trim()}` : ""}; no work recorded`),
    ),
    recommendations: pick((i) => i.recommendations),
    parts: "",
    notes: "",
  };
}

/** Fills only empty summary sections from the draft, so nothing the technician wrote is overwritten. */
export function fillEmptySummary(report: Report): Partial<ReportSummary> {
  const draft = draftSummary(report);
  return Object.fromEntries(
    (Object.keys(draft) as (keyof ReportSummary)[]).filter((k) => !report.summary[k].trim() && draft[k]).map((k) => [k, draft[k]]),
  ) as Partial<ReportSummary>;
}

export interface ReportCheck {
  /** Generation is always allowed; these are reminders. */
  warnings: string[];
}

export function checkReport(report: Report): ReportCheck {
  const warnings: string[] = [];
  if (!report.siteName.trim()) warnings.push("No site name — the workbook will show it as blank.");
  if (!report.date) warnings.push("No job date.");
  if (report.equipment.length === 0) warnings.push("No equipment recorded.");
  const untested = report.equipment.filter((i) => i.status === "not-tested").length;
  if (untested) warnings.push(`${untested} item${untested === 1 ? " is" : "s are"} marked Not Tested.`);
  const faultsNoFindings = report.equipment.filter((i) => i.status === "fault" && !i.findings.trim()).length;
  if (faultsNoFindings) warnings.push(`${faultsNoFindings} fault${faultsNoFindings === 1 ? " has" : "s have"} no findings written.`);
  return { warnings };
}

/** A safe, readable file name: Fieldwise-<site or reference>-<date>.xlsx */
export function workbookFileName(report: Report): string {
  const part = (s: string) =>
    s
      .normalize("NFKD")
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 40);
  const name = part(report.reference) || part(report.siteName) || "Service-Report";
  return `Fieldwise-${name}${report.date ? `-${report.date}` : ""}.xlsx`;
}
