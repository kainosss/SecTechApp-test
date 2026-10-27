/**
 * Guided Fault Finder: data model for deterministic diagnostic workflows.
 * Workflows are authored as JSON in /content/diagnostics and validated here.
 * They are generic service guidance unless their verification metadata says
 * otherwise — and that metadata is checked, so a claim of manufacturer
 * documentation needs an identifiable source and a technician review needs a
 * named reviewer and date.
 */
import { z } from "zod";
import { ZONE_BANDS } from "./eol";

const id = z.string().regex(/^[a-z0-9][a-z0-9-]*$/);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "use YYYY-MM-DD");

/** Context variables answers can set (e.g. a lock's rated voltage, or EOL resistor values r1 / r2). */
const contextSet = z.record(z.string(), z.number().positive()).optional();
/** Evidence an answer adds towards possible causes (cause id → weight). */
const evidence = z.record(id, z.number()).optional();

/** A step that needs confirmation by an experienced technician or manufacturer documentation. */
const reviewFlag = z.object({
  status: z.literal("requires-verification"),
  note: z.string().min(1),
});

const answerSchema = z.object({
  id,
  label: z.string().min(1),
  next: id,
  /** Recorded in the "findings so far" list. */
  finding: z.string().min(1),
  set: contextSet,
  evidence,
});

const rangeSchema = z
  .object({
    id,
    label: z.string().min(1),
    /** Absolute or context-scaled bounds: inclusive min, exclusive max; omitted = unbounded. */
    min: z.number().min(0).optional(),
    max: z.number().positive().optional(),
    /** For zone-loop measurements: the calculated zone bands this range covers. */
    bands: z.array(z.enum(ZONE_BANDS)).min(1).optional(),
    next: id,
    /** Placeholders: {value} measured, {sealed} and {alarm} expected readings. */
    finding: z.string().min(1),
    evidence,
  })
  .refine((r) => r.min === undefined || r.max === undefined || r.min < r.max, "min must be below max")
  .refine((r) => !(r.bands && (r.min !== undefined || r.max !== undefined)), "use bands or min/max, not both");

const testSchema = z.object({
  /** How to take the reading, including isolation requirements. */
  procedure: z.string().min(1),
  /** What a healthy circuit should show. */
  expected: z.string().min(1),
});

const questionSchema = z.object({
  kind: z.literal("question"),
  id,
  /** "yes-no" renders two large buttons; "choice" renders a list. */
  style: z.enum(["yes-no", "choice"]),
  text: z.string().min(1),
  help: z.string().optional(),
  test: testSchema.optional(),
  answers: z.array(answerSchema).min(2),
  review: reviewFlag.optional(),
});

const measureSchema = z.object({
  kind: z.literal("measure"),
  id,
  text: z.string().min(1),
  unit: z.enum(["ohm", "volt"]),
  /**
   * "zone": classify against bands calculated from the configured EOL resistors (r1 / r2) — needs an
   * eol-config node earlier on the path. Otherwise ranges are absolute, or scaled by `relativeTo`.
   */
  scale: z.enum(["absolute", "zone"]).default("absolute"),
  relativeTo: z.string().optional(),
  test: testSchema,
  /** Safety precaution shown with the measurement. */
  safety: z.string().min(1),
  ranges: z.array(rangeSchema).min(2),
  /** For technicians who can't take the reading. */
  skip: answerSchema.optional(),
  review: reviewFlag.optional(),
});

/** Asks for the zone's EOL resistors (presets or custom values) for the generic dual EOL topology. */
const eolConfigSchema = z.object({
  kind: z.literal("eol-config"),
  id,
  text: z.string().min(1),
  help: z.string().optional(),
  next: id,
  presets: z
    .array(z.object({ id, label: z.string().min(1), r1: z.number().positive(), r2: z.number().positive() }))
    .min(1),
  /** Lets the technician enter R1 / R2 values. */
  allowCustom: z.boolean().default(true),
  /** For other topologies or unknown values. */
  unsupported: answerSchema,
});

