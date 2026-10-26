/**
 * Content schema for Fieldwise technical reference data.
 *
 * Technical content lives in /content as JSON and is validated against these
 * schemas. Application code reads it only through ./repository.ts, so the
 * backing store can move to Supabase without UI changes.
 *
 * Every technical claim (terminal, power rating, specification, note,
 * variant) carries its own evidence: source references, the device
 * variants/revisions it applies to, a declared status and an optional review.
 * The declared status is only a request — the effective status shown to users
 * is computed by ./verification.ts, which fails safe to "needs-verification".
 */
import { z } from "zod";
import { circuitSchema, circuitStateSchema, interpretationSchema } from "@/lib/eol/model";

export const slug = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "must be a lowercase kebab-case slug");

export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be YYYY-MM-DD");

/**
 * - verified:           checked by a named reviewer against a cited, non-demo
 *                       manufacturer document for stated device revisions
 * - needs-verification: real product, but the claim is not (yet) verified
 * - demonstration:      fictional data for development; never use on site
 */
export const verificationStatusSchema = z.enum(["verified", "needs-verification", "demonstration"]);
export type VerificationStatus = z.infer<typeof verificationStatusSchema>;

export const STATUS_LABELS: Record<VerificationStatus, string> = {
  verified: "Verified",
  "needs-verification": "Needs verification",
  demonstration: "Demonstration only",
};

export const reviewSchema = z.object({
  reviewedBy: z.string().min(1),
  reviewedAt: isoDate,
});
export type Review = z.infer<typeof reviewSchema>;

/* ------------------------------------------------------------------ sources */

export const sourceDocumentTypeSchema = z.enum([
  "product-page",
  "datasheet",
  "installation-manual",
  "programming-manual",
  "wiring-guide",
  "technical-bulletin",
  "standard",
  "other",
]);
export type SourceDocumentType = z.infer<typeof sourceDocumentTypeSchema>;

export const sourceSchema = z
  .object({
    id: slug,
    manufacturerId: slug.optional(),
    title: z.string().min(1),
    publisher: z.string().min(1),
    documentType: sourceDocumentTypeSchema,
    /** Document or part number printed on the document. */
    documentNumber: z.string().optional(),
    /** Revision as printed on the document, e.g. "Rev C" or "Version 4.2". */
    documentRevision: z.string().optional(),
    publishedDate: isoDate.optional(),
    url: z.url().optional(),
    /** Date the URL was last opened and confirmed to be this document. */
    accessedDate: isoDate.optional(),
    notes: z.string().optional(),
    isDemo: z.boolean().default(false),
  })
  .superRefine((s, ctx) => {
    if (s.url && !s.accessedDate) {
      ctx.addIssue({ code: "custom", path: ["accessedDate"], message: "a URL must record the date it was confirmed (accessedDate)" });
    }
  });
export type Source = z.infer<typeof sourceSchema>;

/** A pointer from a claim to the place in a source that supports it. */
export const sourceRefSchema = z.object({
  sourceId: slug,
  /** Page, section or table within the source document. */
  locator: z.string().optional(),
});
export type SourceRef = z.infer<typeof sourceRefSchema>;

/** Evidence attached to every technical claim. */
export const evidenceShape = {
  /** Declared status. Omitted = inherit the record's declared status. */
  status: verificationStatusSchema.optional(),
  sourceRefs: z.array(sourceRefSchema).default([]),
  /** Variant ids this claim applies to. Empty = all variants. */
  appliesToVariantIds: z.array(slug).default([]),
  /** Hardware / firmware revisions this claim was checked against. */
  appliesToRevisions: z.array(z.string().min(1)).default([]),
  review: reviewSchema.optional(),
};
export const evidenceSchema = z.object(evidenceShape);
export type Evidence = z.infer<typeof evidenceSchema>;

