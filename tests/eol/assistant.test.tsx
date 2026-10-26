import { describe, expect, it } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { EolPanelOption, WiringDetail, WiringSummary } from "@/lib/content/repository";
import { GENERIC_PANEL, arrangementOptions, canAutoSelect, configurationOptions, parseSelection, resolveSelection, selectionToSearch } from "@/lib/eol/assistant";
import { EolAssistant } from "@/components/eol/EolAssistant";
import { getWiringConfiguration, listEolPanels, listWiringConfigurations } from "@/lib/content/repository";

const summary = (over: Partial<WiringSummary>): WiringSummary => ({
  id: "x",
  title: "X",
  summary: "",
  status: "demonstration",
  isDemo: true,
  generic: true,
  panel: null,
  inputType: "single-eol",
  arrangement: { key: "nc-alarm", label: "NC alarm" },
  configurationLabel: "4k7 EOL",
  devices: [],
  ...over,
});
const panel = (id: string): EolPanelOption => ({ id, model: id, name: id, manufacturerName: "Co", status: "needs-verification", isDemo: false, configurationCount: 0, verifiedCount: 0 });

describe("assistant rules", () => {
  it("round-trips the selection through the URL", () => {
    const s = { panel: "generic", arrangement: "nc-alarm", config: "c1", state: "alarm" };
    expect(parseSelection(selectionToSearch(s))).toEqual(s);
    expect(selectionToSearch({})).toBe("");
  });

  it("puts DEOL arrangements and configurations first, verified before others", () => {
    const configs = [
      summary({ id: "a", arrangement: { key: "nc", label: "NC" } }),
      summary({ id: "b", inputType: "double-eol", arrangement: { key: "nc-t", label: "NC + tamper" } }),
    ];
    expect(arrangementOptions(configs).map((a) => a.key)).toEqual(["nc-t", "nc"]);
    const same = [
      summary({ id: "s", arrangement: { key: "k", label: "K" } }),
      summary({ id: "d", inputType: "double-eol", arrangement: { key: "k", label: "K" } }),
      summary({ id: "v", status: "verified", generic: false, arrangement: { key: "k", label: "K" } }),
    ];
    expect(configurationOptions(same, "k").map((c) => c.id)).toEqual(["v", "d", "s"]);
  });

  it("never auto-selects an unverified configuration for a real panel", () => {
    const real = summary({ id: "r", generic: false, isDemo: false, status: "needs-verification", panel: { ...panel("p"), id: "p" } });
    expect(canAutoSelect("p", [real])).toBe(false);
    expect(canAutoSelect("p", [{ ...real, status: "verified" }])).toBe(true);
    expect(canAutoSelect(GENERIC_PANEL, [summary({})])).toBe(true);
    const resolved = resolveSelection({ panel: "p" }, [panel("p")], [real]);
    expect(resolved.arrangement).toBeUndefined();
    expect(resolved.config).toBeUndefined();
  });

  it("auto-selects single generic options and drops invalid values", () => {
    const only = summary({ id: "only" });
    expect(resolveSelection({ panel: GENERIC_PANEL }, [], [only])).toMatchObject({ arrangement: "nc-alarm", config: only, autoSelected: ["arrangement", "config"] });
    expect(resolveSelection({ panel: "nope" }, [], [only]).panel).toBeUndefined();
    expect(resolveSelection({ panel: GENERIC_PANEL, arrangement: "bogus" }, [], [only, summary({ id: "two", arrangement: { key: "other", label: "Other" } })]).arrangement).toBeUndefined();
  });
});

describe("EolAssistant", () => {
  async function setup(search = "") {
    window.history.replaceState(null, "", `/eol${search}`);
    const [panels, configs] = await Promise.all([listEolPanels(), listWiringConfigurations()]);
    const details: Record<string, WiringDetail> = {};
    for (const c of configs) details[c.id] = (await getWiringConfiguration(c.id))!;
    render(<EolAssistant panels={panels} configs={configs} details={details} />);
    return userEvent.setup();
  }

  it("walks panel → arrangement → configuration, shows the reading, and Back undoes one step at a time", async () => {
    const user = await setup();
    await user.click(screen.getByRole("button", { name: "Northgate (Demo) AP-8" }));
    expect(window.location.search).toBe("?panel=northgate-demo-ap-8");
    // Real-panel style rule applies to demo panels too: nothing is auto-selected unless verified.
    await user.click(screen.getByRole("button", { name: "NC alarm + NC tamper" }));
    await user.click(screen.getByRole("button", { name: /4k7 EOL \/ 2k2 alarm/ }));
    expect(window.location.search).toBe("?panel=northgate-demo-ap-8&arrangement=nc-alarm-nc-tamper&config=demo-ap8-dual-eol-pir");
    expect(screen.getByTestId("reading")).toHaveTextContent("4.7 kΩ");

    await user.click(screen.getByRole("radio", { name: "Alarm" }));
    expect(screen.getByTestId("reading")).toHaveTextContent("6.9 kΩ");
    expect(window.location.search).toContain("state=alarm");

    await act(async () => {
      window.history.back();
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(window.location.search).toBe("?panel=northgate-demo-ap-8&arrangement=nc-alarm-nc-tamper");
    expect(screen.getByRole("button", { name: /4k7 EOL \/ 2k2 alarm/ })).toBeInTheDocument();
  });

  it("shows a clear empty state for real panels without verified configurations", async () => {
    const user = await setup();
    await user.click(screen.getByRole("button", { name: "Inner Range Inception Controller" }));
    const step2 = screen.getByRole("region", { name: /Step 2/ });
    expect(within(step2).getByText(/No verified configurations available for Inception Controller/)).toBeInTheDocument();
    expect(within(step2).getByRole("link", { name: /Inception Controller documents/ })).toHaveAttribute("href", "/devices/inner-range-inception-controller");
  });

  it("restores the full selection from the URL", async () => {
    await setup("?panel=northgate-demo-ap-8&arrangement=nc-alarm&config=demo-ap8-single-eol-reed&state=alarm");
    expect(screen.getByTestId("reading")).toHaveTextContent("Open circuit");
  });
});
