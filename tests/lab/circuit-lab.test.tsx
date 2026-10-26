import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { CircuitLab, EXPLANATION_HREF, type LabSchematic } from "@/components/lab/CircuitLab";
import { getWiringConfiguration } from "@/lib/content/repository";
import { bannerFor } from "@/lib/eol/classification";
import { parseExplorer } from "@/lib/eol/explorer";
import type { PointId } from "@/lib/lab/bench";

function setup(schematic: LabSchematic | null = null) {
  const utils = render(<CircuitLab schematic={schematic} />);
  const point = (id: PointId) => utils.container.querySelector(`[data-point="${id}"]`)!;
  const tap = (id: PointId) => fireEvent.click(point(id));
  const trayButton = (name: RegExp) => within(screen.getByRole("group", { name: "Component tray" })).getByRole("button", { name });
  /** Selects a tray item (tapping the selected item again deselects it). */
  const tool = (name: RegExp) => {
    if (trayButton(name).getAttribute("aria-pressed") !== "true") fireEvent.click(trayButton(name));
  };
  const connect = (a: PointId, b: PointId) => {
    tap(a);
    tap(b);
  };
  const placed = () => [...utils.container.querySelectorAll("[data-component]")];
  const check = () => fireEvent.click(screen.getByRole("button", { name: "Check wiring" }));
  return { ...utils, point, tap, tool, trayButton, connect, placed, check };
}

/** Builds the guided arrangement by tapping, as a learner would. */
function wireCorrectly(ui: ReturnType<typeof setup>) {
  ui.tool(/^Wire/);
  ui.connect("panel-com", "tmp-nc");
  ui.connect("panel-z", "alm-com");
  ui.tool(/^2k2/);
  ui.connect("alm-nc", "tmp-com");
  ui.connect("alm-com", "alm-nc");
}

describe("Circuit Lab bench interaction", () => {
  it("creates a wire with two taps, showing the start point while placing", () => {
    const ui = setup();
    ui.tap("panel-com");
    expect(ui.point("panel-com")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("bench-status")).toHaveTextContent("Start: panel COM");
    expect(ui.placed()).toHaveLength(0);
    ui.tap("tmp-nc");
    expect(ui.placed()).toHaveLength(1);
    expect(ui.point("panel-com")).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByTestId("bench-status")).toHaveTextContent("Placed W1 from panel COM to TAMPER NC");
  });

  it("works from the keyboard", () => {
    const ui = setup();
    fireEvent.keyDown(ui.point("panel-z"), { key: "Enter" });
    fireEvent.keyDown(ui.point("alm-com"), { key: " " });
    expect(ui.placed()).toHaveLength(1);
  });

  it("tapping the start point again cancels; pre-wired power terminals are refused", () => {
    const ui = setup();
    ui.tap("alm-com");
    ui.tap("alm-com");
    expect(ui.point("alm-com")).toHaveAttribute("aria-pressed", "false");
    ui.tap("panel-aux-pos");
    expect(screen.getByTestId("bench-status")).toHaveTextContent("pre-wired");
    expect(ui.placed()).toHaveLength(0);
  });

  it("selects, moves and removes components; undo and reset", () => {
    const ui = setup();
    ui.tool(/^2k2/);
    ui.connect("alm-com", "tmp-com");
    fireEvent.click(ui.placed()[0]!);
    expect(screen.getByTestId("selected-component")).toHaveTextContent("R1 2k2: ALARM COM terminal → TAMPER COM terminal");

    fireEvent.click(screen.getByRole("button", { name: "Move" }));
    ui.connect("alm-nc", "tmp-com");
    expect(screen.getByTestId("selected-component")).toHaveTextContent("R1 2k2: ALARM NC terminal → TAMPER COM terminal");
    expect(ui.placed()).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(ui.placed()).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(ui.placed()).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(ui.placed()).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(ui.placed()).toHaveLength(1);
  });

  it("removes from the placed-components list", () => {
    const ui = setup();
    ui.connect("panel-z", "alm-com");
    fireEvent.click(screen.getByRole("button", { name: "Remove W1" }));
    expect(ui.placed()).toHaveLength(0);
  });

  it("inspect mode shows what a terminal does without placing anything", () => {
    const ui = setup();
    expect(ui.trayButton(/^Wire/)).toHaveAttribute("aria-pressed", "true"); // default tool
    fireEvent.click(ui.trayButton(/^Wire/)); // tap again: inspect mode
    ui.tap("tmp-nc");
    expect(screen.getByTestId("terminal-info")).toHaveTextContent("TAMPER NC terminal");
    expect(ui.placed()).toHaveLength(0);
  });
});

