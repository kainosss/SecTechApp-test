"use client";

import { BENCH_POINTS, POWER_POINTS, TRAY, componentLabels, type PlacedComponent, type PointId } from "@/lib/lab/bench";
import { resistorCode } from "@/lib/eol/engine";
import { isSupplyPoint, type Probes } from "@/lib/lab/meter";

/* Same palette as the EOL diagrams. */
const C = {
  board: "#0f1a2e",
  boardStroke: "#2a3d63",
  pcb: "#0d2a2a",
  pcbStroke: "#1f5a52",
  text: "#e7edf7",
  muted: "#9aa9c3",
  subtle: "#6b7c9b",
  signal: "#3fd9c2",
  wire: "#c7d2e3",
  fault: "#f87171",
  amber: "#fbbf24",
  powerPos: "#ef4444",
  powerNeg: "#64748b",
  brass: "#c9a227",
  resistorBody: "#e8d6b0",
};

const BAND_COLOR: Record<string, string> = {
  black: "#111111",
  brown: "#8b5a2b",
  red: "#dc2626",
  orange: "#f08c00",
  yellow: "#facc15",
  violet: "#8b5cf6",
  gold: "#c9a227",
};

/** Fixed drawing positions for every terminal (viewBox 360 × 500). */
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

const BOARD_MID = 250;

/** A gentle curve between two terminals; parallel components on the same pair fan out. */
function geometry(c: PlacedComponent, index: number) {
  const a = POINT_XY[c.a];
  const b = POINT_XY[c.b];
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  let nx = -dy / len;
  let ny = dx / len;
  const midY = (a.y + b.y) / 2;
  // Bulge toward the middle of the bench so leads don't lie over the terminal strips.
  if ((midY > BOARD_MID && ny > 0) || (midY <= BOARD_MID && ny < 0) || (Math.abs(ny) < 1e-6 && nx < 0)) {
    nx = -nx;
    ny = -ny;
  }
  const sameRow = Math.abs(dy) < 1;
  const bulge = (sameRow ? 76 : 16) + index * 24;
  const cx = (a.x + b.x) / 2 + nx * bulge * 2;
  const cy = (a.y + b.y) / 2 + ny * bulge * 2;
  // Quadratic midpoint (t = 0.5) and the tangent there (parallel to a→b).
  const mx = 0.25 * a.x + 0.5 * cx + 0.25 * b.x;
  const my = 0.25 * a.y + 0.5 * cy + 0.25 * b.y;
  let angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  if (angle > 90) angle -= 180;
  if (angle <= -90) angle += 180;
  return { d: `M${a.x} ${a.y} Q${cx} ${cy} ${b.x} ${b.y}`, mx, my, angle, nx, ny };
}

export interface WiringBenchProps {
  components: PlacedComponent[];
  /** First terminal chosen for the component being placed. */
  pending: PointId | null;
  /** True while a tray item (or a move) is armed, so connectable terminals are valid targets. */
  armed: boolean;
  selectedComponent: string | null;
  selectedPoint: PointId | null;
  /** Components flagged by the latest wiring check. */
  flagged: Set<string>;
  /** Detector contact positions to draw (default: both closed). */
  contacts?: { alarm: "open" | "closed"; tamper: "open" | "closed" };
  /** Multimeter probe positions. */
  probes?: Probes;
  /** Placing a probe: supply terminals aren't valid targets. */
  probeMode?: boolean;
  onPoint: (id: PointId) => void;
  onComponent: (id: string) => void;
}

/**
 * Illustrative wiring bench. Terminals and placed components are real
 * buttons (tap, click, Enter or Space). The drawing is generated from the
 * bench state; the electrical check never looks at it.
 */
