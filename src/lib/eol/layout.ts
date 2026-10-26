/**
 * Turns a circuit tree into diagram geometry. Pure and deterministic: the
 * drawing is derived only from the circuit's series/parallel structure, so the
 * picture always matches the electrical connectivity used in calculations.
 *
 * Series components sit left to right on one wire. Parallel branches are
 * stacked between a left and right rail. The network is drawn as a loop from
 * panel terminal A, through the field devices, and back to terminal B.
 *
 * Every wire records when it carries current ("liveWhen"), using the same
 * node paths as conductingPaths() in the engine, so highlighting can never
 * disagree with the calculation. Wires are drawn in the direction of
 * conventional current (terminal A → network → terminal B).
 */
import type { CircuitNode, ContactNode, ResistorNode } from "./model";

export const UNIT_W = 84;
export const ROW_H = 78;
const GAP = 16;
const RAIL = 20;
export const PANEL_W = 76;
const LEAD = 40;
const RETURN = 26;
const MARGIN = 8;

/** When a wire carries current. Paths are node paths: "0" is the root, "0.1" its second child, etc. */
export type LiveRule =
  | { kind: "node"; path: string }
  /** Rail segment between branch `index` and `index + 1`: live if any branch below it is live. */
  | { kind: "rail"; parent: string; index: number; branches: number }
  /** Outer loop wire. "near" is between the panel and the cable-fault position; "far" is beyond it. */
  | { kind: "loop"; side: "near" | "far" }
  | { kind: "short-link" };

export type Drawable =
  | { type: "wire"; x1: number; y1: number; x2: number; y2: number; live: LiveRule }
  | { type: "dot"; x: number; y: number; live: LiveRule }
  | { type: "resistor"; x: number; y: number; node: ResistorNode; path: string }
  | { type: "contact"; x: number; y: number; node: ContactNode; path: string };

interface Block {
  w: number;
  h: number;
  /** Relative to the block's top-left; entry and exit are on the first row's centre line. */
  items: Drawable[];
}

const ENTRY_Y = ROW_H / 2;

function shift(items: Drawable[], dx: number, dy: number): Drawable[] {
  return items.map((d) =>
    d.type === "wire" ? { ...d, x1: d.x1 + dx, x2: d.x2 + dx, y1: d.y1 + dy, y2: d.y2 + dy } : { ...d, x: d.x + dx, y: d.y + dy },
  );
}

function layoutBlock(node: CircuitNode, path: string): Block {
  if (node.kind === "resistor" || node.kind === "contact") {
    const item: Drawable =
      node.kind === "resistor" ? { type: "resistor", x: UNIT_W / 2, y: ENTRY_Y, node, path } : { type: "contact", x: UNIT_W / 2, y: ENTRY_Y, node, path };
    return { w: UNIT_W, h: ROW_H, items: [item] };
  }

  const self: LiveRule = { kind: "node", path };
  const children = node.children.map((c, i) => layoutBlock(c, `${path}.${i}`));
  if (children.length === 0) return { w: GAP, h: ROW_H, items: [{ type: "wire", x1: 0, y1: ENTRY_Y, x2: GAP, y2: ENTRY_Y, live: self }] };

  if (node.kind === "series") {
    const items: Drawable[] = [];
    let x = 0;
    children.forEach((child, i) => {
      if (i > 0) {
        items.push({ type: "wire", x1: x, y1: ENTRY_Y, x2: x + GAP, y2: ENTRY_Y, live: self });
        x += GAP;
      }
      items.push(...shift(child.items, x, 0));
      x += child.w;
    });
    return { w: x, h: Math.max(...children.map((c) => c.h)), items };
  }

  // Parallel: branches stacked, joined by rails on both sides.
  const inner = Math.max(...children.map((c) => c.w));
  const w = inner + RAIL * 2;
  const items: Drawable[] = [];
  let y = 0;
  const branchYs: number[] = [];
  children.forEach((child, i) => {
    const by = y + ENTRY_Y;
    const branch: LiveRule = { kind: "node", path: `${path}.${i}` };
    branchYs.push(by);
    items.push({ type: "wire", x1: 0, y1: by, x2: RAIL, y2: by, live: branch });
    items.push(...shift(child.items, RAIL, y));
    items.push({ type: "wire", x1: RAIL + child.w, y1: by, x2: w, y2: by, live: branch });
    y += child.h;
  });
  // Rails, one segment per gap between branches. Left rail carries current downwards to lower
  // branches; right rail carries it back up to the exit on the first row.
  for (let i = 0; i < branchYs.length - 1; i++) {
    const rail: LiveRule = { kind: "rail", parent: path, index: i, branches: children.length };
    items.push({ type: "wire", x1: 0, y1: branchYs[i]!, x2: 0, y2: branchYs[i + 1]!, live: rail });
    items.push({ type: "wire", x1: w, y1: branchYs[i + 1]!, x2: w, y2: branchYs[i]!, live: rail });
  }
  for (const by of branchYs) items.push({ type: "dot", x: 0, y: by, live: self }, { type: "dot", x: w, y: by, live: self });
  return { w, h: y, items };
}

export interface DiagramLayout {
  width: number;
  height: number;
  items: Drawable[];
  /** Panel terminal positions (A = start of loop, B = return). */
  terminalA: { x: number; y: number };
  terminalB: { x: number; y: number };
  panel: { x: number; y: number; w: number; h: number };
  /** Where a cable-open break or cable-short link is drawn. */
  faultX: number;
}

export function layoutCircuit(network: CircuitNode, top = 0, bottomSpace = 0): DiagramLayout {
  const block = layoutBlock(network, "0");
  const panelRight = MARGIN + PANEL_W;
  const netX = panelRight + LEAD;
  const netY = top + MARGIN;
  const lineY = netY + ENTRY_Y;
  const returnY = netY + block.h + RETURN;
  const rightX = netX + block.w + LEAD / 2;
  const faultX = panelRight + LEAD / 2;
  const near: LiveRule = { kind: "loop", side: "near" };
  const far: LiveRule = { kind: "loop", side: "far" };

  const items: Drawable[] = [
    { type: "wire", x1: panelRight, y1: lineY, x2: faultX, y2: lineY, live: near },
    { type: "wire", x1: faultX, y1: lineY, x2: netX, y2: lineY, live: far },
    ...shift(block.items, netX, netY),
    { type: "wire", x1: netX + block.w, y1: lineY, x2: rightX, y2: lineY, live: far },
    { type: "wire", x1: rightX, y1: lineY, x2: rightX, y2: returnY, live: far },
    { type: "wire", x1: rightX, y1: returnY, x2: faultX, y2: returnY, live: far },
    { type: "wire", x1: faultX, y1: returnY, x2: panelRight, y2: returnY, live: near },
  ];

  return {
    width: rightX + MARGIN,
    height: returnY + 22 + MARGIN + bottomSpace,
    items,
    terminalA: { x: panelRight, y: lineY },
    terminalB: { x: panelRight, y: returnY },
    panel: { x: MARGIN, y: lineY - 24, w: PANEL_W, h: returnY - lineY + 48 },
    faultX,
  };
}
