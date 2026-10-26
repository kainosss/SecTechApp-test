import { describe, expect, it } from "vitest";
import { getWiringConfiguration, listWiringConfigurations } from "@/lib/content/repository";

const reading = async (id: string) => Object.fromEntries((await getWiringConfiguration(id))!.states.map((s) => [s.kind, s.ohms]));

describe("generic demonstration circuits", () => {
  it("are listed, DEOL first, all demonstration and not tied to any device", async () => {
    const generic = (await listWiringConfigurations()).filter((c) => c.generic);
    expect(generic).toHaveLength(5);
    expect(generic[0]!.inputType).toBe("double-eol");
    expect(generic.every((c) => c.status === "demonstration" && !c.panel && c.devices.length === 0)).toBe(true);
  });

  it("DEOL with series tamper: 4k7 sealed, 6k9 alarm, open on tamper", async () => {
    expect(await reading("demo-generic-deol-alarm-tamper")).toEqual({ normal: 4700, alarm: 6900, tamper: Infinity, "cable-open": Infinity, "cable-short": 0 });
  });

  it("alternative DEOL topology gives different readings for the same contacts", async () => {
    const r = await reading("demo-generic-deol-parallel");
    expect(r.normal).toBeCloseTo(2350, 6);
    expect(r.alarm).toBe(4700);
  });

  it("single EOL NC/NO and closed loop behave as expected", async () => {
    expect(await reading("demo-generic-single-eol-nc")).toMatchObject({ normal: 4700, alarm: Infinity });
    expect(await reading("demo-generic-single-eol-no")).toMatchObject({ normal: 4700, alarm: 0 });
    expect(await reading("demo-generic-closed-loop")).toMatchObject({ normal: 0, alarm: Infinity });
  });

  it("flag indistinguishable states as warnings without errors", async () => {
    for (const c of (await listWiringConfigurations()).filter((x) => x.generic)) {
      const d = (await getWiringConfiguration(c.id))!;
      expect(d.diagnostics.some((x) => x.severity === "error"), c.id).toBe(false);
      expect(d.diagnostics.some((x) => x.code === "state-overlap"), c.id).toBe(true);
    }
  });
});
