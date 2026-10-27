import { describe, expect, it } from "vitest";
import { answer, back, evaluate, formatMeasurement, parseMeasurement, rankCauses, restart, startSession, type AnswerInput, type Session } from "@/lib/fault-finder/engine";
import { getDiagnosticWorkflow } from "@/lib/fault-finder/workflows";

const wf = (id: string) => getDiagnosticWorkflow(id)!;
const A = (a: string): AnswerInput => ({ answer: a });
const V = (v: string): AnswerInput => ({ value: v });

/** Answers in order; fails the test on any rejected input. */
function run(id: string, inputs: AnswerInput[]): Session {
  let s = startSession(wf(id));
  for (const input of inputs) {
    const r = answer(wf(id), s, input);
    if (!r.ok) throw new Error(`${id}: ${JSON.stringify(input)} rejected: ${r.error}`);
    s = r.session;
  }
  return s;
}
const end = (id: string, inputs: AnswerInput[]) => evaluate(wf(id), run(id, inputs)).node.id;

describe("measurement input", () => {
  it("parses resistance in the forms technicians write", () => {
    expect(parseMeasurement("2200", "ohm")).toBe(2200);
    expect(parseMeasurement("2.2k", "ohm")).toBe(2200);
    expect(parseMeasurement("2k2", "ohm")).toBe(2200);
    expect(parseMeasurement("4.4 kΩ", "ohm")).toBe(4400);
    expect(parseMeasurement("0.4", "ohm")).toBe(0.4);
    expect(parseMeasurement("1M", "ohm")).toBe(1e6);
    for (const ol of ["OL", "o.l", "open", "∞"]) expect(parseMeasurement(ol, "ohm")).toBe(Infinity);
  });
  it("parses volts and rejects nonsense", () => {
    expect(parseMeasurement("13.8", "volt")).toBe(13.8);
    expect(parseMeasurement("12V", "volt")).toBe(12);
    for (const bad of ["", "abc", "-5", "2k2k", "OL"]) expect(parseMeasurement(bad, "volt")).toBeNull();
    expect(parseMeasurement("240", "volt")).toBeNull(); // not an ELV security circuit reading
    for (const bad of ["", "abc", "-5", "1.2.3"]) expect(parseMeasurement(bad, "ohm")).toBeNull();
  });
  it("formats readings", () => {
    expect(formatMeasurement(2200, "ohm")).toBe("2.2 kΩ");
    expect(formatMeasurement(Infinity, "ohm")).toBe("OL (open circuit)");
    expect(formatMeasurement(13.8, "volt")).toBe("13.8 V");
  });
});

describe("zone permanently open", () => {
  const id = "zone-permanently-open";
  it("branches on the loop reading relative to the zone's EOL values", () => {
    expect(end(id, [A("2k2"), A("no-change"), V("2.2k")])).toBe("r-panel-side");
    expect(end(id, [A("2k2"), A("no-change"), V("4k4"), V("13.6"), A("yes")])).toBe("r-detector-alarm");
    expect(end(id, [A("2k2"), A("no-change"), V("4k4"), V("0")])).toBe("r-no-power");
    expect(end(id, [A("2k2"), A("no-change"), V("OL"), V("2k2")])).toBe("r-cable-open");
    expect(end(id, [A("2k2"), A("no-change"), V("OL"), V("OL")])).toBe("r-detector-open");
    expect(end(id, [A("2k2"), A("no-change"), V("0.3")])).toBe("r-actually-short");
    // The same 4.4 kΩ means something different on a 10k / 10k zone.
    expect(end(id, [A("10k"), A("no-change"), V("4k4")])).toBe("r-wrong-value");
    expect(end(id, [A("10k"), A("no-change"), V("20k"), V("12")])).toBe("det-clear");
    expect(end(id, [A("unknown")])).toBe("r-eol-unknown");
  });
  it("points to the shorted guide when the reading says short", () => {
    const ev = evaluate(wf(id), run(id, [A("2k2"), A("new"), V("0")]));
    expect(ev.node.kind === "result" && ev.node.seeAlso).toBe("zone-permanently-shorted");
  });
  it("ranks causes using the evidence from earlier answers", () => {
    const ev = evaluate(wf(id), run(id, [A("2k2"), A("new"), { answer: "no-meter" }]));
    expect(ev.node.kind).toBe("result");
    if (ev.node.kind !== "result") return;
    expect(rankCauses(wf(id), ev.node, ev.evidence).map((c) => c.id)).toEqual(["wrong-termination", "cable-damage", "config", "detector-alarm"]);
    // Without that evidence the author's order stands.
    const plain = evaluate(wf(id), run(id, [A("2k2"), A("no-change"), { answer: "no-meter" }]));
    if (plain.node.kind === "result") expect(rankCauses(wf(id), plain.node, {}).map((c) => c.id)[0]).toBe("cable-damage");
  });
  it("records findings with the measured value", () => {
    const ev = evaluate(wf(id), run(id, [A("2k2"), A("no-change"), V("OL")]));
    expect(ev.findings.map((f) => f.text)).toEqual([
      "Zone uses 2k2 / 2k2 dual EOL (expect 2.2 kΩ sealed).",
      "Zone worked before; no known changes.",
      "Loop reads OL (open circuit) at the panel: open circuit.",
    ]);
  });
});

