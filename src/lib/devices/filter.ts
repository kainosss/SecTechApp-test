/**
 * Device Library filtering. Pure and serialisable so it runs instantly in
 * the browser now and can move behind an API route when the catalogue grows.
 */
import type { DeviceListItem } from "@/lib/content/repository";
import { categoryGroupIds, type CategoryGroupId } from "@/lib/content/schema";
import { search, type SearchDocument } from "@/lib/search/search";

export interface DeviceFilter {
  query?: string;
  group?: CategoryGroupId;
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

/** Text-matches (ranked by relevance) then applies group and manufacturer filters. */
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
    .filter((d) => !filter.group || d.group === filter.group)
    .filter((d) => !filter.manufacturerId || d.manufacturerId === filter.manufacturerId);
}

/** Device counts per group for the current query and manufacturer, ignoring the group filter itself. */
export function groupCounts(items: DeviceListItem[], filter: DeviceFilter): Map<CategoryGroupId, number> {
  const counts = new Map<CategoryGroupId, number>();
  for (const d of filterDevices(items, { ...filter, group: undefined })) {
    counts.set(d.group, (counts.get(d.group) ?? 0) + 1);
  }
  return counts;
}

/** Serialises filter state to a query string, omitting empty values. */
export function filterToSearchParams(filter: DeviceFilter, extra: Record<string, string | undefined> = {}): string {
  const params = new URLSearchParams();
  if (filter.query?.trim()) params.set("q", filter.query.trim());
  if (filter.group) params.set("group", filter.group);
  if (filter.manufacturerId) params.set("manufacturer", filter.manufacturerId);
  for (const [k, v] of Object.entries(extra)) if (v) params.set(k, v);
  const s = params.toString();
  return s ? `?${s}` : "";
}

/** Parses untrusted URL parameters into a filter; unknown values are dropped. */
export function filterFromSearchParams(params: { q?: string; group?: string; manufacturer?: string }): DeviceFilter {
  const group = categoryGroupIds.find((g) => g === params.group);
  return {
    query: params.q ?? "",
    group,
    manufacturerId: params.manufacturer || undefined,
  };
}
