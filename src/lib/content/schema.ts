/**
 * Content schema for Fieldwise technical reference data.
 *
 * Technical content (manufacturers, devices, sources) lives in /content as
 * plain JSON and is validated against these schemas. Application code only
 * ever consumes content through the repository in ./repository.ts, so the
 * storage backend can later move to Supabase without touching the UI.
 *
 * Core rule: anything marked "verified" must cite at least one source
 * document and record who verified it and when. The schema enforces this.
 */
import { z } from "zod";

const slug = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "must be a lowercase kebab-case slug");

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be YYYY-MM-DD");

/**
 * - verified:   checked against a cited manufacturer document by a reviewer
 * - unverified: real product, but content not yet checked against a source
 * - example:    fictional demonstration data; never use on site
 */
export const verificationStatusSchema = z.enum(["verified", "unverified", "example"]);
export type VerificationStatus = z.infer<typeof verificationStatusSchema>;

export const verificationSchema = z
  .object({
    status: verificationStatusSchema,
    verifiedBy: z.string().min(1).optional(),
    verifiedAt: isoDate.optional(),
    notes: z.string().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.status === "verified" && (!v.verifiedBy || !v.verifiedAt)) {
      ctx.addIssue({
        code: "custom",
        message: "verified content must record verifiedBy and verifiedAt",
      });
    }
  });
export type Verification = z.infer<typeof verificationSchema>;

export const sourceDocumentTypeSchema = z.enum([
  "installation-manual",
  "datasheet",
  "programming-manual",
  "wiring-guide",
  "technical-bulletin",
  "standard",
  "other",
]);

export const sourceSchema = z.object({
  id: slug,
  title: z.string().min(1),
  publisher: z.string().min(1),
  documentType: sourceDocumentTypeSchema,
  /** Document part number or revision as printed on the document, e.g. "Rev C". */
  documentRevision: z.string().optional(),
  publishedDate: isoDate.optional(),
  url: z.url().optional(),
  accessedDate: isoDate.optional(),
  isDemo: z.boolean().default(false),
});
export type Source = z.infer<typeof sourceSchema>;

/** A pointer from a specific fact to the source(s) that back it. */
export const sourceRefSchema = z.object({
  sourceId: slug,
  /** Page, section or table reference within the source document. */
  locator: z.string().optional(),
});
export type SourceRef = z.infer<typeof sourceRefSchema>;

export const manufacturerSchema = z.object({
  id: slug,
  name: z.string().min(1),
  country: z.string().length(2).optional(),
  website: z.url().optional(),
  isDemo: z.boolean().default(false),
});
export type Manufacturer = z.infer<typeof manufacturerSchema>;

export const deviceCategorySchema = z.enum([
  "alarm-panel",
  "keypad",
  "motion-detector",
  "reed-switch",
  "glass-break-detector",
  "siren",
  "power-supply",
  "access-controller",
  "other",
]);
export type DeviceCategory = z.infer<typeof deviceCategorySchema>;

export const terminalSchema = z.object({
  label: z.string().min(1),
  function: z.string().min(1),
  notes: z.string().optional(),
  sourceRefs: z.array(sourceRefSchema).default([]),
});
export type Terminal = z.infer<typeof terminalSchema>;

export const voltageRangeSchema = z
  .object({
    min: z.number().nonnegative(),
    max: z.number().positive(),
    nominal: z.number().positive().optional(),
    type: z.enum(["DC", "AC"]),
  })
  .refine((r) => r.min <= r.max, "min must be <= max");

export const powerSchema = z.object({
  supplyVoltage: voltageRangeSchema.optional(),
  /** Current draw in milliamps. */
  currentDrawMa: z
    .object({ standby: z.number().nonnegative().optional(), alarm: z.number().nonnegative().optional() })
    .optional(),
  notes: z.string().optional(),
  sourceRefs: z.array(sourceRefSchema).default([]),
});

export const modelRevisionSchema = z.object({
  revision: z.string().min(1),
  /** Firmware or hardware revision the content applies to. */
  appliesTo: z.string().optional(),
  notes: z.string().optional(),
});

export const deviceSchema = z
  .object({
    id: slug,
    manufacturerId: slug,
    model: z.string().min(1),
    name: z.string().min(1),
    category: deviceCategorySchema,
    summary: z.string().min(1),
    aliases: z.array(z.string()).default([]),
    modelRevisions: z.array(modelRevisionSchema).min(1),
    terminals: z.array(terminalSchema).default([]),
    power: powerSchema.optional(),
    documentation: z.array(sourceRefSchema).default([]),
    relatedEolConfigIds: z.array(slug).default([]),
    relatedFaultGuideIds: z.array(slug).default([]),
    verification: verificationSchema,
    updatedAt: isoDate,
  })
  .superRefine((d, ctx) => {
    if (d.verification.status === "verified" && d.documentation.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["documentation"],
        message: "verified devices must cite at least one source document",
      });
    }
  });
export type Device = z.infer<typeof deviceSchema>;

export const CATEGORY_LABELS: Record<DeviceCategory, string> = {
  "alarm-panel": "Alarm panel",
  keypad: "Keypad",
  "motion-detector": "Motion detector",
  "reed-switch": "Reed switch",
  "glass-break-detector": "Glass-break detector",
  siren: "Siren / strobe",
  "power-supply": "Power supply",
  "access-controller": "Access controller",
  other: "Other",
};
