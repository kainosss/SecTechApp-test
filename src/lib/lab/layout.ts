/**
 * Bench drawing layout (viewBox 360 × 500): terminal positions, lead curves
 * and label placement that avoids overlapping other labels, terminals and
 * board text. Pure geometry — the electrical model never reads it.
 */
import { BENCH_POINTS, componentLabels, type PlacedComponent, type PointId } from "./bench";
import { resistorCode } from "@/lib/eol/engine";

export const POINT_XY: Record<PointId, { x: number; y: number }> = {
  "panel-aux-pos": { x: 50, y: 74 },
  "panel-aux-neg": { x: 105, y: 74 },
  "panel-z": { x: 215, y: 74 },
  "panel-com": { x: 290, y: 74 },
  j1: { x: 185, y: 236 },
  j2: { x: 255, y: 236 },
  "det-12v": { x: 40, y: 432 },
  "det-0v": { x: 92, y: 432 },
  "alm-com": { x: 160, y: 432 },
  "alm-nc": { x: 212, y: 432 },
  "tmp-com": { x: 268, y: 432 },
  "tmp-nc": { x: 320, y: 432 },
};

/** Where each terminal's label is printed (text baseline centre). */
export function pointLabelXY(id: PointId): { x: number; y: number } {
  const { x, y } = POINT_XY[id];
  return BENCH_POINTS.find((p) => p.id === id)!.group === "joint" ? { x, y: y + 20 } : { x, y: y - 16 };
}

/** Axis-aligned box, top-left origin. */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function overlap(a: Box, b: Box): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

/** Approximate box of centred text (monospace-ish, ~0.62 em per character). */
function textBox(cx: number, baseline: number, text: string, size: number, spacing = 0): Box {
  const w = text.length * (size * 0.62 + spacing) + 4;
  return { x: cx - w / 2, y: baseline - size, w, h: size + 3 };
}

/** Everything fixed on the bench that a component label must not cover. */
export const FIXED_BOXES: Box[] = [
  // Board titles and group headings.
  { x: 20, y: 18, w: 125, h: 13 },
  textBox(78, 44, "AUX POWER", 9, 1),
  textBox(252, 44, "ZONE 1 INPUT", 9, 1),
  textBox(220, 276, "JOINT BLOCK", 9, 1),
  { x: 20, y: 374, w: 225, h: 13 },
  textBox(66, 402, "POWER", 9, 1),
  textBox(186, 402, "ALARM (NC)", 9, 1),
  textBox(294, 402, "TAMPER (NC)", 9, 1),
  // Contact symbols and their state text.
  { x: 150, y: 444, w: 72, h: 44 },
  { x: 258, y: 444, w: 72, h: 44 },
  // Rotated power-cable caption.
  { x: 59, y: 238, w: 14, h: 104 },
  // Terminals and their labels.
  ...BENCH_POINTS.flatMap((p) => {
    const { x, y } = POINT_XY[p.id];
    const l = pointLabelXY(p.id);
    return [{ x: x - 11, y: y - 11, w: 22, h: 22 }, textBox(l.x, l.y, p.label, 10)];
  }),
];

export interface ComponentLayout {
  id: string;
  /** SVG path of the lead. */
  d: string;
  /** Resistor body centre and rotation (degrees). */
  body: { x: number; y: number; angle: number };
  label: { text: string; x: number; y: number; box: Box };
}

type Pt = { x: number; y: number };

function quad(a: Pt, c: Pt, b: Pt, t: number) {
  const u = 1 - t;
  const p = { x: u * u * a.x + 2 * u * t * c.x + t * t * b.x, y: u * u * a.y + 2 * u * t * c.y + t * t * b.y };
  const dx = 2 * u * (c.x - a.x) + 2 * t * (b.x - c.x);
  const dy = 2 * u * (c.y - a.y) + 2 * t * (b.y - c.y);
  const len = Math.hypot(dx, dy) || 1;
  return { p, n: { x: -dy / len, y: dx / len } };
}

const BOARD_MID = 250;
/** Leads keep at least this far from the centre of terminals they don't connect to. */
export const TERMINAL_CLEARANCE = 16;
const POINT_IDS = Object.keys(POINT_XY) as PointId[];
const LABEL_H = 15;

function bodyBox(x: number, y: number, angle: number): Box {
  const r = (angle * Math.PI) / 180;
  const w = 34 * Math.abs(Math.cos(r)) + 12 * Math.abs(Math.sin(r));
  const h = 34 * Math.abs(Math.sin(r)) + 12 * Math.abs(Math.cos(r));
  return { x: x - w / 2, y: y - h / 2, w, h };
}

