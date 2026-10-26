"use client";

import { useState } from "react";
import type { Element } from "@/lib/eol/netlist";
import { resistorCode } from "@/lib/eol/engine";
import { POINTS_BY_ID, SEALED_CONTACTS, TRAY, componentLabels, type BenchAction, type ContactState, type PlacedComponent, type PointId } from "@/lib/lab/bench";
import { NO_PROBES, isSupplyPoint, measure, SUPPLY_WARNING, type Probes } from "@/lib/lab/meter";
import { Icon } from "@/components/ui/Icon";
import { Multimeter, pointShortName as short, type ProbeColor } from "./Multimeter";
import { WiringBench } from "./WiringBench";

type TrayKey = (typeof TRAY)[number]["key"];
type Tool = TrayKey | `probe-${ProbeColor}`;

const BAND_HEX: Record<string, string> = { red: "#dc2626", yellow: "#facc15", violet: "#8b5cf6", brown: "#8b5a2b", black: "#111", orange: "#f08c00", gold: "#c9a227" };

function describe(c: PlacedComponent, label: string): string {
  const kind = c.kind === "resistor" ? `${label} ${resistorCode(c.ohms!)}` : label;
  return `${kind}: ${POINTS_BY_ID[c.a].name} → ${POINTS_BY_ID[c.b].name}`;
}

export interface BenchWorkspaceProps {
  components: PlacedComponent[];
  canUndo: boolean;
  dispatch: (action: BenchAction) => void;
  /** Parent resets its own state (bench, checks); the workspace clears placement, selection and probes. */
  onReset: () => void;
  resetLabel?: string;
  /** Allow Reset even when the bench is empty (e.g. to restore an exercise's starting circuit). */
  resetAlwaysEnabled?: boolean;
  /** Undrawn elements included in measurements (e.g. a hidden training fault). */
  extra?: Element[];
  /** Drawn components that don't conduct (e.g. a conductor broken inside its insulation). */
  inactive?: string[];
  flagged?: Set<string>;
  /** Primary actions shown beside Undo / Reset (e.g. Check wiring). */
  actions?: React.ReactNode;
  initialTool?: Tool | null;
  initialMessage?: string;
}

