/**
 * Circuit Lab bench model: a generic NC PIR detector, a panel zone input and
 * a two-way joint block. Pure data + a reducer; no UI.
 *
 * Terminal labels are illustrative generic labels, not any manufacturer's
 * terminal arrangement.
 */
import type { Element } from "@/lib/eol/netlist";

export type PointId =
  | "panel-z"
  | "panel-com"
  | "panel-aux-pos"
  | "panel-aux-neg"
  | "det-12v"
  | "det-0v"
  | "alm-com"
  | "alm-nc"
  | "tmp-com"
  | "tmp-nc"
  | "j1"
  | "j2";

export type PointGroup = "panel-zone" | "panel-power" | "detector-power" | "detector-alarm" | "detector-tamper" | "joint";

export interface BenchPoint {
  id: PointId;
  /** Label printed beside the terminal. */
  label: string;
  /** Full name for screen readers and feedback, e.g. "ALARM NC terminal". */
  name: string;
  group: PointGroup;
  description: string;
  /** Pre-wired power terminals on the panel are not available for user wiring. */
  connectable: boolean;
}

export const BENCH_POINTS: BenchPoint[] = [
  { id: "panel-aux-pos", label: "AUX +", name: "panel AUX + (12 V detector supply)", group: "panel-power", description: "Detector supply from the panel. Pre-wired for this exercise.", connectable: false },
  { id: "panel-aux-neg", label: "AUX −", name: "panel AUX − (0 V)", group: "panel-power", description: "Detector supply return. Pre-wired for this exercise.", connectable: false },
  { id: "panel-z", label: "Z1", name: "panel zone input Z1 (Z+)", group: "panel-zone", description: "Zone input. The panel measures resistance between Z1 and COM.", connectable: true },
  { id: "panel-com", label: "COM", name: "panel zone common COM (Z−)", group: "panel-zone", description: "Zone common: the return side of the zone loop.", connectable: true },
  { id: "j1", label: "J1", name: "joint J1", group: "joint", description: "Spare joint terminal for joining conductors or fitting a resistor in the cable.", connectable: true },
  { id: "j2", label: "J2", name: "joint J2", group: "joint", description: "Spare joint terminal for joining conductors or fitting a resistor in the cable.", connectable: true },
  { id: "det-12v", label: "+12V", name: "detector +12V terminal", group: "detector-power", description: "Powers the detector's electronics. Not part of the alarm zone.", connectable: true },
  { id: "det-0v", label: "0V", name: "detector 0V terminal", group: "detector-power", description: "Detector supply return. Not part of the alarm zone.", connectable: true },
  { id: "alm-com", label: "COM", name: "ALARM COM terminal", group: "detector-alarm", description: "Common of the alarm relay contact.", connectable: true },
  { id: "alm-nc", label: "NC", name: "ALARM NC terminal", group: "detector-alarm", description: "Normally closed side of the alarm relay: closed when sealed, opens when the PIR detects movement.", connectable: true },
  { id: "tmp-com", label: "COM", name: "TAMPER COM terminal", group: "detector-tamper", description: "Common of the tamper switch.", connectable: true },
  { id: "tmp-nc", label: "NC", name: "TAMPER NC terminal", group: "detector-tamper", description: "Normally closed side of the tamper switch: closed while the cover is on, opens if it is removed.", connectable: true },
];

export const POINTS_BY_ID = Object.fromEntries(BENCH_POINTS.map((p) => [p.id, p])) as Record<PointId, BenchPoint>;
export const POWER_POINTS: PointId[] = ["det-12v", "det-0v"];

/** Zone measurement terminals. */
export const ZONE_A: PointId = "panel-z";
export const ZONE_B: PointId = "panel-com";

/** The detector's internal contacts (fixed, not user wiring). */
export const ALARM_CONTACT = { a: "alm-com", b: "alm-nc" } as const;
export const TAMPER_CONTACT = { a: "tmp-com", b: "tmp-nc" } as const;

export type ComponentKind = "wire" | "resistor";

export interface PlacedComponent {
  id: string;
  kind: ComponentKind;
  /** Resistors only. */
  ohms?: number;
  a: PointId;
  b: PointId;
}

export interface TrayItem {
  key: string;
  kind: ComponentKind;
  ohms?: number;
  label: string;
  /** Colour bands for a 4-band resistor, for the drawing. */
  bands?: string[];
}

export const TRAY: TrayItem[] = [
  { key: "wire", kind: "wire", label: "Wire" },
  { key: "r2200", kind: "resistor", ohms: 2200, label: "2.2 kΩ resistor", bands: ["red", "red", "red", "gold"] },
  { key: "r4700", kind: "resistor", ohms: 4700, label: "4.7 kΩ resistor", bands: ["yellow", "violet", "red", "gold"] },
  { key: "r10000", kind: "resistor", ohms: 10000, label: "10 kΩ resistor", bands: ["brown", "black", "orange", "gold"] },
];

