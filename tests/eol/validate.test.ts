import { describe, expect, it } from "vitest";
import type { Source, WiringConfiguration } from "@/lib/content/schema";
import type { CircuitState, DocumentedReading } from "@/lib/eol/model";
import { analyseCircuit, compareWithDocumented, wiringVerificationGaps } from "@/lib/eol/validate";
import { C, R, circuit, cited, deolNetwork, deolStates, parallel, series, state } from "./fixtures";

const codes = (a: ReturnType<typeof analyseCircuit>) => a.diagnostics.map((d) => d.code);
const deol = (states: CircuitState[] = deolStates, network = deolNetwork()) =>
  analyseCircuit({ circuit: circuit(network), states, inputType: "double-eol" });

describe("structural validation", () => {
  it("accepts a complete DEOL circuit without errors", () => {
    const a = deol();
    expect(a.hasErrors).toBe(false);
    expect(a.states.map((s) => s.ohms)).toEqual([4700, 6900, Infinity, Infinity, 0]);
  });

  it("reports missing resistor values and does not calculate", () => {
    const a = deol(deolStates, series(parallel(C("ALM"), R("RA", null, "alarm")), R("RE", 4700), C("TMP", "NC", "tamper")));
    expect(codes(a)).toContain("resistor-value-missing");
    expect(a.states.find((s) => s.id === "alarm")?.agreement).toBe("not-calculated");
  });

  it("reports undefined contact positions instead of guessing", () => {
    const a = deol([state("normal", "normal", { ALM: "closed" }), ...deolStates.slice(1)]);
    expect(a.diagnostics.find((d) => d.code === "contact-position-missing")?.message).toMatch(/TMP/);
    expect(a.hasErrors).toBe(true);
  });

  it("reports unknown components, duplicates, empty groups and missing states", () => {
    expect(codes(deol([...deolStates, state("x", "other", { ALM: "open", TMP: "closed", NOPE: "open" })]))).toContain("unknown-component");
    expect(codes(deol(deolStates, series(R("R1", 1000), R("R1", 1000), C("ALM"), C("TMP", "NC", "tamper"))))).toContain("duplicate-component");
    expect(codes(deol(deolStates, series(parallel(), C("ALM"), C("TMP", "NC", "tamper"))))).toContain("empty-group");
    expect(codes(deol(deolStates.filter((s) => s.kind !== "alarm")))).toContain("missing-state");
    expect(codes(deol([...deolStates, deolStates[0]!]))).toContain("duplicate-state");
  });

  it("warns when recommended states or the expected resistor count are missing", () => {
    const a = deol(deolStates.filter((s) => s.kind !== "cable-short"));
    expect(codes(a)).toContain("recommended-state-missing");
    const single = analyseCircuit({ circuit: circuit(deolNetwork()), states: deolStates, inputType: "single-eol" });
    expect(codes(single)).toContain("input-type-mismatch");
  });
});

describe("state overlaps", () => {
  it("warns (does not error) when two states read the same, and blocks verification", () => {
    const a = deol();
    const overlap = a.diagnostics.find((d) => d.code === "state-overlap");
    expect(overlap?.severity).toBe("warning");
    expect(overlap?.stateIds).toEqual(["tamper", "cable-open"]);
    expect(a.hasErrors).toBe(false);
    expect(a.readyForVerification).toBe(false);
  });

  it("accepts the overlap when the manufacturer documents that the panel reports both the same way", () => {
    const doc = (panelReports: string): DocumentedReading => ({ panelReports, maxOhms: null, minOhms: 100000, sourceRefs: [] });
    const states = deolStates.map((s) => (s.kind === "tamper" || s.kind === "cable-open" ? { ...s, documented: doc("Tamper") } : s));
    const a = deol(states);
    expect(codes(a)).not.toContain("state-overlap");
    expect(codes(a)).toContain("state-overlap-documented");
  });
});

describe("documented cross-check", () => {
  it("agrees within the documented tolerance, else the default 1%", () => {
    expect(compareWithDocumented(6900, { nominalOhms: 6900, sourceRefs: [] })).toBe("agrees");
    expect(compareWithDocumented(6900, { nominalOhms: 6950, sourceRefs: [] })).toBe("agrees");
    expect(compareWithDocumented(6900, { nominalOhms: 7100, sourceRefs: [] })).toBe("disagrees");
    expect(compareWithDocumented(6900, { nominalOhms: 7100, tolerancePercent: 5, sourceRefs: [] })).toBe("agrees");
  });

  it("checks threshold bands, open circuits and shorts", () => {
    expect(compareWithDocumented(4700, { minOhms: 3000, maxOhms: 5500, sourceRefs: [] })).toBe("agrees");
    expect(compareWithDocumented(6900, { minOhms: 3000, maxOhms: 5500, sourceRefs: [] })).toBe("disagrees");
    expect(compareWithDocumented(Infinity, { minOhms: 20000, maxOhms: null, sourceRefs: [] })).toBe("agrees");
    expect(compareWithDocumented(Infinity, { nominalOhms: 4700, sourceRefs: [] })).toBe("disagrees");
    expect(compareWithDocumented(0, { nominalOhms: 0, sourceRefs: [] })).toBe("agrees");
    expect(compareWithDocumented(4700, { panelReports: "Sealed", sourceRefs: [] })).toBe("undocumented");
    expect(compareWithDocumented(4700, undefined)).toBe("undocumented");
  });

  it("turns a documented mismatch into an error", () => {
    const states = deolStates.map((s) => (s.kind === "alarm" ? { ...s, documented: { nominalOhms: 9400, sourceRefs: [] } } : s));
    const a = deol(states);
    expect(a.diagnostics.find((d) => d.code === "documented-mismatch")?.message).toMatch(/Alarm: calculated 6.9 kΩ/);
  });
});

