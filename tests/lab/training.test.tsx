import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { CircuitLab } from "@/components/lab/CircuitLab";
import { ExercisePicker } from "@/components/lab/ExercisePicker";
import { FaultLab } from "@/components/lab/FaultLab";
import type { PointId } from "@/lib/lab/bench";
import { BENCH_KEY, parseProgress, PROGRESS_KEY, readProgress } from "@/lib/lab/progress";

function helpers(container: HTMLElement) {
  const tap = (id: PointId) => fireEvent.click(container.querySelector(`[data-point="${id}"]`)!);
  const probe = (c: "red" | "black") => fireEvent.click(container.querySelector(`[data-probe-button="${c}"]`)!);
  const display = () =>
    [...screen.getByTestId("meter-display").children]
      .map((c) => c.textContent)
      .join(" ")
      .trim();
  const contact = (which: "alarm" | "tamper") => container.querySelector(`[data-contact-button="${which}"]`)!;
  const radio = (name: RegExp) => within(screen.getByRole("radiogroup", { name: "Detector state" })).getByRole("radio", { name });
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
  return { tap, probe, display, contact, radio, tray, measure };
}

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

describe("tappable detector contacts", () => {
  it("open and close from the bench, update the meter and stay in sync with the state control", () => {
    const { container } = render(<CircuitLab schematic={null} />);
    const ui = helpers(container);
    wire(ui);
    ui.measure("panel-z", "panel-com");
    expect(ui.display()).toBe("2.200 kΩ");
    expect(ui.radio(/^Sealed/)).toHaveAttribute("aria-checked", "true");

    fireEvent.click(ui.contact("alarm"));
    expect(ui.contact("alarm")).toHaveAttribute("aria-pressed", "true");
    expect(ui.contact("alarm")).toHaveAccessibleName(/ALARM contact, open/);
    expect(ui.display()).toBe("4.400 kΩ");
    expect(ui.radio(/^Alarm/)).toHaveAttribute("aria-checked", "true");

    // Both open is a real combination and is calculated, not blocked.
    fireEvent.click(ui.contact("tamper"));
    expect(ui.display()).toBe("OL MΩ");
    expect(screen.getByTestId("custom-contacts")).toBeInTheDocument();
    for (const name of [/^Sealed/, /^Alarm/, /^Tamper/]) expect(ui.radio(name)).toHaveAttribute("aria-checked", "false");

    // Keyboard: close the alarm contact again.
    fireEvent.keyDown(ui.contact("alarm"), { key: "Enter" });
    expect(ui.radio(/^Tamper/)).toHaveAttribute("aria-checked", "true");
    expect(ui.display()).toBe("OL MΩ");

    fireEvent.click(ui.radio(/^Sealed/));
    expect(ui.contact("alarm")).toHaveAttribute("aria-pressed", "false");
    expect(ui.contact("tamper")).toHaveAttribute("aria-pressed", "false");
    expect(ui.display()).toBe("2.200 kΩ");
  });

  it("measures the alarm resistor on its own when only the alarm contact is open", () => {
    const { container } = render(<CircuitLab schematic={null} />);
    const ui = helpers(container);
    wire(ui);
    ui.measure("alm-com", "alm-nc");
    expect(ui.display()).toBe("0.0 Ω");
    fireEvent.click(ui.contact("alarm"));
    expect(ui.display()).toBe("2.200 kΩ");
  });
});

