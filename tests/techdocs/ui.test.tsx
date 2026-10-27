import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

vi.mock("next/navigation", () => ({ usePathname: () => "/tech-docs" }));

const downloads: unknown[] = [];
vi.mock("@/lib/techdocs/download", () => ({
  downloadTechWorkbook: async (register: { name: string }) => {
    downloads.push(structuredClone(register));
    return "Fieldwise-Technical-Register.xlsx";
  },
}));

import { TechDocsApp } from "@/components/techdocs/TechDocsApp";
import { BottomNav } from "@/components/layout/BottomNav";
import { Sidebar } from "@/components/layout/Sidebar";
import { saveTechnician } from "@/lib/reports/store";
import { loadRegisters, saveRegister } from "@/lib/techdocs/store";
import { cctvInstall, largeSite, mixedSite } from "./fixtures";

beforeEach(() => {
  downloads.length = 0;
  window.localStorage.clear();
  window.history.replaceState(null, "", "/tech-docs");
});

const saved = () => loadRegisters().registers[0]!;
const form = () => screen.getByTestId("equipment-form");
const field = (label: string) => within(form()).getByLabelText(label);
const type = (label: string, value: string) => fireEvent.change(field(label), { target: { value } });
const addCategory = (label: string) => fireEvent.click(within(screen.getByRole("group", { name: "Add equipment by category" })).getByRole("button", { name: `+ ${label}` }));
const rows = () => screen.queryAllByRole("listitem").filter((li) => li.hasAttribute("data-equipment"));
/** Waits for the form to close (it closes via history.back()). */
const closed = () =>
  waitFor(() => {
    expect(screen.queryByTestId("equipment-form")).toBeNull();
    expect(window.location.search).not.toContain("item=");
  });

function openSeeded(register = cctvInstall()) {
  saveRegister(register);
  window.history.replaceState(null, "", `/tech-docs?id=${register.id}`);
  render(<TechDocsApp />);
  return register;
}