/** Record-level verification declaration. */
export const verificationSchema = z.object({
  status: verificationStatusSchema,
  review: reviewSchema.optional(),
  notes: z.string().optional(),
});
export type Verification = z.infer<typeof verificationSchema>;

/* ------------------------------------------------------------ manufacturers */

export const manufacturerSchema = z.object({
  id: slug,
  name: z.string().min(1),
  /** ISO 3166-1 alpha-2 country of the brand's head office, when confirmed. */
  country: z.string().length(2).optional(),
  website: z.url().optional(),
  /** Parent company or current brand owner, when confirmed. */
  parentCompany: z.string().optional(),
  sourceRefs: z.array(sourceRefSchema).default([]),
  isDemo: z.boolean().default(false),
});
export type Manufacturer = z.infer<typeof manufacturerSchema>;

/* --------------------------------------------------------------- categories */

export const deviceCategorySchema = z.enum([
  "alarm-panel",
  "alarm-expander",
  "keypad",
  "motion-detector",
  "photoelectric-beam",
  "reed-switch",
  "glass-break-detector",
  "siren",
  "power-supply",
  "access-controller",
  "card-reader",
  "electric-strike",
  "magnetic-lock",
  "ip-camera",
  "network-video-recorder",
  "network-switch",
  "intercom",
  "other",
]);
export type DeviceCategory = z.infer<typeof deviceCategorySchema>;

export const CATEGORY_LABELS: Record<DeviceCategory, string> = {
  "alarm-panel": "Alarm panel",
  "alarm-expander": "Expander",
  keypad: "Keypad",
  "motion-detector": "PIR / motion detector",
  "photoelectric-beam": "Photoelectric beam",
  "reed-switch": "Reed switch / contact",
  "glass-break-detector": "Glass-break detector",
  siren: "Siren / strobe",
  "power-supply": "Power supply",
  "access-controller": "Access controller",
  "card-reader": "Card reader",
  "electric-strike": "Electric strike",
  "magnetic-lock": "Magnetic lock",
  "ip-camera": "IP camera",
  "network-video-recorder": "NVR",
  "network-switch": "Network switch",
  intercom: "Intercom",
  other: "Other",
};

/** Top-level equipment families used for filtering. */
export const CATEGORY_GROUPS = [
  { id: "panels", label: "Alarm panels & expanders", categories: ["alarm-panel", "alarm-expander", "keypad"] },
  { id: "detectors", label: "PIR & beam detectors", categories: ["motion-detector", "photoelectric-beam", "glass-break-detector"] },
  { id: "contacts", label: "Reed switches & contacts", categories: ["reed-switch"] },
  { id: "access", label: "Access controllers", categories: ["access-controller"] },
  { id: "readers", label: "Card readers", categories: ["card-reader"] },
  { id: "locks", label: "Strikes & maglocks", categories: ["electric-strike", "magnetic-lock"] },
  { id: "cctv", label: "CCTV", categories: ["ip-camera", "network-video-recorder"] },
  { id: "network", label: "Network equipment", categories: ["network-switch"] },
  { id: "intercoms", label: "Intercoms", categories: ["intercom"] },
  { id: "other", label: "Other", categories: ["siren", "power-supply", "other"] },
] as const satisfies readonly { id: string; label: string; categories: readonly DeviceCategory[] }[];

export type CategoryGroupId = (typeof CATEGORY_GROUPS)[number]["id"];
export const categoryGroupIds = CATEGORY_GROUPS.map((g) => g.id) as [CategoryGroupId, ...CategoryGroupId[]];

export function groupForCategory(category: DeviceCategory): CategoryGroupId {
  return CATEGORY_GROUPS.find((g) => (g.categories as readonly DeviceCategory[]).includes(category))?.id ?? "other";
}

/* ------------------------------------------------------------------ devices */

export const hardwareRevisionSchema = z.object({
  revision: z.string().min(1),
  firmware: z.string().optional(),
  notes: z.string().optional(),
});

