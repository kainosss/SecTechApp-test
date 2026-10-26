import { describe, expect, it } from "vitest";
import {
  CircuitError,
  OPEN_CIRCUIT,
  SHORT_CIRCUIT,
  circuitComponents,
  conductingComponents,
  formatOhms,
  networkResistance,
  parallelResistance,
  resistorCode,
  sameReading,
  seriesResistance,
  stateResistance,
} from "@/lib/eol/engine";
import { C, R, circuit, deolNetwork, deolStates, parallel, series, state } from "./fixtures";

const close = (actual: number, expected: number) => expect(actual).toBeCloseTo(expected, 6);

describe("series and parallel maths", () => {
  it("adds series resistances", () => {
    expect(seriesResistance([2200, 4700])).toBe(6900);
    expect(seriesResistance([1000])).toBe(1000);
  });

  it("combines parallel resistances as reciprocals", () => {
    close(parallelResistance([4700, 4700]), 2350);
    close(parallelResistance([1000, 2000, 2000]), 500);
    close(parallelResistance([2200, 4700]), (2200 * 4700) / (2200 + 4700));
  });

  it("propagates open and short circuits correctly", () => {
    expect(seriesResistance([1000, OPEN_CIRCUIT])).toBe(OPEN_CIRCUIT);
    expect(seriesResistance([SHORT_CIRCUIT, 1000])).toBe(1000);
    expect(parallelResistance([1000, SHORT_CIRCUIT])).toBe(SHORT_CIRCUIT);
    expect(parallelResistance([1000, OPEN_CIRCUIT])).toBe(1000);
    expect(parallelResistance([OPEN_CIRCUIT, OPEN_CIRCUIT])).toBe(OPEN_CIRCUIT);
    expect(parallelResistance([SHORT_CIRCUIT, OPEN_CIRCUIT])).toBe(SHORT_CIRCUIT);
  });

  it("rejects empty groups", () => {
    expect(() => seriesResistance([])).toThrow(CircuitError);
    expect(() => parallelResistance([])).toThrow(CircuitError);
  });
});

describe("dual EOL (alarm resistor across NC alarm contact, series EOL, series NC tamper)", () => {
  const c = circuit(deolNetwork(4700, 2200));
  const reading = (id: string) => stateResistance(c, deolStates.find((s) => s.id === id)!);

  it("reads the EOL value alone when sealed", () => expect(reading("normal")).toBe(4700));
  it("adds the alarm resistor when the alarm contact opens", () => expect(reading("alarm")).toBe(6900));
  it("reads open when the series tamper opens", () => expect(reading("tamper")).toBe(OPEN_CIRCUIT));
  it("reads open and short for cable faults", () => {
    expect(reading("cable-open")).toBe(OPEN_CIRCUIT);
    expect(reading("cable-short")).toBe(SHORT_CIRCUIT);
  });

  it("depends on the resistor values, not a fixed assumption", () => {
    const other = circuit(deolNetwork(2200, 2200));
    expect(stateResistance(other, deolStates[0]!)).toBe(2200);
    expect(stateResistance(other, deolStates[1]!)).toBe(4400);
  });

  it("handles a different DEOL topology (EOL across a series alarm contact + alarm resistor)", () => {
    const alt = circuit(parallel(R("RE", 4700, "end-of-line"), series(C("ALM"), R("RA", 4700, "alarm"))));
    close(stateResistance(alt, state("n", "normal", { ALM: "closed" })), 2350);
    expect(stateResistance(alt, state("a", "alarm", { ALM: "open" }))).toBe(4700);
  });

  it("highlights the conducting path: the closed alarm contact bypasses the alarm resistor", () => {
    expect([...conductingComponents(c.network, { ALM: "closed", TMP: "closed" })].sort()).toEqual(["ALM", "RE", "TMP"]);
    expect([...conductingComponents(c.network, { ALM: "open", TMP: "closed" })].sort()).toEqual(["RA", "RE", "TMP"]);
    expect(conductingComponents(c.network, { ALM: "closed", TMP: "open" }).size).toBe(0);
  });
});

