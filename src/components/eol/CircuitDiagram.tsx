import { useId } from "react";
import { resistorCode, formatOhms, type ContactPositions } from "@/lib/eol/engine";
import { layoutCircuit, type Drawable } from "@/lib/eol/layout";
import { isLive, liveContext, type LiveContext } from "@/lib/eol/live";
import type { Circuit, CircuitState, ContactNode, ResistorNode } from "@/lib/eol/model";
import type { DiagramBanner } from "@/lib/eol/classification";

/** Colours match the app theme tokens (see globals.css). Colour is always paired with text labels. */
const COLOR = {
  sealed: "#3fd9c2",
  alarm: "#fbbf24",
  fault: "#f87171",
  dead: "#3a4a68",
  wire: "#9aa9c3",
  text: "#e7edf7",
  muted: "#9aa9c3",
  subtle: "#6b7c9b",
  panel: "#0f1a2e",
  panelStroke: "#2a3d63",
  body: "#0b1424",
  demo: "#f5c451",
  unverified: "#fb923c",
};

export type CircuitTone = "sealed" | "alarm" | "fault";

/** Colour theme for the current condition: tamper or cable faults are red, alarm amber, sealed teal. */
export function circuitTone(circuit: Circuit, positions: ContactPositions, normal: ContactPositions, line: CircuitState["line"]): CircuitTone {
  if (line !== "intact") return "fault";
  const changed = (fn: ContactNode["function"]) => contactsOf(circuit).some((c) => c.function === fn && normal[c.id] && positions[c.id] !== normal[c.id]);
  if (changed("tamper")) return "fault";
  if (changed("alarm") || changed("other")) return "alarm";
  return "sealed";
}

function contactsOf(circuit: Circuit): ContactNode[] {
  const out: ContactNode[] = [];
  const walk = (n: Circuit["network"]) => {
    if (n.kind === "contact") out.push(n);
    else if (n.kind !== "resistor") n.children.forEach(walk);
  };
  walk(circuit.network);
  return out;
}

const ROLE_CHIP = {
  "end-of-line": { text: "EOL", color: COLOR.sealed },
  alarm: { text: "ALARM", color: COLOR.alarm },
  tamper: { text: "TAMPER", color: COLOR.fault },
  other: { text: "", color: COLOR.muted },
} as const;

const FUNCTION_STYLE = {
  alarm: { name: "ALARM", color: COLOR.alarm },
  tamper: { name: "TAMPER", color: COLOR.fault },
  other: { name: "CONTACT", color: COLOR.text },
} as const;

function Resistor(props: { x: number; y: number; node: ResistorNode; live: boolean; tone: string; selected?: boolean; onSelect?: (id: string) => void }) {
  const { x, y, node, live, tone, selected, onSelect } = props;
  const stroke = live ? tone : COLOR.dead;
  const chip = ROLE_CHIP[node.role];
  const value = node.ohms === null ? "?" : resistorCode(node.ohms);
  const interactive = Boolean(onSelect);
  return (
    <g
      data-component={node.id}
      data-live={live}
      {...(interactive
        ? {
            role: "button",
            tabIndex: 0,
            "aria-label": `Resistor ${node.id}, ${node.ohms === null ? "value not set" : formatOhms(node.ohms)}${chip.text ? `, ${chip.text.toLowerCase()} resistor` : ""}. Change value.`,
            "aria-pressed": selected ? true : undefined,
            onClick: () => onSelect!(node.id),
            onKeyDown: (e: React.KeyboardEvent) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect!(node.id);
              }
            },
            className: "group cursor-pointer outline-none",
          }
        : { "aria-label": `Resistor ${node.id}, ${node.ohms === null ? "value not set" : formatOhms(node.ohms)}` })}
    >
      {interactive && <rect x={x - 42} y={y - 36} width={84} height={70} rx={10} fill="transparent" />}
      {interactive && (
        <rect
          x={x - 38}
          y={y - 34}
          width={76}
          height={66}
          rx={9}
          fill="none"
          stroke={COLOR.sealed}
          strokeWidth={1.5}
          className={selected ? "opacity-100" : "opacity-0 group-hover:opacity-50 group-focus-visible:opacity-100"}
        />
      )}
      <line x1={x - 42} y1={y} x2={x - 23} y2={y} stroke={stroke} strokeWidth={live ? 3 : 2} strokeDasharray={live ? undefined : "4 5"} />
      <line x1={x + 23} y1={y} x2={x + 42} y2={y} stroke={stroke} strokeWidth={live ? 3 : 2} strokeDasharray={live ? undefined : "4 5"} />
      <rect x={x - 23} y={y - 9} width={46} height={18} rx={3} fill={COLOR.body} stroke={stroke} strokeWidth={2.2} />
      {/* Value as printed on a drawing, e.g. "R1 · 2k2". */}
      <text x={x} y={y - 15} textAnchor="middle" fontSize={14} fontWeight={700} fill={COLOR.text}>
        <tspan fill={COLOR.muted} fontWeight={600}>
          {node.id}
        </tspan>{" "}
        {value}
      </text>
      {chip.text && (
        <g>
          <rect x={x - 22} y={y + 14} width={44} height={15} rx={7.5} fill={chip.color} fillOpacity={0.14} stroke={chip.color} strokeOpacity={0.45} />
          <text x={x} y={y + 25} textAnchor="middle" fontSize={9.5} fontWeight={700} letterSpacing={0.6} fill={chip.color}>
            {chip.text}
          </text>
        </g>
      )}
    </g>
  );
}

