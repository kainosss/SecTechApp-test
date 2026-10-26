import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CircuitDiagram, circuitTone, type CircuitDiagramProps } from "@/components/eol/CircuitDiagram";
import { DiagramViewer } from "@/components/eol/DiagramViewer";
import { layoutCircuit } from "@/lib/eol/layout";
import { isLive, liveContext } from "@/lib/eol/live";
import { C, R, circuit, deolNetwork, parallel, series } from "./fixtures";

const deol = circuit(deolNetwork(2200, 2200)); // series(parallel(ALM, RA), RE, TMP)
const SEALED = { ALM: "closed", TMP: "closed" } as const;

function renderDiagram(over: Partial<CircuitDiagramProps> = {}) {
  const { container } = render(
    <CircuitDiagram circuit={deol} positions={SEALED} normalPositions={SEALED} line="intact" banner="generic" title="DEOL test" {...over} />,
  );
  return container;
}
const attr = (c: Element, id: string, a: string) => c.querySelector(`[data-component="${id}"]`)?.getAttribute(a);

describe("layout: SVG topology matches the circuit", () => {
  it("places every component once; parallel branches share rails with junction dots", () => {
    const l = layoutCircuit(series(parallel(C("ALM"), R("RA", 2200)), R("RE", 2200)));
    expect(l.items.filter((d) => d.type === "resistor" || d.type === "contact")).toHaveLength(3);
    expect(l.items.filter((d) => d.type === "dot")).toHaveLength(4);
    const alm = l.items.find((d) => d.type === "contact") as { x: number; y: number };
    const ra = l.items.find((d) => d.type === "resistor" && d.node.id === "RA") as { x: number; y: number };
    expect(alm.x).toBe(ra.x); // side by side electrically = stacked in the drawing
    expect(ra.y).toBeGreaterThan(alm.y);
  });

  it("puts series components on one line, left to right, and tags each with its circuit path", () => {
    const l = layoutCircuit(series(C("ALM"), R("R1", 2200)));
    const [a, b] = l.items.filter((d) => d.type === "resistor" || d.type === "contact") as { x: number; y: number; path: string }[];
    expect(a!.y).toBe(b!.y);
    expect(a!.x).toBeLessThan(b!.x);
    expect([a!.path, b!.path]).toEqual(["0.0", "0.1"]);
  });

  it("lights only the rail segments that actually carry current", () => {
    const l = layoutCircuit(deolNetwork(2200, 2200));
    const rails = l.items.filter((d) => d.type === "wire" && d.live.kind === "rail");
    expect(rails).toHaveLength(2); // one gap between the two branches, left + right
    const sealed = liveContext(deol.network, SEALED, "intact");
    const alarm = liveContext(deol.network, { ALM: "open", TMP: "closed" }, "intact");
    expect(rails.every((w) => w.type === "wire" && !isLive(w.live, sealed))).toBe(true); // current takes the closed contact, top branch
    expect(rails.every((w) => w.type === "wire" && isLive(w.live, alarm))).toBe(true); // current goes down to RA
  });
});

