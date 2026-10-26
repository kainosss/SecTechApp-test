import { z } from "zod";
import {
  deviceSchema,
  manufacturerSchema,
  sourceSchema,
  troubleshootingWorkflowSchema,
  wiringConfigurationSchema,
  type Device,
  type Manufacturer,
  type Source,
  type SourceRef,
  type TroubleshootingWorkflow,
  type WiringConfiguration,
} from "./schema";
import { resolveStatus, type ClaimEvidence } from "./verification";

export interface RawContent {
  manufacturers: unknown[];
  sources: unknown[];
  devices: unknown[];
  wiring?: unknown[];
  workflows?: unknown[];
}

export interface ContentStore {
  manufacturers: Manufacturer[];
  sources: Source[];
  devices: Device[];
  wiring: WiringConfiguration[];
  workflows: TroubleshootingWorkflow[];
}

export class ContentValidationError extends Error {
  constructor(public readonly problems: string[]) {
    super(`Content validation failed:\n- ${problems.join("\n- ")}`);
    this.name = "ContentValidationError";
  }
}

function parseAll<T>(schema: z.ZodType<T>, items: unknown[], kind: string, problems: string[]): T[] {
  const out: T[] = [];
  items.forEach((item, i) => {
    const result = schema.safeParse(item);
    if (result.success) {
      out.push(result.data);
    } else {
      const id = (item as { id?: string })?.id ?? `#${i}`;
      for (const issue of result.error.issues) {
        problems.push(`${kind} ${id}: ${issue.path.join(".") || "(root)"} ${issue.message}`);
      }
    }
  });
  return out;
}

function checkUniqueIds(items: { id: string }[], kind: string, problems: string[]) {
  const seen = new Set<string>();
  for (const { id } of items) {
    if (seen.has(id)) problems.push(`${kind} ${id}: duplicate id`);
    seen.add(id);
  }
}

/** Every claim on a device, labelled for error messages. */
export function deviceClaims(d: Device): { label: string; claim: ClaimEvidence & { appliesToVariantIds?: string[] } }[] {
  return [
    ...d.variants.map((v) => ({ label: `variant ${v.id}`, claim: v })),
    ...d.terminals.map((t) => ({ label: `terminal ${t.label}`, claim: t })),
    ...(d.power ? [{ label: "power", claim: d.power }] : []),
    ...d.specifications.map((s) => ({ label: `specification ${s.label}`, claim: s })),
    ...d.notes.map((n, i) => ({ label: `note #${i + 1}`, claim: n })),
  ];
}

/**
 * Validates raw content: schemas, unique ids, cross-references, demo
 * separation and — strictly — that nothing declared "verified" lacks the
 * evidence to back it. Throws so bad content fails tests and builds.
 * (At runtime, verification.ts independently downgrades anything that slips
 * through, e.g. from a future database.)
 */