function Contact(props: { x: number; y: number; node: ContactNode; position?: "open" | "closed"; live: boolean; tone: string; onToggle?: (id: string) => void }) {
  const { x, y, node, position, live, tone, onToggle } = props;
  const style = FUNCTION_STYLE[node.function];
  const stroke = live ? tone : position ? COLOR.wire : COLOR.fault;
  const left = x - 17;
  const right = x + 17;
  // Closed: blade rests on the right terminal. Open: blade lifted.
  const bladeEnd = position === "closed" ? { x: right, y: y - 3 } : { x: x + 9, y: y - 22 };
  const interactive = Boolean(onToggle) && Boolean(position);
  const next = position === "closed" ? "open" : "close";
  return (
    <g
      data-component={node.id}
      data-position={position ?? "unknown"}
      data-live={live}
      {...(interactive
        ? {
            role: "button",
            tabIndex: 0,
            "aria-label": `${style.name.toLowerCase()} contact ${node.id} (${node.type}), ${position}. Tap to ${next}.`,
            "aria-pressed": position === "open",
            onClick: () => onToggle!(node.id),
            onKeyDown: (e: React.KeyboardEvent) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onToggle!(node.id);
              }
            },
            className: "group cursor-pointer outline-none",
          }
        : { "aria-label": `${style.name.toLowerCase()} contact ${node.id} (${node.type}), ${position ?? "position unknown"}` })}
    >
      {interactive && <rect x={x - 42} y={y - 40} width={84} height={76} rx={10} fill="transparent" />}
      {interactive && (
        <rect
          x={x - 38}
          y={y - 37}
          width={76}
          height={70}
          rx={9}
          fill={style.color}
          fillOpacity={0.06}
          stroke={style.color}
          strokeOpacity={0.55}
          strokeDasharray="3 3"
          className="opacity-60 group-hover:opacity-100 group-focus-visible:opacity-100"
        />
      )}
      <line x1={x - 42} y1={y} x2={left} y2={y} stroke={live ? tone : COLOR.dead} strokeWidth={live ? 3 : 2} strokeDasharray={live ? undefined : "4 5"} />
      <line x1={right} y1={y} x2={x + 42} y2={y} stroke={live ? tone : COLOR.dead} strokeWidth={live ? 3 : 2} strokeDasharray={live ? undefined : "4 5"} />
      <circle cx={left} cy={y} r={3.6} fill={stroke} />
      <circle cx={right} cy={y} r={3.6} fill={position === "closed" ? stroke : COLOR.wire} />
      <line x1={left} y1={y} x2={bladeEnd.x} y2={bladeEnd.y} stroke={stroke} strokeWidth={3} strokeLinecap="round" />
      <text x={x} y={y - 26} textAnchor="middle" fontSize={11.5} fontWeight={700} letterSpacing={0.5} fill={style.color}>
        {style.name} · {node.type}
      </text>
      <text x={x} y={y + 24} textAnchor="middle" fontSize={11} fontWeight={600} letterSpacing={0.4} fill={position ? (position === "open" ? COLOR.text : COLOR.muted) : COLOR.fault}>
        {position ? position.toUpperCase() : "POSITION?"}
      </text>
    </g>
  );
}

function wireStyle(live: boolean, tone: string) {
  return live
    ? { stroke: tone, strokeWidth: 3, strokeLinecap: "round" as const }
    : { stroke: COLOR.dead, strokeWidth: 2, strokeDasharray: "4 5", strokeLinecap: "round" as const };
}