describe("new fault exercises", () => {
  it("open circuit: locate with continuity tests, repair and verify", () => {
    const { container } = render(<FaultLab scenarioId="open-circuit" />);
    const ui = helpers(container);
    ui.tap("panel-z");
    ui.tap("panel-com");
    expect(ui.display()).toBe("OL MΩ");
    ui.measure("j2", "tmp-nc");
    expect(ui.display()).toBe("OL MΩ"); // the broken conductor
    ui.measure("panel-z", "j1");
    expect(ui.display()).toBe("0.0 Ω");

    for (let i = 1; i <= 3; i++) fireEvent.click(screen.getByRole("button", { name: new RegExp(`Show hint \\(${i} of 3\\)`) }));
    expect(screen.getAllByTestId("hint")).toHaveLength(3);

    fireEvent.click(screen.getByLabelText("Open circuit in the zone wiring"));
    fireEvent.click(screen.getByLabelText("Cable between the panel and the joint block"));
    fireEvent.click(screen.getByRole("button", { name: "Check diagnosis" }));
    expect(screen.getByTestId("diagnosis-result")).toHaveAttribute("data-correct", "false");
    fireEvent.click(screen.getByLabelText("Cable between the joint block and the detector"));
    fireEvent.click(screen.getByRole("button", { name: "Check diagnosis" }));
    expect(screen.getByTestId("diagnosis-result")).toHaveAttribute("data-correct", "true");

    fireEvent.click(screen.getByRole("button", { name: "Replace the damaged conductor" }));
    ui.measure("panel-z", "panel-com");
    expect(ui.display()).toBe("2.200 kΩ");
    fireEvent.click(screen.getByRole("button", { name: "Check repair" }));
    expect(screen.getByTestId("exercise-complete")).toBeInTheDocument();
    expect(screen.getByTestId("completed-badge")).toBeInTheDocument();
  });

  it("incorrect resistor value: identify component and value, replace it, verify every state", () => {
    const { container } = render(<FaultLab scenarioId="wrong-resistor-value" />);
    const ui = helpers(container);
    ui.tap("alm-nc");
    ui.tap("tmp-com");
    expect(ui.display()).toBe("4.700 kΩ");

    const check = screen.getByRole("button", { name: "Check diagnosis" });
    fireEvent.click(screen.getByLabelText("Wrong resistor value"));
    fireEvent.click(screen.getByLabelText("Series position (ALARM NC – TAMPER COM)"));
    expect(check).toBeDisabled(); // value still to choose
    fireEvent.click(screen.getByLabelText(/^10k/));
    fireEvent.click(check);
    expect(screen.getByTestId("diagnosis-result")).toHaveTextContent("That isn't the value fitted there");
    fireEvent.click(screen.getByLabelText(/^4k7/));
    fireEvent.click(check);
    expect(screen.getByTestId("diagnosis-result")).toHaveAttribute("data-correct", "true");

    fireEvent.click(screen.getByRole("button", { name: "Remove R1" }));
    ui.tray(/^2k2/);
    ui.tap("alm-nc");
    ui.tap("tmp-com");
    fireEvent.click(screen.getByRole("button", { name: "Check repair" }));
    expect(screen.getByTestId("exercise-complete")).toBeInTheDocument();
    expect(screen.getByTestId("repair-result").querySelectorAll("tr[data-state]")).toHaveLength(5);
  });
});

describe("saved training progress", () => {
  it("restores wiring, hints and an accepted diagnosis, and remembers completion", () => {
    const first = render(<FaultLab scenarioId="missing-eol-resistor" />);
    const ui = helpers(first.container);
    fireEvent.click(screen.getByRole("button", { name: /Show hint \(1 of 2\)/ }));
    fireEvent.click(screen.getByLabelText("Missing EOL resistor"));
    fireEvent.click(screen.getByLabelText("Across the ALARM contact (COM – NC)"));
    fireEvent.click(screen.getByRole("button", { name: "Check diagnosis" }));
    ui.tray(/^2k2/);
    ui.tap("alm-com");
    ui.tap("alm-nc");
    first.unmount();

    const saved = readProgress();
    expect(saved.current).toBe("missing-eol-resistor");
    expect(saved.exercises["missing-eol-resistor"]).toMatchObject({ diagnosed: true, hintsShown: 1, completed: false });

    const again = render(<FaultLab scenarioId="missing-eol-resistor" />);
    expect(again.container.querySelectorAll("[data-component]")).toHaveLength(4);
    expect(screen.getAllByTestId("hint")).toHaveLength(1);
    expect(screen.getByTestId("diagnosis-result")).toHaveAttribute("data-correct", "true");
    fireEvent.click(screen.getByRole("button", { name: "Check repair" }));
    expect(screen.getByTestId("exercise-complete")).toBeInTheDocument();
    again.unmount();
    expect(readProgress().exercises["missing-eol-resistor"]!.completed).toBe(true);
  });

  it("Reset exercise restores the fault but keeps completion", () => {
    window.localStorage.setItem(PROGRESS_KEY, JSON.stringify({ version: 1, exercises: { "bypassed-tamper": { completed: true, repaired: true, diagnosed: false, hintsShown: 2 } } }));
    const { container } = render(<FaultLab scenarioId="bypassed-tamper" />);
    const ui = helpers(container);
    ui.tap("tmp-com");
    ui.tap("tmp-nc");
    fireEvent.click(ui.contact("tamper"));
    expect(ui.display()).toBe("OL MΩ"); // repaired link restored from progress
    fireEvent.click(screen.getByRole("button", { name: "Reset exercise" }));
    expect(container.querySelector('[data-probe="red"]')).toBeNull();
    expect(screen.queryAllByTestId("hint")).toHaveLength(0);
    expect(readProgress().exercises["bypassed-tamper"]).toMatchObject({ completed: true, repaired: false, hintsShown: 0 });
  });

  it("ignores outdated or invalid saved data safely", () => {
    expect(parseProgress("not json")).toEqual({ version: 1, exercises: {} });
    expect(parseProgress(JSON.stringify({ version: 0, exercises: {} }))).toEqual({ version: 1, exercises: {} });
    const mixed = parseProgress(
      JSON.stringify({
        version: 1,
        current: "deleted-exercise",
        exercises: {
          "deleted-exercise": { completed: true },
          "open-circuit": { completed: true },
          "bypassed-tamper": { components: [{ id: "x", kind: "wire", a: "nowhere", b: "j1" }] },
          "wrong-resistor-value": { diagnosis: { type: "made-up", location: null } },
        },
      }),
    );
    expect(Object.keys(mixed.exercises)).toEqual(["open-circuit"]);
    expect(mixed.current).toBeUndefined();

    window.localStorage.setItem(PROGRESS_KEY, "{broken");
    const { container } = render(<FaultLab scenarioId="shorted-zone-wiring" />);
    expect(container.querySelectorAll("[data-component]")).toHaveLength(6);
  });

  it("a saved diagnosis flag is re-checked, not trusted", () => {
    window.localStorage.setItem(
      PROGRESS_KEY,
      JSON.stringify({ version: 1, exercises: { "open-circuit": { diagnosed: true, diagnosis: { type: "zone-short", location: "panel" } } } }),
    );
    render(<FaultLab scenarioId="open-circuit" />);
    expect(screen.getByTestId("diagnosis-result")).toHaveAttribute("data-correct", "false");
  });
});