describe("zone permanently shorted", () => {
  const id = "zone-permanently-shorted";
  it("splits the circuit to place the short", () => {
    expect(end(id, [A("2k2"), A("recent-work"), V("0"), V("0")])).toBe("r-cable-short");
    expect(end(id, [A("2k2"), A("recent-work"), V("0"), V("OL")])).toBe("r-detector-short");
    expect(end(id, [A("2k2"), A("recent-work"), V("0"), V("15k")])).toBe("r-leakage");
    expect(end(id, [A("10k"), A("new"), V("10k")])).toBe("r-panel-side");
    expect(end(id, [A("2k2"), A("new"), V("OL")])).toBe("r-actually-open");
  });
});

describe("PIR not activating", () => {
  const id = "pir-not-activating";
  it("follows power, warm-up and siting when the detector doesn't detect", () => {
    expect(end(id, [A("no"), V("0")])).toBe("r-no-power");
    expect(end(id, [A("no"), V("8.5")])).toBe("r-low-power");
    expect(end(id, [A("no"), V("13.7"), A("no")])).toBe("r-warmup");
    expect(end(id, [A("no"), V("13.7"), A("yes"), A("obstructed")])).toBe("r-siting");
    expect(end(id, [A("no"), V("13.7"), A("yes"), A("fine")])).toBe("r-detector");
  });
  it("checks the alarm path when the detector detects but the panel doesn't see it", () => {
    expect(end(id, [A("yes"), A("yes")])).toBe("r-reporting");
    expect(end(id, [A("yes"), A("no"), A("yes"), A("2k2"), V("2k2")])).toBe("r-relay-path");
    expect(end(id, [A("yes"), A("no"), A("yes"), A("2k2"), V("4.4k")])).toBe("r-panel-config");
    expect(end(id, [A("yes"), A("no"), A("no")])).toBe("r-check-path");
  });
});

describe("tamper won't clear", () => {
  const id = "tamper-will-not-clear";
  it("separates covers, latched alarms and loop faults", () => {
    expect(end(id, [A("zone"), A("no")])).toBe("r-cover");
    expect(end(id, [A("zone"), A("yes"), A("no")])).toBe("r-reset");
    expect(end(id, [A("zone"), A("yes"), A("yes"), A("2k2"), V("OL")])).toBe("r-open");
    expect(end(id, [A("zone"), A("yes"), A("yes"), A("2k2"), V("2.2k")])).toBe("r-panel");
    expect(end(id, [A("enclosure"), A("no")])).toBe("r-lid");
    expect(end(id, [A("siren")])).toBe("r-module");
  });
});