describe("CircuitDiagram", () => {
  it("labels terminals, both resistors with values and role, and both contacts with function and type", () => {
    renderDiagram();
    expect(document.querySelector('[data-terminal="Z"]')).not.toBeNull();
    expect(document.querySelector('[data-terminal="COM"]')).not.toBeNull();
    expect(screen.getAllByText("2k2")).toHaveLength(2);
    expect(screen.getByText("EOL")).toBeInTheDocument();
    expect(screen.getByText("ALARM")).toBeInTheDocument();
    expect(screen.getByText("ALARM · NC")).toBeInTheDocument();
    expect(screen.getByText("TAMPER · NC")).toBeInTheDocument();
  });

  it("sealed: the closed alarm contact bypasses the alarm resistor (teal); alarm: current flows through it (amber)", () => {
    let c = renderDiagram();
    expect(c.querySelector("svg")?.getAttribute("data-tone")).toBe("sealed");
    expect(attr(c, "ALM", "data-position")).toBe("closed");
    expect(attr(c, "RA", "data-live")).toBe("false");
    expect(attr(c, "RE", "data-live")).toBe("true");
    c.remove();
    c = renderDiagram({ positions: { ALM: "open", TMP: "closed" } });
    expect(c.querySelector("svg")?.getAttribute("data-tone")).toBe("alarm");
    expect(attr(c, "ALM", "data-position")).toBe("open");
    expect(attr(c, "RA", "data-live")).toBe("true");
  });

  it("tamper open: nothing conducts and the condition is red", () => {
    const c = renderDiagram({ positions: { ALM: "closed", TMP: "open" } });
    expect(c.querySelector("svg")?.getAttribute("data-tone")).toBe("fault");
    expect(c.querySelectorAll('[data-wire][data-live="true"]')).toHaveLength(0);
  });

  it("cable short: only the wires between the panel and the short are live; the detector is bypassed", () => {
    const c = renderDiagram({ line: "short" });
    expect(c.querySelector('[data-fault="short"]')).not.toBeNull();
    expect(c.querySelectorAll('[data-wire][data-live="true"]')).toHaveLength(2);
    expect(attr(c, "RE", "data-live")).toBe("false");
    const open = renderDiagram({ line: "open" });
    expect(open.querySelector('[data-fault="open"]')).not.toBeNull();
    expect(open.querySelectorAll('[data-wire][data-live="true"]')).toHaveLength(0);
  });

  it("contacts and resistors are tappable buttons when handlers are given", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    const onSelect = vi.fn();
    renderDiagram({ onToggleContact: onToggle, onSelectResistor: onSelect });
    await user.click(screen.getByRole("button", { name: /alarm contact ALM \(NC\), closed\. Tap to open/ }));
    expect(onToggle).toHaveBeenCalledWith("ALM");
    screen.getByRole("button", { name: /tamper contact TMP/ }).focus();
    await user.keyboard("{Enter}");
    expect(onToggle).toHaveBeenCalledWith("TMP");
    await user.click(screen.getByRole("button", { name: /Resistor RA, 2.2 kΩ, alarm resistor/ }));
    expect(onSelect).toHaveBeenCalledWith("RA");
  });

  it("labels generic and custom circuits with one concise line; fictional demonstrations keep the full banner", () => {
    renderDiagram({ banner: "generic" });
    expect(screen.getByText("Generic circuit · Not a panel-specific installation diagram.")).toBeInTheDocument();
    renderDiagram({ banner: "custom" });
    expect(screen.getByText("Custom circuit · Panel compatibility not confirmed.")).toBeInTheDocument();
    renderDiagram({ banner: "demonstration" });
    expect(screen.getByText("DEMONSTRATION ONLY — NOT AN INSTALLATION DIAGRAM")).toBeInTheDocument();
    renderDiagram({ banner: "unverified" });
    expect(screen.getByText("NOT VERIFIED — NOT AN APPROVED INSTALLATION DIAGRAM")).toBeInTheDocument();
    const confirmed = renderDiagram({ banner: "none" });
    expect(confirmed.querySelector("[data-banner], [data-footer]")).toBeNull();
  });

  it("animates conventional-current dashes only on live wires, and only when asked", () => {
    expect(renderDiagram().querySelectorAll(".fw-current")).toHaveLength(0);
    const c = renderDiagram({ animateCurrent: true });
    const animated = c.querySelectorAll(".fw-current").length;
    expect(animated).toBe(c.querySelectorAll('[data-wire][data-live="true"]').length);
    expect(renderDiagram({ animateCurrent: true, positions: { ALM: "closed", TMP: "open" } }).querySelectorAll(".fw-current")).toHaveLength(0);
  });

  it("tone: tamper beats alarm; cable faults are red", () => {
    expect(circuitTone(deol, { ALM: "open", TMP: "open" }, SEALED, "intact")).toBe("fault");
    expect(circuitTone(deol, SEALED, SEALED, "short")).toBe("fault");
  });
});

describe("DiagramViewer", () => {
  it("expands to a full-screen zoomable view and closes with Escape", async () => {
    const user = userEvent.setup();
    render(<DiagramViewer circuit={deol} positions={SEALED} normalPositions={SEALED} line="intact" banner="generic" title="DEOL test" stateLabel="Normal" />);
    await user.click(screen.getByRole("button", { name: "Expand" }));
    expect(screen.getByRole("dialog", { name: /expanded diagram/ })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(screen.getByText("150%")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
