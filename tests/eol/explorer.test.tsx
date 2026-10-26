import { describe, expect, it } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CircuitExplorer } from "@/components/eol/CircuitExplorer";
import { listEolPresets, listGenericCircuits, type EolPreset, type WiringDetail } from "@/lib/content/repository";
import { classifyCircuit } from "@/lib/eol/classification";
import { circuitComponents } from "@/lib/eol/engine";
import { explainCircuit, interpretAgainstExample } from "@/lib/eol/explain";
import { buildExplorerCircuit, explorerToSearch, parseExplorer } from "@/lib/eol/explorer";

let templates: WiringDetail[];
let presets: EolPreset[];
async function load() {
  templates ??= await listGenericCircuits();
  presets ??= await listEolPresets();
}
const values = (m: ReturnType<typeof buildExplorerCircuit>) =>
  Object.fromEntries(circuitComponents(m.circuit.network).filter((c) => c.kind === "resistor").map((c) => [c.id, (c as { ohms: number }).ohms]));
const readings = (m: ReturnType<typeof buildExplorerCircuit>) => Object.fromEntries(m.analysis.states.map((s) => [s.kind, s.ohms]));

describe("explorer model", () => {
  it("defaults to the generic DEOL with two 2k2 resistors: 2k2 sealed, 4k4 alarm", async () => {
    await load();
    const m = buildExplorerCircuit(templates, presets, {});
    expect(m.template.inputType).toBe("double-eol");
    expect(m.preset?.label).toBe("2k2 / 4k4 generic DEOL example");
    expect(values(m)).toEqual({ R2: 2200, R1: 2200 });
    expect(readings(m)).toEqual({ normal: 2200, alarm: 4400, tamper: Infinity, "cable-open": Infinity, "cable-short": 0 });
    expect(m.ohms).toBe(2200);
    expect(m.classification).toBe("electrically-validated");
  });

  it("Integriti example (2k2/4k4) and Tecom example (10k/20k) solve correctly on both DEOL arrangements", async () => {
    await load();
    const alt = templates.find((t) => t.id === "demo-generic-deol-parallel")!.id;
    const integriti = buildExplorerCircuit(templates, presets, { p: "integriti-example" });
    expect(readings(integriti)).toMatchObject({ normal: 2200, alarm: 4400 });
    const integritiAlt = buildExplorerCircuit(templates, presets, { p: "integriti-example", t: alt });
    expect(readings(integritiAlt).normal).toBeCloseTo(2200, 6);
    expect(readings(integritiAlt).alarm).toBeCloseTo(4400, 6);
    // 4k4 is not a standard part: built from 2k2 + 2k2 in series in each position.
    expect(values(integritiAlt)).toEqual({ R1a: 2200, R1b: 2200, R2a: 2200, R2b: 2200 });

    const tecom = buildExplorerCircuit(templates, presets, { p: "tecom-example" });
    expect(values(tecom)).toEqual({ R2: 10000, R1: 10000 });
    expect(readings(tecom)).toMatchObject({ normal: 10000, alarm: 20000 });
    const tecomAlt = buildExplorerCircuit(templates, presets, { p: "tecom-example", t: alt });
    expect(values(tecomAlt)).toEqual({ R1: 20000, R2: 20000 });
    expect(readings(tecomAlt).normal).toBeCloseTo(10000, 6);
    expect(tecom.classification).toBe("electrically-validated"); // example values never imply manufacturer confirmation
  });

  it("edited resistor values recalculate and make the circuit custom", async () => {
    await load();
    const m = buildExplorerCircuit(templates, presets, { r: { R2: 4700 } });
    expect(m.modified).toBe(true);
    expect(readings(m)).toMatchObject({ normal: 2200, alarm: 6900 });
    expect(m.classification).toBe("custom");
    expect(buildExplorerCircuit(templates, presets, { r: { R2: 2200 } }).modified).toBe(false); // same as base
  });

  it("custom targets size the resistors; impossible targets fall back with a reason", async () => {
    await load();
    const m = buildExplorerCircuit(templates, presets, { p: "custom", seal: 4700, alarm: 9400 });
    expect(values(m)).toEqual({ R2: 4700, R1: 4700 });
    expect(m.classification).toBe("custom");
    const bad = buildExplorerCircuit(templates, presets, { p: "custom", seal: 4700, alarm: 1000 });
    expect(bad.solveError).toMatch(/alarm reading must be higher/);
    const teol = buildExplorerCircuit(templates, presets, { p: "integriti-example", t: "demo-generic-triple-eol" });
    expect(teol.solveError).toMatch(/add a tamper target/);
  });

  it("contact positions and cable faults come from the URL; unknown values are ignored", async () => {
    await load();
    const p = parseExplorer("?c=ALM:open,TMP:closed,BAD:x&line=short&r=R1:abc");
    expect(p).toMatchObject({ c: { ALM: "open", TMP: "closed" }, line: "short" });
    expect(p.r).toBeUndefined();
    const m = buildExplorerCircuit(templates, presets, { c: { ALM: "open", TMP: "closed" } });
    expect(m.ohms).toBe(4400);
    expect(m.matchedStateId).toBe("alarm");
    expect(parseExplorer(explorerToSearch({ t: "x", p: "custom", seal: 2200, r: { R1: 4700 }, c: { ALM: "open" }, line: "open" }))).toEqual({
      t: "x",
      p: "custom",
      seal: 2200,
      alarm: undefined,
      tamper: undefined,
      r: { R1: 4700 },
      c: { ALM: "open" },
      line: "open",
    });
  });
});