export function WiringBench(props: WiringBenchProps) {
  const { components, pending, armed, selectedComponent, selectedPoint, flagged } = props;
  const contacts = props.contacts ?? { alarm: "closed", tamper: "closed" };
  const probes = props.probes ?? { red: null, black: null };
  const labels = componentLabels(components);
  const pairCount = new Map<string, number>();
  const placed = components.map((c) => {
    const pair = [c.a, c.b].sort().join("|");
    const index = pairCount.get(pair) ?? 0;
    pairCount.set(pair, index + 1);
    return { c, g: geometry(c, index) };
  });
  const keyActivate = (fn: () => void) => (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      fn();
    }
  };
  const endpoints = new Set<PointId>();
  const sel = components.find((c) => c.id === selectedComponent);
  if (sel) {
    endpoints.add(sel.a);
    endpoints.add(sel.b);
  }

  return (
    <svg viewBox="0 0 360 500" className="block h-auto w-full select-none" role="group" aria-label="Wiring bench" data-testid="wiring-bench">
      {/* Panel */}
      <rect x="10" y="10" width="340" height="100" rx="10" fill={C.board} stroke={C.boardStroke} />
      <text x="22" y="28" fill={C.muted} fontSize="10" fontWeight="600" letterSpacing="1.5">
        PANEL (GENERIC)
      </text>
      <text x="78" y="44" textAnchor="middle" fill={C.subtle} fontSize="9" letterSpacing="1">
        AUX POWER
      </text>
      <text x="252" y="44" textAnchor="middle" fill={C.signal} fontSize="9" fontWeight="600" letterSpacing="1">
        ZONE 1 INPUT
      </text>
      <line x1="40" y1="48" x2="116" y2="48" stroke={C.subtle} strokeWidth="0.75" />
      <line x1="200" y1="48" x2="305" y2="48" stroke={C.signal} strokeWidth="0.75" strokeOpacity="0.6" />

      {/* Joint block */}
      <rect x="150" y="214" width="140" height="48" rx="8" fill={C.board} stroke={C.boardStroke} />
      <text x="220" y="276" textAnchor="middle" fill={C.subtle} fontSize="9" letterSpacing="1">
        JOINT BLOCK
      </text>

      {/* Detector PCB */}
      <rect x="10" y="368" width="340" height="124" rx="10" fill={C.pcb} stroke={C.pcbStroke} />
      <text x="22" y="384" fill={C.muted} fontSize="10" fontWeight="600" letterSpacing="1.5">
        GENERIC NC PIR · ILLUSTRATIVE
      </text>
      <text x="66" y="402" textAnchor="middle" fill={C.subtle} fontSize="9" letterSpacing="1">
        POWER
      </text>
      <text x="186" y="402" textAnchor="middle" fill={C.amber} fontSize="9" fontWeight="600" letterSpacing="1">
        ALARM (NC)
      </text>
      <text x="294" y="402" textAnchor="middle" fill={C.fault} fontSize="9" fontWeight="600" letterSpacing="1">
        TAMPER (NC)
      </text>
      <line x1="30" y1="406" x2="102" y2="406" stroke={C.subtle} strokeWidth="0.75" />
      <line x1="150" y1="406" x2="222" y2="406" stroke={C.amber} strokeWidth="0.75" strokeOpacity="0.6" />
      <line x1="258" y1="406" x2="330" y2="406" stroke={C.fault} strokeWidth="0.75" strokeOpacity="0.6" />

      {/* Internal contacts in the selected detector state. */}
      {(
        [
          ["alm-com", "alm-nc", C.amber, "relay", contacts.alarm === "open"],
          ["tmp-com", "tmp-nc", C.fault, "switch", contacts.tamper === "open"],
        ] as const
      ).map(([a, b, color, name, open]) => {
        const pa = POINT_XY[a];
        const pb = POINT_XY[b];
        const y = 466;
        return (
          <g key={a} aria-hidden="true">
            <path d={`M${pa.x} ${pa.y + 12} V${y} H${pa.x + 14} M${pb.x - 14} ${y} H${pb.x} V${pb.y + 12}`} fill="none" stroke={color} strokeWidth="1.5" strokeOpacity="0.8" />
            <circle cx={pa.x + 14} cy={y} r="2.2" fill={color} />
            <circle cx={pb.x - 14} cy={y} r="2.2" fill={color} />
            <line x1={pa.x + 14} y1={y} x2={pb.x - 15} y2={open ? y - 11 : y - 2} stroke={color} strokeWidth="2" data-contact={a} data-open={open} />
            <text x={(pa.x + pb.x) / 2} y={y + 18} textAnchor="middle" fill={C.muted} fontSize="8">
              {name} {open ? "OPEN" : "closed"}
            </text>
          </g>
        );
      })}

      {/* Pre-wired power: a separate subsystem from the zone loop. */}
      <g aria-hidden="true">
        <path d={`M50 86 C50 220 40 300 40 420`} fill="none" stroke={C.powerPos} strokeWidth="2.5" strokeDasharray="6 4" strokeOpacity="0.7" />
        <path d={`M105 86 C105 220 92 300 92 420`} fill="none" stroke={C.powerNeg} strokeWidth="2.5" strokeDasharray="6 4" />
        <text transform="translate(66 290) rotate(-90)" textAnchor="middle" fill={C.muted} fontSize="9">
          POWER (PRE-WIRED)
        </text>
      </g>

      {/* Placed components */}
      {placed.map(({ c, g }) => {
        const selected = c.id === selectedComponent;
        const onPower = POWER_POINTS.includes(c.a) || POWER_POINTS.includes(c.b);
        const bad = onPower || flagged.has(c.id);
        const stroke = bad ? C.fault : c.kind === "wire" ? C.wire : C.muted;
        const tray = TRAY.find((t) => t.kind === "resistor" && t.ohms === c.ohms);
        const label = labels[c.id]!;
        const name = c.kind === "resistor" ? `${label}, ${resistorCode(c.ohms!)} resistor` : `${label}, wire`;
        const from = BENCH_POINTS.find((p) => p.id === c.a)!.name;
        const to = BENCH_POINTS.find((p) => p.id === c.b)!.name;
        return (
          <g
            key={c.id}
            role="button"
            tabIndex={0}
            aria-pressed={selected}
            aria-label={`${name} from ${from} to ${to}${bad ? " (flagged)" : ""}`}
            onClick={() => props.onComponent(c.id)}
            onKeyDown={keyActivate(() => props.onComponent(c.id))}
            className="fw-bench-target cursor-pointer outline-none"
            data-component={c.id}
          >
            {/* Wide invisible hit area along the lead. */}
            <path d={g.d} fill="none" stroke="transparent" strokeWidth="20" />
            {selected && <path d={g.d} fill="none" stroke={C.signal} strokeWidth="8" strokeOpacity="0.35" strokeLinecap="round" />}
            <path
              className="fw-focus-ring"
              d={g.d}
              fill="none"
              stroke={C.text}
              strokeWidth="7"
              strokeOpacity="0"
              strokeLinecap="round"
            />
            <path d={g.d} fill="none" stroke={stroke} strokeWidth={c.kind === "wire" ? 2.5 : 1.5} strokeDasharray={bad ? "5 3" : undefined} strokeLinecap="round" />
            {c.kind === "resistor" ? (
              <g transform={`translate(${g.mx} ${g.my}) rotate(${g.angle})`}>
                <rect x="-17" y="-6" width="34" height="12" rx="5" fill={C.resistorBody} stroke={bad ? C.fault : selected ? C.signal : "#8c7a55"} strokeWidth={bad || selected ? 2 : 1} />
                {(tray?.bands ?? []).map((band, i) => (
                  <rect key={i} x={[-11, -5, 1, 9][i]} y="-6" width="3" height="12" fill={BAND_COLOR[band]} />
                ))}
              </g>
            ) : null}
            <g transform={`translate(${g.mx + g.nx * (c.kind === "resistor" ? 18 : 10)} ${g.my + g.ny * (c.kind === "resistor" ? 18 : 10)})`}>
              <rect x="-22" y="-8" width="44" height="15" rx="4" fill="#0b1424" fillOpacity="0.85" />
              <text textAnchor="middle" y="3.5" fill={bad ? C.fault : selected ? C.signal : C.text} fontSize="10" fontWeight="600" fontFamily="ui-monospace, monospace">
                {bad ? "! " : ""}
                {label}
                {c.kind === "resistor" ? ` ${resistorCode(c.ohms!)}` : ""}
              </text>
            </g>
          </g>
        );
      })}

      {/* Terminals (drawn last so they stay on top of leads). */}
      {BENCH_POINTS.map((p) => {
        const { x, y } = POINT_XY[p.id];
        const isPending = pending === p.id;
        const isTarget = armed && p.connectable && !isPending && !(props.probeMode && isSupplyPoint(p.id));
        const isSelected = selectedPoint === p.id;
        const isEnd = endpoints.has(p.id);
        const labelY = p.group === "joint" ? y + 20 : y - 16;
        const fill = p.connectable ? C.brass : "#4b5563";
        return (
          <g
            key={p.id}
            role="button"
            tabIndex={0}
            aria-label={`${p.name}${isPending ? " (start point selected)" : ""}${p.connectable ? "" : " (pre-wired, not available)"}${
              probes.red === p.id ? " (red probe)" : ""
            }${probes.black === p.id ? " (black probe)" : ""}`}
            aria-pressed={isPending || isSelected}
            onClick={() => props.onPoint(p.id)}
            onKeyDown={keyActivate(() => props.onPoint(p.id))}
            className="fw-bench-target cursor-pointer outline-none"
            data-point={p.id}
          >
            <circle cx={x} cy={y} r="22" fill="transparent" />
            <circle className="fw-focus-ring" cx={x} cy={y} r="17" fill="none" stroke={C.text} strokeWidth="2" strokeOpacity="0" />
            {isTarget && <circle cx={x} cy={y} r="13" fill="none" stroke={C.signal} strokeWidth="1.5" strokeDasharray="3 3" />}
            {(isPending || isSelected || isEnd) && <circle cx={x} cy={y} r="13" fill={C.signal} fillOpacity="0.2" stroke={C.signal} strokeWidth="2.5" />}
            <circle cx={x} cy={y} r="8" fill={fill} stroke="#0b1424" strokeWidth="1.5" />
            <line x1={x - 4} y1={y - 4} x2={x + 4} y2={y + 4} stroke="#3b3320" strokeWidth="1.5" />
            <text x={x} y={labelY} textAnchor="middle" fill={p.connectable ? C.text : C.subtle} fontSize="10" fontWeight="600" fontFamily="ui-monospace, monospace">
              {p.label}
            </text>
            {isPending && (
              <text x={x} y={p.group.startsWith("panel") ? y + 26 : y - 28} textAnchor="middle" fill={C.signal} fontSize="9" fontWeight="700" letterSpacing="1">
                START
              </text>
            )}
          </g>
        );
      })}

      {/* Meter probe tips: red (V Ω) marked "+", black (COM) marked "−". Not interactive, so taps reach the terminal. */}
      {(
        [
          ["red", probes.red, -14, "#ef4444", "#fecaca", "+"],
          ["black", probes.black, 14, "#111827", "#e5e7eb", "−"],
        ] as const
      ).map(([color, at, dx, fill, stroke, mark]) => {
        if (!at) return null;
        const { x, y } = POINT_XY[at];
        // Fan out when both probes are on the same terminal.
        const tx = probes.red === probes.black ? x + dx : x;
        const ty = y + 20;
        return (
          <g key={color} pointerEvents="none" aria-hidden="true" data-probe={color}>
            <line x1={x} y1={y} x2={tx} y2={ty} stroke={fill} strokeWidth="3" />
            <line x1={x} y1={y} x2={tx} y2={ty} stroke={stroke} strokeWidth="1" />
            <circle cx={tx} cy={ty} r="8" fill={fill} stroke={stroke} strokeWidth="1.5" />
            <text x={tx} y={ty + 4} textAnchor="middle" fill="#ffffff" fontSize="12" fontWeight="700">
              {mark}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