describe("other arrangements", () => {
  it("NC with single series EOL", () => {
    const c = series(C("ALM"), R("R1", 2200));
    expect(networkResistance(c, { ALM: "closed" })).toBe(2200);
    expect(networkResistance(c, { ALM: "open" })).toBe(OPEN_CIRCUIT);
  });

  it("NO with parallel EOL", () => {
    const c = parallel(C("ALM", "NO"), R("R1", 2200));
    expect(networkResistance(c, { ALM: "open" })).toBe(2200);
    expect(networkResistance(c, { ALM: "closed" })).toBe(SHORT_CIRCUIT);
  });

  it("closed loop without EOL", () => {
    const c = series(C("ALM"), C("TMP", "NC", "tamper"));
    expect(networkResistance(c, { ALM: "closed", TMP: "closed" })).toBe(SHORT_CIRCUIT);
    expect(networkResistance(c, { ALM: "open", TMP: "closed" })).toBe(OPEN_CIRCUIT);
  });

  it("triple EOL style network with nested groups", () => {
    const c = series(parallel(C("ALM"), R("RA", 2200)), parallel(C("TMP", "NC", "tamper"), R("RT", 10000)), R("RE", 4700));
    expect(networkResistance(c, { ALM: "closed", TMP: "closed" })).toBe(4700);
    expect(networkResistance(c, { ALM: "open", TMP: "closed" })).toBe(6900);
    expect(networkResistance(c, { ALM: "closed", TMP: "open" })).toBe(14700);
    expect(networkResistance(c, { ALM: "open", TMP: "open" })).toBe(16900);
  });
});

describe("incomplete data", () => {
  it("refuses to calculate with an undocumented resistor value", () => {
    expect(() => networkResistance(series(C("ALM"), R("R1", null)), { ALM: "closed" })).toThrow(/R1 has no documented value/);
  });

  it("refuses to guess a contact position", () => {
    expect(() => networkResistance(deolNetwork(), { ALM: "closed" })).toThrow(/TMP has no position/);
  });

  it("does not need contact positions for cable faults", () => {
    expect(stateResistance(circuit(deolNetwork()), state("o", "cable-open", {}, "open"))).toBe(OPEN_CIRCUIT);
  });
});

describe("helpers", () => {
  it("lists components in order", () => {
    expect(circuitComponents(deolNetwork()).map((c) => c.id)).toEqual(["ALM", "RA", "RE", "TMP"]);
  });

  it("formats readings and resistor codes", () => {
    expect(formatOhms(6900)).toBe("6.9 kΩ");
    expect(formatOhms(2350)).toBe("2.35 kΩ");
    expect(formatOhms(470)).toBe("470 Ω");
    expect(formatOhms(OPEN_CIRCUIT)).toBe("Open circuit");
    expect(formatOhms(SHORT_CIRCUIT)).toBe("Short circuit (0 Ω)");
    expect(resistorCode(4700)).toBe("4k7");
    expect(resistorCode(2200)).toBe("2k2");
    expect(resistorCode(10000)).toBe("10k");
    expect(resistorCode(1500)).toBe("1k5");
    expect(resistorCode(470)).toBe("470R");
    expect(resistorCode(1_000_000)).toBe("1M");
  });

  it("compares readings with floating-point tolerance", () => {
    expect(sameReading(1 / (1 / 4700 + 1 / 4700), 2350)).toBe(true);
    expect(sameReading(OPEN_CIRCUIT, OPEN_CIRCUIT)).toBe(true);
    expect(sameReading(2350, 2351)).toBe(false);
  });
});

describe("Circuit Lab readiness", () => {
  it("recalculates when a learner toggles contacts or changes a resistor value (pure, no mutation)", async () => {
    const { circuitNodeSchema } = await import("@/lib/eol/model");
    const network = circuitNodeSchema.parse({
      kind: "series",
      children: [
        { kind: "parallel", children: [{ kind: "contact", id: "ALM", function: "alarm", type: "NC", location: { terminals: ["ALM", "ALM"], description: "Inside detector" } }, { kind: "resistor", id: "RA", ohms: 2200, role: "alarm" }] },
        { kind: "resistor", id: "RE", ohms: 4700, role: "end-of-line" },
      ],
    });
    expect(networkResistance(network, { ALM: "open" })).toBe(6900);
    const swapped = JSON.parse(JSON.stringify(network).replace('"ohms":2200', '"ohms":10000'));
    expect(networkResistance(swapped, { ALM: "open" })).toBe(14700);
    expect(networkResistance(network, { ALM: "open" })).toBe(6900);
  });
});
