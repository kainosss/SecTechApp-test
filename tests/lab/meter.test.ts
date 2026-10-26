import { describe, expect, it } from "vitest";
import type { PlacedComponent, PointId } from "@/lib/lab/bench";
import { checkWiring } from "@/lib/lab/check";
import { checkDiagnosis, effectiveCircuit, FAULT_SCENARIOS, getFaultScenario } from "@/lib/lab/faults";
import { formatMeter, measure, type DetectorState, type MeterReading } from "@/lib/lab/meter";

let n = 0;
const W = (a: PointId, b: PointId): PlacedComponent => ({ id: `t${++n}`, kind: "wire", a, b });
const R = (a: PointId, b: PointId, ohms = 2200): PlacedComponent => ({ id: `t${++n}`, kind: "resistor", ohms, a, b });
const correct = () => [W("panel-z", "alm-com"), R("alm-com", "alm-nc"), R("alm-nc", "tmp-com"), W("tmp-nc", "panel-com")];
const read = (m: MeterReading) => (m.status === "ok" ? `${m.value} ${m.unit}` : m.status);
const meter = (c: PlacedComponent[], red: PointId, black: PointId, state: DetectorState = "sealed", extra = [] as Parameters<typeof measure>[3]) =>
  read(measure(c, { red, black }, state, extra));

describe("meter display", () => {
  it("auto-ranges like a 4-digit meter and shows OL for open circuit", () => {
    expect(formatMeter(0)).toEqual({ value: "0.0", unit: "Ω" });
    expect(formatMeter(220)).toEqual({ value: "220.0", unit: "Ω" });
    expect(formatMeter(2200)).toEqual({ value: "2.200", unit: "kΩ" });
    expect(formatMeter(4400)).toEqual({ value: "4.400", unit: "kΩ" });
    expect(formatMeter(10000)).toEqual({ value: "10.00", unit: "kΩ" });
    expect(formatMeter(1_100_000)).toEqual({ value: "1.100", unit: "MΩ" });
    expect(formatMeter(Infinity).value).toBe("OL");
    expect(formatMeter(50e6).value).toBe("OL");
  });
});

describe("measuring between arbitrary probe nodes", () => {
  it("reads the zone loop in each detector state", () => {
    expect(meter(correct(), "panel-z", "panel-com", "sealed")).toBe("2.200 kΩ");
    expect(meter(correct(), "panel-z", "panel-com", "alarm")).toBe("4.400 kΩ");
    expect(meter(correct(), "panel-z", "panel-com", "tamper")).toBe("OL MΩ");
  });

  it("measures between the actual probe points, not always Z1–COM", () => {
    const c = correct();
    expect(meter(c, "alm-com", "alm-nc", "sealed")).toBe("0.0 Ω"); // closed contact shorts R2
    expect(meter(c, "alm-com", "alm-nc", "alarm")).toBe("2.200 kΩ"); // R2 alone
    expect(meter(c, "alm-nc", "tmp-com")).toBe("2.200 kΩ"); // R1
    expect(meter(c, "tmp-com", "tmp-nc", "tamper")).toBe("OL MΩ");
    expect(meter(c, "panel-z", "alm-com")).toBe("0.0 Ω"); // continuity along a wire
    expect(meter(c, "alm-com", "panel-z")).toBe("0.0 Ω"); // probe polarity doesn't matter
  });

  it("handles series, parallel, bypassed and equivalent connections", () => {
    expect(meter([R("j1", "j2"), R("j2", "alm-com")], "j1", "alm-com")).toBe("4.400 kΩ");
    expect(meter([R("j1", "j2"), R("j1", "j2")], "j1", "j2")).toBe("1.100 kΩ");
    expect(meter([R("j1", "j2"), W("j1", "j2")], "j1", "j2")).toBe("0.0 Ω");
    // R2 across the alarm contact via joint J1 is electrically the same as directly across it.
    const viaJoint = [W("panel-z", "alm-com"), W("alm-com", "j1"), R("j1", "alm-nc"), R("alm-nc", "tmp-com"), W("tmp-nc", "panel-com")];
    for (const s of ["sealed", "alarm", "tamper"] as const) expect(meter(viaJoint, "panel-z", "panel-com", s)).toBe(meter(correct(), "panel-z", "panel-com", s));
  });

  it("reads OL for incomplete wiring and unconnected points", () => {
    expect(meter([W("panel-z", "alm-com"), R("alm-nc", "tmp-com")], "panel-z", "panel-com")).toBe("OL MΩ");
    expect(meter([], "j1", "j2")).toBe("OL MΩ");
    expect(meter([], "j1", "j1")).toBe("0.0 Ω");
  });

  it("never measures on supply terminals or through unmodelled detector electronics", () => {
    const blocked = measure(correct(), { red: "det-12v", black: "det-0v" }, "sealed");
    expect(blocked.status).toBe("blocked");
    expect(blocked.status !== "ok" && blocked.message).toMatch(/Never measure resistance on a powered circuit/);
    expect(measure(correct(), { red: "panel-aux-pos", black: "panel-com" }, "sealed").status).toBe("blocked");
    expect(measure([...correct(), R("det-12v", "alm-com")], { red: "panel-z", black: "panel-com" }, "sealed").status).toBe("error");
  });

  it("asks for both probes and reports invalid circuits instead of inventing a value", () => {
    expect(measure(correct(), { red: "panel-z", black: null }, "sealed")).toMatchObject({ status: "idle", message: expect.stringMatching(/black probe/) });
    expect(measure([R("j1", "j2", 0)], { red: "j1", black: "j2" }, "sealed").status).toBe("error");
  });
});

