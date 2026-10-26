import { listDevices, listManufacturers } from "@/lib/content/repository";
import { CATEGORY_LABELS } from "@/lib/content/schema";
import { TOOLS } from "@/lib/navigation";
import type { SearchDocument } from "./search";

/** Builds the universal search index from visible content. Server-only; the result is serialisable. */
export async function buildSearchIndex(): Promise<SearchDocument[]> {
  const devices: SearchDocument[] = (await listDevices()).map((d) => ({
    id: d.id,
    type: "device",
    title: d.name.includes(d.model) ? d.name : `${d.model} ${d.name}`,
    subtitle: `${d.manufacturerName} · ${CATEGORY_LABELS[d.category]}`,
    href: `/devices/${d.id}`,
    keywords: [d.model, d.manufacturerName, ...d.keywords],
  }));

  const manufacturers: SearchDocument[] = (await listManufacturers()).map((m) => ({
    id: m.id,
    type: "manufacturer",
    title: m.name,
    subtitle: "Manufacturer",
    href: `/devices?manufacturer=${m.id}`,
    keywords: [],
  }));

  const tools: SearchDocument[] = TOOLS.map((t) => ({
    id: t.id,
    type: "tool",
    title: t.title,
    subtitle: t.description,
    href: t.href,
    keywords: t.keywords,
  }));

  return [...devices, ...manufacturers, ...tools];
}
