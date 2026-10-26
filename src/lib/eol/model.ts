/**
 * EOL circuit data model.
 *
 * A wiring configuration describes the field loop between two panel input
 * terminals as a tree of series and parallel groups containing resistors and
 * contacts. It is pure data: independent of the UI, of any one manufacturer,
 * and of the calculation engine (./engine.ts) that interprets it.
 *
 * Nothing here is inferred. Contact positions are given explicitly for every
 * circuit state, and manufacturer-documented readings/thresholds are stored
 * separately from calculated values so the two can be cross-checked.
 */
import { z } from "zod";

/** Component ids are short and human readable, e.g. "R1", "ALM", "TMP". */
export const componentId = z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,15}$/, "must be a short id like R1 or ALM");

const sourceRefsShape = {
  sourceId: z.string(),
  locator: z.string().optional(),
};
export const circuitSourceRefs = z.array(z.object(sourceRefsShape)).default([]);

export const resistorRoleSchema = z.enum(["end-of-line", "alarm", "tamper", "other"]);
export type ResistorRole = z.infer<typeof resistorRoleSchema>;

export const RESISTOR_ROLE_LABELS: Record<ResistorRole, string> = {
  "end-of-line": "End-of-line (seal) resistor",
  alarm: "Alarm resistor",
  tamper: "Tamper resistor",
  other: "Resistor",
};

export const contactFunctionSchema = z.enum(["alarm", "tamper", "other"]);
export type ContactFunction = z.infer<typeof contactFunctionSchema>;

export type CircuitNode = ResistorNode | ContactNode | SeriesNode | ParallelNode;

/**
 * Where a component physically sits, e.g. a detector's alarm relay terminals.
 * Optional and only filled from documentation; lets schematics link to the
 * physical device terminals (planned Circuit Lab) without changing circuits.
 */
export interface PhysicalLocation {
  /** Device Library id of the device the component is fitted in/at, if known. */
  deviceId?: string;
  /** Terminal labels as printed on that device, e.g. ["ALM", "ALM"]. */
  terminals?: string[];
  /** e.g. "Inside detector", "At panel". */
  description?: string;
}

const physicalLocation = z
  .object({ deviceId: z.string().optional(), terminals: z.array(z.string().min(1)).optional(), description: z.string().optional() })
  .optional();

export interface ResistorNode {
  kind: "resistor";
  id: string;
  /** Ohms. Null means "not documented" — the configuration is then incomplete. */
  ohms: number | null;
  role: ResistorRole;
  /** What this resistor does in this circuit, as documented. */
  purpose?: string;
  location?: PhysicalLocation;
  sourceRefs: { sourceId: string; locator?: string }[];
}

export interface ContactNode {
  kind: "contact";
  id: string;
  function: ContactFunction;
  /** Contact type: NC is closed when the device is in its normal (secure) condition. */
  type: "NC" | "NO";
  label?: string;
  location?: PhysicalLocation;
  sourceRefs: { sourceId: string; locator?: string }[];
}

export interface SeriesNode {
  kind: "series";
  children: CircuitNode[];
}

export interface ParallelNode {
  kind: "parallel";
  children: CircuitNode[];
}

const resistorNode = z.object({
  kind: z.literal("resistor"),
  id: componentId,
  ohms: z.number().positive().nullable(),
  role: resistorRoleSchema,
  purpose: z.string().optional(),
  location: physicalLocation,
  sourceRefs: circuitSourceRefs,
});

const contactNode = z.object({
  kind: z.literal("contact"),
  id: componentId,
  function: contactFunctionSchema,
  type: z.enum(["NC", "NO"]),
  label: z.string().optional(),
  location: physicalLocation,
  sourceRefs: circuitSourceRefs,
});

export const circuitNodeSchema: z.ZodType<CircuitNode, unknown> = z.lazy(() =>
  z.discriminatedUnion("kind", [
    resistorNode,
    contactNode,
    z.object({ kind: z.literal("series"), children: z.array(circuitNodeSchema) }),
    z.object({ kind: z.literal("parallel"), children: z.array(circuitNodeSchema) }),
  ]),
) as z.ZodType<CircuitNode, unknown>;

export const terminalRefSchema = z.object({
  /** Terminal label as printed on the panel, e.g. "Z1" or "COM". */
  label: z.string().min(1),
  description: z.string().optional(),
  sourceRefs: circuitSourceRefs,
});

export const circuitStateKindSchema = z.enum(["normal", "alarm", "tamper", "cable-open", "cable-short", "other"]);
export type CircuitStateKind = z.infer<typeof circuitStateKindSchema>;

export const STATE_KIND_LABELS: Record<CircuitStateKind, string> = {
  normal: "Normal",
  alarm: "Alarm",
  tamper: "Tamper",
  "cable-open": "Cable open",
  "cable-short": "Cable short",
  other: "Other",
};

/** What the manufacturer documents for a state. Only filled from source documents. */
export const documentedReadingSchema = z
  .object({
    nominalOhms: z.number().nonnegative().optional(),
    /** Panel threshold band for this state, if documented. Use null for "no upper limit". */
    minOhms: z.number().nonnegative().optional(),
    maxOhms: z.number().positive().nullable().optional(),
    /** Accepted deviation from nominal when cross-checking, if documented. */
    tolerancePercent: z.number().positive().max(50).optional(),
    /** How the panel reports this state, as documented (e.g. "Tamper"). */
    panelReports: z.string().optional(),
    sourceRefs: circuitSourceRefs,
  })
  .refine((d) => d.minOhms === undefined || d.maxOhms == null || d.minOhms <= d.maxOhms, "minOhms must be <= maxOhms");
export type DocumentedReading = z.infer<typeof documentedReadingSchema>;

export const circuitStateSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  kind: circuitStateKindSchema,
  label: z.string().optional(),
  /** Cable faults replace the whole field loop; otherwise contacts decide the reading. */
  line: z.enum(["intact", "open", "short"]).default("intact"),
  /** Explicit position of every contact in this state. */
  contacts: z.record(z.string(), z.enum(["open", "closed"])).default({}),
  documented: documentedReadingSchema.optional(),
});
export type CircuitState = z.infer<typeof circuitStateSchema>;

export const circuitSchema = z.object({
  terminals: z.object({ a: terminalRefSchema, b: terminalRefSchema }),
  network: circuitNodeSchema,
});
export type Circuit = z.infer<typeof circuitSchema>;

/** Plain-language description of how the panel tells the states apart, from documentation. */
export const interpretationSchema = z.object({
  text: z.string().min(1),
  sourceRefs: circuitSourceRefs,
});
