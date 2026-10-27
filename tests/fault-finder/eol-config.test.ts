import { describe, expect, it } from "vitest";
import { answer, evaluate, startSession, type AnswerInput, type Session } from "@/lib/fault-finder/engine";
import { getDiagnosticWorkflow } from "@/lib/fault-finder/workflows";

const wf = (id: string) => getDiagnosticWorkflow(id)!;
const A = (a: string): AnswerInput => ({ answer: a });
const V = (v: string): AnswerInput => ({ value: v });
const id = "zone-permanently-open";

function run(inputs: AnswerInput[], workflow = id): Session {
  let s = startSession(wf(workflow));
  for (const input of inputs) {
    const r = answer(wf(workflow), s, input);
    if (!r.ok) throw new Error(`${JSON.stringify(input)} rejected: ${r.error}`);
    s = r.session;
  }
  return s;
}
const end = (inputs: AnswerInput[], workflow = id) => evaluate(wf(workflow), run(inputs, workflow)).node.id;

describe("configurable EOL resistors in the Fault Finder", () => {
  it("uses calculated expectations for unequal pairs", () => {
    expect(end([A("4k7-2k2"), A("no-change"), V("4k7")])).toBe("r-panel-side");
    expect(end([A("4k7-2k2"), A("no-change"), V("6.9k")])).toBe("det-power"); // alarm reading
    expect(end([A("2k2-4k7"), A("no-change"), V("4k7")])).toBe("r-wrong-value"); // between sealed and alarm
    expect(end([A("2k2-2k2"), A("no-change"), V("6.9k")])).toBe("r-wrong-value"); // above alarm for 2k2/2k2
    // Preserved behaviour for the equal pairs.
    expect(end([A("2k2-2k2"), A("no-change"), V("2.2k")])).toBe("r-panel-side");
    expect(end([A("10k-10k"), A("no-change"), V("20k"), V("12")])).toBe("det-clear");
  });

  it("applies to every zone measurement in every intrusion guide", () => {
    expect(end([A("4k7-2k2"), A("recent-work"), V("0"), V("6.9k")], "zone-permanently-shorted")).toBe("r-leakage");
    expect(end([A("yes"), A("no"), A("yes"), A("4k7-2k2"), V("4.7k")], "pir-not-activating")).toBe("r-relay-path");
    expect(end([A("yes"), A("no"), A("yes"), A("4k7-2k2"), V("6.9k")], "pir-not-activating")).toBe("r-panel-config");
    expect(end([A("zone"), A("yes"), A("yes"), A("series"), A("4k7-2k2"), V("4.7k")], "tamper-will-not-clear")).toBe("r-panel");
  });

  it("accepts custom values and records them as a finding", () => {
    const ev = evaluate(wf(id), run([{ eol: { r1: "3k3", r2: "1.5k" } }, A("no-change"), V("4.8k")]));
    expect(ev.node.id).toBe("det-power"); // 3.3k + 1.5k = 4.8k alarm
    expect(ev.findings[0]).toMatchObject({ kind: "config", text: expect.stringMatching(/R1 3.3 kΩ .* R2 1.5 kΩ .* expect 3.3 kΩ sealed, 4.8 kΩ in alarm/) });
    expect(ev.findings[1]!.kind).toBe("reported");
    expect(ev.findings[2]!.kind).toBe("measured");
  });

  it("rejects unreadable or ambiguous custom values with a reason", () => {
    const s = startSession(wf(id));
    expect(answer(wf(id), s, { eol: { r1: "abc", r2: "2k2" } })).toMatchObject({ ok: false, error: expect.stringMatching(/Enter both/) });
    expect(answer(wf(id), s, { eol: { r1: "10k", r2: "470" } })).toMatchObject({ ok: false, error: expect.stringMatching(/tell them apart/) });
    expect(answer(wf(id), s, A("custom"))).toMatchObject({ ok: false }); // "custom" needs values
    expect(answer(wf(id), run([A("2k2-2k2")]), { eol: { r1: "2k2", r2: "2k2" } })).toMatchObject({ ok: false }); // not asked here
  });

  it("routes unsupported wiring to 'confirm EOL values' rather than guessing", () => {
    const ev = evaluate(wf(id), run([A("unknown")]));
    expect(ev.node.id).toBe("r-eol-unknown");
    expect(ev.node.kind === "result" && ev.node.confidence).toBe("verify");
  });

  it("doesn't replay a saved custom step with invalid values", () => {
    const forged: Session = { workflowId: id, version: wf(id).version, steps: [{ node: "eol", answer: "custom", r1: 10000, r2: 470 }] };
    expect(evaluate(wf(id), forged).validSteps).toBe(0);
  });

  it("changing the resistors re-classifies later readings instead of keeping a stale answer", () => {
    const s = run([A("2k2-2k2"), A("no-change"), V("4.4k")]);
    expect(evaluate(wf(id), s).node.id).toBe("det-power");
    const changed: Session = { ...s, steps: [{ node: "eol", answer: "4k7-2k2" }, ...s.steps.slice(1)] };
    const ev = evaluate(wf(id), changed);
    expect(ev.validSteps).toBe(2); // 4.4 kΩ is 'low' for 4k7/2k2, not the recorded 'alarm' range
    expect(ev.node.id).toBe("panel-measure");
  });
});

describe("result confidence", () => {
  it("measurement-isolated results are 'likely'; unmeasured ones need verification", () => {
    const likely = evaluate(wf(id), run([A("2k2-2k2"), A("no-change"), V("OL"), V("2k2")]));
    expect(likely.node.kind === "result" && likely.node.confidence).toBe("likely");
    const verify = evaluate(wf(id), run([A("2k2-2k2"), A("no-change"), A("no-meter")]));
    expect(verify.node.kind === "result" && verify.node.confidence).toBe("verify");
  });
});
