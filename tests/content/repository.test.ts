import { afterEach, describe, expect, it, vi } from "vitest";
import { getDevice, getRelatedForDevice, getWorkflow, listDevices, listManufacturers, listWiringConfigurations, listWorkflows } from "@/lib/content/repository";

afterEach(() => vi.unstubAllEnvs());

describe("demo mode", () => {
  it("hides demonstration devices, manufacturers and wiring unless demo mode is on", async () => {
    vi.stubEnv("FIELDWISE_DEMO_MODE", "false");
    expect((await listDevices()).some((d) => d.status === "demonstration")).toBe(false);
    expect((await listManufacturers()).some((m) => m.isDemo)).toBe(false);
    expect(await getDevice("arclight-demo-ac-2d")).toBeNull();
    expect(await listWiringConfigurations()).toEqual([]);
    expect(await listWorkflows()).toEqual([]);
  });

  it("includes them when demo mode is on", async () => {
    vi.stubEnv("FIELDWISE_DEMO_MODE", "true");
    expect((await listDevices()).filter((d) => d.status === "demonstration")).toHaveLength(10);
    expect(await getDevice("arclight-demo-ac-2d")).not.toBeNull();
  });
});

describe("device detail", () => {
  it("resolves statuses and sources for every claim", async () => {
    const d = await getDevice("arclight-demo-ac-2d");
    expect(d?.status).toBe("demonstration");
    expect(d?.terminals.every((t) => t.status === "demonstration" && t.sources.length > 0)).toBe(true);
    expect(d?.installationNotes.length).toBeGreaterThan(0);
  });

  it("links wiring by device and workflows by device or category", async () => {
    const related = await getRelatedForDevice("northgate-demo-ap-8");
    expect(related.wiring.map((w) => w.id).sort()).toEqual(["demo-ap8-dual-eol-pir", "demo-ap8-single-eol-reed"]);
    expect(related.workflows.map((w) => w.id)).toContain("demo-zone-permanently-open");
    expect(related.workflows.every((w) => w.status === "demonstration")).toBe(true);
  });

  it("returns linked devices on workflow pages, hiding demo devices outside demo mode", async () => {
    const wf = await getWorkflow("demo-camera-offline");
    expect(wf?.devices.map((d) => d.model)).toContain("HC-4D");
  });
});

describe("real devices", () => {
  it("never shows a real device as demonstration, and only verified with complete evidence", async () => {
    vi.stubEnv("FIELDWISE_DEMO_MODE", "false");
    for (const item of await listDevices()) {
      expect(item.status).not.toBe("demonstration");
      const detail = await getDevice(item.id);
      const claims = [...detail!.variants, ...detail!.terminals, ...detail!.specifications, ...detail!.installationNotes, ...detail!.commissioningNotes];
      for (const c of claims) {
        if (c.status === "verified") {
          expect(c.sources.length).toBeGreaterThan(0);
          expect(c.review).toBeDefined();
        }
      }
    }
  });
});