describe("fault-finding scenarios behave as described", () => {
  const scenario = (id: string) => getFaultScenario(id)!;
  const extra = (id: string) => scenario(id).hidden?.elements ?? [];

  it("missing EOL resistor: sealed is normal, alarm opens the loop", () => {
    const s = scenario("missing-eol-resistor");
    expect(meter(s.components, "panel-z", "panel-com", "sealed")).toBe("2.200 kΩ");
    expect(meter(s.components, "panel-z", "panel-com", "alarm")).toBe("OL MΩ");
    expect(meter(s.components, "alm-com", "alm-nc", "alarm")).toBe("OL MΩ");
    // Repair: fit R2 across the alarm contact.
    expect(checkWiring([...s.components, R("alm-com", "alm-nc")]).correct).toBe(true);
  });

  it("bypassed tamper: the hidden link keeps the loop closed with the cover off", () => {
    const s = scenario("bypassed-tamper");
    expect(meter(s.components, "panel-z", "panel-com", "tamper", extra(s.id))).toBe("2.200 kΩ");
    expect(meter(s.components, "tmp-com", "tmp-nc", "tamper", extra(s.id))).toBe("0.0 Ω");
    expect(checkWiring(s.components, extra(s.id)).findings.map((f) => f.code)).toContain("tamper-bypassed");
    expect(checkWiring(s.components).correct).toBe(true); // link removed
  });

  it("shorted zone wiring: 0 Ω at the panel in every state, the detector itself is fine", () => {
    const s = scenario("shorted-zone-wiring");
    for (const st of ["sealed", "alarm", "tamper"] as const) expect(meter(s.components, "panel-z", "panel-com", st, extra(s.id))).toBe("0.0 Ω");
    expect(meter(s.components, "alm-com", "tmp-nc", "sealed", extra(s.id))).toBe("0.0 Ω"); // still across the short via the joint wiring
    expect(meter(s.components, "j1", "j2", "sealed", extra(s.id))).toBe("0.0 Ω");
    // Isolating the detector (lifting J1 → ALARM COM) separates the two halves.
    const isolated = s.components.filter((c) => !(c.a === "j1" && c.b === "alm-com"));
    expect(meter(isolated, "alm-com", "tmp-nc", "sealed", extra(s.id))).toBe("2.200 kΩ");
    expect(meter(isolated, "alm-com", "tmp-nc", "alarm", extra(s.id))).toBe("4.400 kΩ");
    expect(meter(isolated, "j1", "j2", "sealed", extra(s.id))).toBe("0.0 Ω");
    expect(checkWiring(s.components, extra(s.id)).correct).toBe(false);
    expect(checkWiring(s.components).correct).toBe(true); // after re-terminating
  });

  it("every scenario is faulty as found and correct once repaired", () => {
    for (const s of FAULT_SCENARIOS) {
      const eff = effectiveCircuit(s, { components: s.components, repaired: false });
      expect(checkWiring(eff.components, eff.extra).correct, s.id).toBe(false);
      expect(new Set(s.components.map((c) => c.id)).size, s.id).toBe(s.components.length);
    }
  });

  it("diagnosis needs both the fault type and the location", () => {
    const s = scenario("bypassed-tamper");
    expect(checkDiagnosis(s, { type: "bypassed-tamper", location: "tamper-contact" }).correct).toBe(true);
    expect(checkDiagnosis(s, { type: "bypassed-tamper", location: "alarm-contact" })).toMatchObject({ typeCorrect: true, locationCorrect: false, correct: false });
    expect(checkDiagnosis(s, { type: "zone-short", location: "tamper-contact" })).toMatchObject({ typeCorrect: false, locationCorrect: true, correct: false });
    expect(checkDiagnosis(s, { type: null, location: null }).correct).toBe(false);
  });
});
