import { CATEGORY_LABELS } from "@/lib/content/schema";
import { getDevices, getManufacturer, getManufacturers } from "@/lib/content/repository";
import { TOOLS } from "@/lib/navigation";
import type { SearchDocument } from "./search";

/** Builds the search index from content. Server-only; the result is serialisable. */
export function buildSearchIndex(): SearchDocument[] {
  const devices: SearchDocument[] = getDevices().map((d) => {
    const manufacturer = getManufacturer(d.manufacturerId);
    return {
      id: d.id,
      type: "device",
      title: d.name.includes(d.model) ? d.name : `${d.model} ${d.name}`,
      subtitle: `${manufacturer?.name ?? ""} · ${CATEGORY_LABELS[d.category]}`,
      href: `/devices/${d.id}`,
      keywords: [d.model, ...d.aliases, CATEGORY_LABELS[d.category], manufacturer?.name ?? ""],
    };
  });

  const manufacturers: SearchDocument[] = getManufacturers().map((m) => ({
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
