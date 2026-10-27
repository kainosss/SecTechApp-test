import { describe, expect, it } from "vitest";
import { sectionOrder, CATEGORY_PRIORITY, SECTIONS } from "@/lib/techdocs/fields";
import {
  applyRegisterEdit,
  blankEquipment,
  createRegister,
  DUPLICATE_CLEARS,
  duplicateEquipment,
  duplicateRegister,
  equipmentLabel,
  exportFileName,
  filterEquipment,
  hasNetworkConfig,
  registerTitle,
  TEXT_FIELDS,
  UNIQUE_IDENTIFIERS,
} from "@/lib/techdocs/register";
import { equipmentSchema, registerSchema } from "@/lib/techdocs/schema";
import { cctvInstall, largeSite, makeRegister, mixedSite } from "./fixtures";

describe("registers", () => {
  it("creates an empty, valid register with only the technician pre-filled", () => {
    const r = createRegister("Sam", new Date(2026, 9, 27));
    expect(registerSchema.parse(r)).toEqual(r);
    expect(r).toMatchObject({ name: "", siteName: "", customer: "", siteAddress: "", siteReference: "", technician: "Sam", notes: "", equipment: [] });
    expect(r.createdAt).toBe(r.updatedAt);
    expect(registerTitle(r)).toBe("Untitled register");
    expect(registerTitle({ ...r, siteName: "Depot" })).toBe("Depot");
    expect(registerTitle({ ...r, name: "CCTV", siteName: "Depot" })).toBe("CCTV");
  });

  it("edits details and updates the last-updated time", () => {
    const r = createRegister("", new Date(2026, 0, 1));
    const next = applyRegisterEdit(r, { type: "set", patch: { siteName: "Depot", notes: "Key at office" } }, new Date(2026, 0, 2));
    expect(next).toMatchObject({ siteName: "Depot", notes: "Key at office", createdAt: r.createdAt });
    expect(next.updatedAt > r.updatedAt).toBe(true);
  });

  it("duplicates a whole register under a new id", () => {
    const r = cctvInstall();
    const copy = duplicateRegister(r);
    expect(copy.id).not.toBe(r.id);
    expect(copy.name).toBe("Building C CCTV (copy)");
    expect(copy.equipment).toEqual(r.equipment);
  });
});

describe("equipment", () => {
  it("blank entries have every field empty — nothing assigned automatically", () => {
    const e = blankEquipment("ip-camera");
    expect(equipmentSchema.parse(e)).toEqual(e);
    for (const k of TEXT_FIELDS) expect(e[k], k).toBe("");
    expect(e.status).toBe("");
    expect(e.customFields).toEqual([]);
  });

  it("saves new entries (optionally after another) and replaces existing ones", () => {
    let r = createRegister();
    const a = { ...blankEquipment("nvr"), name: "NVR" };
    const b = { ...blankEquipment("ip-camera"), name: "CAM-1" };
    r = applyRegisterEdit(r, { type: "save-item", item: a });
    r = applyRegisterEdit(r, { type: "save-item", item: b });
    const c = { ...blankEquipment("ip-camera"), name: "CAM-0" };
    r = applyRegisterEdit(r, { type: "save-item", item: c, after: a.id });
    expect(r.equipment.map((e) => e.name)).toEqual(["NVR", "CAM-0", "CAM-1"]);
    r = applyRegisterEdit(r, { type: "save-item", item: { ...a, firmware: "4.2.1" } });
    expect(r.equipment[0]).toMatchObject({ name: "NVR", firmware: "4.2.1" });
    expect(r.equipment).toHaveLength(3);
  });

  it("removes and restores entries at their position", () => {
    const r = cctvInstall();
    const victim = r.equipment[3]!;
    const removed = applyRegisterEdit(r, { type: "remove-item", id: victim.id });
    expect(removed.equipment).toHaveLength(13);
    const restored = applyRegisterEdit(removed, { type: "restore-item", item: victim, index: 3 });
    expect(restored.equipment).toEqual(r.equipment);
    expect(applyRegisterEdit(r, { type: "remove-item", id: "missing" })).toBe(r);
  });

  it("duplicating keeps common values and clears unique identifiers", () => {
    const src = cctvInstall().equipment[2]!;
    const copy = duplicateEquipment(src);
    expect(copy.id).not.toBe(src.id);
    for (const k of UNIQUE_IDENTIFIERS) expect(copy[k], k).toBe("");
    for (const k of DUPLICATE_CLEARS) expect(copy[k], k).toBe("");
    for (const k of ["category", "type", "location", "make", "model", "firmware", "subnet", "gateway", "vlan", "switchName", "poe", "connectedTo", "nvrVms", "ladderHeight", "ladderType", "mountingHeight"] as const)
      expect(copy[k], k).toBe(src[k]);
    expect(src.ip).toBe("10.20.0.101"); // the source is untouched
  });

  it("duplicates custom fields with new ids", () => {
    const src = { ...blankEquipment(), customFields: [{ id: "x", name: "Lens", value: "2.8 mm" }] };
    const copy = duplicateEquipment(src);
    expect(copy.customFields).toEqual([{ id: expect.not.stringMatching(/^x$/), name: "Lens", value: "2.8 mm" }]);
  });

  it("labels unnamed entries by type or category without inventing names", () => {
    const r = makeRegister({}, [{ category: "detector", type: "PIR" }, { category: "detector", type: "PIR" }, { category: "detector" }, { category: "nvr", name: "NVR-01" }]);
    expect(r.equipment.map((e) => equipmentLabel(r, e))).toEqual(["PIR 1", "PIR 2", "Alarm detector 1", "NVR-01"]);
  });

  it("changing category keeps every entered value", () => {
    const e = { ...cctvInstall().equipment[2]! };
    const changed = { ...e, category: "other" as const };
    for (const k of TEXT_FIELDS) expect(changed[k]).toBe(e[k]);
  });

  it("orders sections by category while keeping all of them", () => {
    for (const cat of Object.keys(CATEGORY_PRIORITY) as (keyof typeof CATEGORY_PRIORITY)[]) {
      const order = sectionOrder(cat);
      expect(new Set(order)).toEqual(new Set(SECTIONS.map((s) => s.id)));
      expect(order.slice(0, CATEGORY_PRIORITY[cat].length)).toEqual(CATEGORY_PRIORITY[cat]);
    }
    expect(sectionOrder("ip-camera").slice(0, 3)).toEqual(["basic", "hardware", "network"]);
    expect(sectionOrder("detector")).toContain("network"); // still available
  });

  it("has no credential fields", () => {
    const keys = Object.keys(equipmentSchema.shape).join(" ").toLowerCase();
    for (const bad of ["password", "pin", "passcode", "credential", "secret"]) expect(keys).not.toMatch(new RegExp(`\\b\\w*${bad}`));
  });
});