describe("door not unlocking", () => {
  const id = "door-not-unlocking";
  it("uses the lock type and rated voltage to interpret the lock voltage", () => {
    expect(end(id, [A("denied")])).toBe("r-denied");
    expect(end(id, [A("granted"), A("yes")])).toBe("r-config");
    expect(end(id, [A("granted"), A("no"), A("fail-secure"), A("12"), V("0")])).toBe("r-no-unlock-power");
    expect(end(id, [A("granted"), A("no"), A("fail-secure"), A("12"), V("12.1")])).toBe("r-mechanical-secure");
    // 12 V on a 24 V strike is low, not normal.
    expect(end(id, [A("granted"), A("no"), A("fail-secure"), A("24"), V("12.1")])).toBe("r-low-lock-voltage");
    expect(end(id, [A("granted"), A("no"), A("fail-safe"), A("12"), V("12")])).toBe("r-power-not-removed");
    expect(end(id, [A("granted"), A("no"), A("fail-safe"), A("24"), V("0")])).toBe("r-mechanical-safe");
    expect(end(id, [A("nothing"), V("0.2")])).toBe("r-reader-power");
    expect(end(id, [A("nothing"), V("12.5")])).toBe("r-reader-comms");
  });
});

describe("session handling", () => {
  const id = "zone-permanently-open";
  it("tracks progress, goes back and restarts", () => {
    const s0 = startSession(wf(id));
    const e0 = evaluate(wf(id), s0);
    expect(e0.step).toBe(1);
    expect(e0.total).toBeGreaterThan(2);
    const s2 = run(id, [A("2k2"), A("new")]);
    const e2 = evaluate(wf(id), s2);
    expect(e2.node.id).toBe("panel-measure");
    expect(e2.step).toBe(3);
    expect(e2.total).toBeGreaterThanOrEqual(e2.step);
    expect(evaluate(wf(id), back(s2)).node.id).toBe("history");
    expect(evaluate(wf(id), back(back(back(s2)))).node.id).toBe("eol"); // back past the start is harmless
    expect(restart(wf(id)).steps).toEqual([]);
  });
  it("rejects invalid answers without changing the session", () => {
    const s = run(id, [A("2k2")]);
    expect(answer(wf(id), s, A("not-an-answer"))).toMatchObject({ ok: false });
    expect(answer(wf(id), s, V("2k2"))).toMatchObject({ ok: false, error: "Choose one of the answers." });
    const atMeasure = run(id, [A("2k2"), A("new")]);
    expect(answer(wf(id), atMeasure, V("lots"))).toMatchObject({ ok: false, error: expect.stringMatching(/Enter a resistance/) });
    expect(answer(wf(id), atMeasure, A("short"))).toMatchObject({ ok: false }); // ranges are chosen by the reading, not by id
    const done = run(id, [A("unknown")]);
    expect(answer(wf(id), done, A("2k2"))).toMatchObject({ ok: false, error: expect.stringMatching(/complete/) });
  });
  it("relative ranges can't be evaluated without the context they need", () => {
    // A tampered session that skips the EOL question can't classify the reading.
    const forged: Session = { workflowId: id, version: 1, steps: [{ node: "panel-measure", answer: "seal", value: 2200 }] };
    expect(evaluate(wf(id), forged)).toMatchObject({ validSteps: 0, node: { id: "eol" } });
  });
  it("replays only the valid prefix of outdated or tampered sessions", () => {
    const s = run(id, [A("2k2"), A("new"), V("2k2")]);
    const tampered: Session = { ...s, steps: [s.steps[0]!, { node: "history", answer: "gone" }, s.steps[2]!] };
    const ev = evaluate(wf(id), tampered);
    expect(ev.validSteps).toBe(1);
    expect(ev.node.id).toBe("history");
    const wrongValue: Session = { ...s, steps: [s.steps[0]!, s.steps[1]!, { node: "panel-measure", answer: "open", value: 2200 }] };
    expect(evaluate(wf(id), wrongValue).node.id).toBe("panel-measure");
    // Answering after a bad tail drops the tail.
    const r = answer(wf(id), tampered, A("new"));
    expect(r.ok && r.session.steps).toHaveLength(2);
  });
});