describe("technical register workflow", () => {
  it("create → details → add camera with firmware, IP and ladder → save → reopen", async () => {
    saveTechnician({ name: "Sam Tech", company: "" });
    const { unmount } = render(<TechDocsApp />);
    expect(screen.getByTestId("storage-warning")).toHaveTextContent("Saved in this browser only");
    fireEvent.click(screen.getByRole("button", { name: "+ New technical register" }));
    expect(window.location.search).toMatch(/^\?id=/);
    expect(screen.getByLabelText("Technician")).toHaveValue("Sam Tech");
    fireEvent.change(screen.getByLabelText("Register name"), { target: { value: "Depot CCTV" } });
    fireEvent.change(screen.getByLabelText("Site name"), { target: { value: "Harbour Depot" } });
    fireEvent.change(screen.getByLabelText("General site notes"), { target: { value: "Key at gatehouse" } });

    addCategory("IP camera");
    expect(window.location.search).toMatch(/&item=/);
    // Camera-relevant sections open first; others stay available.
    const sections = [...form().querySelectorAll("details")].map((d) => [d.dataset.section, d.open]);
    expect(sections.slice(0, 3)).toEqual([["basic", true], ["hardware", true], ["network", true]]);
    expect(sections.map((s) => s[0])).toContain("custom");
    type("Equipment name", "CAM-01");
    type("Location", "Gate 2");
    type("Firmware / software version", "V5.7.10");
    type("IP address", "192.168.1.64");
    type("Subnet mask or prefix", "/24");
    type("Ladder height required", "3.6 m");
    type("Ladder type required", "Platform ladder");
    type("Mounting height", "approx. 4.5 m");
    fireEvent.click(within(form()).getByRole("button", { name: "Save" }));
    await closed();
    expect(rows()).toHaveLength(1);
    expect(rows()[0]).toHaveTextContent("CAM-01");
    expect(rows()[0]).toHaveTextContent("192.168.1.64");

    const r = saved();
    expect(r).toMatchObject({ name: "Depot CCTV", siteName: "Harbour Depot", notes: "Key at gatehouse", technician: "Sam Tech" });
    expect(r.equipment[0]).toMatchObject({ category: "ip-camera", name: "CAM-01", firmware: "V5.7.10", ip: "192.168.1.64", subnet: "/24", ladderHeight: "3.6 m", ladderType: "Platform ladder", mountingHeight: "approx. 4.5 m", serial: "", mac: "" });

    // Reopen later.
    unmount();
    window.history.replaceState(null, "", "/tech-docs");
    render(<TechDocsApp />);
    expect(within(screen.getByRole("list", { name: "Saved registers" })).getByText("Depot CCTV")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    expect(rows()).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Open CAM-01" }));
    expect(field("Firmware / software version")).toHaveValue("V5.7.10");
    expect(field("Ladder type required")).toHaveValue("Platform ladder");
  });

  it("nothing changes until Save; Cancel discards with a restore option", async () => {
    const r = openSeeded();
    fireEvent.click(screen.getByRole("button", { name: "Open CAM-01" }));
    type("Firmware / software version", "V9");
    fireEvent.click(within(form()).getByRole("button", { name: "Cancel" }));
    await closed();
    expect(saved().equipment[2]!.firmware).toBe(r.equipment[2]!.firmware);
    expect(screen.getByText(/Changes to CAM-01 were not saved/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Restore" }));
    expect(field("Firmware / software version")).toHaveValue("V9");
  });

  it("supports keyboard entry: Enter moves on, Ctrl+Enter saves, Escape cancels", async () => {
    openSeeded();
    addCategory("Alarm detector");
    const name = field("Equipment name");
    name.focus();
    fireEvent.keyDown(name, { key: "Enter" });
    expect(document.activeElement).toBe(field("Equipment type"));
    type("Equipment type", "PIR");
    fireEvent.keyDown(field("Equipment type"), { key: "Enter", ctrlKey: true });
    await closed();
    expect(saved().equipment.at(-1)).toMatchObject({ category: "detector", type: "PIR" });
    addCategory("Alarm detector");
    type("Equipment name", "Unsaved");
    fireEvent.keyDown(field("Equipment name"), { key: "Escape" });
    await closed();
    expect(saved().equipment.some((e) => e.name === "Unsaved")).toBe(false);
  });

  it("Save & add another keeps category and type for fast entry", async () => {
    openSeeded();
    addCategory("IP camera");
    type("Equipment name", "CAM-13");
    type("Equipment type", "Dome camera");
    type("IP address", "10.20.0.113");
    fireEvent.click(within(form()).getByRole("button", { name: "Save & add another" }));
    expect(screen.getByText("✓ Saved CAM-13.")).toBeInTheDocument();
    expect(field("Equipment type")).toHaveValue("Dome camera");
    expect(field("Equipment name")).toHaveValue("");
    expect(field("IP address")).toHaveValue("");
    expect(within(form()).getByLabelText("Equipment category")).toHaveValue("ip-camera");
    expect(saved().equipment.at(-1)).toMatchObject({ name: "CAM-13", ip: "10.20.0.113" });
  });

  it("duplicates an entry, keeping common values and clearing unique identifiers", async () => {
    const r = openSeeded();
    fireEvent.click(screen.getByRole("button", { name: "Duplicate CAM-01" }));
    expect(screen.getByText(/Copied from CAM-01/)).toHaveTextContent("asset id / reference, serial number, ip address, mac address, hostname");
    expect(field("Model")).toHaveValue("DM-4MP");
    expect(field("Firmware / software version")).toHaveValue("V5.7.10");
    expect(field("Default gateway")).toHaveValue("10.20.0.1");
    for (const l of ["IP address", "Serial number", "MAC address", "Asset ID / reference", "Equipment name"]) expect(field(l), l).toHaveValue("");
    type("Equipment name", "CAM-01B");
    fireEvent.click(within(form()).getByRole("button", { name: "Save" }));
    await closed();
    const names = saved().equipment.map((e) => e.name);
    expect(names.indexOf("CAM-01B")).toBe(names.indexOf("CAM-01") + 1); // inserted after its source
    expect(saved().equipment).toHaveLength(r.equipment.length + 1);
  });

  it("deletes an entry only after confirmation, with undo", async () => {
    openSeeded();
    fireEvent.click(screen.getByRole("button", { name: "Open CAM-02" }));
    fireEvent.click(within(form()).getByRole("button", { name: "Delete this entry…" }));
    expect(saved().equipment.some((e) => e.name === "CAM-02")).toBe(true);
    fireEvent.click(within(form()).getByRole("button", { name: "Delete entry" }));
    await closed();
    expect(saved().equipment.some((e) => e.name === "CAM-02")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(saved().equipment[3]!.name).toBe("CAM-02");
  });

  it("changing category keeps entered values and opens the new category's sections", () => {
    openSeeded();
    addCategory("Other");
    type("Equipment name", "Intercom");
    fireEvent.change(within(form()).getByLabelText("Equipment category"), { target: { value: "access-reader" } });
    expect(field("Equipment name")).toHaveValue("Intercom");
    const open = [...form().querySelectorAll("details")].filter((d) => d.open).map((d) => d.dataset.section);
    expect(open).toEqual(expect.arrayContaining(["basic", "references", "hardware", "maintenance"]));
  });

  it("shows network warnings without changing values, and still saves", async () => {
    openSeeded();
    addCategory("IP camera");
    type("IP address", "10.20.0.101"); // already used by CAM-01
    type("VLAN ID", "5000");
    type("MAC address", "zz");
    expect(form().querySelector('[data-warning="ip"]')).toHaveTextContent("Same IP address as 1 other entry");
    expect(form().querySelector('[data-warning="vlan"]')).toHaveTextContent("1 to 4094");
    expect(field("VLAN ID")).toHaveAttribute("aria-invalid", "true");
    expect(field("VLAN ID")).toHaveValue("5000");
    fireEvent.click(within(form()).getByRole("button", { name: "Save" }));
    await closed();
    expect(saved().equipment.at(-1)).toMatchObject({ ip: "10.20.0.101", vlan: "5000", mac: "zz" });
    expect(screen.getByText(/IP address is used by more than one entry: 10.20.0.101/)).toBeInTheDocument();
  });

  it("keeps custom fields", async () => {
    openSeeded();
    addCategory("Power supply");
    const custom = form().querySelector('details[data-section="custom"]') as HTMLDetailsElement;
    custom.open = true;
    fireEvent.click(within(custom).getByRole("button", { name: "+ Add custom field" }));
    fireEvent.click(within(custom).getByRole("button", { name: "+ Add custom field" }));
    fireEvent.change(within(custom).getByLabelText("Field name 1"), { target: { value: "Battery date" } });
    fireEvent.change(within(custom).getByLabelText("Value 1"), { target: { value: "2021-03" } });
    fireEvent.click(within(custom).getByRole("button", { name: "Remove custom field 2" }));
    fireEvent.click(within(form()).getByRole("button", { name: "Save" }));
    await closed();
    expect(saved().equipment.at(-1)!.customFields).toEqual([{ id: expect.any(String), name: "Battery date", value: "2021-03" }]);
  });

  it("searches and filters the register", () => {
    openSeeded();
    const search = screen.getByLabelText("Search equipment");
    fireEvent.change(search, { target: { value: "dock 2" } });
    expect(rows().map((r) => r.textContent)).toEqual([expect.stringContaining("CAM-04")]);
    expect(screen.getByRole("heading", { name: "Equipment (1 of 14)" })).toBeInTheDocument();
    fireEvent.change(search, { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("Filter by category"), { target: { value: "nvr" } });
    expect(rows()).toHaveLength(1);
    fireEvent.change(screen.getByLabelText("Filter by category"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("Filter by status"), { target: { value: "attention" } });
    expect(rows().map((r) => r.querySelector("[data-status]")?.getAttribute("data-status"))).toEqual(["attention"]);
    fireEvent.change(search, { target: { value: "no such thing" } });
    fireEvent.click(screen.getByRole("button", { name: "Clear search and filters" }));
    expect(rows()).toHaveLength(14);
  });

  it("stays usable with 100+ entries", () => {
    openSeeded(largeSite());
    expect(rows()).toHaveLength(120);
    fireEvent.change(screen.getByLabelText("Search equipment"), { target: { value: "SN100119" } });
    expect(rows()).toHaveLength(1);
  });

  it("exports from the editor with a sensitivity notice", async () => {
    const r = openSeeded(mixedSite());
    expect(screen.getByTestId("sensitive-notice")).toHaveTextContent("network and access details");
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Export Excel" })));
    expect(await screen.findByText("Downloaded Fieldwise-Technical-Register.xlsx")).toBeInTheDocument();
    expect(downloads).toEqual([expect.objectContaining({ id: r.id })]);
  });

  it("deletes a register only after confirmation", () => {
    saveRegister(cctvInstall());
    render(<TechDocsApp />);
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(loadRegisters().registers).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Delete register" }));
    expect(loadRegisters().registers).toHaveLength(0);
    expect(screen.getByText(/No registers yet/)).toBeInTheDocument();
  });

  it("is in the sidebar but leaves the five-slot mobile bar unchanged", () => {
    render(<Sidebar />);
    expect(screen.getByRole("link", { name: /Technical Docs/ })).toHaveAttribute("href", "/tech-docs");
  });

  it("mobile bottom bar keeps five items", () => {
    render(<BottomNav />);
    expect(screen.getAllByRole("link")).toHaveLength(5);
  });
});