export const variantSchema = z.object({
  id: slug,
  name: z.string().min(1),
  partNumber: z.string().optional(),
  description: z.string().optional(),
  hardwareRevisions: z.array(hardwareRevisionSchema).default([]),
  ...evidenceShape,
});
export type Variant = z.infer<typeof variantSchema>;

export const terminalSchema = z.object({
  label: z.string().min(1),
  function: z.string().min(1),
  notes: z.string().optional(),
  ...evidenceShape,
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
  /** e.g. "PoE IEEE 802.3af Class 3". */
  powerOverEthernet: z.string().optional(),
  notes: z.string().optional(),
  ...evidenceShape,
});
export type Power = z.infer<typeof powerSchema>;

export const specificationGroupSchema = z.enum(["electrical", "communications", "physical", "environmental", "other"]);

/** Generic specification row: new kinds of spec are data, not UI code. */
export const specificationSchema = z.object({
  group: specificationGroupSchema.default("electrical"),
  label: z.string().min(1),
  value: z.string().min(1),
  ...evidenceShape,
});
export type Specification = z.infer<typeof specificationSchema>;

export const deviceNoteSchema = z.object({
  kind: z.enum(["installation", "commissioning"]).default("installation"),
  text: z.string().min(1),
  severity: z.enum(["info", "caution"]).default("info"),
  ...evidenceShape,
});
export type DeviceNote = z.infer<typeof deviceNoteSchema>;

/**
 * Manufacturer lifecycle. Only recorded when a manufacturer document states
 * it (e.g. a discontinuation statement); absent means "not recorded", not "current".
 */
export const lifecycleSchema = z.object({
  state: z.enum(["current", "discontinued"]),
  discontinuedOn: isoDate.optional(),
  /** Replacement products as the manufacturer names them. */
  replacedBy: z.array(z.string().min(1)).default([]),
  /** Last date of hardware / software support stated by the manufacturer. */
  supportUntil: isoDate.optional(),
  notes: z.string().optional(),
  ...evidenceShape,
});
export type Lifecycle = z.infer<typeof lifecycleSchema>;

export const deviceSchema = z.object({
  id: slug,
  manufacturerId: slug,
  /** Model name as the manufacturer prints it. */
  model: z.string().min(1),
  name: z.string().min(1),
  category: deviceCategorySchema,
  description: z.string().optional(),
  aliases: z.array(z.string()).default([]),
  variants: z.array(variantSchema).default([]),
  lifecycle: lifecycleSchema.optional(),
  terminals: z.array(terminalSchema).default([]),
  power: powerSchema.optional(),
  specifications: z.array(specificationSchema).default([]),
  notes: z.array(deviceNoteSchema).default([]),
  /** Manufacturer documents for this device (manuals, datasheets, product pages). */
  documentation: z.array(sourceRefSchema).default([]),
  // Relationships to wiring configurations and troubleshooting workflows are
  // declared on those records and resolved in the repository, so each link
  // is maintained in exactly one place.
  verification: verificationSchema,
  updatedAt: isoDate,
});
export type Device = z.infer<typeof deviceSchema>;

/* ---------------------------------------------------- wiring configurations */

export const wiringInputTypeSchema = z.enum(["no-eol", "single-eol", "double-eol", "triple-eol", "other"]);

export const WIRING_INPUT_LABELS: Record<z.infer<typeof wiringInputTypeSchema>, string> = {
  "no-eol": "No EOL (closed loop)",
  "single-eol": "Single EOL",
  "double-eol": "Dual EOL",
  "triple-eol": "Triple EOL",
  other: "Other",
};

