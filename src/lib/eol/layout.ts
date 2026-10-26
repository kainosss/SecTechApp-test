/**
 * Turns a circuit tree into diagram geometry. Pure and deterministic: the
 * drawing is derived only from the circuit's series/parallel structure, so the
 * picture always matches the electrical connectivity used in calculations.
 *
 * Series components sit left to right on one wire. Parallel branches are
 * stacked between a left and right rail. The network is drawn as a loop from
 * panel terminal A, through the field devices, and back to terminal B.
 */
import type { CircuitNode, ContactNode, ResistorNode } from "./model";

export const UNIT_W = 80;
export const ROW_H = 74;
const GAP = 14;
const RAIL = 18;
export const PANEL_W = 76;
const LEAD = 34;
const RETURN = 22;
const MARGIN = 8;

export type Drawable =
  | { type: "wire"; x1: number; y1: number; x2: number; y2: number }
  | { type: "dot"; x: number; y: number }
  | { type: "resistor"; x: number; y: number; node: ResistorNode }
  | { type: "contact"; x: number; y: number; node: ContactNode };

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

function layoutBlock(node: CircuitNode): Block {
  if (node.kind === "resistor" || node.kind === "contact") {
    const item: Drawable = node.kind === "resistor" ? { type: "resistor", x: UNIT_W / 2, y: ENTRY_Y, node } : { type: "contact", x: UNIT_W / 2, y: ENTRY_Y, node };
    return { w: UNIT_W, h: ROW_H, items: [item] };
  }

  const children = node.children.map(layoutBlock);
  if (children.length === 0) return { w: GAP, h: ROW_H, items: [{ type: "wire", x1: 0, y1: ENTRY_Y, x2: GAP, y2: ENTRY_Y }] };

  if (node.kind === "series") {
    const items: Drawable[] = [];
    let x = 0;
    children.forEach((child, i) => {
      if (i > 0) {
        items.push({ type: "wire", x1: x, y1: ENTRY_Y, x2: x + GAP, y2: ENTRY_Y });
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
  for (const child of children) {
    const by = y + ENTRY_Y;
    branchYs.push(by);
    items.push({ type: "wire", x1: 0, y1: by, x2: RAIL, y2: by });
    items.push(...shift(child.items, RAIL, y));
    items.push({ type: "wire", x1: RAIL + child.w, y1: by, x2: w, y2: by });
    y += child.h;
  }
  const top = branchYs[0]!;
  const bottom = branchYs[branchYs.length - 1]!;
  items.push({ type: "wire", x1: 0, y1: top, x2: 0, y2: bottom }, { type: "wire", x1: w, y1: top, x2: w, y2: bottom });
  for (const by of branchYs) items.push({ type: "dot", x: 0, y: by }, { type: "dot", x: w, y: by });
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

export function layoutCircuit(network: CircuitNode, top = 0): DiagramLayout {
  const block = layoutBlock(network);
  const netX = MARGIN + PANEL_W + LEAD;
  const netY = top + MARGIN;
  const lineY = netY + ENTRY_Y;
  const returnY = netY + block.h + RETURN;
  const rightX = netX + block.w + LEAD / 2;

  const items: Drawable[] = [
    { type: "wire", x1: MARGIN + PANEL_W, y1: lineY, x2: netX, y2: lineY },
    ...shift(block.items, netX, netY),
    { type: "wire", x1: netX + block.w, y1: lineY, x2: rightX, y2: lineY },
    { type: "wire", x1: rightX, y1: lineY, x2: rightX, y2: returnY },
    { type: "wire", x1: rightX, y1: returnY, x2: MARGIN + PANEL_W, y2: returnY },
  ];

  return {
    width: rightX + MARGIN,
    height: returnY + 18 + MARGIN,
    items,
    terminalA: { x: MARGIN + PANEL_W, y: lineY },
    terminalB: { x: MARGIN + PANEL_W, y: returnY },
    panel: { x: MARGIN, y: lineY - 22, w: PANEL_W, h: returnY - lineY + 40 },
    faultX: MARGIN + PANEL_W + LEAD / 2,
  };
}
