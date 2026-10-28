"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { CircuitDiagram, type CircuitDiagramProps } from "./CircuitDiagram";

const ZOOMS = [1, 1.5, 2, 3];

/** Inline diagram with an "Expand" control that opens a full-screen, zoomable view. */
export function DiagramViewer(props: CircuitDiagramProps & { stateLabel: string }) {
  const [expanded, setExpanded] = useState(false);
  const [zoom, setZoom] = useState(1);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!expanded) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setExpanded(false);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [expanded]);

  return (
    <>
      <div className="rounded-xl border border-line bg-ink-950 p-2">
        <CircuitDiagram {...props} />
        <div className="mt-1 flex justify-end">
          <button
            type="button"
            onClick={() => {
              setZoom(1);
              setExpanded(true);
            }}
            className="inline-flex h-11 items-center gap-1.5 rounded-lg border border-line-strong bg-ink-900 px-3 text-xs font-medium text-fg hover:bg-ink-800"
          >
            <Icon name="search" className="size-4" />
            Expand
          </button>
        </div>
      </div>

      {expanded && (
        <div role="dialog" aria-modal="true" aria-label={`${props.title} — expanded diagram`} className="fixed inset-0 z-50 flex flex-col bg-ink-950">
          <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-line px-3">
            <div role="group" aria-label="Zoom" className="flex items-center gap-1">
              <button
                type="button"
                aria-label="Zoom out"
                disabled={zoom === ZOOMS[0]}
                onClick={() => setZoom(ZOOMS[Math.max(0, ZOOMS.indexOf(zoom) - 1)]!)}
                className="grid size-11 place-items-center rounded-lg border border-line-strong text-lg text-fg disabled:opacity-40"
              >
                −
              </button>
              <span className="w-14 text-center font-mono text-sm text-fg-muted" aria-live="polite">
                {Math.round(zoom * 100)}%
              </span>
              <button
                type="button"
                aria-label="Zoom in"
                disabled={zoom === ZOOMS[ZOOMS.length - 1]}
                onClick={() => setZoom(ZOOMS[Math.min(ZOOMS.length - 1, ZOOMS.indexOf(zoom) + 1)]!)}
                className="grid size-11 place-items-center rounded-lg border border-line-strong text-lg text-fg disabled:opacity-40"
              >
                +
              </button>
            </div>
            <button
              ref={closeRef}
              type="button"
              onClick={() => setExpanded(false)}
              className="inline-flex h-11 items-center gap-1.5 rounded-lg border border-line-strong px-3 text-sm font-medium text-fg"
            >
              <Icon name="close" className="size-4" />
              Close
            </button>
          </div>
          {/* Native scrolling plus browser pinch-zoom; buttons give precise zoom steps. */}
          <div className="flex-1 overflow-auto p-3" style={{ touchAction: "pan-x pan-y pinch-zoom" }}>
            <div style={{ width: `${zoom * 100}%`, minWidth: "100%" }}>
              <CircuitDiagram {...props} />
            </div>
          </div>
          <p className="shrink-0 border-t border-line px-4 py-2 text-xs text-fg-subtle">Showing: {props.stateLabel}</p>
        </div>
      )}
    </>
  );
}
