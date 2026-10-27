import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

vi.mock("next/navigation", () => ({ usePathname: () => "/reports" }));
vi.mock("@/lib/reports/download", () => ({ downloadWorkbook: async () => "report.xlsx" }));
vi.mock("@/lib/techdocs/download", () => ({ downloadTechWorkbook: async () => "register.xlsx" }));

import { ReportsApp } from "@/components/reports/ReportsApp";
import { TechDocsApp } from "@/components/techdocs/TechDocsApp";
import { applyEdit, createReport } from "@/lib/reports/report";
import { loadReports, saveReport } from "@/lib/reports/store";
import { linkedItem, linkReport, syncReportHistory } from "@/lib/sites/link";
import { createBackup } from "@/lib/techdocs/backup";
import { getRegister, loadRegisters, saveRegister } from "@/lib/techdocs/store";
import { accessSystem, cctvInstall, intruderSystem } from "../techdocs/fixtures";

beforeEach(() => {
  window.localStorage.clear();
  window.history.replaceState(null, "", "/reports");
});

const report = () => loadReports().reports[0]!;
const items = () => screen.queryAllByRole("listitem").filter((li) => li.hasAttribute("data-item"));
const siteCard = () => screen.getByTestId("site-link");
function startLinked() {
  const site = cctvInstall();
  saveRegister(site);
  saveRegister(accessSystem());
  render(<ReportsApp />);
  fireEvent.click(screen.getByRole("button", { name: "CCTV" }));
  fireEvent.change(within(siteCard()).getByLabelText("Site register"), { target: { value: site.id } });
  fireEvent.click(within(siteCard()).getByRole("button", { name: "Link" }));
  return site;
}
function pick(...names: string[]) {
  fireEvent.click(screen.getByRole("button", { name: "+ From site register" }));
  const picker = screen.getByTestId("equipment-picker");
  for (const n of names) fireEvent.click(within(picker).getByRole("checkbox", { name: n }));
  fireEvent.click(within(picker).getByRole("button", { name: /^Add \d+ selected$/ }));
}