function draw(
  d: Drawable,
  i: number,
  ctx: LiveContext,
  positions: ContactPositions,
  tone: string,
  opts: { onToggleContact?: (id: string) => void; onSelectResistor?: (id: string) => void; selectedResistor?: string; animate: boolean },
) {
  switch (d.type) {
    case "wire": {
      const live = isLive(d.live, ctx);
      return (
        <g key={i} data-wire data-live={live}>
          <line x1={d.x1} y1={d.y1} x2={d.x2} y2={d.y2} {...wireStyle(live, tone)} />
          {live && opts.animate && (
            <line x1={d.x1} y1={d.y1} x2={d.x2} y2={d.y2} stroke="#ffffff" strokeOpacity={0.7} strokeWidth={1.6} strokeDasharray="2 14" className="fw-current" />
          )}
        </g>
      );
    }
    case "dot":
      return <circle key={i} cx={d.x} cy={d.y} r={4} fill={isLive(d.live, ctx) ? tone : COLOR.dead} />;
    case "resistor":
      return (
        <Resistor
          key={i}
          x={d.x}
          y={d.y}
          node={d.node}
          live={ctx.paths.has(d.path)}
          tone={tone}
          selected={opts.selectedResistor === d.node.id}
          onSelect={opts.onSelectResistor}
        />
      );
    case "contact":
      return <Contact key={i} x={d.x} y={d.y} node={d.node} position={positions[d.node.id]} live={ctx.paths.has(d.path)} tone={tone} onToggle={opts.onToggleContact} />;
  }
}

const BANNER_TEXT: Record<Exclude<DiagramBanner, "none" | "generic" | "custom">, { text: string; color: string }> = {
  demonstration: { text: "DEMONSTRATION ONLY — NOT AN INSTALLATION DIAGRAM", color: COLOR.demo },
  unverified: { text: "NOT VERIFIED — NOT AN APPROVED INSTALLATION DIAGRAM", color: COLOR.unverified },
  invalid: { text: "CIRCUIT HAS ERRORS — READINGS NOT VALIDATED", color: COLOR.fault },
};
const FOOTER_TEXT = {
  generic: { text: "Generic circuit · Not a panel-specific installation diagram.", color: COLOR.sealed },
  custom: { text: "Custom circuit · Panel compatibility not confirmed.", color: COLOR.alarm },
} as const;
const BANNER_H = 26;
const FOOTER_H = 20;

export interface CircuitDiagramProps {
  circuit: Circuit;
  /** Contact positions to draw. During cable faults pass the sealed positions. */
  positions: ContactPositions;
  line: CircuitState["line"];
  /** Sealed positions, used to colour the condition (alarm vs tamper). */
  normalPositions: ContactPositions;
  banner: DiagramBanner;
  panelLabel?: string;
  title: string;
  /** Rendered width in CSS pixels; defaults to fill the container. */
  width?: number;
  onToggleContact?: (id: string) => void;
  onSelectResistor?: (id: string) => void;
  selectedResistor?: string;
  /** Illustrative conventional-current dashes on conducting wires (generic circuits only). */
  animateCurrent?: boolean;
}

/**
 * Wiring diagram generated from validated circuit data. Highlighted wires are
 * exactly the conducting paths the engine reports; dashed grey wires carry no
 * measurement current (interrupted or bypassed).
 */
