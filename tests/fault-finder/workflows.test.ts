import { describe, expect, it } from "vitest";
import { validateWorkflow } from "@/lib/fault-finder/engine";
import { WORKFLOWS } from "@/lib/fault-finder/workflows";

describe("diagnostic workflow content", () => {
  const ids = new Set(WORKFLOWS.map((w) => w.id));
  it("has the five supported workflows", () => {
    expect([...ids]).toEqual(["zone-permanently-open", "zone-permanently-shorted", "pir-not-activating", "tamper-will-not-clear", "door-not-unlocking"]);
  });
  for (const wf of WORKFLOWS) {
    it(`${wf.id}: is structurally sound (links, causes, reachability, no cycles, ranges tile 0 → OL)`, () => {
      expect(validateWorkflow(wf, ids)).toEqual([]);
    });
  }
});
