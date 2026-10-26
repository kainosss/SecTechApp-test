import { describe, expect, it } from "vitest";
import type { PlacedComponent, PointId } from "@/lib/lab/bench";
import { FAULT_SCENARIOS } from "@/lib/lab/faults";
import { FIXED_BOXES, layoutBench, overlap, POINT_XY } from "@/lib/lab/layout";

let n = 0;
const W = (a: PointId, b: PointId): PlacedComponent => ({ id: `l${++n}`, kind: "wire", a, b });
const R = (a: PointId, b: PointId, ohms = 2200): PlacedComponent => ({ id: `l${++n}`, kind: "resistor", ohms, a, b });

const circuits: [string, PlacedComponent[]][] = [
  ["guided build", [W("tmp-nc", "panel-com"), W("panel-z", "alm-com"), R("alm-nc", "tmp-com"), R("alm-com", "alm-nc")]],
  ["via joints", [W("panel-z", "j1"), W("j1", "alm-com"), R("alm-com", "alm-nc"), R("alm-nc", "tmp-com"), W("tmp-nc", "j2"), W("j2", "panel-com"), R("j1", "j2", 10000)]],
  ["parallel pair", [R("j1", "j2"), R("j1", "j2"), W("j1", "j2")]],
  ...FAULT_SCENARIOS.map((s) => [s.id, s.components] as [string, PlacedComponent[]]),
];

describe("bench layout readability", () => {
  for (const [name, components] of circuits) {
    it(`${name}: labels stay on the bench and clear of each other, terminals and board text`, () => {
      const layout = layoutBench(components);
      expect(layout).toHaveLength(components.length);
      const boxes = layout.map((l) => l.label.box);
      for (const b of boxes) {
        expect(b.x).toBeGreaterThanOrEqual(0);
        expect(b.x + b.w).toBeLessThanOrEqual(360);
        expect(b.y).toBeGreaterThanOrEqual(0);
        expect(b.y + b.h).toBeLessThanOrEqual(500);
        for (const f of FIXED_BOXES) expect(overlap(b, f), `${name}: label over fixed item`).toBe(0);
      }
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) expect(overlap(boxes[i]!, boxes[j]!), `${name}: labels ${i}/${j}`).toBe(0);
    });
  }

  for (const [name, components] of circuits) {
    it(`${name}: leads don't pass over terminals they aren't connected to`, () => {
      layoutBench(components).forEach((l, i) => {
        const c = components[i]!;
        const [, ax, ay, cx, cy, bx, by] = l.d.match(/M([\d.-]+) ([\d.-]+) Q([\d.-]+) ([\d.-]+) ([\d.-]+) ([\d.-]+)/)!.map(Number);
        for (let t = 0.05; t < 0.96; t += 0.01) {
          const u = 1 - t;
          const x = u * u * ax! + 2 * u * t * cx! + t * t * bx!;
          const y = u * u * ay! + 2 * u * t * cy! + t * t * by!;
          for (const [id, p] of Object.entries(POINT_XY)) {
            if (id === c.a || id === c.b) continue;
            expect(Math.hypot(x - p.x, y - p.y), `${name}: ${c.id} over ${id}`).toBeGreaterThan(11);
          }
        }
      });
    });
  }

  it("fans out components that share a pair of terminals", () => {
    const [a, b] = layoutBench([R("j1", "j2"), R("j1", "j2")]);
    expect(a!.d).not.toBe(b!.d);
    expect(Math.hypot(a!.body.x - b!.body.x, a!.body.y - b!.body.y)).toBeGreaterThan(20);
  });

  it("labels resistors with their value", () => {
    expect(layoutBench([R("alm-com", "alm-nc", 4700)])[0]!.label.text).toBe("R1 4k7");
  });
});