describe("verification gaps (mathematically correct is not enough)", () => {
  const manual: Source = { id: "manual", title: "Panel manual", publisher: "Co", documentType: "installation-manual", documentRevision: "Rev 3", isDemo: false };
  const ref = [{ sourceId: "manual", locator: "p. 12" }];
  const documented = (reading: Partial<DocumentedReading>, reports: string): DocumentedReading => ({ ...reading, panelReports: reports, sourceRefs: ref });

  const fullyDocumented: WiringConfiguration = {
    id: "cfg",
    title: "Panel DEOL",
    summary: "s",
    panelDeviceId: "panel",
    panelHardwareRevisions: ["Rev B"],
    panelFirmwareRevisions: ["4.2"],
    inputType: "double-eol",
    arrangement: { key: "nc-alarm-nc-tamper", label: "NC alarm + NC tamper" },
    circuit: {
      terminals: { a: { label: "Z1", sourceRefs: ref }, b: { label: "0V", sourceRefs: ref } },
      network: series(
        parallel(cited(C("ALM"), ref), cited(R("RA", 2200, "alarm"), ref)),
        cited(R("RE", 4700, "end-of-line"), ref),
        cited(C("TMP", "NC", "tamper"), ref),
      ),
    },
    states: [
      { ...deolStates[0]!, documented: documented({ nominalOhms: 4700 }, "Sealed") },
      { ...deolStates[1]!, documented: documented({ nominalOhms: 6900 }, "Alarm") },
      { ...deolStates[2]!, documented: documented({ minOhms: 20000, maxOhms: null }, "Tamper") },
      { ...deolStates[3]!, documented: documented({ minOhms: 20000, maxOhms: null }, "Tamper") },
      { ...deolStates[4]!, documented: documented({ maxOhms: 500 }, "Tamper") },
    ],
    interpretation: { text: "Documented", sourceRefs: ref },
    appliesToDeviceIds: [],
    appliesToVariants: [],
    isDemo: false,
    verification: { status: "verified" },
    sourceRefs: ref,
    appliesToRevisions: ["Rev B"],
    updatedAt: "2026-10-01",
  };
  const gaps = (c: WiringConfiguration) => wiringVerificationGaps(c, analyseCircuit(c), (id) => (id === "manual" ? manual : undefined));

  it("has no gaps when every element is documented and the calculation agrees", () => {
    expect(gaps(fullyDocumented)).toEqual([]);
  });

  it("lists every missing piece of evidence for an undocumented but mathematically valid circuit", () => {
    const bare: WiringConfiguration = {
      ...fullyDocumented,
      panelHardwareRevisions: [],
      panelFirmwareRevisions: [],
      circuit: circuit(deolNetwork()),
      states: deolStates,
      interpretation: undefined,
    };
    const g = gaps(bare);
    expect(g).toEqual(
      expect.arrayContaining([
        "panel hardware/firmware revisions not identified",
        "panel terminal assignments not documented",
        "resistor RA value/placement not documented",
        "contact ALM behaviour not documented",
        "Normal: no documented reading that the calculation matches",
        "how the panel interprets the states is not documented",
      ]),
    );
    expect(g.some((x) => x.startsWith("unresolved:") && x.includes("Tamper and Cable open"))).toBe(true);
  });

  it("blocks when the calculation disagrees with the documented value", () => {
    const wrong = { ...fullyDocumented, states: fullyDocumented.states.map((s) => (s.kind === "alarm" ? { ...s, documented: documented({ nominalOhms: 9400 }, "Alarm") } : s)) };
    expect(gaps(wrong)).toContain("the circuit has validation errors");
  });

  it("blocks demonstration or unrevisioned sources", () => {
    const g = wiringVerificationGaps(fullyDocumented, analyseCircuit(fullyDocumented), () => ({ ...manual, documentRevision: undefined }));
    expect(g).toContain('source "manual" has no document revision or date');
    const d = wiringVerificationGaps(fullyDocumented, analyseCircuit(fullyDocumented), () => ({ ...manual, isDemo: true }));
    expect(d).toContain('cites demonstration source "manual"');
  });
});