describe("search and filters", () => {
  const r = cctvInstall();
  const names = (q: Parameters<typeof filterEquipment>[1]) => filterEquipment(r, q).map((e) => equipmentLabel(r, e));

  it("searches name, reference, location, make, model, IP and serial", () => {
    expect(names({ query: "cam-03" })).toEqual(["CAM-03"]);
    expect(names({ query: "WG-NVR" })).toEqual(["NVR-01"]);
    expect(names({ query: "dock 2" })).toEqual(["CAM-04"]);
    expect(names({ query: "ptz-25x" })).toEqual(["CAM-04", "CAM-08", "CAM-12"]);
    expect(names({ query: "10.20.0.112" })).toEqual(["CAM-12"]);
    expect(names({ query: "EVD4-1005" })).toEqual(["CAM-06"]);
    expect(names({ query: "examplenet" })).toEqual(["SW-CAM-01"]);
    expect(names({ query: "   " })).toHaveLength(14);
  });

  it("filters by category and status, combined with search", () => {
    expect(filterEquipment(r, { category: "ip-camera" })).toHaveLength(12);
    expect(names({ status: "attention" })).toEqual(["CAM-06"]);
    expect(names({ category: "ip-camera", query: "roof" })).toEqual(["CAM-11", "CAM-12"]);
    const l = largeSite();
    expect(filterEquipment(l, { status: "none" })).toHaveLength(20);
  });

  it("detects entries with network values", () => {
    const m = mixedSite();
    expect(m.equipment.filter(hasNetworkConfig).map((e) => e.name)).toEqual(["CAM-Gate", "CAM-Dock", "NVR", "Router", "Gate intercom"]);
  });

  it("handles 100+ entries", () => {
    const l = largeSite();
    expect(l.equipment).toHaveLength(120);
    expect(filterEquipment(l, { query: "zone 12" })).toHaveLength(10);
    expect(filterEquipment(l, { query: "V5.6.0" }).length).toBe(0); // firmware isn't a search field
    expect(filterEquipment(l, { query: "SN100119" })).toHaveLength(1);
  });
});

it("builds a safe export file name", () => {
  expect(exportFileName({ ...createRegister(), name: "Building C / CCTV: \"north\"" }, new Date(2026, 9, 27))).toBe("Fieldwise-Technical-Building-C-CCTV-north-2026-10-27.xlsx");
  expect(exportFileName(createRegister(), new Date(2026, 0, 5))).toBe("Fieldwise-Technical-Untitled-register-2026-01-05.xlsx");
});