const resultSchema = z.object({
  kind: z.literal("result"),
  id,
  title: z.string().min(1),
  summary: z.string().min(1),
  /**
   * How far the path's evidence goes: "likely" — the measurements point here; "possible" — consistent
   * with the answers but not isolated by measurement; "verify" — not enough evidence yet.
   */
  confidence: z.enum(["likely", "possible", "verify"]),
  /** Candidate causes, most likely first before evidence from the answers is applied. */
  causes: z.array(id).min(1),
  verify: z.array(z.string().min(1)).min(1),
  actions: z.array(z.string().min(1)).min(1),
  escalate: z.array(z.string().min(1)).default([]),
  notes: z.array(z.string().min(1)).default([]),
  /** Points to another workflow when the evidence says the fault is different. */
  seeAlso: z.string().optional(),
  review: reviewFlag.optional(),
});

export const nodeSchema = z.discriminatedUnion("kind", [questionSchema, measureSchema, eolConfigSchema, resultSchema]);

const causeSchema = z.object({
  title: z.string().min(1),
  detail: z.string().min(1),
});

export const SOURCE_TYPES = ["manufacturer-manual", "installation-guide", "datasheet", "standard", "training", "other"] as const;

export const sourceSchema = z
  .object({
    title: z.string().min(1),
    /** Manufacturer or organisation that published it. */
    organisation: z.string().min(1),
    type: z.enum(SOURCE_TYPES),
    /** Document version or revision, if stated. */
    version: z.string().optional(),
    date: isoDate.optional(),
    url: z.url().optional(),
    /** Relevant section or page. */
    section: z.string().optional(),
  })
  .refine((s) => s.version || s.date, "record the document's version or date");

export const VERIFICATION_STATUSES = ["generic", "manufacturer-referenced", "technician-reviewed", "requires-verification"] as const;
export const VERIFICATION_LABELS: Record<(typeof VERIFICATION_STATUSES)[number], string> = {
  generic: "Generic guidance — not manufacturer verified",
  "manufacturer-referenced": "Manufacturer documentation referenced",
  "technician-reviewed": "Technician reviewed",
  "requires-verification": "Requires verification",
};

export const verificationSchema = z
  .object({
    status: z.enum(VERIFICATION_STATUSES),
    lastReviewed: isoDate.optional(),
    /** Who reviewed it (name and role). Never filled in for an automated or AI review. */
    reviewer: z.string().min(1).optional(),
    reviewerNotes: z.string().optional(),
    /** What still needs confirming. */
    pending: z.array(z.string().min(1)).default([]),
  })
  .refine((v) => v.status !== "technician-reviewed" || (v.reviewer && v.lastReviewed), "a technician review needs a reviewer and date");

export const workflowSchema = z
  .object({
    id,
    /** Bump when the tree changes so stale saved sessions are discarded. */
    version: z.number().int().positive(),
    title: z.string().min(1),
    summary: z.string().min(1),
    area: z.enum(["intrusion", "access"]),
    icon: z.enum(["eol", "fault", "alert", "shield", "lock", "pir"]),
    symptoms: z.array(z.string().min(1)).min(1),
    safety: z.array(z.string().min(1)).min(1),
    start: id,
    nodes: z.array(nodeSchema).min(2),
    causes: z.record(id, causeSchema),
    escalation: z.array(z.string().min(1)).min(1),
    notes: z.array(z.string().min(1)).default([]),
    related: z.array(z.object({ href: z.string().startsWith("/"), label: z.string().min(1) })).default([]),
    verification: verificationSchema,
    sources: z.array(sourceSchema).default([]),
  })
  .refine((w) => w.verification.status !== "manufacturer-referenced" || w.sources.length > 0, "manufacturer-referenced guides need at least one source");

export type Workflow = z.infer<typeof workflowSchema>;
export type WorkflowNode = z.infer<typeof nodeSchema>;
export type QuestionNode = z.infer<typeof questionSchema>;
export type MeasureNode = z.infer<typeof measureSchema>;
export type EolConfigNode = z.infer<typeof eolConfigSchema>;
export type ResultNode = z.infer<typeof resultSchema>;
export type Answer = z.infer<typeof answerSchema>;
export type Range = z.infer<typeof rangeSchema>;
export type Source = z.infer<typeof sourceSchema>;
export type Verification = z.infer<typeof verificationSchema>;
