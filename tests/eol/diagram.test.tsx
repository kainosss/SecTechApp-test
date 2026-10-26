import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CircuitDiagram } from "@/components/eol/CircuitDiagram";
import { DiagramViewer } from "@/components/eol/DiagramViewer";
import { layoutCircuit } from "@/lib/eol/layout";
import { C, R, circuit, deolNetwork, deolStates, parallel, series } from "./fixtures";

const deol = circuit(deolNetwork(4700, 2200));
const byState = (id: string) => deolStates.find((s) => s.id === id)!;

function renderDiagram(stateId: string, status: "verified" | "needs-verification" | "demonstration" = "demonstration") {
  const { container } = render(<CircuitDiagram circuit={deol} state={byState(stateId)} status={status} title="DEOL test" panelLabel="Panel" />);
  return container;
}

describe("layout", () => {
  it("places every component once and joins parallel branches with rails and junction dots", () => {
    const l = layoutCircuit(series(parallel(C("ALM"), R("RA", 2200)), R("RE", 4700)));
    expect(l.items.filter((d) => d.type === "resistor" || d.type === "contact")).toHaveLength(3);
    expect(l.items.filter((d) => d.type === "dot")).toHaveLength(4);
    const alm = l.items.find((d) => d.type === "contact") as { x: number; y: number };
    const ra = l.items.find((d) => d.type === "resistor" && d.node.id === "RA") as { x: number; y: number };
    expect(alm.x).toBe(ra.x);
    expect(ra.y).toBeGreaterThan(alm.y);
  });

  it("puts series components on the same line, left to right", () => {
    const l = layoutCircuit(series(C("ALM"), R("R1", 2200)));
    const [a, b] = l.items.filter((d) => d.type === "resistor" || d.type === "contact") as { x: number; y: number }[];
    expect(a!.y).toBe(b!.y);
    expect(a!.x).toBeLessThan(b!.x);
  });
});

describe("CircuitDiagram", () => {
  it("labels panel terminals, resistors with values and contacts with type", () => {
    const c = renderDiagram("normal");
    expect(c.querySelector('[data-terminal="Z"]')).not.toBeNull();
    expect(c.querySelector('[data-terminal="COM"]')).not.toBeNull();
    expect(screen.getByText("RE · 4k7")).toBeInTheDocument();
    expect(screen.getByText("RA · 2k2")).toBeInTheDocument();
    expect(screen.getByText("Alarm (NC)")).toBeInTheDocument();
    expect(screen.getByText("Tamper (NC)")).toBeInTheDocument();
  });

  it("draws contact positions and the live path from the selected state", () => {
    let c = renderDiagram("normal");
    expect(c.querySelector('[data-component="ALM"]')?.getAttribute("data-position")).toBe("closed");
    expect(c.querySelector('[data-component="RA"]')?.getAttribute("data-live")).toBe("false");
    c.remove();
    c = renderDiagram("alarm");
    expect(c.querySelector('[data-component="ALM"]')?.getAttribute("data-position")).toBe("open");
    expect(c.querySelector('[data-component="RA"]')?.getAttribute("data-live")).toBe("true");
  });

  it("marks cable faults", () => {
    expect(renderDiagram("cable-open").querySelector('[data-fault="open"]')).not.toBeNull();
    expect(renderDiagram("cable-short").querySelector('[data-fault="short"]')).not.toBeNull();
  });

  it("brands demonstration and unverified diagrams inside the drawing; verified ones carry no banner", () => {
    renderDiagram("normal", "demonstration");
    expect(screen.getByText("DEMONSTRATION ONLY — NOT AN INSTALLATION DIAGRAM")).toBeInTheDocument();
    renderDiagram("normal", "needs-verification");
    expect(screen.getByText("NOT VERIFIED — NOT AN APPROVED INSTALLATION DIAGRAM")).toBeInTheDocument();
    expect(renderDiagram("normal", "verified").querySelector("[data-banner]")).toBeNull();
  });
});

describe("DiagramViewer", () => {
  it("expands to a full-screen zoomable view and closes with Escape", async () => {
    const user = userEvent.setup();
    render(<DiagramViewer circuit={deol} state={byState("alarm")} status="demonstration" title="DEOL test" />);
    await user.click(screen.getByRole("button", { name: "Expand" }));
    const dialog = screen.getByRole("dialog", { name: /expanded diagram/ });
    expect(dialog).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(screen.getByText("150%")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