describe("site-linked service report", () => {
  it("links a site, fills site details and persists the link", () => {
    const site = startLinked();
    expect(screen.getByLabelText("Site name")).toHaveValue("Westgate Logistics — Building C");
    expect(screen.getByLabelText("Customer")).toHaveValue("Westgate Logistics Pty Ltd");
    expect(siteCard()).toHaveTextContent("Building C CCTV");
    expect(report().registerId).toBe(site.id);
  });

  it("asks before replacing details already in the report", () => {
    const site = cctvInstall();
    saveRegister(site);
    render(<ReportsApp />);
    fireEvent.click(screen.getByRole("button", { name: "CCTV" }));
    fireEvent.change(screen.getByLabelText("Site name"), { target: { value: "My own name" } });
    fireEvent.change(within(siteCard()).getByLabelText("Site register"), { target: { value: site.id } });
    fireEvent.click(within(siteCard()).getByRole("button", { name: "Link" }));
    expect(within(siteCard()).getByRole("alert")).toHaveTextContent("“My own name” → “Westgate Logistics — Building C”");
    fireEvent.click(screen.getByRole("button", { name: "Link, keep report details" }));
    expect(screen.getByLabelText("Site name")).toHaveValue("My own name");
    expect(screen.getByLabelText("Customer")).toHaveValue("Westgate Logistics Pty Ltd"); // empty field filled
    expect(report().registerId).toBe(site.id);
  });

  it("picks several entries by search, prevents duplicates and keeps manual items", () => {
    startLinked();
    fireEvent.click(within(screen.getByRole("group", { name: "Quick add" })).getByRole("button", { name: "+ Camera" }));
    fireEvent.click(screen.getByRole("button", { name: "+ From site register" }));
    const picker = screen.getByTestId("equipment-picker");
    fireEvent.change(within(picker).getByLabelText("Search site equipment"), { target: { value: "dock" } });
    expect(within(picker).getAllByRole("checkbox")).toHaveLength(3);
    fireEvent.click(within(picker).getByRole("button", { name: "Select all shown (3)" }));
    fireEvent.click(within(picker).getByRole("button", { name: "Add 3 selected" }));
    expect(items().map((li) => li.textContent)).toEqual([expect.stringContaining("Camera"), expect.stringContaining("CAM-03"), expect.stringContaining("CAM-04"), expect.stringContaining("CAM-05")]);
    fireEvent.click(screen.getByRole("button", { name: "+ From site register" }));
    const again = screen.getByTestId("equipment-picker");
    fireEvent.change(within(again).getByLabelText("Search site equipment"), { target: { value: "10.20.0.104" } });
    expect(within(again).getByRole("checkbox")).toBeDisabled();
    expect(within(again).getByText("In report")).toBeInTheDocument();
    expect(report().equipment.filter((i) => i.source)).toHaveLength(3);
  });

  it("records findings, history and a confirmed equipment update without touching other master fields", async () => {
    const site = startLinked();
    pick("CAM-06");
    const card = items()[0]!;
    fireEvent.click(within(card).getByRole("button", { name: /Fault/ }));
    fireEvent.change(within(card).getByLabelText("Findings"), { target: { value: "Camera dead" } });
    fireEvent.change(within(card).getByLabelText("Equipment history entry for this job"), { target: { value: "replaced" } });
    expect(within(card).getByTestId("linked-item")).toHaveTextContent("FW V5.7.3");

    fireEvent.click(within(card).getByRole("button", { name: "Propose equipment update…" }));
    const propose = within(card).getByTestId("propose-update");
    fireEvent.change(within(propose).getByLabelText("Serial number — now: EVD4-1005"), { target: { value: "EVD4-2000" } });
    fireEvent.change(within(propose).getByLabelText("Firmware / software version — now: V5.7.3"), { target: { value: "V5.7.10" } });
    fireEvent.click(within(propose).getByRole("button", { name: "Review 2 changes" }));
    const review = within(card).getByTestId("review-update");
    expect(review).toHaveTextContent("EVD4-1005");
    expect(review).toHaveTextContent("EVD4-2000");
    // Nothing applied before confirmation.
    expect(getRegister(site.id)!.equipment.find((e) => e.name === "CAM-06")!.serial).toBe("EVD4-1005");
    fireEvent.click(within(review).getByLabelText("Apply Firmware / software version"));
    fireEvent.click(within(review).getByRole("button", { name: "Apply 1 change" }));

    const master = getRegister(site.id)!.equipment.find((e) => e.name === "CAM-06")!;
    const original = site.equipment.find((e) => e.name === "CAM-06")!;
    expect(master).toEqual({ ...original, serial: "EVD4-2000" });
    expect(within(card).getByTestId("applied-updates")).toHaveTextContent("Serial number: EVD4-1005 → EVD4-2000");
    // The report keeps what it recorded; the card notes the site record has moved on.
    expect(report().equipment[0]!.source!.snapshot.serial).toBe("EVD4-1005");
    expect(within(card).getByTestId("snapshot-diff")).toHaveTextContent("Serial number EVD4-2000");

    await waitFor(() => expect(getRegister(site.id)!.history.map((e) => e.type).sort()).toEqual(["details", "fault", "replaced"]));
    const h = getRegister(site.id)!.history;
    expect(h.find((e) => e.type === "fault")!.description).toBe("Fault recorded. Findings: Camera dead.");
    expect(h.every((e) => e.reportId === report().id)).toBe(true);
  });

  it("unlinking (after confirmation) removes this job's service entries but keeps the items", async () => {
    const site = startLinked();
    pick("CAM-01");
    await waitFor(() => expect(getRegister(site.id)!.history).toHaveLength(1));
    fireEvent.click(within(siteCard()).getByRole("button", { name: "Unlink" }));
    fireEvent.click(within(within(siteCard()).getByRole("alert")).getByRole("button", { name: "Unlink" }));
    expect(report().registerId).toBe("");
    expect(report().equipment).toHaveLength(1);
    expect(getRegister(site.id)!.history).toHaveLength(0);
  });

  it("reopening a linked report keeps links and doesn't duplicate history", async () => {
    const site = startLinked();
    pick("CAM-01", "CAM-02");
    await waitFor(() => expect(getRegister(site.id)!.history).toHaveLength(2));
    const id = report().id;
    window.history.replaceState(null, "", `/reports?id=${id}`);
    render(<ReportsApp />);
    await new Promise((r) => setTimeout(r, 600));
    expect(getRegister(site.id)!.history).toHaveLength(2);
    expect(report().equipment.map((i) => i.source?.equipmentId)).toEqual([site.equipment[2]!.id, site.equipment[3]!.id]);
  });

  it("standalone reports need no extra steps when no site registers exist", () => {
    render(<ReportsApp />);
    fireEvent.click(screen.getByRole("button", { name: "CCTV" }));
    expect(siteCard()).toHaveTextContent("Standalone report");
    expect(screen.queryByRole("button", { name: "+ From site register" })).toBeNull();
  });

  it("shows a clear note when the linked register is missing", () => {
    const site = cctvInstall();
    let r = linkReport(createReport("cctv"), site, false);
    r = applyEdit(r, { type: "add-items", items: [linkedItem(site, site.equipment[2]!)] });
    saveReport(r);
    window.history.replaceState(null, "", `/reports?id=${r.id}`);
    render(<ReportsApp />);
    expect(siteCard()).toHaveTextContent("isn't on this device");
    expect(items()).toHaveLength(1);
  });
});

