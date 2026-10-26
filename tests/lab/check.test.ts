import { describe, expect, it } from "vitest";
import { EMPTY_BENCH, benchReducer, type PlacedComponent, type PointId } from "@/lib/lab/bench";
import { checkWiring, readingsFor, stepStatus } from "@/lib/lab/check";

let n = 0;
const W = (a: PointId, b: PointId): PlacedComponent => ({ id: `c${++n}`, kind: "wire", a, b });
const R = (a: PointId, b: PointId, ohms = 2200): PlacedComponent => ({ id: `c${++n}`, kind: "resistor", ohms, a, b });

/** The guided arrangement: Z1 → ALM COM; R2 across ALM COM–NC; R1 ALM NC → TMP COM; TMP NC → COM. */
const correct = () => [W("panel-z", "alm-com"), R("alm-com", "alm-nc"), R("alm-nc", "tmp-com"), W("tmp-nc", "panel-com")];
const readings = (c: PlacedComponent[]) => Object.fromEntries(readingsFor(c).map((r) => [r.kind, r.ohms]));
const codes = (c: PlacedComponent[]) => checkWiring(c).findings.map((f) => f.code);

describe("correct 2k2 / 4k4 dual EOL wiring", () => {
  it("reads 2.2 kΩ sealed, 4.4 kΩ alarm, open on tamper and cut cable, 0 Ω on cable short", () => {
    expect(readings(correct())).toEqual({ sealed: 2200, alarm: 4400, tamper: Infinity, "cable-open": Infinity, "cable-short": 0 });
    const result = checkWiring(correct());
    expect(result.correct).toBe(true);
    expect(result.findings.map((f) => f.code)).toEqual(["correct"]);
  });

  it("accepts electrically equivalent arrangements and says so", () => {
    // R1 fitted in the cable at the panel end via joint J1, tamper first in the loop.
    const viaJoint = [R("panel-z", "j1"), W("j1", "tmp-nc"), W("tmp-com", "alm-com"), R("alm-com", "alm-nc"), W("alm-nc", "panel-com")];
    const result = checkWiring(viaJoint);
    expect(result.correct).toBe(true);
    expect(result.findings.map((f) => f.code)).toEqual(["correct", "equivalent"]);
    // Resistor leads reversed are the same circuit (no "equivalent" note needed).
    const reversed = [W("alm-com", "panel-z"), R("alm-nc", "alm-com"), R("tmp-com", "alm-nc"), W("panel-com", "tmp-nc")];
    expect(checkWiring(reversed).findings.map((f) => f.code)).toEqual(["correct"]);
  });
});

