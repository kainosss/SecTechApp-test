import { describe, expect, it } from "vitest";
import { listGenericCircuits } from "@/lib/content/repository";
import { stateResistance } from "@/lib/eol/engine";
import type { CircuitNode } from "@/lib/eol/model";
import { resistanceBetween, shortedTogether, type Element } from "@/lib/eol/netlist";

const R = (a: string, b: string, ohms: number): Element => ({ kind: "resistor", a, b, ohms });
const W = (a: string, b: string): Element => ({ kind: "wire", a, b });
const S = (a: string, b: string, closed: boolean): Element => ({ kind: "switch", a, b, closed });
const ohms = (els: Element[], a = "A", b = "B") => {
  const r = resistanceBetween(els, a, b);
  if (!r.ok) throw new Error(r.reason);
  return r.ohms;
};

describe("graph resistance", () => {
  it("series and parallel", () => {
    expect(ohms([R("A", "x", 2200), R("x", "B", 2200)])).toBe(4400);
    expect(ohms([R("A", "B", 4400), R("A", "B", 4400)])).toBe(2200);
  });

  it("open, short and bypass", () => {
    expect(ohms([R("A", "x", 2200)])).toBe(Infinity);
    expect(ohms([W("A", "B"), R("A", "B", 1000)])).toBe(0);
    expect(ohms([R("A", "x", 2200), R("x", "B", 2200), W("x", "B")])).toBe(2200); // second resistor bypassed by a wire
    expect(ohms([R("A", "x", 2200), S("x", "B", true)])).toBe(2200);
    expect(ohms([R("A", "x", 2200), S("x", "B", false)])).toBe(Infinity);
    expect(ohms([])).toBe(Infinity);
  });

  it("solves non series-parallel networks (balanced and unbalanced bridges)", () => {
    const bridge = (r5: number) => [R("A", "c", 1000), R("A", "d", 1000), R("c", "B", 1000), R("d", "B", 1000), R("c", "d", r5)];
    expect(ohms(bridge(500))).toBeCloseTo(1000, 6); // balanced: middle resistor carries no current
    const unbalanced = [R("A", "c", 1000), R("A", "d", 2000), R("c", "B", 3000), R("d", "B", 4000), R("c", "d", 5000)];
    expect(ohms(unbalanced)).toBeCloseTo(2394.366197, 4); // checked independently with numpy.linalg.solve
  });

  it("ignores dangling parts and floating islands", () => {
    expect(ohms([R("A", "B", 2200), R("B", "dangling", 4700), R("p", "q", 1000), W("q", "r")])).toBe(2200);
  });

  it("refuses to invent a reading for invalid values", () => {
    expect(resistanceBetween([R("A", "B", 0)], "A", "B").ok).toBe(false);
    expect(resistanceBetween([R("A", "B", NaN)], "A", "B").ok).toBe(false);
  });

  it("detects dead shorts through wires and closed switches", () => {
    expect(shortedTogether([W("A", "x"), S("x", "B", true)], "A", "B")).toBe(true);
    expect(shortedTogether([W("A", "x"), S("x", "B", false)], "A", "B")).toBe(false);
  });
});

describe("agrees with the EOL engine on every generic circuit and state", () => {
  function toElements(node: CircuitNode, a: string, b: string, positions: Record<string, "open" | "closed">, counter = { n: 0 }): Element[] {
    if (node.kind === "resistor") return [{ kind: "resistor", a, b, ohms: node.ohms! }];
    if (node.kind === "contact") return [{ kind: "switch", a, b, closed: positions[node.id] === "closed" }];
    if (node.kind === "parallel") return node.children.flatMap((c) => toElements(c, a, b, positions, counter));
    const out: Element[] = [];
    let from = a;
    node.children.forEach((c, i) => {
      const to = i === node.children.length - 1 ? b : `n${counter.n++}`;
      out.push(...toElements(c, from, to, positions, counter));
      from = to;
    });
    return out;
  }

  it("matches stateResistance() exactly", async () => {
    for (const t of await listGenericCircuits()) {
      for (const s of t.states.filter((x) => x.line === "intact")) {
        const expected = stateResistance(t.circuit, { id: s.id, kind: s.kind, line: s.line, contacts: s.contacts });
        const got = ohms(toElements(t.circuit.network, "Z+", "Z-", s.contacts), "Z+", "Z-");
        if (Number.isFinite(expected)) expect(got, `${t.id} ${s.id}`).toBeCloseTo(expected, 6);
        else expect(got, `${t.id} ${s.id}`).toBe(expected);
      }
    }
  });
});
