import { useId } from "react";
import { conductingComponents, resistorCode, type ContactPositions } from "@/lib/eol/engine";
import { layoutCircuit, type Drawable } from "@/lib/eol/layout";
import type { Circuit, CircuitState, ContactNode, ResistorNode } from "@/lib/eol/model";
import type { VerificationStatus } from "@/lib/content/schema";

/** Colours match the app theme tokens (see globals.css). */
const COLOR = {
  wire: "#9aa9c3",
  live: "#e7edf7",
  dim: "#4a5a78",
  text: "#e7edf7",
  muted: "#9aa9c3",
  panel: "#121e36",
  panelStroke: "#2a3d63",
  alarm: "#7eecdc",
  tamper: "#c4b5fd",
  fault: "#f87171",
  demo: "#f5c451",
  unverified: "#fb923c",
};

const ROLE_SHORT = { "end-of-line": "EOL", alarm: "Alarm", tamper: "Tamper", other: "" } as const;
const BANNER_H = 26;

function Resistor({ x, y, node, live }: { x: number; y: number; node: ResistorNode; live: boolean }) {
  const stroke = live ? COLOR.live : COLOR.dim;
  return (
    <g data-component={node.id} data-live={live} aria-label={`Resistor ${node.id}`}>
      <line x1={x - 40} y1={y} x2={x - 22} y2={y} stroke={COLOR.wire} strokeWidth={2} />
      <rect x={x - 22} y={y - 8} width={44} height={16} rx={2} fill="#0d172b" stroke={stroke} strokeWidth={2} />
      <line x1={x + 22} y1={y} x2={x + 40} y2={y} stroke={COLOR.wire} strokeWidth={2} />
      <text x={x} y={y - 16} textAnchor="middle" fontSize={13} fontWeight={600} fill={COLOR.text}>
        {node.id} · {node.ohms === null ? "value?" : resistorCode(node.ohms)}
      </text>
      <text x={x} y={y + 25} textAnchor="middle" fontSize={11} fill={COLOR.muted}>
        {ROLE_SHORT[node.role]}
      </text>
    </g>
  );
}

function Contact({ x, y, node, position, live }: { x: number; y: number; node: ContactNode; position?: "open" | "closed"; live: boolean }) {
  const colour = node.function === "tamper" ? COLOR.tamper : node.function === "alarm" ? COLOR.alarm : COLOR.text;
  const stroke = live ? COLOR.live : position ? COLOR.dim : COLOR.fault;
  const left = x - 16;
  const right = x + 16;
  // Closed: blade rests on the right terminal. Open: blade lifted ~35°.
  const bladeEnd = position === "closed" ? { x: right, y: y - 3 } : { x: x + 10, y: y - 20 };
  const name = node.label ?? (node.function === "tamper" ? "Tamper" : node.function === "alarm" ? "Alarm" : "Contact");
  return (
    <g data-component={node.id} data-position={position ?? "unknown"} data-live={live} aria-label={`${name} contact ${node.id}, ${node.type}, ${position ?? "position unknown"}`}>
      <line x1={x - 40} y1={y} x2={left} y2={y} stroke={COLOR.wire} strokeWidth={2} />
      <line x1={right} y1={y} x2={x + 40} y2={y} stroke={COLOR.wire} strokeWidth={2} />
      <circle cx={left} cy={y} r={3} fill={stroke} />
      <circle cx={right} cy={y} r={3} fill={stroke} />
      <line x1={left} y1={y} x2={bladeEnd.x} y2={bladeEnd.y} stroke={stroke} strokeWidth={2.5} strokeLinecap="round" />
      <text x={x} y={y - 24} textAnchor="middle" fontSize={13} fontWeight={600} fill={colour}>
        {name} ({node.type})
      </text>
      <text x={x} y={y + 25} textAnchor="middle" fontSize={11} fill={position ? COLOR.muted : COLOR.fault}>
        {position ? position : "position?"}
      </text>
    </g>
  );
}

function draw(d: Drawable, i: number, positions: ContactPositions, live: Set<string>) {
  switch (d.type) {
    case "wire":
      return <line key={i} x1={d.x1} y1={d.y1} x2={d.x2} y2={d.y2} stroke={COLOR.wire} strokeWidth={2} strokeLinecap="square" />;
    case "dot":
      return <circle key={i} cx={d.x} cy={d.y} r={3.5} fill={COLOR.wire} />;
    case "resistor":
      return <Resistor key={i} x={d.x} y={d.y} node={d.node} live={live.has(d.node.id)} />;
    case "contact":
      return <Contact key={i} x={d.x} y={d.y} node={d.node} position={positions[d.node.id]} live={live.has(d.node.id)} />;
  }
}

export interface CircuitDiagramProps {
  circuit: Circuit;
  state: CircuitState;
  status: VerificationStatus;
  panelLabel?: string;
  /** Rendered width in CSS pixels; defaults to fill the container. */
  width?: number;
  title: string;
}

