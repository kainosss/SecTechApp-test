import { describe, expect, it } from "vitest";
import type { PlacedComponent, PointId } from "@/lib/lab/bench";
import { checkWiring } from "@/lib/lab/check";
import { checkDiagnosis, effectiveCircuit, FAULT_SCENARIOS, faultTypesShown, getFaultScenario, resistorsAt } from "@/lib/lab/faults";
import { measure, type MeterReading } from "@/lib/lab/meter";

const read = (m: MeterReading) => (m.status === "ok" ? `${m.value} ${m.unit}` : m.status);
const scenario = (id: string) => getFaultScenario(id)!;
/** Meter reading on a scenario as found (or repaired). */
const probe = (id: string, red: PointId, black: PointId, state: "sealed" | "alarm" | "tamper" = "sealed", components?: PlacedComponent[], repaired = false) => {
  const s = scenario(id);
  const eff = effectiveCircuit(s, { components: components ?? s.components, repaired });
  return read(measure(eff.components, { red, black }, state, eff.extra));
};

describe("open circuit exercise", () => {
  const id = "open-circuit";
  it("reads OL in every state and the broken conductor is found by continuity testing", () => {
    for (const st of ["sealed", "alarm", "tamper"] as const) expect(probe(id, "panel-z", "panel-com", st)).toBe("OL MΩ");
    expect(probe(id, "panel-z", "j1")).toBe("0.0 Ω"); // good conductor
    expect(probe(id, "panel-com", "j2")).toBe("0.0 Ω");
    expect(probe(id, "alm-com", "tmp-nc")).toBe("2.200 kΩ"); // detector itself is fine
    expect(probe(id, "j2", "tmp-nc")).toBe("OL MΩ"); // broken conductor
  });

  it("is repaired either by the repair action or by re-running the wire", () => {
    const s = scenario(id);
    expect(probe(id, "panel-z", "panel-com", "sealed", undefined, true)).toBe("2.200 kΩ");
    // Remove the broken conductor and run a new one.
    const rewired: PlacedComponent[] = [...s.components.filter((c) => c.id !== "c5"), { id: "c99", kind: "wire", a: "tmp-nc", b: "j2" }];
    const eff = effectiveCircuit(s, { components: rewired, repaired: false });
    expect(checkWiring(eff.components, eff.extra).correct).toBe(true);
  });

  it("diagnosis is checked against the circuit", () => {
    const s = scenario(id);
    expect(faultTypesShown(effectiveCircuit(s, { components: s.components, repaired: false }).components)).toEqual(new Set(["open-circuit"]));
    expect(checkDiagnosis(s, { type: "open-circuit", location: "cable-detector" }).correct).toBe(true);
    expect(checkDiagnosis(s, { type: "open-circuit", location: "cable-panel" }).correct).toBe(false);
    expect(checkDiagnosis(s, { type: "zone-short", location: "cable-detector" }).correct).toBe(false);
    // Once repaired, there's no fault left to diagnose.
    expect(checkDiagnosis(s, { type: "open-circuit", location: "cable-detector" }, { components: s.components, repaired: true })).toMatchObject({ faultPresent: false, correct: false });
  });
});

describe("incorrect resistor value exercise", () => {
  const id = "wrong-resistor-value";
  it("readings follow the wrong value and each resistor can be measured on its own", () => {
    expect(probe(id, "panel-z", "panel-com", "sealed")).toBe("4.700 kΩ");
    expect(probe(id, "panel-z", "panel-com", "alarm")).toBe("6.900 kΩ");
    expect(probe(id, "alm-nc", "tmp-com")).toBe("4.700 kΩ"); // R1 alone (zone disconnected from the panel)
    expect(probe(id, "alm-com", "alm-nc", "sealed")).toBe("0.0 Ω"); // R2 shorted by the closed contact
    expect(probe(id, "alm-com", "alm-nc", "alarm")).toBe("2.200 kΩ");
  });

  it("requires the component and the value actually fitted", () => {
    const s = scenario(id);
    expect(resistorsAt(s.components, "series").map((c) => c.ohms)).toEqual([4700]);
    expect(checkDiagnosis(s, { type: "wrong-value", location: "series", value: 4700 })).toMatchObject({ correct: true, valueCorrect: true, actualValue: 4700 });
    expect(checkDiagnosis(s, { type: "wrong-value", location: "series", value: 10000 })).toMatchObject({ correct: false, valueCorrect: false });
    expect(checkDiagnosis(s, { type: "wrong-value", location: "alarm-contact", value: 4700 }).correct).toBe(false);
    expect(checkDiagnosis(s, { type: "wrong-value", location: "series", value: null }).correct).toBe(false);
  });

  it("is repaired by replacing R1 with 2k2, verified in every state", () => {
    const s = scenario(id);
    const fixed: PlacedComponent[] = s.components.map((c) => (c.ohms === 4700 ? { ...c, ohms: 2200 } : c));
    const result = checkWiring(fixed);
    expect(result.correct).toBe(true);
    expect(result.readings.every((r) => r.matches)).toBe(true);
    // A diagnosis of the repaired circuit is not accepted: the value is now 2k2 and no fault remains.
    expect(checkDiagnosis(s, { type: "wrong-value", location: "series", value: 4700 }, { components: fixed, repaired: false }).correct).toBe(false);
  });
});

describe("every exercise", () => {
  it("as found shows exactly the fault type it teaches, and is correct once repaired", () => {
    for (const s of FAULT_SCENARIOS) {
      const found = effectiveCircuit(s, { components: s.components, repaired: false });
      expect(faultTypesShown(found.components, found.extra).has(s.answer.type), s.id).toBe(true);
      if (s.hidden) {
        const fixed = effectiveCircuit(s, { components: s.components, repaired: true });
        expect(checkWiring(fixed.components, fixed.extra).correct, s.id).toBe(true);
      }
    }
  });

  it("accepts the right diagnosis only with the fault still present", () => {
    for (const s of FAULT_SCENARIOS) {
      const value = s.answer.value ? resistorsAt(s.components, s.answer.location)[0]!.ohms : undefined;
      expect(checkDiagnosis(s, { ...s.answer, value }).correct, s.id).toBe(true);
    }
  });
});