describe("classification keeps electrical validity separate from manufacturer confirmation", () => {
  const ok = { hasErrors: false, states: [{ ohms: 2200 }] } as never;
  it("never confirms generic or custom circuits, and never validates broken ones", () => {
    expect(classifyCircuit({ analysis: ok, manufacturerStatus: "verified", generic: true })).toBe("electrically-validated");
    expect(classifyCircuit({ analysis: ok, manufacturerStatus: "verified", generic: false, custom: true })).toBe("custom");
    expect(classifyCircuit({ analysis: ok, manufacturerStatus: "verified", generic: false })).toBe("manufacturer-confirmed");
    expect(classifyCircuit({ analysis: ok, manufacturerStatus: "needs-verification", generic: false })).toBe("needs-verification");
    expect(classifyCircuit({ analysis: { hasErrors: true, states: [] } as never, manufacturerStatus: "verified", generic: false })).toBe("invalid");
    expect(classifyCircuit({ analysis: { hasErrors: false, states: [{ ohms: null }] } as never, manufacturerStatus: "demonstration", generic: true })).toBe("invalid");
  });
});

describe("explanations", () => {
  it("explain alarm as two resistors in series, and individual vs total resistance", async () => {
    await load();
    const m = buildExplorerCircuit(templates, presets, {});
    const sealed = explainCircuit(m.circuit, m.normalPositions, m.normalPositions, "intact");
    expect(sealed.headline).toBe("Sealed (normal)");
    expect(sealed.equation).toBe("R1 = 2.2 kΩ");
    expect(sealed.bypassed.join(" ")).toMatch(/R2 is bypassed \(shorted out\) by the closed alarm contact \(ALM\)/);
    const alarm = explainCircuit(m.circuit, { ALM: "open", TMP: "closed" }, m.normalPositions, "intact");
    expect(alarm.changes[0]).toMatch(/alarm contact \(ALM\) has opened — it is closed when sealed/);
    expect(alarm.equation).toBe("R2 + R1 = 2.2 kΩ + 2.2 kΩ = 4.4 kΩ");
    expect(alarm.individualVsTotal).toMatch(/a total made from 2 resistors, not a single 4k4 part/);
    const tamper = explainCircuit(m.circuit, { ALM: "closed", TMP: "open" }, m.normalPositions, "intact");
    expect(tamper.path).toMatch(/open tamper contact \(TMP\) breaks the loop/);
    expect(explainCircuit(m.circuit, m.normalPositions, m.normalPositions, "short").ohms).toBe(0);
  });

  it("explains parallel arrangements", async () => {
    await load();
    const m = buildExplorerCircuit(templates, presets, { t: "demo-generic-deol-parallel", p: "tecom-example" });
    expect(explainCircuit(m.circuit, m.normalPositions, m.normalPositions, "intact").equation).toBe("R1 ∥ R2 = 20 kΩ ∥ 20 kΩ = 10 kΩ");
  });

  it("interprets readings against example values without claiming a real panel's behaviour", () => {
    const ex = { normal: 2200, alarm: 4400, label: "Integriti example" };
    expect(interpretAgainstExample(4400, ex)).toMatch(/Matches the alarm value .* A panel documented for these values would see this as alarm/);
    expect(interpretAgainstExample(3000, ex)).toMatch(/Matches neither value/);
    expect(interpretAgainstExample(Infinity, ex)).toMatch(/must come from that panel's documentation/);
  });
});

describe("CircuitExplorer (component)", () => {
  async function setup(search = "") {
    await load();
    window.history.replaceState(null, "", `/eol${search}`);
    render(<CircuitExplorer templates={templates} presets={presets} />);
    return userEvent.setup();
  }

  it("shows the DEOL circuit immediately with no selection steps", async () => {
    await setup();
    expect(screen.getByTestId("reading")).toHaveTextContent("2.2 kΩ");
    expect(screen.getByRole("radio", { name: "Dual EOL" })).toHaveAttribute("aria-checked", "true");
    // Animation is on by default and labelled as illustrative.
    expect(document.querySelectorAll("[data-particles] .fw-current").length).toBeGreaterThan(0);
    expect(screen.getByTestId("animation-note")).toHaveTextContent(/illustrative conventional-current path, not a measurement/);
    expect(screen.getByRole("button", { name: "Flow animation" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("radio", { name: "2k2 / 4k4 generic" })).toHaveAttribute("aria-checked", "true");
    expect(document.querySelector("[data-classification]")).toHaveAttribute("data-classification", "electrically-validated");
    expect(document.querySelector("[data-classification]")).toHaveAttribute("title", "Electrically validated — generic circuit");
    expect(screen.getByText("Generic circuit · Not a panel-specific installation diagram.")).toBeInTheDocument();
    const strip = screen.getByRole("radiogroup", { name: "Circuit state" });
    expect(within(strip).getByRole("radio", { name: /^Normal/ })).toHaveTextContent("2.2 kΩ");
    expect(within(strip).getByRole("radio", { name: /^Alarm/ })).toHaveTextContent("4.4 kΩ");
  });

  it("tapping contacts updates the reading, highlighted path and explanation together", async () => {
    const user = await setup();
    await user.click(screen.getByRole("button", { name: /alarm contact ALM/ }));
    expect(screen.getByTestId("reading")).toHaveTextContent("4.4 kΩ");
    expect(document.querySelector('[data-component="R2"]')?.getAttribute("data-live")).toBe("true");
    expect(screen.getByTestId("explanation")).toHaveTextContent("R2 + R1 = 2.2 kΩ + 2.2 kΩ = 4.4 kΩ");
    expect(screen.getByRole("radio", { name: /^Alarm/ })).toHaveAttribute("aria-checked", "true");

    await user.click(screen.getByRole("button", { name: /tamper contact TMP/ }));
    expect(screen.getByTestId("reading")).toHaveTextContent("Open circuit");
    expect(screen.getByText("Custom contact positions", { exact: false })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Short cable" }));
    expect(screen.getByTestId("reading")).toHaveTextContent("Short circuit (0 Ω)");
  });

  it("editing a resistor updates the diagram and readings, flags the change, and Reset restores the preset", async () => {
    const user = await setup("?p=integriti-example");
    await user.click(screen.getByRole("button", { name: /Resistor R2, 2.2 kΩ, alarm resistor/ }));
    await user.type(screen.getByRole("textbox", { name: "Custom value for R2" }), "abc");
    expect(screen.getByText(/Not a valid resistance/)).toBeInTheDocument();
    await user.clear(screen.getByRole("textbox", { name: "Custom value for R2" }));
    await user.click(screen.getByRole("button", { name: "4k7" }));
    expect(within(screen.getByRole("radiogroup", { name: "Circuit state" })).getByRole("radio", { name: /^Alarm/ })).toHaveTextContent("6.9 kΩ");
    expect(screen.getByText(/Modified from the Integriti example — now a custom circuit/)).toBeInTheDocument();
    expect(document.querySelector("[data-classification]")).toHaveAttribute("title", "Custom circuit — panel compatibility not confirmed");
    expect(window.location.search).toContain("r=R2%3A4700");
    await user.click(screen.getByRole("button", { name: "Reset" }));
    expect(document.querySelector("[data-classification]")).toHaveAttribute("data-classification", "electrically-validated");
  });

  it("preset and arrangement changes add history entries; Back returns to the previous choice", async () => {
    const user = await setup();
    await user.click(screen.getByRole("radio", { name: "Tecom example" }));
    expect(screen.getByTestId("reading")).toHaveTextContent("10 kΩ");
    await user.click(screen.getByRole("radio", { name: "Single EOL · NC" }));
    expect(window.location.search).toBe("?t=demo-generic-single-eol-nc&p=tecom-example");
    expect(screen.getByTestId("reading")).toHaveTextContent("10 kΩ");
    await act(async () => {
      window.history.back();
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(screen.getByRole("radio", { name: "Dual EOL" })).toHaveAttribute("aria-checked", "true");
    // Animation is on by default and labelled as illustrative.
    expect(document.querySelectorAll("[data-particles] .fw-current").length).toBeGreaterThan(0);
    expect(screen.getByTestId("animation-note")).toHaveTextContent(/illustrative conventional-current path, not a measurement/);
    expect(screen.getByRole("button", { name: "Flow animation" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("radio", { name: "Tecom example" })).toHaveAttribute("aria-checked", "true");
  });

  it("offers Dual EOL, Single EOL and No EOL; hides alternative DEOL and triple EOL from the selector", async () => {
    await setup();
    const names = within(screen.getByRole("radiogroup", { name: "Circuit arrangement" }))
      .getAllByRole("radio")
      .map((r) => r.textContent);
    expect(names).toEqual(["Dual EOL", "Single EOL · NC", "Single EOL · NO", "No EOL"]);
  });

  it("still opens hidden arrangements from existing links, and explains presets they can't use", async () => {
    await setup("?t=demo-generic-triple-eol&p=integriti-example");
    expect(screen.getByRole("radio", { name: "Triple EOL" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("status")).toHaveTextContent(/add a tamper target/);
  });

  it("the animation toggle turns the particles off and remembers it", async () => {
    const user = await setup();
    await user.click(screen.getByRole("button", { name: "Flow animation" }));
    expect(document.querySelector("[data-particles]")).toBeNull();
    expect(window.localStorage.getItem("fieldwise:eol-current")).toBe("off");
    expect(screen.queryByTestId("animation-note")).not.toBeInTheDocument();
  });

  it("highlights a contact that has moved from its sealed position", async () => {
    const user = await setup();
    expect(document.querySelector('[data-component="ALM"]')?.getAttribute("data-changed")).toBeNull();
    await user.click(screen.getByRole("button", { name: /alarm contact ALM/ }));
    expect(document.querySelector('[data-component="ALM"]')?.getAttribute("data-changed")).toBe("true");
  });
});
