/**
 * Pilot accuracy checks: the reference examples, open/short behaviour and the
 * meter's safety rules, all calculated by the engines (never fixed values).
 */
import { describe, expect, it } from "vitest";
import { listEolPresets, listGenericCircuits } from "@/lib/content/repository";
import { formatOhms } from "@/lib/eol/engine";
import { buildExplorerCircuit } from "@/lib/eol/explorer";
import type { PlacedComponent, PointId } from "@/lib/lab/bench";
import { formatMeter, measure, SUPPLY_WARNING } from "@/lib/lab/meter";
import { presetTier, TIER_LABELS } from "@/lib/verification";

const readings = (m: ReturnType<typeof buildExplorerCircuit>) => Object.fromEntries(m.analysis.states.map((s) => [s.kind, s.ohms]));

describe("dual EOL reference examples", () => {
  it.each([
    ["generic-2k2-4k4", 2200, 4400],
    ["integriti-example", 2200, 4400],
    ["tecom-example", 10000, 20000],
  ])("%s: sealed %d Ω, alarm %d Ω, tamper open, cable short ≈ 0 Ω", async (p, seal, alarm) => {
    const m = buildExplorerCircuit(await listGenericCircuits(), await listEolPresets(), { p });
    expect(readings(m)).toEqual({ normal: seal, alarm, tamper: Infinity, "cable-open": Infinity, "cable-short": 0 });
    // Example values never claim manufacturer confirmation.
    expect(m.classification).not.toBe("manufacturer-confirmed");
  });

  it("panel-named examples are labelled as requiring verification, not as manufacturer specifications", async () => {
    const presets = await listEolPresets();
    for (const p of presets.filter((x) => x.kind === "manufacturer-example")) {
      expect(p.note).toMatch(/Not a manufacturer specification/);
      expect(TIER_LABELS[presetTier(p, false)]).toBe("Requires verification");
    }
    const generic = presets.find((p) => p.id === "generic-2k2-4k4")!;
    expect(TIER_LABELS[presetTier(generic, false)]).toBe("Generic training example");
    expect(TIER_LABELS[presetTier(generic, true)]).toBe("Technician-configured values");
  });

  it("formats open and short circuits explicitly", () => {
    expect(formatOhms(Infinity)).toBe("Open circuit");
    expect(formatOhms(0)).toBe("Short circuit (0 Ω)");
    expect(formatMeter(Infinity).value).toBe("OL");
    expect(formatMeter(0)).toEqual({ value: "0.0", unit: "Ω" });
  });
});

describe("virtual multimeter safety", () => {
  let n = 0;
  const W = (a: PointId, b: PointId): PlacedComponent => ({ id: `a${++n}`, kind: "wire", a, b });
  const R = (a: PointId, b: PointId, ohms: number): PlacedComponent => ({ id: `a${++n}`, kind: "resistor", ohms, a, b });
  const tecom = () => [W("panel-z", "alm-com"), R("alm-com", "alm-nc", 10000), R("alm-nc", "tmp-com", 10000), W("tmp-nc", "panel-com")];
  const value = (r: ReturnType<typeof measure>) => (r.status === "ok" ? `${r.value} ${r.unit}` : r.status);

  it("reads a 10k / 20k loop: sealed, alarm, tamper open, short ≈ 0 Ω", () => {
    expect(value(measure(tecom(), { red: "panel-z", black: "panel-com" }, "sealed"))).toBe("10.00 kΩ");
    expect(value(measure(tecom(), { red: "panel-z", black: "panel-com" }, "alarm"))).toBe("20.00 kΩ");
    expect(value(measure(tecom(), { red: "panel-z", black: "panel-com" }, "tamper"))).toBe("OL MΩ");
    expect(value(measure([...tecom(), W("panel-z", "panel-com")], { red: "panel-z", black: "panel-com" }, "sealed"))).toBe("0.0 Ω");
  });

  it("refuses resistance across supply terminals and never suggests measuring live", () => {
    const r = measure(tecom(), { red: "panel-aux-pos", black: "panel-com" }, "sealed");
    expect(r.status).toBe("blocked");
    expect(SUPPLY_WARNING).toMatch(/isolate power/);
    expect(SUPPLY_WARNING).not.toMatch(/measure resistance (while|when) (powered|live)/i);
  });
});
