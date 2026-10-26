import { describe, expect, it } from "vitest";
import { stateResistance } from "@/lib/eol/engine";
import type { Circuit } from "@/lib/eol/model";
import { buildWithStandardParts, solveForTargets, withResistorValues } from "@/lib/eol/solve";
import { isStandardValue, parseResistance, realise } from "@/lib/eol/standard-values";
import { C, R, circuit, deolNetwork, deolStates, parallel, series, state } from "./fixtures";

const deolAcross = circuit(deolNetwork(4700, 2200));
const deolParallel = circuit(series(C("TMP", "NC", "tamper"), parallel(R("RE", 4700, "end-of-line"), series(C("ALM"), R("RA", 4700, "alarm")))));
const triple = circuit(series(parallel(C("ALM"), R("RA", 1000, "alarm")), parallel(C("TMP", "NC", "tamper"), R("RT", 1000, "tamper")), R("RE", 1000, "end-of-line")));

const readings = (c: Circuit, values: Record<string, number>) => {
  const net = { ...c, network: withResistorValues(c.network, values) };
  return Object.fromEntries(deolStates.map((s) => [s.kind, stateResistance(net, s)]));
};

describe("solving for target readings with the engine", () => {
  it("2k2 sealed / 4k4 alarm on DEOL (alarm resistor across the contact) → 2k2 + 2k2", () => {
    const r = solveForTargets(deolAcross, deolStates, { normal: 2200, alarm: 4400 });
    expect(r.ok && r.values).toEqual({ RA: 2200, RE: 2200 });
    expect(readings(deolAcross, (r as { values: Record<string, number> }).values)).toMatchObject({ normal: 2200, alarm: 4400, tamper: Infinity, "cable-short": 0 });
  });

  it("10k sealed / 20k alarm on DEOL → 10k + 10k", () => {
    const r = solveForTargets(deolAcross, deolStates, { normal: 10000, alarm: 20000 });
    expect(r.ok && r.values).toEqual({ RA: 10000, RE: 10000 });
  });

  it("the alternative DEOL arrangement needs different resistors for the same targets", () => {
    const a = solveForTargets(deolParallel, deolStates, { normal: 2200, alarm: 4400 });
    expect(a.ok && a.values).toEqual({ RE: 4400, RA: 4400 });
    const t = solveForTargets(deolParallel, deolStates, { normal: 10000, alarm: 20000 });
    expect(t.ok && t.values).toEqual({ RE: 20000, RA: 20000 });
    expect(readings(deolParallel, (a as { values: Record<string, number> }).values)).toMatchObject({ normal: 2200, alarm: 4400 });
  });

  it("refuses targets an arrangement cannot produce", () => {
    const r = solveForTargets(deolAcross, deolStates, { normal: 4400, alarm: 2200 });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toMatch(/alarm reading must be higher than the sealed reading/);
  });

  it("asks for a tamper target when an arrangement has three resistors", () => {
    const r = solveForTargets(triple, deolStates, { normal: 2200, alarm: 4400 });
    expect(!r.ok && r.reason).toMatch(/needs 3 target readings \(add a tamper target\)/);
    const ok = solveForTargets(triple, deolStates, { normal: 2200, alarm: 4400, tamper: 6600 });
    expect(ok.ok && ok.values).toEqual({ RA: 2200, RT: 4400, RE: 2200 });
  });

  it("explains targets that an arrangement ignores (single EOL alarm always reads open)", () => {
    const single = circuit(series(C("ALM"), R("R1", 4700, "end-of-line")));
    const r = solveForTargets(single, [state("normal", "normal", { ALM: "closed" }), state("alarm", "alarm", { ALM: "open" })], { normal: 2200, alarm: 4400 });
    expect(r.ok && r.values).toEqual({ R1: 2200 });
    expect(r.notes.join(" ")).toMatch(/alarm state always reads open circuit/);
  });
});

describe("standard values and combinations", () => {
  it("recognises standard values and builds non-standard ones from standard parts", () => {
    expect(isStandardValue(2200)).toBe(true);
    expect(isStandardValue(4400)).toBe(false);
    expect(realise(2200)).toMatchObject({ parts: [2200], arrangement: "single", exact: true });
    expect(realise(4400)).toMatchObject({ parts: [2200, 2200], arrangement: "series", exact: true });
    expect(realise(20000)).toMatchObject({ parts: [20000], exact: true }); // E24 value
    expect(realise(5000)).toMatchObject({ parts: [10000, 10000], arrangement: "parallel", exact: true });
  });

  it("puts the standard parts into the circuit so the diagram shows real components, with the same readings", () => {
    const solved = withResistorValues(deolParallel.network, { RE: 4400, RA: 4400 });
    const built = buildWithStandardParts(solved);
    const ids: string[] = [];
    const walk = (n: typeof built): void => (n.kind === "resistor" ? void ids.push(`${n.id}=${n.ohms}`) : n.kind === "contact" ? undefined : n.children.forEach(walk));
    walk(built);
    expect(ids).toEqual(["REa=2200", "REb=2200", "RAa=2200", "RAb=2200"]);
    for (const s of deolStates) {
      expect(stateResistance({ ...deolParallel, network: built }, s)).toBeCloseTo(stateResistance({ ...deolParallel, network: solved }, s), 9);
    }
  });

  it("parses technician input and rejects invalid values", () => {
    expect(parseResistance("4k7")).toBe(4700);
    expect(parseResistance("4.7k")).toBe(4700);
    expect(parseResistance("4.7 kΩ")).toBe(4700);
    expect(parseResistance("2200")).toBe(2200);
    expect(parseResistance("470R")).toBe(470);
    expect(parseResistance("1M")).toBe(1_000_000);
    expect(parseResistance("10 kohm")).toBe(10000);
    for (const bad of ["", "abc", "-100", "0", "5", "4k7k", "1e9", "20M"]) expect(parseResistance(bad), bad).toBeNull();
  });
});
