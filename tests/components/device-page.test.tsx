import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));

import DevicePage from "@/app/devices/[id]/page";
import { RECENT_KEY } from "@/lib/storage/device-lists";

async function renderDevice(id: string) {
  render(await DevicePage({ params: Promise.resolve({ id }) }));
}

describe("device detail page", () => {
  it("renders every section from structured data with citations", async () => {
    await renderDevice("arclight-demo-ac-2d");
    expect(screen.getByRole("heading", { level: 1, name: "AC-2D" })).toBeInTheDocument();
    for (const name of ["Terminals", "Specifications", "Installation notes", "Manufacturer documentation", "Wiring & troubleshooting", "Model revisions"]) {
      expect(screen.getByRole("region", { name })).toBeInTheDocument();
    }
    expect(screen.getByText("LK1 NO / C / NC")).toBeInTheDocument();
    expect(screen.getByText("2 A @ 30 V DC (demo)")).toBeInTheDocument();
    expect(screen.getAllByText(/AC-2D Door Controller Installation Manual \(fictional\)/).length).toBeGreaterThan(1);
    expect(screen.getAllByText("Example data").length).toBeGreaterThan(0);
  });

  it("records the view in recently viewed", async () => {
    await renderDevice("kestrel-demo-ks-rs1");
    expect(JSON.parse(window.localStorage.getItem(RECENT_KEY) ?? "[]")).toEqual(["kestrel-demo-ks-rs1"]);
  });

  it("omits sections that have no data", async () => {
    await renderDevice("kestrel-demo-ks-rs1");
    expect(screen.queryByRole("link", { name: "Specs" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Specifications" })).toBeInTheDocument();
    expect(screen.queryByText("Supply voltage")).not.toBeInTheDocument();
  });

  it("calls notFound for unknown devices", async () => {
    await expect(renderDevice("does-not-exist")).rejects.toThrow("NOT_FOUND");
  });
});

describe("sharedRefs", async () => {
  const { sharedRefs } = await import("@/components/devices/Citation");
  it("returns refs only when every item cites the same sources", () => {
    const a = { sourceRefs: [{ sourceId: "s1" }] };
    expect(sharedRefs([a, { sourceRefs: [{ sourceId: "s1" }] }])).toEqual(a.sourceRefs);
    expect(sharedRefs([a, { sourceRefs: [{ sourceId: "s1", locator: "p2" }] }])).toBeNull();
    expect(sharedRefs([{ sourceRefs: [] }])).toBeNull();
    expect(sharedRefs([])).toBeNull();
  });
});
