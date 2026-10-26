import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { CircuitLab } from "@/components/lab/CircuitLab";
import { FaultLab } from "@/components/lab/FaultLab";
import { LabExerciseNav } from "@/components/lab/LabExerciseNav";
import { FAULT_SCENARIOS } from "@/lib/lab/faults";
import type { PointId } from "@/lib/lab/bench";

function helpers(container: HTMLElement) {
  const tap = (id: PointId) => fireEvent.click(container.querySelector(`[data-point="${id}"]`)!);
  const probe = (c: "red" | "black") => fireEvent.click(container.querySelector(`[data-probe-button="${c}"]`)!);
  const display = () =>
    [...screen.getByTestId("meter-display").children]
      .map((c) => c.textContent)
      .join(" ")
      .trim();
  const state = (name: RegExp) => fireEvent.click(within(screen.getByRole("radiogroup", { name: "Detector state" })).getByRole("radio", { name }));
  const tray = (name: RegExp) => {
    const b = within(screen.getByRole("group", { name: "Component tray" })).getByRole("button", { name });
    if (b.getAttribute("aria-pressed") !== "true") fireEvent.click(b);
  };
  const measure = (red: PointId, black: PointId) => {
    probe("red");
    tap(red);
    if (container.querySelector('[data-probe-button="black"]')!.getAttribute("aria-pressed") !== "true") probe("black");
    tap(black);
  };
  return { tap, probe, display, state, tray, measure };
}

/** Builds the correct dual EOL circuit by tapping. */
function wire(ui: ReturnType<typeof helpers>) {
  ui.tray(/^Wire/);
  ui.tap("panel-com");
  ui.tap("tmp-nc");
  ui.tap("panel-z");
  ui.tap("alm-com");
  ui.tray(/^2k2/);
  ui.tap("alm-nc");
  ui.tap("tmp-com");
  ui.tap("alm-com");
  ui.tap("alm-nc");
}

describe("virtual multimeter on the wiring bench", () => {
  it("measures between the placed probes and follows the detector state", () => {
    const { container } = render(<CircuitLab schematic={null} />);
    const ui = helpers(container);
    wire(ui);
    expect(screen.getByTestId("meter-message")).toHaveTextContent("Place the red and black probes");
    ui.measure("panel-z", "panel-com");
    expect(container.querySelector('[data-probe="red"]')).not.toBeNull();
    expect(container.querySelector('[data-probe="black"]')).not.toBeNull();
    expect(ui.display()).toBe("2.200 kΩ");
    ui.state(/^Alarm/);
    expect(ui.display()).toBe("4.400 kΩ");
    expect(container.querySelector('[data-contact="alm-com"]')).toHaveAttribute("data-open", "true");
    ui.state(/^Tamper/);
    expect(ui.display()).toBe("OL MΩ");
    ui.state(/^Sealed/);

    // Move the probes across R2 only.
    ui.measure("alm-com", "alm-nc");
    expect(ui.display()).toBe("0.0 Ω");
    ui.state(/^Alarm/);
    expect(ui.display()).toBe("2.200 kΩ");
  });

  it("updates when the wiring changes, and removes probes", () => {
    const { container } = render(<CircuitLab schematic={null} />);
    const ui = helpers(container);
    wire(ui);
    ui.measure("panel-z", "panel-com");
    expect(ui.display()).toBe("2.200 kΩ");
    fireEvent.click(screen.getByRole("button", { name: "Remove W1" })); // break the loop
    expect(ui.display()).toBe("OL MΩ");
    fireEvent.click(screen.getByRole("button", { name: "Remove black probe" }));
    expect(container.querySelector('[data-probe="black"]')).toBeNull();
    expect(screen.getByTestId("meter-message")).toHaveTextContent("Place the black probe");
  });

  it("refuses supply terminals with a safety explanation", () => {
    const { container } = render(<CircuitLab schematic={null} />);
    const ui = helpers(container);
    ui.probe("red");
    ui.tap("det-12v");
    expect(container.querySelector('[data-probe="red"]')).toBeNull();
    expect(screen.getByTestId("bench-status")).toHaveTextContent("Never measure resistance on a powered circuit");
  });

  it("places probes from the keyboard and Escape cancels probe placement", () => {
    const { container } = render(<CircuitLab schematic={null} />);
    const ui = helpers(container);
    ui.probe("red");
    // Supply terminals are not offered as probe targets.
    expect(container.querySelector('[data-point="det-12v"] circle[stroke-dasharray]')).toBeNull();
    expect(container.querySelector('[data-point="j1"] circle[stroke-dasharray]')).not.toBeNull();
    fireEvent.keyDown(container.querySelector('[data-point="j1"]')!, { key: "Enter" });
    fireEvent.keyDown(container.querySelector('[data-point="j1"]')!, { key: " " }); // black on the same point
    expect(ui.display()).toBe("0.0 Ω");
    fireEvent.keyDown(container.querySelector('[data-point="j2"]')!, { key: "Escape" });
    expect(container.querySelector('[data-probe-button="black"]')).toHaveAttribute("aria-pressed", "false");
  });

  it("probe placement does not change the wiring", () => {
    const { container } = render(<CircuitLab schematic={null} />);
    const ui = helpers(container);
    ui.measure("j1", "j2");
    expect(container.querySelectorAll("[data-component]")).toHaveLength(0);
    expect(ui.display()).toBe("OL MΩ");
  });
});

