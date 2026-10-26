import { describe, expect, it } from "vitest";
import { filterDevices, filterFromSearchParams, filterToSearchParams, groupCounts } from "@/lib/devices/filter";
import { listDevices, type DeviceListItem } from "@/lib/content/repository";

const item = (over: Partial<DeviceListItem>): DeviceListItem => ({
  id: "x",
  model: "X",
  name: "X device",
  category: "other",
  group: "other",
  manufacturerId: "m1",
  manufacturerName: "Maker One",
  status: "demonstration",
  keywords: [],
  ...over,
});

const items = [
  item({ id: "pir", model: "PIR-20", name: "PIR-20 Detector", category: "motion-detector", group: "detectors", keywords: ["motion"] }),
  item({ id: "pir2", model: "PIR-3", name: "PIR-3 Detector", category: "motion-detector", group: "detectors", manufacturerId: "m2", manufacturerName: "Maker Two" }),
  item({ id: "reed", model: "RS-1", name: "RS-1 Reed", category: "reed-switch", group: "contacts", keywords: ["door contact"] }),
];

describe("filterDevices", () => {
  it("returns everything sorted by model (numeric aware) with no filter", () => {
    expect(filterDevices(items, {}).map((d) => d.id)).toEqual(["pir2", "pir", "reed"]);
  });

  it("filters by text, category and manufacturer together", () => {
    expect(filterDevices(items, { query: "pir" }).map((d) => d.id).sort()).toEqual(["pir", "pir2"]);
    expect(filterDevices(items, { query: "pir", manufacturerId: "m2" }).map((d) => d.id)).toEqual(["pir2"]);
    expect(filterDevices(items, { group: "contacts" }).map((d) => d.id)).toEqual(["reed"]);
    expect(filterDevices(items, { query: "door contact" }).map((d) => d.id)).toEqual(["reed"]);
    expect(filterDevices(items, { query: "maker two" }).map((d) => d.id)).toEqual(["pir2"]);
  });

  it("ignores whitespace-only queries", () => {
    expect(filterDevices(items, { query: "   " })).toHaveLength(3);
  });

  it("counts groups without applying the group filter itself", () => {
    const counts = groupCounts(items, { group: "contacts", manufacturerId: "m1" });
    expect(counts.get("detectors")).toBe(1);
    expect(counts.get("contacts")).toBe(1);
  });

  it("serialises filters to a shareable query string", () => {
    expect(filterToSearchParams({})).toBe("");
    expect(filterToSearchParams({ query: " ks pir ", group: "cctv" }, { shown: "60" })).toBe("?q=ks+pir&group=cctv&shown=60");
  });

  it("parses URL parameters and drops unknown groups", () => {
    expect(filterFromSearchParams({ q: "axis", group: "cctv", manufacturer: "axis" })).toEqual({ query: "axis", group: "cctv", manufacturerId: "axis" });
    expect(filterFromSearchParams({ group: "<script>" }).group).toBeUndefined();
  });

  it("finds shipped devices by model with any formatting", async () => {
    const all = await listDevices();
    expect(filterDevices(all, { query: "ac2d" })[0]?.id).toBe("arclight-demo-ac-2d");
    expect(filterDevices(all, { group: "locks", manufacturerId: "arclight-demo" }).map((d) => d.model)).toEqual(["LS-12"]);
  });
});
