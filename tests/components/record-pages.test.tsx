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

describe("wiring configuration summary", () => {
  it("shows the configuration, its status, linked devices and sources", async () => {
    render(await WiringPage({ params: Promise.resolve({ id: "demo-ap8-dual-eol-pir" }) }));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("AP-8 zone: dual EOL with KS-PIR12");
    expect(screen.getByRole("note", { name: "Verification status: Demonstration only" })).toBeInTheDocument();
    expect(screen.getByText("Dual EOL")).toBeInTheDocument();
    expect(screen.getByText("4.7 kΩ")).toBeInTheDocument();
    const applies = screen.getByRole("region", { name: "Applies to" });
    expect(within(applies).getByRole("link", { name: /AP-8/ })).toHaveAttribute("href", "/devices/northgate-demo-ap-8");
    expect(within(screen.getByRole("region", { name: "Sources" })).getByText(/AP-8 Alarm Panel Installation Guide/)).toBeInTheDocument();
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

  it("show an honest empty state in production", async () => {
    vi.stubEnv("FIELDWISE_DEMO_MODE", "false");
    render(await EolPage());
    expect(screen.getByText(/No wiring configurations have been published yet/)).toBeInTheDocument();
  });
});
