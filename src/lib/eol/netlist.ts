/**
 * General circuit-graph evaluator for resistance between two nodes.
 *
 * The EOL engine (engine.ts) works on authored series/parallel trees. User-built
 * wiring (Circuit Lab) can form any graph — bridges, bypasses, dangling parts —
 * so this module evaluates arbitrary networks of two-terminal elements with
 * nodal analysis. It deliberately does one job: DC resistance between two nodes.
 *
 *   1. Zero-ohm elements (wires, closed contacts) merge their end nodes.
 *   2. If the two measurement nodes merge, the reading is a short (0 Ω).
 *   3. If no resistor path joins them, the reading is open (Infinity).
 *   4. Otherwise: inject 1 A at A, hold B at 0 V, solve G·V = I on the
 *      connected component; R = V(A). Resistors whose ends merged are bypassed.
 */

export type Element =
  | { kind: "wire"; a: string; b: string; id?: string }
  | { kind: "resistor"; a: string; b: string; ohms: number; id?: string }
  | { kind: "switch"; a: string; b: string; closed: boolean; id?: string };

export type NetlistResult =
  | { ok: true; ohms: number }
  /** The network could not be evaluated reliably (e.g. an invalid value). Never invent a reading. */
  | { ok: false; reason: string };

class UnionFind {
  private parent = new Map<string, string>();
  find(x: string): string {
    if (!this.parent.has(x)) this.parent.set(x, x);
    let root = x;
    while (this.parent.get(root) !== root) root = this.parent.get(root)!;
    // Path compression.
    let cur = x;
    while (this.parent.get(cur) !== root) {
      const next = this.parent.get(cur)!;
      this.parent.set(cur, root);
      cur = next;
    }
    return root;
  }
  union(a: string, b: string) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }
}

/** Groups of nodes joined by zero-ohm elements (wires and closed switches). */
export function zeroOhmGroups(elements: Element[]): UnionFind {
  const uf = new UnionFind();
  for (const e of elements) {
    uf.find(e.a);
    uf.find(e.b);
    if (e.kind === "wire" || (e.kind === "switch" && e.closed)) uf.union(e.a, e.b);
  }
  return uf;
}

/** True when the two nodes are joined by wires/closed switches alone (a dead short between them). */
export function shortedTogether(elements: Element[], a: string, b: string): boolean {
  const uf = zeroOhmGroups(elements);
  return uf.find(a) === uf.find(b);
}

function solve(matrix: number[][], rhs: number[]): number[] | null {
  const n = rhs.length;
  const m = matrix.map((row, i) => [...row, rhs[i]!]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(m[r]![col]!) > Math.abs(m[pivot]![col]!)) pivot = r;
    if (Math.abs(m[pivot]![col]!) < 1e-15) return null;
    [m[col], m[pivot]] = [m[pivot]!, m[col]!];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = m[r]![col]! / m[col]![col]!;
      if (f === 0) continue;
      for (let c = col; c <= n; c++) m[r]![c]! -= f * m[col]![c]!;
    }
  }
  return m.map((row, i) => row[n]! / row[i]!);
}

export function resistanceBetween(elements: Element[], a: string, b: string): NetlistResult {
  for (const e of elements) {
    if (e.kind === "resistor" && !(e.ohms > 0 && Number.isFinite(e.ohms))) {
      return { ok: false, reason: `Resistor ${e.id ?? ""} has an invalid value.`.replace("  ", " ") };
    }
  }
  const uf = zeroOhmGroups(elements);
  uf.find(a);
  uf.find(b);
  const A = uf.find(a);
  const B = uf.find(b);
  if (A === B) return { ok: true, ohms: 0 };

  // Resistors between distinct groups (a resistor whose ends merged is bypassed).
  const edges = elements
    .filter((e): e is Extract<Element, { kind: "resistor" }> => e.kind === "resistor")
    .map((e) => ({ u: uf.find(e.a), v: uf.find(e.b), g: 1 / e.ohms }))
    .filter((e) => e.u !== e.v);

  // Connected component of A through resistors.
  const adjacency = new Map<string, string[]>();
  for (const e of edges) {
    adjacency.set(e.u, [...(adjacency.get(e.u) ?? []), e.v]);
    adjacency.set(e.v, [...(adjacency.get(e.v) ?? []), e.u]);
  }
  const component = new Set<string>([A]);
  const queue = [A];
  while (queue.length) {
    for (const next of adjacency.get(queue.shift()!) ?? []) {
      if (!component.has(next)) {
        component.add(next);
        queue.push(next);
      }
    }
  }
  if (!component.has(B)) return { ok: true, ohms: Number.POSITIVE_INFINITY };

  // Nodal analysis on the component with B as the 0 V reference.
  const unknowns = [...component].filter((n) => n !== B);
  const index = new Map(unknowns.map((n, i) => [n, i]));
  const G = unknowns.map(() => unknowns.map(() => 0));
  for (const { u, v, g } of edges) {
    if (!component.has(u)) continue;
    const iu = index.get(u);
    const iv = index.get(v);
    if (iu !== undefined) G[iu]![iu]! += g;
    if (iv !== undefined) G[iv]![iv]! += g;
    if (iu !== undefined && iv !== undefined) {
      G[iu]![iv]! -= g;
      G[iv]![iu]! -= g;
    }
  }
  const I = unknowns.map((n) => (n === A ? 1 : 0));
  const V = solve(G, I);
  if (!V) return { ok: false, reason: "The circuit could not be solved reliably." };
  const ohms = V[index.get(A)!]!;
  if (!Number.isFinite(ohms) || ohms <= 0) return { ok: false, reason: "The circuit could not be solved reliably." };
  // Remove floating-point noise (e.g. 4399.999999 → 4400).
  return { ok: true, ohms: Math.round(ohms * 1e6) / 1e6 };
}