/**
 * Wiring diagram generated from validated circuit data. Unverified and
 * demonstration circuits carry a banner inside the drawing itself, so a
 * screenshot can never be mistaken for an approved installation diagram.
 */
export function CircuitDiagram({ circuit, state, status, panelLabel = "Panel", width, title }: CircuitDiagramProps) {
  const hatchId = `hatch-${useId().replace(/:/g, "")}`;
  const banner = status !== "verified";
  const top = banner ? BANNER_H : 0;
  const layout = layoutCircuit(circuit.network, top);
  // During a cable fault the detector itself is undisturbed: contacts are drawn as supplied (normally the sealed positions).
  const positions: ContactPositions = state.contacts;
  let live = new Set<string>();
  if (state.line === "intact") {
    try {
      live = conductingComponents(circuit.network, positions);
    } catch {
      // Incomplete data: nothing highlighted; validation reports the problem.
    }
  }
  const { panel, terminalA, terminalB } = layout;
  const bannerText = status === "demonstration" ? "DEMONSTRATION ONLY — NOT AN INSTALLATION DIAGRAM" : "NOT VERIFIED — NOT AN APPROVED INSTALLATION DIAGRAM";
  const bannerColour = status === "demonstration" ? COLOR.demo : COLOR.unverified;

  return (
    <svg
      viewBox={`0 0 ${layout.width} ${layout.height}`}
      width={width ?? "100%"}
      role="img"
      aria-label={`${title}. ${state.label ?? state.kind} state.${banner ? ` ${bannerText.toLowerCase()}.` : ""}`}
      className="block h-auto max-w-none font-sans select-none"
      style={width ? undefined : { maxWidth: "100%" }}
      data-state={state.id}
    >
      <title>{title}</title>
      {status === "demonstration" && (
        <defs>
          <pattern id={hatchId} width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="10" stroke={COLOR.demo} strokeOpacity={0.07} strokeWidth={6} />
          </pattern>
        </defs>
      )}
      <rect x={0} y={0} width={layout.width} height={layout.height} fill={status === "demonstration" ? `url(#${hatchId})` : "none"} />
      {banner && (
        <g data-banner>
          <rect x={0} y={0} width={layout.width} height={BANNER_H - 6} fill={bannerColour} fillOpacity={0.14} stroke={bannerColour} strokeOpacity={0.5} />
          <text x={layout.width / 2} y={14} textAnchor="middle" fontSize={10.5} fontWeight={700} letterSpacing={0.6} fill={bannerColour}>
            {bannerText}
          </text>
        </g>
      )}

      {/* Panel with its two input terminals */}
      <rect x={panel.x} y={panel.y} width={panel.w} height={panel.h} rx={6} fill={COLOR.panel} stroke={COLOR.panelStroke} strokeWidth={1.5} />
      <text x={panel.x + 8} y={panel.y + panel.h / 2 + 4} fontSize={11} fill={COLOR.muted}>
        {panelLabel.length > 11 ? `${panelLabel.slice(0, 10)}…` : panelLabel}
      </text>
      {[
        { t: terminalA, label: circuit.terminals.a.label },
        { t: terminalB, label: circuit.terminals.b.label },
      ].map(({ t, label }) => (
        <g key={label} data-terminal={label}>
          <rect x={t.x - 8} y={t.y - 6} width={12} height={12} rx={2} fill="#0a1222" stroke={COLOR.live} strokeWidth={1.5} />
          <text x={t.x - 12} y={t.y + 4} textAnchor="end" fontSize={13} fontWeight={700} fill={COLOR.text}>
            {label}
          </text>
        </g>
      ))}

      {layout.items.map((d, i) => draw(d, i, positions, live))}

      {state.line === "open" && (
        <g data-fault="open">
          <rect x={layout.faultX - 7} y={terminalA.y - 4} width={14} height={8} fill="#060b16" />
          <path d={`M${layout.faultX - 6} ${terminalA.y - 7} l12 14 M${layout.faultX + 6} ${terminalA.y - 7} l-12 14`} stroke={COLOR.fault} strokeWidth={2.5} />
          <text x={layout.faultX} y={terminalA.y - 12} textAnchor="middle" fontSize={11} fontWeight={600} fill={COLOR.fault}>
            cut
          </text>
        </g>
      )}
      {state.line === "short" && (
        <g data-fault="short">
          <line x1={layout.faultX} y1={terminalA.y} x2={layout.faultX} y2={terminalB.y} stroke={COLOR.fault} strokeWidth={2.5} strokeDasharray="5 4" />
          <circle cx={layout.faultX} cy={terminalA.y} r={3.5} fill={COLOR.fault} />
          <circle cx={layout.faultX} cy={terminalB.y} r={3.5} fill={COLOR.fault} />
          <text x={layout.faultX} y={terminalB.y + 15} textAnchor="middle" fontSize={11} fontWeight={600} fill={COLOR.fault}>
            short
          </text>
        </g>
      )}
    </svg>
  );
}
