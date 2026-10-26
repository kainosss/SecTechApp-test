/**
 * Device Library filtering. Pure and serialisable so it runs instantly in
 * the browser now and can move behind an API route when the catalogue grows.
 */
import type { DeviceCategory, VerificationStatus } from "@/lib/content/schema";
import { search, type SearchDocument } from "@/lib/search/search";

export interface DeviceListItem {
  id: string;
  model: string;
  name: string;
  category: DeviceCategory;
  manufacturerId: string;
  manufacturerName: string;
  status: VerificationStatus;
  /** Aliases and other terms technicians search by. */
  keywords: string[];
}

export interface DeviceFilter {
  query?: string;
  category?: DeviceCategory;
  manufacturerId?: string;
}

function toSearchDocument(d: DeviceListItem): SearchDocument {
  return {
    id: d.id,
    type: "device",
    title: d.name,
    subtitle: d.manufacturerName,
    href: `/devices/${d.id}`,
    keywords: [d.model, ...d.keywords],
  };
}

function byModel(a: DeviceListItem, b: DeviceListItem) {
  return a.model.localeCompare(b.model, undefined, { numeric: true });
}

/** Text-matches (ranked by relevance) then applies category and manufacturer filters. */
export function filterDevices(items: DeviceListItem[], filter: DeviceFilter): DeviceListItem[] {
  const query = filter.query?.trim() ?? "";
  let result: DeviceListItem[];
  if (query) {
    const byId = new Map(items.map((d) => [d.id, d]));
    result = search(items.map(toSearchDocument), query, items.length).flatMap((r) => byId.get(r.id) ?? []);
  } else {
    result = [...items].sort(byModel);
  }
  return result
    .filter((d) => !filter.category || d.category === filter.category)
    .filter((d) => !filter.manufacturerId || d.manufacturerId === filter.manufacturerId);
}

/** Device counts per category for the current query and manufacturer, ignoring the category filter itself. */
export function categoryCounts(items: DeviceListItem[], filter: DeviceFilter): Map<DeviceCategory, number> {
  const counts = new Map<DeviceCategory, number>();
  for (const d of filterDevices(items, { ...filter, category: undefined })) {
    counts.set(d.category, (counts.get(d.category) ?? 0) + 1);
  }
  return counts;
}

/** Serialises filter state to a query string, omitting empty values. */
export function filterToSearchParams(filter: DeviceFilter): string {
  const params = new URLSearchParams();
  if (filter.query?.trim()) params.set("q", filter.query.trim());
  if (filter.category) params.set("category", filter.category);
  if (filter.manufacturerId) params.set("manufacturer", filter.manufacturerId);
  const s = params.toString();
  return s ? `?${s}` : "";
}