describe("mistakes are diagnosed from the circuit's behaviour", () => {
  it("missing series resistor", () => {
    const c = [W("panel-z", "alm-com"), R("alm-com", "alm-nc"), W("alm-nc", "tmp-com"), W("tmp-nc", "panel-com")];
    expect(readings(c)).toMatchObject({ sealed: 0, alarm: 2200 });
    expect(codes(c)).toContain("missing-series-resistor");
  });

  it("missing alarm shunt resistor (alarm opens the loop)", () => {
    const c = [W("panel-z", "alm-com"), R("alm-nc", "tmp-com"), W("tmp-nc", "panel-com")];
    expect(readings(c)).toMatchObject({ sealed: 2200, alarm: Infinity });
    expect(codes(c)).toContain("missing-alarm-resistor");
  });

  it("both resistors in series (R2 not across the alarm contact)", () => {
    const c = [R("panel-z", "j1"), R("j1", "alm-com"), W("alm-nc", "tmp-com"), W("tmp-nc", "panel-com")];
    expect(readings(c)).toMatchObject({ sealed: 4400, alarm: Infinity });
    expect(codes(c)).toEqual(expect.arrayContaining(["missing-alarm-resistor", "wrong-sealed"]));
    expect(checkWiring(c).correct).toBe(false);
  });

  it("tamper contact bypassed by a wire, or left out of the loop", () => {
    expect(codes([...correct(), W("tmp-com", "tmp-nc")])).toContain("tamper-bypassed");
    const outOfLoop = [W("panel-z", "alm-com"), R("alm-com", "alm-nc"), R("alm-nc", "panel-com")];
    expect(readings(outOfLoop)).toMatchObject({ sealed: 2200, alarm: 4400, tamper: 2200 });
    expect(codes(outOfLoop)).toContain("tamper-not-in-loop");
  });

  it("alarm contact bypassed", () => {
    const c = [...correct(), W("alm-com", "alm-nc")];
    expect(codes(c)).toContain("alarm-not-in-loop");
  });

  it("incorrect resistor value", () => {
    const c = [W("panel-z", "alm-com"), R("alm-com", "alm-nc", 4700), R("alm-nc", "tmp-com"), W("tmp-nc", "panel-com")];
    expect(readings(c)).toMatchObject({ sealed: 2200, alarm: 6900 });
    const f = checkWiring(c).findings.find((x) => x.code === "wrong-resistor-value");
    expect(f?.title).toMatch(/R1 is 4.7 kΩ/);
  });

  it("incomplete zone loop and unconnected zone terminals", () => {
    const c = [W("panel-z", "alm-com"), R("alm-com", "alm-nc"), R("alm-nc", "tmp-com")];
    expect(codes(c)).toEqual(expect.arrayContaining(["zone-not-connected", "incomplete-loop"]));
  });

  it("direct short across the zone", () => {
    expect(codes([...correct(), W("panel-z", "panel-com")])).toContain("direct-short");
    expect(readings([W("panel-z", "panel-com")]).sealed).toBe(0);
  });

  it("resistor connected to the detector power terminals", () => {
    const c = [...correct().slice(0, 3), W("tmp-nc", "panel-com"), R("det-12v", "det-0v")];
    const f = checkWiring(c).findings.find((x) => x.code === "power-terminal");
    expect(f?.title).toMatch(/R3 is connected to the detector's power terminals/);
    expect(checkWiring(c).correct).toBe(false); // zone readings are right, but the mistake still fails the check
  });

  it("flags components that change no reading (dangling)", () => {
    const c = [...correct(), R("j1", "j2")];
    expect(codes(c)).toContain("no-effect");
    expect(checkWiring(c).findings.find((f) => f.code === "no-effect")?.severity).toBe("warning");
  });

  it("never calls an empty bench correct", () => {
    expect(checkWiring([]).correct).toBe(false);
    expect(codes([])).toEqual(["empty"]);
  });
});

describe("bench reducer", () => {
  it("places, removes, undoes and resets", () => {
    let s = benchReducer(EMPTY_BENCH, { type: "place", kind: "wire", a: "panel-z", b: "alm-com" });
    s = benchReducer(s, { type: "place", kind: "resistor", ohms: 2200, a: "alm-com", b: "alm-nc" });
    expect(s.components.map((c) => c.id)).toEqual(["c1", "c2"]);
    s = benchReducer(s, { type: "remove", id: "c1" });
    expect(s.components.map((c) => c.id)).toEqual(["c2"]);
    s = benchReducer(s, { type: "undo" });
    expect(s.components.map((c) => c.id)).toEqual(["c1", "c2"]);
    s = benchReducer(s, { type: "reset" });
    expect(s.components).toEqual([]);
    s = benchReducer(s, { type: "undo" });
    expect(s.components).toHaveLength(2); // reset can be undone
  });

  it("repositions a component, keeping its identity, and the move can be undone", () => {
    let s = benchReducer(EMPTY_BENCH, { type: "place", kind: "resistor", ohms: 2200, a: "alm-com", b: "tmp-com" });
    s = benchReducer(s, { type: "move", id: "c1", a: "alm-nc", b: "tmp-com" });
    expect(s.components).toEqual([{ id: "c1", kind: "resistor", ohms: 2200, a: "alm-nc", b: "tmp-com" }]);
    expect(benchReducer(s, { type: "move", id: "c1", a: "det-12v", b: "panel-aux-pos" })).toBe(s);
    s = benchReducer(s, { type: "undo" });
    expect(s.components[0]).toMatchObject({ a: "alm-com", b: "tmp-com" });
  });

  it("rejects invalid placements", () => {
    expect(benchReducer(EMPTY_BENCH, { type: "place", kind: "wire", a: "alm-com", b: "alm-com" })).toBe(EMPTY_BENCH);
    expect(benchReducer(EMPTY_BENCH, { type: "place", kind: "wire", a: "panel-aux-pos", b: "det-12v" })).toBe(EMPTY_BENCH);
    expect(benchReducer(EMPTY_BENCH, { type: "place", kind: "resistor", a: "alm-com", b: "alm-nc" })).toBe(EMPTY_BENCH);
  });
});

describe("guided steps follow the circuit, not a drawing", () => {
  const ctx = { reviewedTerminals: true, lastCheckCorrect: false };
  it("progresses as the circuit is built, in any equivalent way", () => {
    expect(stepStatus([], ctx)).toMatchObject({ tamper: false, r1: false, r2: false, loop: false });
    expect(stepStatus([W("tmp-nc", "panel-com")], ctx).tamper).toBe(true);
    expect(stepStatus([W("tmp-nc", "j2"), W("j2", "panel-com")], ctx).tamper).toBe(true); // via a joint
    expect(stepStatus([R("alm-nc", "tmp-com")], ctx)).toMatchObject({ r1: true, r2: false });
    expect(stepStatus([R("alm-com", "alm-nc")], ctx)).toMatchObject({ r1: false, r2: true });
    expect(stepStatus([R("alm-com", "j1"), W("j1", "alm-nc")], ctx).r2).toBe(true); // across the contact via a joint
    expect(stepStatus(correct(), ctx).loop).toBe(true);
    expect(stepStatus([R("det-12v", "det-0v")], ctx).r1).toBe(false); // on power terminals: not R1
  });
});