describe("Technical Docs history and backup", () => {
  beforeEach(() => window.history.replaceState(null, "", "/tech-docs"));

  it("shows an entry's history, including linked service jobs", () => {
    let site = cctvInstall();
    let job = linkReport({ ...createReport("cctv", "Alex"), date: "2026-11-03", reference: "JOB-7" }, site, false);
    job = applyEdit(job, { type: "add-items", items: [linkedItem(site, site.equipment[2]!)] });
    job = applyEdit(job, { type: "update-item", id: job.equipment[0]!.id, patch: { status: "pass", work: "Cleaned" } });
    site = syncReportHistory(site, job);
    saveRegister(site);
    window.history.replaceState(null, "", `/tech-docs?id=${site.id}`);
    render(<TechDocsApp />);
    fireEvent.click(screen.getByRole("button", { name: "Open CAM-01" }));
    const hist = screen.getByRole("list", { name: "Equipment history" });
    expect(hist).toHaveTextContent("Service inspection");
    expect(hist).toHaveTextContent("Service inspection — Pass. Work completed: Cleaned.");
    expect(within(hist).getByRole("link")).toHaveAttribute("href", `/reports?id=${job.id}`);
  });

  it("saving a changed entry adds a history event with old and new values", async () => {
    const site = cctvInstall();
    saveRegister(site);
    window.history.replaceState(null, "", `/tech-docs?id=${site.id}`);
    render(<TechDocsApp />);
    fireEvent.click(screen.getByRole("button", { name: "Open CAM-01" }));
    fireEvent.change(screen.getByLabelText("Firmware / software version"), { target: { value: "V6.0" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(getRegister(site.id)!.history).toHaveLength(1));
    await waitFor(() => expect(window.location.search).not.toContain("item=")); // the form closes via history.back()
    expect(getRegister(site.id)!.history[0]).toMatchObject({ type: "firmware", description: "Firmware / software version: V5.7.10 → V6.0" });
  });

  const restore = async (text: string, name = "backup.json") => {
    const file = new File([text], name, { type: "application/json" });
    fireEvent.change(screen.getByLabelText("Backup file"), { target: { files: [file] } });
  };

  it("downloads a backup and explains browser storage isn't a backup", () => {
    saveRegister(cctvInstall());
    const create = vi.fn(() => "blob:x");
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: vi.fn() });
    render(<TechDocsApp />);
    expect(screen.getByTestId("backup")).toHaveTextContent("not a cloud backup");
    fireEvent.click(screen.getByRole("button", { name: "Download backup" }));
    expect(create).toHaveBeenCalledOnce();
    expect(screen.getByText(/Downloaded Fieldwise-TechDocs-Backup-\d{4}-\d{2}-\d{2}\.json/)).toBeInTheDocument();
  });

  it("previews a backup, then merges it without touching existing registers", async () => {
    const mine = { ...cctvInstall(), notes: "Mine" };
    saveRegister(mine);
    render(<TechDocsApp />);
    await restore(JSON.stringify(createBackup([cctvInstall(), intruderSystem()].map((r, i) => (i === 0 ? { ...r, id: mine.id } : r)), [])));
    const preview = await screen.findByTestId("restore-preview");
    expect(preview).toHaveTextContent("2 registers · 24 equipment entries");
    expect(preview).toHaveTextContent("Add: Riverside Medical — intruder");
    expect(preview).toHaveTextContent("imported as a separate copy: Building C CCTV");
    fireEvent.click(within(preview).getByRole("button", { name: "Import (merge)" }));
    expect(screen.getByText(/Import complete: 1 added, 1 copied/)).toBeInTheDocument();
    const regs = loadRegisters().registers;
    expect(regs).toHaveLength(3);
    expect(regs.find((r) => r.id === mine.id)!.notes).toBe("Mine");
    expect(new Set(regs.map((r) => r.id)).size).toBe(3);
  });

  it("replace requires explicit confirmation", async () => {
    saveRegister(cctvInstall());
    render(<TechDocsApp />);
    await restore(JSON.stringify(createBackup([intruderSystem()], [])));
    const preview = await screen.findByTestId("restore-preview");
    fireEvent.click(within(preview).getByRole("radio", { name: /Replace registers/ }));
    expect(preview).toHaveTextContent("Delete from this device: Building C CCTV");
    const go = within(preview).getByRole("button", { name: "Replace registers" });
    expect(go).toBeDisabled();
    fireEvent.click(within(preview).getByRole("checkbox"));
    fireEvent.click(go);
    expect(loadRegisters().registers.map((r) => r.name)).toEqual(["Riverside Medical — intruder"]);
  });

  it("rejects invalid files and keeps existing data", async () => {
    const mine = cctvInstall();
    saveRegister(mine);
    render(<TechDocsApp />);
    await restore("{ definitely not json");
    expect(await screen.findByRole("alert")).toHaveTextContent("isn't valid JSON");
    await restore(JSON.stringify({ format: "fieldwise-techdocs-backup", version: 9, registers: [] }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("version 9"));
    expect(screen.queryByTestId("restore-preview")).toBeNull();
    expect(loadRegisters().registers).toEqual([mine]);
  });
});
