/**
 * Guided Fault Finder: data model for deterministic diagnostic workflows.
 * Workflows are authored as JSON in /content/diagnostics and validated here.
 * They are generic service guidance, not manufacturer instructions.
 */
import { z } from "zod";

const id = z.string().regex(/^[a-z0-9][a-z0-9-]*$/);

/** Context variables answers can set (e.g. the EOL seal value or a lock's rated voltage). */
const contextSet = z.record(z.string(), z.number().positive()).optional();
/** Evidence an answer adds towards possible causes (cause id → weight). */
const evidence = z.record(id, z.number()).optional();

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
    /** Inclusive lower bound, exclusive upper bound. Omitted = unbounded. Infinity (OL) only matches when max is omitted. */
    min: z.number().min(0).optional(),
    max: z.number().positive().optional(),
    next: id,
    /** `{value}` is replaced by the formatted measurement. */
    finding: z.string().min(1),
    evidence,
  })
  .refine((r) => r.min === undefined || r.max === undefined || r.min < r.max, "min must be below max");

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
});

const measureSchema = z.object({
  kind: z.literal("measure"),
  id,
  text: z.string().min(1),
  unit: z.enum(["ohm", "volt"]),
  /** Ranges are multiplied by this context variable (e.g. "seal", "rated"); absolute when omitted. */
  relativeTo: z.string().optional(),
  test: testSchema,
  /** Safety precaution shown with the measurement. */
  safety: z.string().min(1),
  ranges: z.array(rangeSchema).min(2),
  /** For technicians who can't take the reading. */
  skip: answerSchema.optional(),
});

const resultSchema = z.object({
  kind: z.literal("result"),
  id,
  title: z.string().min(1),
  summary: z.string().min(1),
  /** Candidate causes, most likely first before evidence from the answers is applied. */
  causes: z.array(id).min(1),
  verify: z.array(z.string().min(1)).min(1),
  actions: z.array(z.string().min(1)).min(1),
  escalate: z.array(z.string().min(1)).default([]),
  notes: z.array(z.string().min(1)).default([]),
  /** Points to another workflow when the evidence says the fault is different. */
  seeAlso: z.string().optional(),
});

export const nodeSchema = z.discriminatedUnion("kind", [questionSchema, measureSchema, resultSchema]);

const causeSchema = z.object({
  title: z.string().min(1),
  detail: z.string().min(1),
});

export const workflowSchema = z.object({
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
});

export type Workflow = z.infer<typeof workflowSchema>;
export type WorkflowNode = z.infer<typeof nodeSchema>;
export type QuestionNode = z.infer<typeof questionSchema>;
export type MeasureNode = z.infer<typeof measureSchema>;
export type ResultNode = z.infer<typeof resultSchema>;
export type Answer = z.infer<typeof answerSchema>;
export type Range = z.infer<typeof rangeSchema>;
