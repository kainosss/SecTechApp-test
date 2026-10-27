import { describe, expect, it } from "vitest";
import zoneOpen from "@content/diagnostics/zone-permanently-open.json";
import { validateWorkflow } from "@/lib/fault-finder/engine";
import { sourceSchema, workflowSchema } from "@/lib/fault-finder/schema";
import { WORKFLOWS } from "@/lib/fault-finder/workflows";

describe("verification metadata", () => {
  it("every guide is honestly labelled: generic, no invented sources or sign-offs, pending checks listed", () => {
    for (const wf of WORKFLOWS) {
      expect(wf.verification.status, wf.id).toBe("generic");
      expect(wf.sources, wf.id).toEqual([]);
      expect(wf.verification.reviewer, wf.id).toBeUndefined();
      expect(wf.verification.pending.length, wf.id).toBeGreaterThan(0);
    }
  });

  it("rejects claims the metadata can't back up", () => {
    const parse = (verification: object, sources: object[] = []) => workflowSchema.safeParse({ ...zoneOpen, verification, sources }).success;
    expect(parse({ status: "manufacturer-referenced" })).toBe(false); // no source
    expect(parse({ status: "technician-reviewed" })).toBe(false); // no reviewer or date
    expect(parse({ status: "technician-reviewed", reviewer: "J. Smith, senior technician" })).toBe(false); // no date
    expect(parse({ status: "technician-reviewed", reviewer: "J. Smith, senior technician", lastReviewed: "2026-11-01" })).toBe(true);
    expect(parse({ status: "manufacturer-referenced" }, [{ title: "Installation manual", organisation: "Example Pty Ltd", type: "installation-guide", version: "Rev 3" }])).toBe(true);
  });

  it("sources need a version or date, a valid URL and a known type", () => {
    const ok = { title: "Manual", organisation: "Org", type: "datasheet", date: "2025-01-31", url: "https://example.com/manual.pdf", section: "p. 12" };
    expect(sourceSchema.safeParse(ok).success).toBe(true);
    expect(sourceSchema.safeParse({ ...ok, date: undefined }).success).toBe(false);
    expect(sourceSchema.safeParse({ ...ok, url: "not a url" }).success).toBe(false);
    expect(sourceSchema.safeParse({ ...ok, type: "blog" }).success).toBe(false);
    expect(sourceSchema.safeParse({ ...ok, date: "31/01/2025" }).success).toBe(false);
  });

  it("every result states its confidence, and unmeasured fallbacks never claim 'likely'", () => {
    for (const wf of WORKFLOWS) {
      for (const n of wf.nodes) {
        if (n.kind !== "result") continue;
        expect(["likely", "possible", "verify"], `${wf.id}/${n.id}`).toContain(n.confidence);
        if (n.id === "r-no-meter" || n.id.endsWith("-unknown")) expect(n.confidence, `${wf.id}/${n.id}`).toBe("verify");
      }
    }
  });
});

describe("safety wording", () => {
  const all = (wf: (typeof WORKFLOWS)[number]) => JSON.stringify(wf).toLowerCase();
  it("every resistance measurement says to isolate the circuit first", () => {
    for (const wf of WORKFLOWS) {
      for (const n of wf.nodes) {
        if (n.kind === "measure" && n.unit === "ohm") {
          expect(`${n.test.procedure} ${n.safety}`.toLowerCase(), `${wf.id}/${n.id}`).toMatch(/isolat|disconnect/);
        }
      }
    }
  });
  it("every voltage measurement is a live DC test with probes on terminals only", () => {
    for (const wf of WORKFLOWS) {
      for (const n of wf.nodes) {
        if (n.kind === "measure" && n.unit === "volt") {
          expect(n.test.procedure.toLowerCase(), `${wf.id}/${n.id}`).toMatch(/dc volts/);
          expect(n.safety.toLowerCase(), `${wf.id}/${n.id}`).toMatch(/never|don't/);
        }
      }
    }
  });
  it("covers batteries, mains and supervision, and never suggests shorting outputs", () => {
    for (const wf of WORKFLOWS) {
      const safety = wf.safety.join(" ").toLowerCase();
      expect(safety, wf.id).toMatch(/licensed electrician|licence conditions/);
      expect(safety, wf.id).toMatch(/supervision/);
      expect(all(wf), wf.id).not.toMatch(/short (the|a) (power|supply|aux|battery|lock) output to test/);
    }
  });
  it("the door guide treats egress and fire interfaces as safety-critical", () => {
    const door = WORKFLOWS.find((w) => w.id === "door-not-unlocking")!;
    const text = all(door);
    expect(text).toMatch(/free exit|egress/);
    expect(text).toMatch(/fire services contractor/);
    expect(text).toMatch(/never as a permanent fix/);
  });
});

describe("structural validator catches unsafe content", () => {
  it("flags a zone measurement reachable before the EOL values are known", () => {
    const wf = structuredClone(WORKFLOWS[0]!);
    wf.start = "panel-measure";
    expect(validateWorkflow(wf).some((p) => p.includes("reachable without EOL values"))).toBe(true);
  });
  it("flags zone measurements that don't classify every band", () => {
    const wf = structuredClone(WORKFLOWS[0]!);
    const m = wf.nodes.find((n) => n.id === "panel-measure");
    if (m?.kind === "measure") m.ranges = m.ranges.filter((r) => r.id !== "between");
    expect(validateWorkflow(wf)).toContain("panel-measure: band between covered 0 times");
  });
  it("flags presets the measurement can't support", () => {
    const wf = structuredClone(WORKFLOWS[0]!);
    const e = wf.nodes.find((n) => n.kind === "eol-config");
    if (e?.kind === "eol-config") e.presets.push({ id: "bad", label: "bad", r1: 10000, r2: 470 });
    expect(validateWorkflow(wf).some((p) => p.startsWith("eol/bad"))).toBe(true);
  });
});
