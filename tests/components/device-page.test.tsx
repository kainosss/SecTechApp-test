import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));

import DevicePage from "@/app/devices/[id]/page";
import { RECENT_KEY } from "@/lib/storage/device-lists";
import { sharedSources } from "@/components/devices/Citation";

afterEach(() => vi.unstubAllEnvs());

async function renderDevice(id: string) {
  render(await DevicePage({ params: Promise.resolve({ id }) }));
}

describe("device detail page", () => {
  it("renders sections from structured data with citations and status", async () => {
    await renderDevice("arclight-demo-ac-2d");
    expect(screen.getByRole("heading", { level: 1, name: "AC-2D" })).toBeInTheDocument();
    for (const name of ["Model identification", "Power requirements", "Terminals", "Specifications", "Installation & commissioning", "Manufacturer documentation", "Wiring & troubleshooting"]) {
      expect(screen.getByRole("region", { name })).toBeInTheDocument();
    }
    expect(screen.getByText("LK1 NO / C / NC")).toBeInTheDocument();
    expect(screen.getByRole("note", { name: "Verification status: Demonstration only" })).toBeInTheDocument();
    expect(screen.getAllByText(/AC-2D Door Controller Installation Manual \(fictional\)/).length).toBeGreaterThan(1);
  });

  it("links a panel to the EOL Assistant and keeps demonstration wiring visually separate", async () => {
    await renderDevice("northgate-demo-ap-8");
    const related = screen.getByRole("region", { name: "Wiring & troubleshooting" });
    expect(within(related).getByRole("link", { name: "Open in EOL Wiring Assistant" })).toHaveAttribute("href", "/eol?panel=northgate-demo-ap-8");
    expect(within(related).getByText("Demonstration — not field references")).toBeInTheDocument();
    expect(within(related).getByRole("link", { name: /AP-8 zone: dual EOL/ })).toHaveAttribute("href", "/eol/demo-ap8-dual-eol-pir");
    expect(within(related).getByRole("link", { name: /Alarm zone permanently open/ })).toHaveAttribute("href", "/fault-finder/demo-zone-permanently-open");
  });

  it("lists undocumented items instead of hiding them silently", async () => {
    await renderDevice("kestrel-demo-ks-rs1");
    expect(screen.getByRole("region", { name: "Not yet documented" })).toHaveTextContent(/power requirements/);
    expect(screen.queryByRole("region", { name: "Power requirements" })).not.toBeInTheDocument();
  });

  it("shows real identification-only records as needing verification, with honest empty states", async () => {
    vi.stubEnv("FIELDWISE_DEMO_MODE", "false");
    await renderDevice("takex-pa-6810");
    expect(screen.getByRole("heading", { level: 1, name: "PA-6810" })).toBeInTheDocument();
    expect(screen.getByRole("note", { name: "Verification status: Requires verification" })).toHaveTextContent(/Don't treat anything here as installation instructions/);
    expect(screen.getByRole("region", { name: "Not yet documented" })).toHaveTextContent(
      /power requirements, terminal assignments, technical specifications, installation and commissioning notes/,
    );
    expect(screen.getByText(/No manufacturer documents have been linked yet/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /^Open / })).not.toBeInTheDocument();
    expect(screen.queryByText(/Verified/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Demonstration/)).not.toBeInTheDocument();
  });

  it("shows sourced real data with page references, lifecycle, and no Verified label without review", async () => {
    vi.stubEnv("FIELDWISE_DEMO_MODE", "false");
    await renderDevice("axis-a1601");
    expect(screen.getByRole("note", { name: "Verification status: Requires verification" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Product lifecycle" })).toHaveTextContent(/Discontinued by the manufacturer on 31 Dec 2023/);
    expect(screen.getByRole("region", { name: "Product lifecycle" })).toHaveTextContent(/AXIS A1610 Network Door Controller/);
    const terminals = screen.getByRole("region", { name: "Terminals" });
    expect(within(terminals).getByText("Relay 1/2 · pin 4 (NC)")).toBeInTheDocument();
    expect(within(terminals).getAllByText("Source: p. 24").length).toBeGreaterThan(0);
    expect(within(terminals).getAllByText(/installation guide, Ver\. M12\.5 \(September 2023\)$/)).toHaveLength(1);
    expect(screen.getByRole("link", { name: /Open installation manual/ })).toHaveAttribute("href", expect.stringContaining("axis.com/dam/public/"));
    expect(screen.queryByText("Verified")).not.toBeInTheDocument();
  });

  it("shows real panels as having no verified configurations, with a route into the assistant", async () => {
    vi.stubEnv("FIELDWISE_DEMO_MODE", "false");
    await renderDevice("tecom-challengerplus");
    const related = screen.getByRole("region", { name: "Wiring & troubleshooting" });
    expect(within(related).getByText(/No verified configurations available for this panel yet/)).toBeInTheDocument();
    expect(within(related).getByRole("link", { name: "Open in EOL Wiring Assistant" })).toHaveAttribute("href", "/eol?panel=tecom-challengerplus");
    expect(within(related).queryByText("Demonstration — not field references")).not.toBeInTheDocument();
  });

  it("links detectors to the configurations that use them", async () => {
    await renderDevice("kestrel-demo-ks-rs1");
    const related = screen.getByRole("region", { name: "Wiring & troubleshooting" });
    expect(within(related).getByRole("link", { name: /AP-8 zone: single EOL/ })).toHaveTextContent("2k2 EOL · AP-8");
    expect(within(related).queryByRole("link", { name: "Open in EOL Wiring Assistant" })).not.toBeInTheDocument();
  });

  it("records the view in recently viewed", async () => {
    await renderDevice("kestrel-demo-ks-rs1");
    expect(JSON.parse(window.localStorage.getItem(RECENT_KEY) ?? "[]")).toEqual(["kestrel-demo-ks-rs1"]);
  });

  it("calls notFound for unknown devices, and for demo devices outside demo mode", async () => {
    await expect(renderDevice("does-not-exist")).rejects.toThrow("NOT_FOUND");
    vi.stubEnv("FIELDWISE_DEMO_MODE", "false");
    await expect(renderDevice("arclight-demo-ac-2d")).rejects.toThrow("NOT_FOUND");
  });
});

describe("sharedSources", () => {
  const src = (id: string, locator?: string) => ({ id, title: id, publisher: "p", documentType: "datasheet" as const, isDemo: false, locator });
  it("returns sources only when every item cites the same ones", () => {
    expect(sharedSources([{ sources: [src("s1")] }, { sources: [src("s1")] }])).toEqual([src("s1")]);
    expect(sharedSources([{ sources: [src("s1")] }, { sources: [src("s1", "p2")] }])).toBeNull();
    expect(sharedSources([{ sources: [] }])).toBeNull();
    expect(sharedSources([])).toBeNull();
  });
});
