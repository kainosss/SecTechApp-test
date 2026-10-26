/**
 * Read-only access to technical content. UI code must go through these
 * functions rather than importing content files, so the backing store can
 * be swapped (local JSON now, Supabase later) without UI changes.
 */
import { rawContent } from "@content/index";
import { loadContent, type ContentStore } from "./loader";
import type { DeviceListItem } from "@/lib/devices/filter";
import { CATEGORY_LABELS, type Device, type DeviceCategory, type Manufacturer, type Source, type VerificationStatus } from "./schema";

let store: ContentStore | null = null;

function getStore(): ContentStore {
  store ??= loadContent(rawContent);
  return store;
}

export function getManufacturers(): Manufacturer[] {
  return [...getStore().manufacturers].sort((a, b) => a.name.localeCompare(b.name));
}

export function getManufacturer(id: string): Manufacturer | undefined {
  return getStore().manufacturers.find((m) => m.id === id);
}

export function getDevices(filter?: { category?: DeviceCategory; manufacturerId?: string }): Device[] {
  return getStore()
    .devices.filter((d) => !filter?.category || d.category === filter.category)
    .filter((d) => !filter?.manufacturerId || d.manufacturerId === filter.manufacturerId)
    .sort((a, b) => a.model.localeCompare(b.model));
}

export function getDevice(id: string): Device | undefined {
  return getStore().devices.find((d) => d.id === id);
}

export function getSource(id: string): Source | undefined {
  return getStore().sources.find((s) => s.id === id);
}

/** Lightweight device projection safe to send to client components. */
export interface DeviceSummary {
  id: string;
  model: string;
  name: string;
  category: DeviceCategory;
  manufacturerName: string;
  status: Device["verification"]["status"];
}

export function toDeviceSummary(d: Device): DeviceSummary {
  return {
    id: d.id,
    model: d.model,
    name: d.name,
    category: d.category,
    manufacturerName: getManufacturer(d.manufacturerId)?.name ?? "Unknown manufacturer",
    status: d.verification.status,
  };
}

export function getDeviceSummaries(): DeviceSummary[] {
  return getDevices().map(toDeviceSummary);
}

export function toDeviceListItem(d: Device): DeviceListItem {
  return {
    ...toDeviceSummary(d),
    manufacturerId: d.manufacturerId,
    keywords: [...d.aliases, CATEGORY_LABELS[d.category]],
  };
}

export function getDeviceListItems(): DeviceListItem[] {
  return getDevices().map(toDeviceListItem);
}

/** A link from a device to a related EOL configuration or fault workflow. */
export interface RelatedRecord {
  id: string;
  title: string;
  href: string;
  status: VerificationStatus;
}

/**
 * Records that declare they apply to this device. EOL configurations and
 * fault workflows are added in the next v0.2 steps; until then these are empty.
 */
export function getRelatedForDevice(_deviceId: string): { eolConfigurations: RelatedRecord[]; faultWorkflows: RelatedRecord[] } {
  return { eolConfigurations: [], faultWorkflows: [] };
}

export function getContentStats() {
  const { devices, manufacturers } = getStore();
  const count = (s: string) => devices.filter((d) => d.verification.status === s).length;
  return {
    devices: devices.length,
    manufacturers: manufacturers.length,
    verified: count("verified"),
    unverified: count("unverified"),
    example: count("example"),
  };
}