export function loadContent(raw: RawContent): ContentStore {
  const problems: string[] = [];
  const manufacturers = parseAll(manufacturerSchema, raw.manufacturers, "manufacturer", problems);
  const sources = parseAll(sourceSchema, raw.sources, "source", problems);
  const devices = parseAll(deviceSchema, raw.devices, "device", problems);
  const wiring = parseAll(wiringConfigurationSchema, raw.wiring ?? [], "wiring", problems);
  const workflows = parseAll(troubleshootingWorkflowSchema, raw.workflows ?? [], "workflow", problems);

  checkUniqueIds(manufacturers, "manufacturer", problems);
  checkUniqueIds(sources, "source", problems);
  checkUniqueIds(devices, "device", problems);
  checkUniqueIds(wiring, "wiring", problems);
  checkUniqueIds(workflows, "workflow", problems);

  const manufacturersById = new Map(manufacturers.map((m) => [m.id, m]));
  const sourcesById = new Map(sources.map((s) => [s.id, s]));
  const devicesById = new Map(devices.map((d) => [d.id, d]));
  const getSource = (id: string) => sourcesById.get(id);

  const checkRefs = (owner: string, refs: SourceRef[], ownerIsDemo: boolean) => {
    for (const ref of refs) {
      const source = sourcesById.get(ref.sourceId);
      if (!source) problems.push(`${owner}: cites unknown source "${ref.sourceId}"`);
      else if (source.isDemo && !ownerIsDemo) problems.push(`${owner}: real content cites demonstration source "${source.id}"`);
    }
  };

  for (const s of sources) {
    if (s.manufacturerId && !manufacturersById.has(s.manufacturerId)) {
      problems.push(`source ${s.id}: unknown manufacturerId "${s.manufacturerId}"`);
    }
  }
  for (const m of manufacturers) checkRefs(`manufacturer ${m.id}`, m.sourceRefs, m.isDemo);

  const isDemoDevice = (d: Device) => manufacturersById.get(d.manufacturerId)?.isDemo ?? false;

  for (const d of devices) {
    const owner = `device ${d.id}`;
    const manufacturer = manufacturersById.get(d.manufacturerId);
    if (!manufacturer) problems.push(`${owner}: unknown manufacturerId "${d.manufacturerId}"`);
    const demo = isDemoDevice(d);

    if (demo && d.verification.status !== "demonstration") {
      problems.push(`${owner}: devices from demonstration manufacturers must be declared "demonstration"`);
    }
    if (!demo && d.verification.status === "demonstration") {
      problems.push(`${owner}: real devices cannot be declared "demonstration"`);
    }

    checkRefs(owner, d.documentation, demo);
    const variantIds = new Set(d.variants.map((v) => v.id));
    checkUniqueIds(d.variants, `${owner} variant`, problems);

    for (const { label, claim } of deviceClaims(d)) {
      checkRefs(`${owner} ${label}`, claim.sourceRefs, demo);
      for (const v of claim.appliesToVariantIds ?? []) {
        if (!variantIds.has(v)) problems.push(`${owner} ${label}: unknown variant "${v}"`);
      }
      if (!demo && claim.status === "demonstration") {
        problems.push(`${owner} ${label}: real devices cannot carry demonstration claims`);
      }
      const resolved = resolveStatus(claim, {
        recordStatus: d.verification.status,
        recordReview: d.verification.review,
        isDemo: demo,
        getSource,
      });
      if ((claim.status ?? d.verification.status) === "verified" && resolved.status !== "verified") {
        problems.push(`${owner} ${label}: declared verified but ${resolved.reasons.join("; ")}`);
      }
    }
  }

  const checkLinkedRecord = (
    kind: string,
    r: { id: string; isDemo: boolean; appliesToDeviceIds: string[]; sourceRefs: SourceRef[]; appliesToRevisions: string[]; verification: Device["verification"] },
  ) => {
    const owner = `${kind} ${r.id}`;
    if (r.isDemo && r.verification.status !== "demonstration") {
      problems.push(`${owner}: demonstration records must be declared "demonstration"`);
    }
    if (!r.isDemo && r.verification.status === "demonstration") {
      problems.push(`${owner}: only records marked isDemo may be declared "demonstration"`);
    }
    checkRefs(owner, r.sourceRefs, r.isDemo);
    for (const id of r.appliesToDeviceIds) {
      const device = devicesById.get(id);
      if (!device) problems.push(`${owner}: unknown device "${id}"`);
      // Never attach demonstration wiring/procedures to a real product, or real ones to demo products.
      else if (r.isDemo !== isDemoDevice(device)) {
        problems.push(`${owner}: ${r.isDemo ? "demonstration" : "real"} records cannot link ${r.isDemo ? "real" : "demonstration"} device "${id}"`);
      }
    }
    if (r.verification.status === "verified") {
      const resolved = resolveStatus(
        { sourceRefs: r.sourceRefs, appliesToRevisions: r.appliesToRevisions },
        { recordStatus: r.verification.status, recordReview: r.verification.review, isDemo: r.isDemo, getSource },
      );
      if (resolved.status !== "verified") problems.push(`${owner}: declared verified but ${resolved.reasons.join("; ")}`);
    }
  };
  wiring.forEach((w) => checkLinkedRecord("wiring", w));
  workflows.forEach((w) => checkLinkedRecord("workflow", w));

  if (problems.length > 0) throw new ContentValidationError(problems);
  return { manufacturers, sources, devices, wiring, workflows };
}