describe("fault-finding exercises", () => {
  it("missing EOL resistor: probe, diagnose, repair by fitting R2, verify", () => {
    const { container } = render(<FaultLab scenarioId="missing-eol-resistor" />);
    const ui = helpers(container);
    expect(screen.getByTestId("symptom")).toHaveTextContent("tamper / open-circuit");
    // Starts with the red probe armed.
    ui.tap("panel-z");
    ui.tap("panel-com");
    expect(ui.display()).toBe("2.200 kΩ");
    ui.state(/^Alarm/);
    expect(ui.display()).toBe("OL MΩ");

    const check = screen.getByRole("button", { name: "Check diagnosis" });
    expect(check).toBeDisabled();
    fireEvent.click(screen.getByLabelText("Bypassed tamper contact"));
    fireEvent.click(screen.getByLabelText("Across the ALARM contact (COM – NC)"));
    fireEvent.click(check);
    expect(screen.getByTestId("diagnosis-result")).toHaveAttribute("data-correct", "false");
    expect(screen.getByTestId("diagnosis-result")).toHaveTextContent("The location is right");

    fireEvent.click(screen.getByLabelText("Missing EOL resistor"));
    fireEvent.click(check);
    expect(screen.getByTestId("diagnosis-result")).toHaveAttribute("data-correct", "true");

    fireEvent.click(screen.getByRole("button", { name: "Check repair" }));
    expect(screen.queryByTestId("exercise-complete")).toBeNull();
    ui.tray(/^2k2/);
    ui.tap("alm-com");
    ui.tap("alm-nc");
    expect(ui.display()).toBe("4.400 kΩ"); // alarm state, R1 + new R2
    fireEvent.click(screen.getByRole("button", { name: "Check repair" }));
    expect(screen.getByTestId("exercise-complete")).toBeInTheDocument();
  });

  it("bypassed tamper: the hidden link shows in measurements until repaired", () => {
    const { container } = render(<FaultLab scenarioId="bypassed-tamper" />);
    const ui = helpers(container);
    ui.tap("tmp-com");
    ui.tap("tmp-nc");
    ui.state(/^Tamper/);
    expect(ui.display()).toBe("0.0 Ω");
    fireEvent.click(screen.getByLabelText("Bypassed tamper contact"));
    fireEvent.click(screen.getByLabelText("Across the TAMPER contact (COM – NC)"));
    fireEvent.click(screen.getByRole("button", { name: "Check diagnosis" }));
    expect(screen.getByTestId("diagnosis-result")).toHaveTextContent("wire link");
    fireEvent.click(screen.getByRole("button", { name: "Remove the tamper link" }));
    expect(ui.display()).toBe("OL MΩ");
    fireEvent.click(screen.getByRole("button", { name: "Check repair" }));
    expect(screen.getByTestId("exercise-complete")).toBeInTheDocument();
  });

  it("shorted zone wiring: hints are optional and revealed one at a time; reset restores the fault", () => {
    const { container } = render(<FaultLab scenarioId="shorted-zone-wiring" />);
    const ui = helpers(container);
    ui.tap("panel-z");
    ui.tap("panel-com");
    expect(ui.display()).toBe("0.0 Ω");
    expect(screen.queryAllByTestId("hint")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: /Show hint \(1 of 2\)/ }));
    fireEvent.click(screen.getByRole("button", { name: /Show hint \(2 of 2\)/ }));
    expect(screen.getAllByTestId("hint")).toHaveLength(2);

    // Lift J1 → ALARM COM to isolate the detector, then measure it on its own.
    fireEvent.click(screen.getByRole("button", { name: "Remove W2" }));
    ui.measure("alm-com", "tmp-nc");
    expect(ui.display()).toBe("2.200 kΩ");

    fireEvent.click(screen.getByLabelText("Short circuit in the zone wiring"));
    fireEvent.click(screen.getByLabelText("Joint block (J1 – J2)"));
    fireEvent.click(screen.getByRole("button", { name: "Check diagnosis" }));
    expect(screen.getByTestId("diagnosis-result")).toHaveAttribute("data-correct", "true");

    fireEvent.click(screen.getByRole("button", { name: "Reset exercise" }));
    expect(screen.queryByTestId("diagnosis-result")).toBeNull();
    expect(screen.queryAllByTestId("hint")).toHaveLength(0);
    expect(container.querySelectorAll("[data-component]")).toHaveLength(6);
    expect(container.querySelector('[data-probe="red"]')).toBeNull();
  });

  it("lists every exercise and marks the current one", () => {
    render(<LabExerciseNav current="/circuit-lab/faults/bypassed-tamper" />);
    const nav = screen.getByRole("navigation", { name: "Circuit Lab exercises" });
    expect(within(nav).getAllByRole("link")).toHaveLength(1 + FAULT_SCENARIOS.length);
    expect(within(nav).getByRole("link", { name: /Bypassed tamper contact/ })).toHaveAttribute("aria-current", "page");
  });
});
