import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));

import WiringPage from "@/app/eol/[id]/page";
import EolPage from "@/app/eol/page";
import WorkflowPage from "@/app/fault-finder/[id]/page";
import FaultFinderPage from "@/app/fault-finder/page";

afterEach(() => vi.unstubAllEnvs());

describe("wiring configuration permanent page", () => {
  it("shows the configuration, reading, status, linked devices and sources", async () => {
    window.history.replaceState(null, "", "/eol/demo-ap8-dual-eol-pir");
    render(await WiringPage({ params: Promise.resolve({ id: "demo-ap8-dual-eol-pir" }) }));
    expect(screen.getByText("4k7 EOL / 2k2 alarm")).toBeInTheDocument();
    expect(screen.getByRole("note", { name: "Verification status: Demonstration only" })).toBeInTheDocument();
    expect(screen.getAllByText("Dual EOL").length).toBeGreaterThan(0);
    expect(screen.getByTestId("reading")).toHaveTextContent("4.7 kΩ");
    const related = screen.getByRole("region", { name: "Related devices" });
    expect(within(related).getByRole("link", { name: /AP-8/ })).toHaveAttribute("href", "/devices/northgate-demo-ap-8");
    expect(within(related).getByRole("link", { name: /KS-PIR12/ })).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Manufacturer documentation" })).getByText(/AP-8 Alarm Panel Installation Guide/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open in assistant" })).toHaveAttribute(
      "href",
      "/eol?panel=northgate-demo-ap-8&arrangement=nc-alarm-nc-tamper&config=demo-ap8-dual-eol-pir",
    );
  });

  it("is not found outside demo mode", async () => {
    vi.stubEnv("FIELDWISE_DEMO_MODE", "false");
    await expect(WiringPage({ params: Promise.resolve({ id: "demo-ap8-dual-eol-pir" }) })).rejects.toThrow("NOT_FOUND");
  });
});

describe("troubleshooting workflow summary", () => {
  it("shows symptoms, outline, categories and linked devices", async () => {
    render(await WorkflowPage({ params: Promise.resolve({ id: "demo-reader-grants-door-locked" }) }));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Card reader grants access but door stays locked");
    expect(within(screen.getByRole("region", { name: "Symptoms" })).getAllByRole("listitem").length).toBeGreaterThan(0);
    expect(screen.getByRole("region", { name: "Fault-finding outline" })).toHaveTextContent(/Measure the lock supply/);
    expect(screen.getByRole("link", { name: "Electric strike" })).toHaveAttribute("href", "/devices?group=locks");
    expect(screen.getByText(/No source documents are cited/)).toBeInTheDocument();
  });
});

describe("tool index pages", () => {
  it("list demonstration records in demo mode", async () => {
    render(await FaultFinderPage());
    expect(within(screen.getByRole("region", { name: "Troubleshooting workflows" })).getAllByRole("link")).toHaveLength(5);
  });

  it("offer only real panels in production, never fictional demo panels", async () => {
    vi.stubEnv("FIELDWISE_DEMO_MODE", "false");
    window.history.replaceState(null, "", "/eol?panel=");
    render(await EolPage());
    const step1 = screen.getByRole("region", { name: /Step 1/ });
    expect(within(step1).getByRole("button", { name: "Inner Range Integriti Security Controller (ISC)" })).toBeInTheDocument();
    expect(within(step1).getByRole("button", { name: "Tecom ChallengerPlus" })).toBeInTheDocument();
    expect(within(step1).queryByRole("button", { name: /Northgate/ })).not.toBeInTheDocument();
  });
});
