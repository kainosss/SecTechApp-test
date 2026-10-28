import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";

vi.mock("next/navigation", () => ({ usePathname: () => "/reports" }));

import { ReportsApp } from "@/components/reports/ReportsApp";
import { SiteReports } from "@/components/techdocs/SiteReports";
import { buildDemoData } from "@/lib/demo/seed";
import { FAULT_SCENARIOS } from "@/lib/lab/faults";
import { loadReports, saveReport } from "@/lib/reports/store";
import { saveRegister } from "@/lib/techdocs/store";

beforeEach(() => {
  window.localStorage.clear();
  window.history.replaceState(null, "", "/reports");
});

describe("register ↔ report links", () => {
  it("a site lists its linked reports and offers new linked reports", () => {
    const { registers, reports } = buildDemoData();
    render(<SiteReports register={registers[0]!} />);
    expect(screen.getByRole("heading", { name: "Service reports for this site (0)" })).toBeInTheDocument();
    act(() => reports.forEach((r) => saveReport(r)));
    // Updates live when reports change.
    expect(screen.getByRole("heading", { name: "Service reports for this site (2)" })).toBeInTheDocument();
    const list = screen.getByRole("list", { name: "Linked service reports" });
    const links = within(list).getAllByRole("link");
    expect(links.map((a) => a.textContent)).toEqual([expect.stringContaining("DEMO-JOB-1002"), expect.stringContaining("DEMO-JOB-1001")]);
    expect(links[0]).toHaveAttribute("href", `/reports?id=${reports[1]!.id}`);
    const cctv = screen.getByRole("link", { name: "CCTV" });
    const id = new URLSearchParams(cctv.getAttribute("href")!.split("?")[1]).get("id")!;
    fireEvent.click(cctv);
    const created = loadReports().reports.find((r) => r.id === id)!;
    expect(created).toMatchObject({ jobType: "cctv", registerId: registers[0]!.id, siteName: registers[0]!.siteName });
    // A second tap creates another report rather than reusing the id.
    expect(screen.getByRole("link", { name: "CCTV" }).getAttribute("href")).not.toContain(id);
  });

  it("a linked report links back to the site register and each item's equipment record", () => {
    const { registers, reports } = buildDemoData();
    saveRegister(registers[0]!);
    saveReport(reports[0]!);
    window.history.replaceState(null, "", `/reports?id=${reports[0]!.id}`);
    render(<ReportsApp />);
    expect(within(screen.getByTestId("site-link")).getByRole("link", { name: "View site register" })).toHaveAttribute("href", `/tech-docs?id=${registers[0]!.id}`);
    const cam = screen.getAllByRole("listitem").find((li) => li.hasAttribute("data-item") && li.textContent?.includes("CAM-06"))!;
    fireEvent.click(within(cam).getAllByRole("button")[0]!);
    const link = within(cam).getByRole("link", { name: "Open equipment record and service history" });
    const equipment = registers[0]!.equipment.find((e) => e.name === "CAM-06")!;
    expect(link).toHaveAttribute("href", `/tech-docs?id=${registers[0]!.id}&item=${equipment.id}`);
  });
});

describe("fault finder → circuit lab", () => {
  it("every Circuit Lab link in a workflow points to a real exercise", () => {
    const dir = join(process.cwd(), "content/diagnostics");
    const ids = new Set(FAULT_SCENARIOS.map((s) => s.id));
    const hrefs = readdirSync(dir).flatMap((f) => (JSON.parse(readFileSync(join(dir, f), "utf8")).related ?? []).map((r: { href: string }) => r.href));
    const lab = hrefs.filter((h: string) => h.startsWith("/circuit-lab"));
    expect(lab.length).toBeGreaterThan(0);
    for (const h of lab) {
      const m = /^\/circuit-lab\/faults\/(.+)$/.exec(h);
      if (m) expect(ids.has(m[1]!)).toBe(true);
      else expect(h).toBe("/circuit-lab/wiring-bench");
    }
  });
});
