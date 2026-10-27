import { describe, expect, it } from "vitest";
import { resistanceBetween, type Element } from "@/lib/eol/netlist";
import { classifyZoneReading, expectedReadings, OPEN_FROM, READING_TOLERANCE, shortBelow, zoneBands } from "@/lib/fault-finder/eol";

describe("expected readings come from the topology", () => {
  it("presets: equal and unequal resistor pairs", () => {
    expect(expectedReadings({ r1: 2200, r2: 2200 })).toMatchObject({ sealed: 2200, alarm: 4400, tamper: Infinity });
    expect(expectedReadings({ r1: 10000, r2: 10000 })).toMatchObject({ sealed: 10000, alarm: 20000 });
    // R1 sets the sealed reading; R2 only adds when the alarm contact opens — resistor order matters.
    expect(expectedReadings({ r1: 4700, r2: 2200 })).toMatchObject({ sealed: 4700, alarm: 6900 });
    expect(expectedReadings({ r1: 2200, r2: 4700 })).toMatchObject({ sealed: 2200, alarm: 6900 });
  });

  it("agrees with the independent netlist solver for the same wiring", () => {
    for (const [r1, r2] of [
      [2200, 2200],
      [4700, 2200],
      [1000, 6800],
      [3300, 12000],
    ] as const) {
      const net = (alarm: boolean, tamper: boolean): Element[] => [
        { kind: "switch", a: "z+", b: "n1", closed: !alarm },
        { kind: "resistor", a: "z+", b: "n1", ohms: r2 },
        { kind: "resistor", a: "n1", b: "n2", ohms: r1 },
        { kind: "switch", a: "n2", b: "z-", closed: !tamper },
      ];
      const ohms = (alarm: boolean, tamper: boolean) => {
        const r = resistanceBetween(net(alarm, tamper), "z+", "z-");
        return r.ok ? r.ohms : NaN;
      };
      const e = expectedReadings({ r1, r2 });
      expect(e.sealed).toBeCloseTo(ohms(false, false), 6);
      expect(e.alarm).toBeCloseTo(ohms(true, false), 6);
      expect(e.tamper).toBe(ohms(false, true));
    }
  });
});

describe("classifying a reading", () => {
  const cfg = { r1: 2200, r2: 2200 };
  it("respects tolerance boundaries (inclusive lower, exclusive upper)", () => {
    expect(READING_TOLERANCE).toBe(0.1);
    expect(classifyZoneReading(cfg, 1980)).toBe("sealed");
    expect(classifyZoneReading(cfg, 1979.9)).toBe("low");
    expect(classifyZoneReading(cfg, 2419.9)).toBe("sealed");
    expect(classifyZoneReading(cfg, 2420)).toBe("between");
    expect(classifyZoneReading(cfg, 3960)).toBe("alarm");
    expect(classifyZoneReading(cfg, 4839.9)).toBe("alarm");
    expect(classifyZoneReading(cfg, 4840)).toBe("high");
  });
  it("treats near-zero as short and very high or OL as open", () => {
    expect(shortBelow(2200)).toBe(55);
    expect(shortBelow(10000)).toBe(100); // capped
    expect(classifyZoneReading(cfg, 54.9)).toBe("short");
    expect(classifyZoneReading(cfg, 55)).toBe("low");
    expect(classifyZoneReading(cfg, OPEN_FROM - 1)).toBe("high");
    expect(classifyZoneReading(cfg, OPEN_FROM)).toBe("open");
    expect(classifyZoneReading(cfg, Infinity)).toBe("open");
    expect(classifyZoneReading(cfg, -1)).toBeNull();
  });
  it("the same reading means different things for different resistor pairs", () => {
    expect(classifyZoneReading({ r1: 4700, r2: 2200 }, 4700)).toBe("sealed");
    expect(classifyZoneReading({ r1: 2200, r2: 4700 }, 4700)).toBe("between");
    expect(classifyZoneReading({ r1: 2200, r2: 2200 }, 4700)).toBe("alarm");
    expect(classifyZoneReading({ r1: 10000, r2: 10000 }, 4700)).toBe("low");
  });
});

describe("unsupported or ambiguous configurations", () => {
  it("rejects values outside the supported range", () => {
    expect(zoneBands({ r1: 5, r2: 2200 })).toMatchObject({ ok: false, reason: expect.stringMatching(/R1/) });
    expect(zoneBands({ r1: 2200, r2: 220000 })).toMatchObject({ ok: false, reason: expect.stringMatching(/R2/) });
    expect(zoneBands({ r1: NaN, r2: 2200 }).ok).toBe(false);
  });
  it("rejects pairs whose sealed and alarm readings can't be told apart by measurement", () => {
    expect(zoneBands({ r1: 10000, r2: 470 })).toMatchObject({ ok: false, reason: expect.stringMatching(/can't reliably tell them apart/) });
    expect(classifyZoneReading({ r1: 10000, r2: 470 }, 10000)).toBeNull();
    expect(zoneBands({ r1: 1000, r2: 470 }).ok).toBe(true); // 1 kΩ vs 1.47 kΩ is distinguishable
  });
  it("bands tile 0 → OL without gaps", () => {
    const b = zoneBands({ r1: 4700, r2: 2200 });
    if (!b.ok) throw new Error(b.reason);
    for (let i = 1; i < b.bands.length; i++) expect(b.bands[i]!.min).toBe(b.bands[i - 1]!.max);
    expect(b.bands[0]!.min).toBe(0);
    expect(b.bands.at(-1)!.max).toBe(Infinity);
  });
});
