import { describe, expect, it } from "vitest";
import { categoryCounts, filterDevices, filterToSearchParams, type DeviceListItem } from "@/lib/devices/filter";
import { getDeviceListItems } from "@/lib/content/repository";

const item = (over: Partial<DeviceListItem>): DeviceListItem => ({
  id: "x",
  model: "X",
  name: "X device",
  category: "other",
  manufacturerId: "m1",
  manufacturerName: "Maker One",
  status: "example",
  keywords: [],
  ...over,
});

const items = [
  item({ id: "pir", model: "PIR-20", name: "PIR-20 Detector", category: "motion-detector", keywords: ["motion"] }),
  item({ id: "pir2", model: "PIR-3", name: "PIR-3 Detector", category: "motion-detector", manufacturerId: "m2", manufacturerName: "Maker Two" }),
  item({ id: "reed", model: "RS-1", name: "RS-1 Reed", category: "reed-switch", keywords: ["door contact"] }),
];

describe("filterDevices", () => {
  it("returns everything sorted by model (numeric aware) with no filter", () => {
    expect(filterDevices(items, {}).map((d) => d.id)).toEqual(["pir2", "pir", "reed"]);
  });

  it("filters by text, category and manufacturer together", () => {
    expect(filterDevices(items, { query: "pir" }).map((d) => d.id).sort()).toEqual(["pir", "pir2"]);
    expect(filterDevices(items, { query: "pir", manufacturerId: "m2" }).map((d) => d.id)).toEqual(["pir2"]);
    expect(filterDevices(items, { category: "reed-switch" }).map((d) => d.id)).toEqual(["reed"]);
    expect(filterDevices(items, { query: "door contact" }).map((d) => d.id)).toEqual(["reed"]);
    expect(filterDevices(items, { query: "maker two" }).map((d) => d.id)).toEqual(["pir2"]);
  });

  it("ignores whitespace-only queries", () => {
    expect(filterDevices(items, { query: "   " })).toHaveLength(3);
  });

  it("counts categories without applying the category filter itself", () => {
    const counts = categoryCounts(items, { category: "reed-switch", manufacturerId: "m1" });
    expect(counts.get("motion-detector")).toBe(1);
    expect(counts.get("reed-switch")).toBe(1);
  });

  it("serialises filters to a shareable query string", () => {
    expect(filterToSearchParams({})).toBe("");
    expect(filterToSearchParams({ query: " ks pir ", category: "siren" })).toBe("?q=ks+pir&category=siren");
  });

  it("finds shipped devices by model with any formatting", () => {
    const all = getDeviceListItems();
    expect(filterDevices(all, { query: "ac2d" })[0]?.id).toBe("arclight-demo-ac-2d");
    expect(filterDevices(all, { category: "ip-camera" }).map((d) => d.model)).toEqual(["HC-4D"]);
  });
});