export const wiringConfigurationSchema = z.object({
  id: slug,
  title: z.string().min(1),
  summary: z.string().min(1),
  /** The panel (or expander) this applies to. Omitted for generic demonstration inputs. */
  panelDeviceId: slug.optional(),
  /** Panel hardware and firmware revisions the configuration was documented for. */
  panelHardwareRevisions: z.array(z.string().min(1)).default([]),
  panelFirmwareRevisions: z.array(z.string().min(1)).default([]),
  inputType: wiringInputTypeSchema,
  /** Groups configurations in the assistant's "contact arrangement" step. */
  arrangement: z.object({ key: slug, label: z.string().min(1) }),
  /** Short name for the resistor choice, e.g. "4k7 EOL / 2k2 alarm". */
  configurationLabel: z.string().min(1).optional(),
  /** Generic circuits: name and order in the explorer's arrangement picker (DEOL first). */
  shortLabel: z.string().min(1).optional(),
  explorerOrder: z.number().int().optional(),
  /** Kept for engine support, permanent links and future use, but not offered in the explorer's selector. */
  explorerHidden: z.boolean().default(false),
  circuit: circuitSchema,
  states: z.array(circuitStateSchema).min(1),
  /** How the panel distinguishes the states, as documented. */
  interpretation: interpretationSchema.optional(),
  /** Detectors/contacts this configuration applies to (the panel is linked via panelDeviceId). */
  appliesToDeviceIds: z.array(slug).default([]),
  /** Specific device variants, when the documentation limits it to them. */
  appliesToVariants: z.array(z.object({ deviceId: slug, variantId: slug })).default([]),
  notes: z.string().optional(),
  isDemo: z.boolean().default(false),
  verification: verificationSchema,
  sourceRefs: z.array(sourceRefSchema).default([]),
  appliesToRevisions: z.array(z.string().min(1)).default([]),
  updatedAt: isoDate,
});
export type WiringConfiguration = z.infer<typeof wiringConfigurationSchema>;

/* -------------------------------------------------- troubleshooting workflows */

export const faultAreaSchema = z.enum(["cctv", "access-control", "intrusion", "communications"]);
export const FAULT_AREA_LABELS: Record<z.infer<typeof faultAreaSchema>, string> = {
  cctv: "CCTV",
  "access-control": "Access control",
  intrusion: "Intrusion alarm",
  communications: "Communications",
};

export const troubleshootingWorkflowSchema = z.object({
  id: slug,
  title: z.string().min(1),
  faultArea: faultAreaSchema,
  summary: z.string().min(1),
  symptoms: z.array(z.string().min(1)).min(1),
  /** High-level outline of checks. The interactive decision tree comes later. */
  outline: z.array(z.object({ title: z.string().min(1), detail: z.string().optional() })).default([]),
  /** Generic workflows apply to whole categories... */
  appliesToCategories: z.array(deviceCategorySchema).default([]),
  /** ...device-specific ones list devices. */
  appliesToDeviceIds: z.array(slug).default([]),
  isDemo: z.boolean().default(false),
  verification: verificationSchema,
  sourceRefs: z.array(sourceRefSchema).default([]),
  appliesToRevisions: z.array(z.string().min(1)).default([]),
  updatedAt: isoDate,
});
export type TroubleshootingWorkflow = z.infer<typeof troubleshootingWorkflowSchema>;

/* ------------------------------------------------------------- EOL presets */

/**
 * Named resistance targets for the EOL circuit explorer. These are example
 * values, not manufacturer specifications: they never mark a circuit as
 * manufacturer confirmed, and are not tied to any Device Library panel.
 */
export const eolPresetSchema = z.object({
  id: slug,
  label: z.string().min(1),
  /** Short chip label, e.g. "Integriti example". */
  shortLabel: z.string().min(1),
  kind: z.enum(["generic-example", "manufacturer-example"]),
  manufacturerId: slug.optional(),
  targets: z.object({
    normal: z.number().positive(),
    alarm: z.number().positive().optional(),
    tamper: z.number().positive().optional(),
  }),
  /** Shown with the preset, e.g. where the values came from and what to check. */
  note: z.string().min(1),
  isDefault: z.boolean().default(false),
  order: z.number().int().default(0),
});
export type EolPreset = z.infer<typeof eolPresetSchema>;