/**
 * Lays out every placed component. Leads bow toward the middle of the bench
 * (so they don't lie along the terminal strips) and fan out when several
 * share a pair of terminals; resistor bodies avoid board text; labels try
 * several positions along each side of the lead and take the first clear one.
 */
export function layoutBench(components: PlacedComponent[]): ComponentLayout[] {
  const names = componentLabels(components);
  const occupied: Box[] = [...FIXED_BOXES];
  const pairCount = new Map<string, number>();
  const out: ComponentLayout[] = [];

  for (const c of components) {
    const pair = [c.a, c.b].sort().join("|");
    const index = pairCount.get(pair) ?? 0;
    pairCount.set(pair, index + 1);

    const a = POINT_XY[c.a];
    const b = POINT_XY[c.b];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    let nx = -dy / len;
    let ny = dx / len;
    const midY = (a.y + b.y) / 2;
    if ((midY > BOARD_MID && ny > 0) || (midY <= BOARD_MID && ny < 0) || (Math.abs(ny) < 1e-6 && nx < 0)) {
      nx = -nx;
      ny = -ny;
    }
    const sameRow = Math.abs(dy) < 1;
    let angle = (Math.atan2(dy, dx) * 180) / Math.PI;
    if (angle > 90) angle -= 180;
    if (angle <= -90) angle += 180;

    // Choose the bow: avoid passing over terminals this component isn't connected to (it would look
    // connected), then keep resistor bodies clear of board text; prefer the gentlest curve.
    const base = (sameRow ? 76 : 16) + index * 24;
    const bulges = [0, 14, -14, 28, -28, 42, -42, 60, -60].map((d) => base + d);
    let best: { ctrl: Pt; body: Pt; cost: number } | null = null;
    for (const bulge of bulges) {
      const ctrl = { x: (a.x + b.x) / 2 + nx * bulge * 2, y: (a.y + b.y) / 2 + ny * bulge * 2 };
      const body = quad(a, ctrl, b, 0.5).p;
      let cost = Math.abs(bulge - base) * 0.01;
      for (let t = 0.04; t < 0.97; t += 0.04) {
        const { p } = quad(a, ctrl, b, t);
        for (const id of POINT_IDS) {
          if (id === c.a || id === c.b) continue;
          const d = Math.hypot(p.x - POINT_XY[id].x, p.y - POINT_XY[id].y);
          if (d < TERMINAL_CLEARANCE) cost += TERMINAL_CLEARANCE - d;
        }
      }
      if (c.kind === "resistor") cost += occupied.reduce((sum, o) => sum + overlap(bodyBox(body.x, body.y, angle), o), 0);
      if (!best || cost < best.cost) best = { ctrl, body, cost };
    }
    const { ctrl, body } = best!;
    if (c.kind === "resistor") occupied.push(bodyBox(body.x, body.y, angle));

    // Label candidates: along the lead, either side.
    const text = c.kind === "resistor" ? `${names[c.id]} ${resistorCode(c.ohms!)}` : names[c.id]!;
    const w = text.length * 6.4 + 10;
    let chosen: { x: number; y: number; box: Box; cost: number } | null = null;
    for (const t of [0.5, 0.38, 0.62, 0.28, 0.72, 0.18, 0.82]) {
      const { p, n } = quad(a, ctrl, b, t);
      for (const side of [1, -1]) {
        const off = (c.kind === "resistor" && Math.abs(t - 0.5) < 0.2 ? 20 : 11) * side;
        const x = p.x + n.x * off;
        const y = p.y + n.y * off;
        const box = { x: x - w / 2, y: y - LABEL_H / 2, w, h: LABEL_H };
        const inside = box.x >= 2 && box.y >= 2 && box.x + box.w <= 358 && box.y + box.h <= 498;
        const cost = occupied.reduce((s, o) => s + overlap(box, o), 0) + (inside ? 0 : 1e6);
        if (!chosen || cost < chosen.cost) chosen = { x, y, box, cost };
        if (cost === 0) break;
      }
      if (chosen?.cost === 0) break;
    }
    occupied.push(chosen!.box);
    out.push({
      id: c.id,
      d: `M${a.x} ${a.y} Q${ctrl.x} ${ctrl.y} ${b.x} ${b.y}`,
      body: { x: body.x, y: body.y, angle },
      label: { text, x: chosen!.x, y: chosen!.y, box: chosen!.box },
    });
  }
  return out;
}
