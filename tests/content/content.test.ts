import { describe, expect, it } from "vitest";
import { rawContent } from "@content/index";
import { ContentValidationError, loadContent } from "@/lib/content/loader";

const baseDevice = {
  id: "test-device",
  manufacturerId: "northgate-demo",
  model: "T-1",
  name: "Test",
  category: "other",
  summary: "Test device",
  modelRevisions: [{ revision: "A" }],
  documentation: [{ sourceId: "demo-ng-ap8-install" }],
  verification: { status: "example" },
  updatedAt: "2026-01-01",
};

function withDevice(device: Record<string, unknown>) {
  return { ...rawContent, devices: [...rawContent.devices, device] };
}

describe("shipped content", () => {
  it("passes schema and cross-reference validation", () => {
    expect(() => loadContent(rawContent)).not.toThrow();
  });

  it("labels every demo manufacturer's devices as example data", () => {
    const store = loadContent(rawContent);
    const demoMakers = new Set(store.manufacturers.filter((m) => m.isDemo).map((m) => m.id));
    for (const d of store.devices.filter((d) => demoMakers.has(d.manufacturerId))) {
      expect(d.verification.status, d.id).toBe("example");
    }
  });
});

describe("content safeguards", () => {
  it("rejects verified devices without verifier details", () => {
    expect(() => loadContent(withDevice({ ...baseDevice, verification: { status: "verified" } }))).toThrow(
      ContentValidationError,
    );
  });

  it("rejects verified devices that cite no documentation", () => {
    const device = {
      ...baseDevice,
      documentation: [],
      verification: { status: "verified", verifiedBy: "Reviewer", verifiedAt: "2026-01-01" },
    };
    expect(() => loadContent(withDevice(device))).toThrow(/cite at least one source/);
  });

  it("rejects verified devices that rely on demo sources", () => {
    const device = {
      ...baseDevice,
      verification: { status: "verified", verifiedBy: "Reviewer", verifiedAt: "2026-01-01" },
    };
    expect(() => loadContent(withDevice(device))).toThrow(/demo source/);
  });

  it("rejects references to unknown sources and manufacturers", () => {
    const device = { ...baseDevice, manufacturerId: "nope", documentation: [{ sourceId: "missing" }] };
    expect(() => loadContent(withDevice(device))).toThrow(/unknown manufacturerId[\s\S]*unknown source/);
  });

  it("rejects specifications and installation notes citing unknown sources", () => {
    const device = {
      ...baseDevice,
      specifications: [{ label: "Rating", value: "1 A", sourceRefs: [{ sourceId: "ghost-spec" }] }],
      installationNotes: [{ text: "Note", sourceRefs: [{ sourceId: "ghost-note" }] }],
    };
    expect(() => loadContent(withDevice(device))).toThrow(/ghost-spec[\s\S]*ghost-note/);
  });

  it("rejects unknown device categories", () => {
    expect(() => loadContent(withDevice({ ...baseDevice, category: "toaster" }))).toThrow(ContentValidationError);
  });

  it("rejects duplicate ids", () => {
    expect(() => loadContent(withDevice({ ...baseDevice, id: "kestrel-demo-ks-rs1" }))).toThrow(/duplicate id/);
  });
});