export function CircuitDiagram(props: CircuitDiagramProps) {
  const { circuit, positions, line, normalPositions, banner, panelLabel = "Panel input", title, width } = props;
  const hatchId = `hatch-${useId().replace(/:/g, "")}`;
  const big = banner === "demonstration" || banner === "unverified" || banner === "invalid";
  const footer = banner === "generic" || banner === "custom" ? FOOTER_TEXT[banner] : null;
  const top = big ? BANNER_H : 0;
  const layout = layoutCircuit(circuit.network, top, footer ? FOOTER_H : 0);
  const ctx = liveContext(circuit.network, positions, line);
  const toneName = circuitTone(circuit, positions, normalPositions, line);
  const tone = COLOR[toneName];
  const { panel, terminalA, terminalB } = layout;
  const interactive = Boolean(props.onToggleContact || props.onSelectResistor);

  return (
    <svg
      viewBox={`0 0 ${layout.width} ${layout.height}`}
      width={width ?? "100%"}
      role={interactive ? "group" : "img"}
      aria-label={`${title}. ${toneName === "sealed" ? "Sealed" : toneName === "alarm" ? "Alarm" : "Tamper or cable fault"} condition.`}
      className="block h-auto max-w-none font-sans select-none"
      style={width ? undefined : { maxWidth: "100%" }}
      data-tone={toneName}
      data-line={line}
    >
      <title>{title}</title>
      {banner === "demonstration" && (
        <defs>
          <pattern id={hatchId} width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="10" stroke={COLOR.demo} strokeOpacity={0.07} strokeWidth={6} />
          </pattern>
        </defs>
      )}
      {banner === "demonstration" && <rect x={0} y={0} width={layout.width} height={layout.height} fill={`url(#${hatchId})`} />}
      {big && (
        <g data-banner={banner}>
          <rect x={0} y={0} width={layout.width} height={BANNER_H - 6} rx={4} fill={BANNER_TEXT[banner].color} fillOpacity={0.14} stroke={BANNER_TEXT[banner].color} strokeOpacity={0.5} />
          <text x={layout.width / 2} y={14} textAnchor="middle" fontSize={10.5} fontWeight={700} letterSpacing={0.6} fill={BANNER_TEXT[banner].color}>
            {BANNER_TEXT[banner].text}
          </text>
        </g>
      )}

      {/* Panel and its two input terminals */}
      <rect x={panel.x} y={panel.y} width={panel.w} height={panel.h} rx={8} fill={COLOR.panel} stroke={COLOR.panelStroke} strokeWidth={1.5} />
      <text x={panel.x + 10} y={panel.y + panel.h / 2 - 10} fontSize={9.5} fontWeight={700} letterSpacing={0.8} fill={COLOR.subtle}>
        PANEL
      </text>
      <text x={panel.x + 10} y={panel.y + panel.h / 2 + 6} fontSize={11} fill={COLOR.muted}>
        {panelLabel.length > 11 ? `${panelLabel.slice(0, 10)}…` : panelLabel}
      </text>
      {[
        { t: terminalA, label: circuit.terminals.a.label },
        { t: terminalB, label: circuit.terminals.b.label },
      ].map(({ t, label }) => (
        <g key={label} data-terminal={label}>
          <rect x={t.x - 34} y={t.y - 11} width={38} height={22} rx={6} fill="#0a1222" stroke={COLOR.sealed} strokeOpacity={0.7} strokeWidth={1.5} />
          <text x={t.x - 15} y={t.y + 4.5} textAnchor="middle" fontSize={12.5} fontWeight={700} fill={COLOR.text}>
            {label}
          </text>
        </g>
      ))}

      {layout.items
        .filter((d) => d.type === "wire" || d.type === "dot")
        .map((d, i) => draw(d, i, ctx, positions, tone, { animate: Boolean(props.animateCurrent) }))}
      {layout.items
        .filter((d) => d.type === "resistor" || d.type === "contact")
        .map((d, i) =>
          draw(d, 10_000 + i, ctx, positions, tone, {
            animate: false,
            onToggleContact: props.onToggleContact,
            onSelectResistor: props.onSelectResistor,
            selectedResistor: props.selectedResistor,
          }),
        )}

      {line === "open" && (
        <g data-fault="open">
          <rect x={layout.faultX - 8} y={terminalA.y - 5} width={16} height={10} fill="#060b16" />
          <path d={`M${layout.faultX - 7} ${terminalA.y - 8} l14 16 M${layout.faultX + 7} ${terminalA.y - 8} l-14 16`} stroke={COLOR.fault} strokeWidth={3} strokeLinecap="round" />
          <text x={layout.faultX} y={terminalA.y - 14} textAnchor="middle" fontSize={10.5} fontWeight={700} letterSpacing={0.5} fill={COLOR.fault}>
            CUT
          </text>
        </g>
      )}
      {line === "short" && (
        <g data-fault="short">
          <line x1={layout.faultX} y1={terminalA.y} x2={layout.faultX} y2={terminalB.y} stroke={COLOR.fault} strokeWidth={3} />
          <circle cx={layout.faultX} cy={terminalA.y} r={4} fill={COLOR.fault} />
          <circle cx={layout.faultX} cy={terminalB.y} r={4} fill={COLOR.fault} />
          <text x={layout.faultX} y={terminalB.y + 16} textAnchor="middle" fontSize={10.5} fontWeight={700} letterSpacing={0.5} fill={COLOR.fault}>
            SHORT
          </text>
        </g>
      )}

      {footer && (
        <text data-footer x={8} y={layout.height - 7} fontSize={11} fontWeight={600} fill={footer.color} fillOpacity={0.9}>
          {footer.text}
        </text>
      )}
    </svg>
  );
}