describe("Circuit Lab check and steps", () => {
  it("reports correct only after a check of the correct circuit, in all five states", () => {
    const ui = setup();
    wireCorrectly(ui);
    expect(screen.queryByTestId("check-verdict")).toBeNull();
    ui.check();
    expect(screen.getByTestId("check-verdict")).toHaveTextContent("Correct wiring");
    const rows = screen.getByTestId("feedback").querySelectorAll("tr[data-state]");
    expect(rows).toHaveLength(5);
    for (const row of rows) expect(row).toHaveTextContent("✓ Pass");
    expect(screen.getByTestId("feedback").querySelector('tr[data-state="alarm"]')).toHaveTextContent("4.4 kΩ");
  });

  it("explains a mistake and marks the result stale after a change", () => {
    const ui = setup();
    ui.tool(/^Wire/);
    ui.connect("panel-com", "tmp-nc");
    ui.connect("panel-z", "alm-com");
    ui.tool(/^2k2/);
    ui.connect("alm-nc", "tmp-com"); // R2 missing
    ui.check();
    expect(screen.getByTestId("check-verdict")).toHaveTextContent("Not correct");
    const finding = screen.getByTestId("feedback").querySelector('[data-finding="missing-alarm-resistor"]')!;
    expect(finding).toHaveTextContent("Why it matters");
    expect(finding).toHaveTextContent("How to fix");
    ui.connect("alm-com", "alm-nc");
    expect(screen.getByTestId("stale-check")).toBeInTheDocument();
    expect(screen.queryByTestId("check-verdict")).toBeNull();
  });

  it("steps progress with the circuit and any step can be viewed without losing progress", () => {
    const ui = setup();
    const step = (id: string) => ui.container.querySelector(`[data-step="${id}"]`)!;
    expect(step("identify")).toHaveAttribute("aria-current", "step");
    fireEvent.click(screen.getByRole("button", { name: /reviewed the terminals/ }));
    expect(step("identify")).toHaveAttribute("data-done", "true");
    expect(step("tamper")).toHaveAttribute("aria-current", "step");

    // Viewing a later step's hint keeps the bench as it is.
    ui.connect("panel-com", "tmp-nc");
    fireEvent.click(step("test"));
    expect(screen.getByTestId("step-detail")).toHaveTextContent("Test");
    fireEvent.click(screen.getByRole("button", { name: "Show hint" }));
    expect(screen.getByTestId("step-detail")).toHaveTextContent("equivalent wiring is accepted");
    expect(ui.placed()).toHaveLength(1);

    ui.connect("panel-z", "alm-com");
    ui.tool(/^2k2/);
    ui.connect("alm-nc", "tmp-com");
    ui.connect("alm-com", "alm-nc");
    for (const id of ["tamper", "r1", "r2", "loop"]) expect(step(id)).toHaveAttribute("data-done", "true");
    expect(step("test")).toHaveAttribute("data-done", "false");
    ui.check();
    expect(step("test")).toHaveAttribute("data-done", "true");
  });

  it("restores saved progress on this device", () => {
    const first = setup();
    wireCorrectly(first);
    first.unmount();
    const again = setup();
    expect(again.placed()).toHaveLength(4);
  });
});

describe("Circuit Lab links to the EOL Assistant", () => {
  it("View Circuit Explanation opens the generic 2k2 / 4k4 DEOL in the explorer", async () => {
    const detail = (await getWiringConfiguration("demo-generic-deol-alarm-tamper"))!;
    const schematic: LabSchematic = {
      circuit: detail.circuit,
      normalPositions: detail.states.find((s) => s.kind === "normal")!.contacts,
      banner: bannerFor(detail.classification),
      title: detail.title,
    };
    setup(schematic);
    const link = screen.getByRole("link", { name: /View Circuit Explanation/ });
    expect(link).toHaveAttribute("href", EXPLANATION_HREF);
    const params = parseExplorer(EXPLANATION_HREF.split("?")[1]!);
    expect(params).toMatchObject({ t: "demo-generic-deol-alarm-tamper", p: "generic-2k2-4k4" });
    expect(screen.getByRole("region", { name: "Target schematic" }).querySelector("svg")).not.toBeNull();
  });
});