/* ------------------------------------------------------------------ state */

export interface BenchState {
  components: PlacedComponent[];
  /** Previous component lists, for Undo. */
  history: PlacedComponent[][];
  nextId: number;
}

export const EMPTY_BENCH: BenchState = { components: [], history: [], nextId: 1 };

export type BenchAction =
  | { type: "place"; kind: ComponentKind; ohms?: number; a: PointId; b: PointId }
  | { type: "remove"; id: string }
  /** Reposition an existing component (keeps its identity and label). */
  | { type: "move"; id: string; a: PointId; b: PointId }
  | { type: "undo" }
  | { type: "reset" }
  | { type: "load"; components: PlacedComponent[] };

export function benchReducer(state: BenchState, action: BenchAction): BenchState {
  const snapshot = () => [...state.history, state.components].slice(-50);
  switch (action.type) {
    case "place": {
      if (action.a === action.b) return state;
      if (!POINTS_BY_ID[action.a]?.connectable || !POINTS_BY_ID[action.b]?.connectable) return state;
      if (action.kind === "resistor" && !(action.ohms && action.ohms > 0)) return state;
      const component: PlacedComponent = { id: `c${state.nextId}`, kind: action.kind, a: action.a, b: action.b, ...(action.kind === "resistor" ? { ohms: action.ohms } : {}) };
      return { components: [...state.components, component], history: snapshot(), nextId: state.nextId + 1 };
    }
    case "remove":
      if (!state.components.some((c) => c.id === action.id)) return state;
      return { ...state, components: state.components.filter((c) => c.id !== action.id), history: snapshot() };
    case "move": {
      if (action.a === action.b) return state;
      if (!POINTS_BY_ID[action.a]?.connectable || !POINTS_BY_ID[action.b]?.connectable) return state;
      if (!state.components.some((c) => c.id === action.id)) return state;
      return { ...state, components: state.components.map((c) => (c.id === action.id ? { ...c, a: action.a, b: action.b } : c)), history: snapshot() };
    }
    case "undo": {
      if (state.history.length === 0) return state;
      return { ...state, components: state.history[state.history.length - 1]!, history: state.history.slice(0, -1) };
    }
    case "reset":
      return state.components.length === 0 ? state : { ...EMPTY_BENCH, history: snapshot(), nextId: state.nextId };
    case "load": {
      const valid = action.components.filter(
        (c) => POINTS_BY_ID[c.a]?.connectable && POINTS_BY_ID[c.b]?.connectable && c.a !== c.b && (c.kind === "wire" || (c.ohms ?? 0) > 0),
      );
      const max = Math.max(0, ...valid.map((c) => Number(c.id.replace(/^c/, "")) || 0));
      return { components: valid, history: [], nextId: max + 1 };
    }
  }
}

/** Display names: R1, R2… for resistors and W1, W2… for wires, in placement order. */
export function componentLabels(components: PlacedComponent[]): Record<string, string> {
  let r = 0;
  let w = 0;
  return Object.fromEntries(components.map((c) => [c.id, c.kind === "resistor" ? `R${++r}` : `W${++w}`]));
}

/* --------------------------------------------------------- electrical view */

export type BenchStateKind = "sealed" | "alarm" | "tamper" | "cable-open" | "cable-short";

/**
 * The zone circuit as a netlist for one test state. Detector power terminals
 * belong to a separate circuit (pre-wired to the panel AUX supply) and are
 * not part of the zone measurement. `extra` adds undrawn elements such as a
 * training fault.
 */
export function zoneNetlist(components: PlacedComponent[], state: BenchStateKind, extra: Element[] = []): Element[] {
  let user: Element[] = [
    ...components.map((c) =>
      c.kind === "wire" ? { kind: "wire" as const, a: c.a, b: c.b, id: c.id } : { kind: "resistor" as const, a: c.a, b: c.b, ohms: c.ohms!, id: c.id },
    ),
    // Hidden wiring (e.g. a fault inside a joint) that isn't drawn on the bench.
    ...extra,
  ];
  // Cable open: the zone input conductor is cut at the panel.
  if (state === "cable-open") user = user.filter((e) => e.a !== ZONE_A && e.b !== ZONE_A);
  const contacts: Element[] = [
    { kind: "switch", ...ALARM_CONTACT, closed: state !== "alarm" },
    { kind: "switch", ...TAMPER_CONTACT, closed: state !== "tamper" },
  ];
  // Cable short: the two zone conductors touch.
  const fault: Element[] = state === "cable-short" ? [{ kind: "wire", a: ZONE_A, b: ZONE_B }] : [];
  return [...user, ...contacts, ...fault];
}
