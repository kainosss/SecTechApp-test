/**
 * Quick Service Report: data model. Reports are drafts stored on this device
 * only; everything in them is entered by the technician — nothing is
 * generated or assumed. Validated on load so corrupted or outdated drafts
 * can't break the editor or the workbook.
 */
import { z } from "zod";

export const JOB_TYPES = [
  { id: "cctv", label: "CCTV" },
  { id: "intruder", label: "Intruder Alarm" },
  { id: "access", label: "Access Control" },
  { id: "general", label: "General Security" },
] as const;
export type JobType = (typeof JOB_TYPES)[number]["id"];

export const STATUSES = [
  { id: "pass", label: "Pass" },
  { id: "fault", label: "Fault" },
  { id: "recommendation", label: "Recommendation" },
  { id: "not-tested", label: "Not Tested" },
] as const;
export type ItemStatus = (typeof STATUSES)[number]["id"];

export const PRIORITIES = ["", "High", "Medium", "Low"] as const;
export type Priority = (typeof PRIORITIES)[number];

/** Generous limits: long notes are fine, but a runaway paste can't fill storage or exceed Excel's cell limit. */
const text = (max = 5000) => z.string().max(max).default("");

/** One applied change to the site's master equipment record, made from this job (factual record, not exported). */
export const appliedChangeSchema = z.object({
  field: z.string().max(40),
  label: text(100),
  from: text(2000),
  to: text(2000),
  at: z.string().max(40),
});
export type AppliedChange = z.infer<typeof appliedChangeSchema>;

/**
 * Link from a report item to a Technical Docs equipment entry. The register
 * stays the source of truth; `snapshot` keeps the identifying details as they
 * were when the item was added, so this report stays accurate if the master
 * record changes later. Network settings are deliberately not copied.
 */
export const itemSourceSchema = z.object({
  registerId: z.string().min(1).max(64),
  equipmentId: z.string().min(1).max(64),
  snapshot: z
    .object({
      name: text(200),
      category: text(100),
      type: text(200),
      location: text(200),
      assetId: text(100),
      make: text(200),
      model: text(200),
      serial: text(100),
      firmware: text(100),
      capturedAt: z.string().max(40).default(""),
    })
    .default({ name: "", category: "", type: "", location: "", assetId: "", make: "", model: "", serial: "", firmware: "", capturedAt: "" }),
  /** Only ever set by the technician; used for the equipment's service history. */
  outcome: z.enum(["", "repaired", "replaced"]).default(""),
  applied: z.array(appliedChangeSchema).max(200).default([]),
});
export type ItemSource = z.infer<typeof itemSourceSchema>;

export const itemSchema = z.object({
  id: z.string().min(1).max(64),
  name: text(200),
  type: text(100),
  location: text(200),
  makeModel: text(200),
  status: z.enum(["pass", "fault", "recommendation", "not-tested"]).default("not-tested"),
  findings: text(),
  work: text(),
  recommendations: text(),
  notes: text(),
  /** Only ever set by the technician; never inferred. */
  priority: z.enum(PRIORITIES).default(""),
  /** Set when the item was picked from a site register; manual items have none. */
  source: itemSourceSchema.nullable().default(null),
});
export type ReportItem = z.infer<typeof itemSchema>;

export const summarySchema = z.object({
  workCompleted: text(10000),
  faults: text(10000),
  outstanding: text(10000),
  recommendations: text(10000),
  parts: text(10000),
  notes: text(10000),
});
export type ReportSummary = z.infer<typeof summarySchema>;

export const REPORT_VERSION = 1;

export const reportSchema = z.object({
  id: z.string().min(1).max(64),
  version: z.literal(REPORT_VERSION),
  createdAt: z.string(),
  updatedAt: z.string(),
  jobType: z.enum(["cctv", "intruder", "access", "general"]),
  siteName: text(200),
  siteAddress: text(500),
  customer: text(200),
  technician: text(200),
  reference: text(100),
  /** YYYY-MM-DD, or empty. */
  date: z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]).default(""),
  description: text(),
  /** Linked Technical Docs register ("" = standalone report). Optional, so older drafts load unchanged. */
  registerId: z.string().max(64).default(""),
  equipment: z.array(itemSchema).max(500).default([]),
  summary: summarySchema.default({ workCompleted: "", faults: "", outstanding: "", recommendations: "", parts: "", notes: "" }),
});
export type Report = z.infer<typeof reportSchema>;

export const technicianSchema = z.object({
  name: text(200),
  company: text(200),
});
export type TechnicianProfile = z.infer<typeof technicianSchema>;