describe("exercise selection", () => {
  it("lists all six exercises with difficulty and completion status", () => {
    window.localStorage.setItem(
      PROGRESS_KEY,
      JSON.stringify({ version: 1, current: "open-circuit", exercises: { "bypassed-tamper": { completed: true }, "open-circuit": { hintsShown: 1 } } }),
    );
    const { container } = render(<ExercisePicker />);
    const status = (id: string) => container.querySelector(`[data-exercise="${id}"] [data-status]`)!.getAttribute("data-status");
    expect(container.querySelectorAll("[data-exercise]")).toHaveLength(6);
    expect(container.querySelector('[data-exercise="wiring-bench"]')).toHaveAttribute("href", "/circuit-lab/wiring-bench");
    expect(status("bypassed-tamper")).toBe("completed");
    expect(status("open-circuit")).toBe("in-progress");
    expect(status("wrong-resistor-value")).toBe("not-started");
    expect(container.querySelector('[data-exercise="open-circuit"]')).toHaveTextContent("Continue");
    expect(screen.getAllByText("Beginner", { exact: false })).toHaveLength(6);
    expect(screen.getByTestId("progress-summary")).toHaveTextContent("1 of 6 completed");
  });

  it("Reset progress asks first, then clears everything including the wiring bench", () => {
    window.localStorage.setItem(PROGRESS_KEY, JSON.stringify({ version: 1, exercises: { "bypassed-tamper": { completed: true } } }));
    window.localStorage.setItem(BENCH_KEY, JSON.stringify({ components: [{ id: "c1", kind: "wire", a: "panel-z", b: "alm-com" }], reviewed: true }));
    const { container } = render(<ExercisePicker />);
    expect(container.querySelector('[data-exercise="wiring-bench"] [data-status]')).toHaveAttribute("data-status", "in-progress");
    fireEvent.click(screen.getByRole("button", { name: "Reset progress" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(window.localStorage.getItem(PROGRESS_KEY)).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Reset progress" }));
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(window.localStorage.getItem(PROGRESS_KEY)).toBeNull();
    expect(window.localStorage.getItem(BENCH_KEY)).toBeNull();
    expect(container.querySelectorAll('[data-status="not-started"]')).toHaveLength(6);
  });

  it("completing the wiring bench marks it completed", () => {
    const { container } = render(<CircuitLab schematic={null} />);
    wire(helpers(container));
    fireEvent.click(screen.getByRole("button", { name: "Check wiring" }));
    expect(readProgress().exercises["wiring-bench"]!.completed).toBe(true);
  });
});
