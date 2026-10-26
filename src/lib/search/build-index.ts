import { listDevices, listManufacturers, listWiringConfigurations, listWorkflows } from "@/lib/content/repository";
import { CATEGORY_LABELS, FAULT_AREA_LABELS, STATUS_LABELS } from "@/lib/content/schema";
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

  const wiring: SearchDocument[] = (await listWiringConfigurations()).map((w) => ({
    id: w.id,
    type: "wiring",
    title: w.title,
    subtitle: `Wiring configuration · ${STATUS_LABELS[w.status]}`,
    href: `/eol/${w.id}`,
    keywords: ["wiring", "eol", ...w.devices.map((d) => d.model)],
  }));

  const workflows: SearchDocument[] = (await listWorkflows()).map((w) => ({
    id: w.id,
    type: "workflow",
    title: w.title,
    subtitle: `${FAULT_AREA_LABELS[w.faultArea]} fault · ${STATUS_LABELS[w.status]}`,
    href: `/fault-finder/${w.id}`,
    keywords: ["fault", "troubleshooting", ...w.devices.map((d) => d.model)],
  }));

  const tools: SearchDocument[] = TOOLS.map((t) => ({
    id: t.id,
    type: "tool",
    title: t.title,
    subtitle: t.description,
    href: t.href,
    keywords: t.keywords,
  }));

  return [...devices, ...manufacturers, ...workflows, ...wiring, ...tools];
}
