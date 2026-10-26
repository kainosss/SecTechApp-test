import { z } from "zod";
import {
  deviceSchema,
  manufacturerSchema,
  sourceSchema,
  type Device,
  type Manufacturer,
  type Source,
} from "./schema";

export interface ContentStore {
  manufacturers: Manufacturer[];
  sources: Source[];
  devices: Device[];
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

/**
 * Validates raw content against the schema and checks cross-references
 * (manufacturers and cited sources must exist). Throws on any problem so
 * bad content fails the build and the test suite rather than reaching users.
 */
export function loadContent(raw: { manufacturers: unknown[]; sources: unknown[]; devices: unknown[] }): ContentStore {
  const problems: string[] = [];
  const manufacturers = parseAll(manufacturerSchema, raw.manufacturers, "manufacturer", problems);
  const sources = parseAll(sourceSchema, raw.sources, "source", problems);
  const devices = parseAll(deviceSchema, raw.devices, "device", problems);

  checkUniqueIds(manufacturers, "manufacturer", problems);
  checkUniqueIds(sources, "source", problems);
  checkUniqueIds(devices, "device", problems);

  const manufacturerIds = new Set(manufacturers.map((m) => m.id));
  const sourcesById = new Map(sources.map((s) => [s.id, s]));

  for (const d of devices) {
    if (!manufacturerIds.has(d.manufacturerId)) {
      problems.push(`device ${d.id}: unknown manufacturerId "${d.manufacturerId}"`);
    }
    const refs = [
      ...d.documentation,
      ...d.terminals.flatMap((t) => t.sourceRefs),
      ...(d.power?.sourceRefs ?? []),
    ];
    for (const ref of refs) {
      const source = sourcesById.get(ref.sourceId);
      if (!source) {
        problems.push(`device ${d.id}: cites unknown source "${ref.sourceId}"`);
      } else if (source.isDemo && d.verification.status === "verified") {
        problems.push(`device ${d.id}: verified content cannot rely on demo source "${source.id}"`);
      }
    }
  }

  if (problems.length > 0) throw new ContentValidationError(problems);
  return { manufacturers, sources, devices };
}
