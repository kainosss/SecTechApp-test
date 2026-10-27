import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";

vi.mock("next/navigation", () => ({ usePathname: () => "/reports" }));

const downloads: unknown[] = [];
vi.mock("@/lib/reports/download", () => ({
  downloadWorkbook: async (report: { siteName: string }) => {
    downloads.push(structuredClone(report));
    return `Fieldwise-${report.siteName || "Service-Report"}.xlsx`;
  },
}));

import { ReportsApp } from "@/components/reports/ReportsApp";
import { BottomNav } from "@/components/layout/BottomNav";
import { loadReports, REPORTS_KEY, saveTechnician } from "@/lib/reports/store";

beforeEach(() => {
  downloads.length = 0;
  window.history.replaceState(null, "", "/reports");
});

const startCctv = () => fireEvent.click(screen.getByRole("button", { name: "CCTV" }));
const quickAdd = (name: string) => fireEvent.click(within(screen.getByRole("group", { name: "Quick add" })).getByRole("button", { name: `+ ${name}` }));
const items = () => screen.queryAllByRole("listitem").filter((li) => li.hasAttribute("data-item"));
const saved = () => loadReports().reports[0]!;

describe("quick service report workflow", () => {
  it("start → details → equipment → summary → generate, autosaving throughout", async () => {
    saveTechnician({ name: "Sam Tech", company: "" });
    render(<ReportsApp />);
    expect(screen.getByTestId("storage-warning")).toHaveTextContent("Saved in this browser only");
    startCctv();
    expect(window.location.search).toMatch(/^\?id=/);
    expect(screen.getByLabelText("Technician")).toHaveValue("Sam Tech"); // remembered
    expect((screen.getByLabelText("Date") as HTMLInputElement).value).toMatch(/^\d{4}-\d{2}-\d{2}$/); // auto-filled

    fireEvent.change(screen.getByLabelText("Site name"), { target: { value: "Harbour Depot" } });
    quickAdd("Camera");
    expect(items()).toHaveLength(1);
    // The new item opens ready for input: tap a status, type a finding.
    fireEvent.click(within(items()[0]!).getByRole("button", { name: /Fault/ }));
    fireEvent.change(within(items()[0]!).getByLabelText("Findings"), { target: { value: "No video" } });
    fireEvent.change(within(items()[0]!).getByLabelText("Location"), { target: { value: "Gate 2" } });

    // One tap adds another of the same type.
    fireEvent.click(within(items()[0]!).getByRole("button", { name: "+ Add another Camera" }));
    expect(items()).toHaveLength(2);
    fireEvent.click(within(items()[1]!).getByRole("button", { name: /Pass/ }));
    quickAdd("NVR");
    expect(items().map((li) => li.textContent)).toEqual([expect.stringContaining("Camera 1"), expect.stringContaining("Camera 2"), expect.stringContaining("NVR 1")]);
    expect(screen.getByTestId("counts")).toHaveTextContent("Pass 1");
    expect(screen.getByTestId("counts")).toHaveTextContent("Fault 1");

    // Summary filled from entered findings only.
    fireEvent.click(screen.getByRole("button", { name: "Fill empty sections from equipment" }));
    const summary = within(screen.getByRole("region", { name: "Job summary" }));
    expect(summary.getByLabelText("Faults identified")).toHaveValue("• Camera 1 (Gate 2): No video");
    expect(summary.getByLabelText("Work completed")).toHaveValue("");

    expect(screen.getByTestId("save-status")).toHaveTextContent("Saved on this device");
    const r = saved();
    expect(r).toMatchObject({ siteName: "Harbour Depot", technician: "Sam Tech", jobType: "cctv" });
    expect(r.equipment.map((i) => [i.type, i.status])).toEqual([
      ["Camera", "fault"],
      ["Camera", "pass"],
      ["NVR", "not-tested"],
    ]);
    expect(screen.getByTestId("warnings")).toHaveTextContent("1 item is marked Not Tested");

    fireEvent.click(screen.getByRole("button", { name: "Generate Excel" }));
    expect(await screen.findByText("Downloaded Fieldwise-Harbour Depot.xlsx")).toBeInTheDocument();
    expect(downloads).toHaveLength(1);
    expect(downloads[0]).toMatchObject({ siteName: "Harbour Depot", equipment: [{ findings: "No video" }, {}, {}] });
  });

  it("duplicates, reorders and removes equipment with undo, no confirmation screens", () => {
    render(<ReportsApp />);
    fireEvent.click(screen.getByRole("button", { name: "Intruder Alarm" }));
    quickAdd("PIR");
    fireEvent.change(within(items()[0]!).getByLabelText("Location"), { target: { value: "Hall" } });
    fireEvent.click(within(items()[0]!).getByRole("button", { name: "Duplicate" }));
    expect(items()).toHaveLength(2);
    expect(within(items()[1]!).getByLabelText("Location")).toHaveValue("Hall"); // copy opens
    fireEvent.click(screen.getByRole("button", { name: "Duplicate previous" }));
    expect(items()).toHaveLength(3);
    quickAdd("Keypad");
    fireEvent.click(within(items()[3]!).getByRole("button", { name: /Move Keypad 1 up/ }));
    expect(items()[2]).toHaveTextContent("Keypad 1");
    fireEvent.click(within(items()[2]!).getByRole("button", { name: "Remove" }));
    expect(items()).toHaveLength(3);
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(items()).toHaveLength(4);
    expect(items()[2]).toHaveTextContent("Keypad 1");
    expect(saved().equipment).toHaveLength(4);
  });

  it("restores a draft after reload and resumes from the list", () => {
    const first = render(<ReportsApp />);
    fireEvent.click(screen.getByRole("button", { name: "Access Control" }));
    fireEvent.change(screen.getByLabelText("Site name"), { target: { value: "Office" } });
    quickAdd("Maglock");
    first.unmount();
    window.history.replaceState(null, "", "/reports");

    render(<ReportsApp />);
    const list = screen.getByRole("list", { name: "Saved reports" });
    expect(within(list).getByText("Office")).toBeInTheDocument();
    expect(within(list).getByText(/Access Control .* 1 item/)).toBeInTheDocument();
    fireEvent.click(within(list).getByRole("button", { name: "Continue" }));
    expect(screen.getByLabelText("Site name")).toHaveValue("Office");
    expect(items()).toHaveLength(1);
  });

  it("manages drafts: duplicate, delete with undo, clear all with a confirm", () => {
    render(<ReportsApp />);
    startCctv();
    fireEvent.change(screen.getByLabelText("Site name"), { target: { value: "Site A" } });
    fireEvent.click(screen.getByRole("button", { name: "All reports" }));
    const list = () => screen.getByRole("list", { name: "Saved reports" });
    fireEvent.click(within(list()).getByRole("button", { name: "Duplicate" }));
    expect(within(list()).getAllByText("Site A")).toHaveLength(2);
    fireEvent.click(within(list()).getAllByRole("button", { name: "Delete" })[0]!);
    expect(within(list()).getAllByText("Site A")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(within(list()).getAllByText("Site A")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Clear saved reports" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete all" }));
    expect(screen.getByText(/No reports yet/)).toBeInTheDocument();
    expect(window.localStorage.getItem(REPORTS_KEY)).toBeNull();
  });

  it("generates again from the list without opening the report", async () => {
    render(<ReportsApp />);
    startCctv();
    fireEvent.click(screen.getByRole("button", { name: "All reports" }));
    fireEvent.click(screen.getByRole("button", { name: "Excel" }));
    expect(await screen.findByText("Downloaded Fieldwise-Service-Report.xlsx")).toBeInTheDocument();
  });

  it("handles corrupted saved data and a missing report safely", () => {
    window.localStorage.setItem(REPORTS_KEY, JSON.stringify({ version: 1, reports: { x: { id: "x", version: 1, jobType: "nope" } } }));
    render(<ReportsApp />);
    expect(screen.getByText(/1 saved report couldn't be read/)).toBeInTheDocument();
    window.history.replaceState(null, "", "/reports?id=missing");
    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(screen.getByRole("alert")).toHaveTextContent("This report isn't saved on this device.");
  });

  it("is in the mobile bottom navigation", () => {
    render(<BottomNav />);
    expect(screen.getByRole("link", { name: "Reports" })).toHaveAttribute("href", "/reports");
    expect(screen.getAllByRole("link")).toHaveLength(5);
  });
});