/** Tray, interactive bench, multimeter, and edit controls — shared by the build and fault-finding exercises. */
export function BenchWorkspace(props: BenchWorkspaceProps) {
  const { components, dispatch } = props;
  const [tool, setTool] = useState<Tool | null>(props.initialTool === undefined ? "wire" : props.initialTool);
  const [pending, setPending] = useState<PointId | null>(null);
  const [moving, setMoving] = useState<string | null>(null);
  const [selectedComponent, setSelectedComponent] = useState<string | null>(null);
  const [selectedPoint, setSelectedPoint] = useState<PointId | null>(null);
  const [probes, setProbes] = useState<Probes>(NO_PROBES);
  const [contacts, setContacts] = useState<ContactState>(SEALED_CONTACTS);
  const [message, setMessage] = useState(props.initialMessage ?? "Choose a component from the tray, then tap two terminals to connect it.");

  const labels = componentLabels(components);
  const probeTool: ProbeColor | null = tool === "probe-red" ? "red" : tool === "probe-black" ? "black" : null;
  const toolItem = TRAY.find((t) => t.key === tool);
  const armed = moving !== null || toolItem !== undefined;
  const movingComponent = components.find((c) => c.id === moving);
  const selected = components.find((c) => c.id === selectedComponent);
  const inspected = selectedPoint ? POINTS_BY_ID[selectedPoint] : null;
  const conducting = props.inactive?.length ? components.filter((c) => !props.inactive!.includes(c.id)) : components;
  const reading = measure(conducting, probes, contacts, props.extra);

  function cancelPlacement() {
    setPending(null);
    setMoving(null);
  }

  function chooseTool(key: Tool) {
    cancelPlacement();
    setSelectedPoint(null);
    if (tool === key) {
      setTool(null);
      setMessage("Inspect mode: tap a terminal to read what it does.");
      return;
    }
    setTool(key);
    if (key === "probe-red" || key === "probe-black") {
      setMessage(`Tap a terminal to place the ${key === "probe-red" ? "red (V Ω)" : "black (COM)"} probe.`);
    } else {
      setMessage(`${TRAY.find((t) => t.key === key)!.label} selected. Tap the start terminal.`);
    }
  }

  function placeProbe(color: ProbeColor, id: PointId) {
    if (isSupplyPoint(id)) {
      setMessage(`${POINTS_BY_ID[id].name}: ${SUPPLY_WARNING}`);
      return;
    }
    const next = { ...probes, [color]: id };
    setProbes(next);
    const other: ProbeColor = color === "red" ? "black" : "red";
    if (!next[other]) {
      setTool(`probe-${other}`);
      setMessage(`${color === "red" ? "Red" : "Black"} probe on ${short(id)}. Now tap a terminal for the ${other} probe.`);
    } else {
      setMessage(`${color === "red" ? "Red" : "Black"} probe on ${short(id)}. Read the meter, or tap another terminal to move it.`);
    }
  }

  function onPoint(id: PointId) {
    const point = POINTS_BY_ID[id];
    if (probeTool) {
      placeProbe(probeTool, id);
      return;
    }
    if (!armed) {
      setSelectedComponent(null);
      setSelectedPoint(selectedPoint === id ? null : id);
      return;
    }
    if (!point.connectable) {
      setMessage(`${point.name} is pre-wired to the detector's power terminals and isn't available. Choose another terminal.`);
      return;
    }
    if (pending === null) {
      setPending(id);
      setSelectedComponent(null);
      setMessage(`Start: ${short(id)}. Now tap the end terminal, or tap ${short(id)} again to cancel.`);
      return;
    }
    if (pending === id) {
      setPending(null);
      setMessage("Start point cleared. Tap a start terminal.");
      return;
    }
    if (movingComponent) {
      dispatch({ type: "move", id: movingComponent.id, a: pending, b: id });
      setMessage(`Moved ${labels[movingComponent.id]} to ${short(pending)} → ${short(id)}.`);
      setSelectedComponent(movingComponent.id);
      setMoving(null);
    } else if (toolItem) {
      const n = components.filter((c) => c.kind === toolItem.kind).length + 1;
      const label = toolItem.kind === "resistor" ? `R${n} (${resistorCode(toolItem.ohms!)})` : `W${n}`;
      dispatch({ type: "place", kind: toolItem.kind, ohms: toolItem.ohms, a: pending, b: id });
      setMessage(`Placed ${label} from ${short(pending)} to ${short(id)}. Tap another start terminal to place more.`);
    }
    setPending(null);
  }

  function onComponent(id: string) {
    cancelPlacement();
    setSelectedPoint(null);
    setSelectedComponent(selectedComponent === id ? null : id);
  }

  function remove(id: string) {
    setMessage(`Removed ${labels[id]}. Undo restores it.`);
    dispatch({ type: "remove", id });
    setSelectedComponent(null);
    cancelPlacement();
  }

  function startMove(id: string) {
    if (probeTool) setTool(null);
    setMoving(id);
    setPending(null);
    setSelectedPoint(null);
    setMessage(`Moving ${labels[id]}: tap its new start terminal.`);
  }

  function reset() {
    props.onReset();
    cancelPlacement();
    setSelectedComponent(null);
    setSelectedPoint(null);
    setProbes(NO_PROBES);
    setMessage("Reset. Undo restores the previous wiring.");
  }

  return (
    <div
      className="flex flex-col"
      onKeyDown={(e) => {
        if (e.key === "Escape" && (pending || moving || probeTool)) {
          cancelPlacement();
          if (probeTool) setTool(null);
          setMessage("Cancelled.");
        }
      }}
    >
      <div role="group" aria-label="Component tray" className="flex flex-wrap gap-2">
        {TRAY.map((t) => {
          const active = tool === t.key && !moving;
          return (
            <button
              key={t.key}
              type="button"
              aria-pressed={active}
              onClick={() => chooseTool(t.key)}
              className={`flex h-11 items-center gap-2 rounded-lg border px-3 text-sm font-medium ${
                active ? "border-signal-400 bg-signal-500/15 text-signal-300" : "border-line-strong text-fg-muted hover:text-fg"
              }`}
            >
              {t.kind === "wire" ? (
                <span className="h-0.5 w-5 rounded bg-current" aria-hidden="true" />
              ) : (
                <span className="flex h-3 w-6 items-center justify-center gap-[2px] rounded-sm bg-[#e8d6b0]" aria-hidden="true">
                  {t.bands!.map((b, i) => (
                    <span key={i} className="h-3 w-[3px]" style={{ background: BAND_HEX[b] }} />
                  ))}
                </span>
              )}
              {t.kind === "wire" ? "Wire" : resistorCode(t.ohms!)}
              {active && <span className="sr-only"> (selected)</span>}
            </button>
          );
        })}
      </div>

      <p className="mt-2 min-h-10 rounded-lg bg-ink-850 px-3 py-2 text-sm text-fg" role="status" aria-live="polite" data-testid="bench-status">
        {message}
      </p>

      <div className="mt-2">
        <Multimeter
          reading={reading}
          probes={probes}
          activeProbe={probeTool}
          contacts={contacts}
          onContacts={setContacts}
          onArmProbe={(c) => chooseTool(`probe-${c}`)}
          onRemoveProbe={(c) => {
            setProbes({ ...probes, [c]: null });
            setMessage(`${c === "red" ? "Red" : "Black"} probe removed.`);
          }}
        />
      </div>

      <div className="mt-2 rounded-xl border border-line bg-ink-950 p-1">
        <WiringBench
          components={components}
          pending={pending}
          armed={armed || probeTool !== null}
          selectedComponent={selectedComponent}
          selectedPoint={selectedPoint}
          flagged={props.flagged ?? new Set()}
          contacts={contacts}
          onContact={(which) => {
            const next = { ...contacts, [which]: contacts[which] === "open" ? "closed" : "open" } as ContactState;
            setContacts(next);
            setMessage(`${which === "alarm" ? "ALARM" : "TAMPER"} contact ${next[which] === "open" ? "opened" : "closed"}.`);
          }}
          probes={probes}
          probeMode={probeTool !== null}
          onPoint={onPoint}
          onComponent={onComponent}
        />
      </div>

      {(pending || moving) && (
        <div className="mt-2 flex items-center justify-between gap-2 rounded-lg border border-signal-400/40 bg-signal-500/10 px-3 py-2 text-sm text-fg">
          <span>
            {moving ? `Moving ${labels[moving]}` : `Placing ${toolItem?.kind === "resistor" ? resistorCode(toolItem.ohms!) + " resistor" : "wire"}`}
            {pending ? ` · start ${short(pending)} → choose end` : " · choose start"}
          </span>
          <button
            type="button"
            onClick={() => {
              cancelPlacement();
              setMessage("Placement cancelled.");
            }}
            className="h-9 shrink-0 px-1 font-medium text-signal-400 hover:text-signal-300"
          >
            Cancel
          </button>
        </div>
      )}

      {inspected && (
        <div className="mt-2 rounded-lg border border-line bg-ink-850 px-3 py-2 text-sm" data-testid="terminal-info">
          <p className="font-semibold text-fg">{inspected.name}</p>
          <p className="mt-0.5 text-fg-muted">{inspected.description}</p>
        </div>
      )}

      {selected && (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-line bg-ink-850 px-3 py-2 text-sm" data-testid="selected-component">
          <span className="min-w-0 flex-1 text-fg">{describe(selected, labels[selected.id]!)}</span>
          <button type="button" onClick={() => startMove(selected.id)} className="h-10 rounded-lg border border-line-strong px-3 font-medium text-fg hover:bg-ink-800">
            Move
          </button>
          <button type="button" onClick={() => remove(selected.id)} className="h-10 rounded-lg border border-fault/50 px-3 font-medium text-fault hover:bg-fault/10">
            Remove
          </button>
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {props.actions}
        <button
          type="button"
          onClick={() => {
            dispatch({ type: "undo" });
            cancelPlacement();
            setSelectedComponent(null);
            setMessage("Undid the last change.");
          }}
          disabled={!props.canUndo}
          className="h-11 rounded-lg border border-line-strong px-4 text-sm font-medium text-fg hover:bg-ink-800 disabled:opacity-40"
        >
          Undo
        </button>
        <button
          type="button"
          onClick={reset}
          disabled={!props.resetAlwaysEnabled && components.length === 0}
          className="h-11 rounded-lg border border-line-strong px-4 text-sm font-medium text-fg hover:bg-ink-800 disabled:opacity-40"
        >
          {props.resetLabel ?? "Reset"}
        </button>
      </div>

      <details className="mt-3 rounded-lg border border-line px-3 py-2 text-sm" open={components.length > 0}>
        <summary className="cursor-pointer font-medium text-fg">Placed components ({components.length})</summary>
        {components.length === 0 ? (
          <p className="mt-2 text-fg-muted">Nothing placed yet.</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-1.5" aria-label="Placed components">
            {components.map((c) => (
              <li key={c.id} className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onComponent(c.id)}
                  aria-pressed={c.id === selectedComponent}
                  className={`min-h-10 min-w-0 flex-1 rounded-lg px-2 text-left ${c.id === selectedComponent ? "bg-signal-500/15 text-signal-300" : "text-fg hover:bg-ink-850"}`}
                >
                  <span className="font-mono font-semibold">{labels[c.id]}</span>{" "}
                  <span className="text-fg-muted">
                    {c.kind === "resistor" ? `${resistorCode(c.ohms!)} · ` : "wire · "}
                    {short(c.a)} → {short(c.b)}
                  </span>
                </button>
                <button type="button" onClick={() => remove(c.id)} aria-label={`Remove ${labels[c.id]}`} className="grid size-10 shrink-0 place-items-center rounded-lg text-fg-muted hover:text-fault">
                  <Icon name="close" className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </details>
    </div>
  );
}
