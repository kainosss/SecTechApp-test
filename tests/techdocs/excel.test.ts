// @vitest-environment node
import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { buildWorkbook } from "@/lib/reports/excel";
import { finalizeXlsx, MAX_CELL, MAX_ROW_HEIGHT } from "@/lib/reports/xlsx-layout";
import { buildTechWorkbook, SENSITIVE_NOTE, TABLE_ROW } from "@/lib/techdocs/excel";
import { applyRegisterEdit, blankEquipment, createRegister } from "@/lib/techdocs/register";
import type { TechRegister } from "@/lib/techdocs/schema";
import { shortCctv } from "../reports/fixtures";
import { accessSystem, cctvInstall, intruderSystem, largeSite, makeRegister, mixedSite } from "./fixtures";

async function open(register: TechRegister) {
  const raw = (await buildTechWorkbook(register, ExcelJS, new Date(2026, 9, 27, 12)).xlsx.writeBuffer()) as ArrayBuffer;
  const buffer = await finalizeXlsx(raw);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  return { wb, buffer };
}
const str = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const values = (ws: ExcelJS.Worksheet, row: number) => (ws.getRow(row).values as unknown[]).slice(1).map(str);
/** Table rows (below the header) as objects keyed by header. */
function rows(ws: ExcelJS.Worksheet): Record<string, string>[] {
  const headers = values(ws, TABLE_ROW);
  const out: Record<string, string>[] = [];
  for (let r = TABLE_ROW + 1; r <= ws.rowCount; r++) out.push(Object.fromEntries(headers.map((h, i) => [h, str(ws.getCell(r, i + 1).value)])));
  return out;
}
const allCells = (wb: ExcelJS.Workbook) => {
  const out: ExcelJS.Cell[] = [];
  for (const ws of wb.worksheets) ws.eachRow((row) => row.eachCell((c) => out.push(c)));
  return out;
};

describe("technical workbook structure", () => {
  it("has the five practical sheets with plain, filterable, frozen tables", async () => {
    const { wb } = await open(cctvInstall());
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Equipment Register", "Network Configuration", "Access & Maintenance", "Full Equipment Details", "Site Information"]);
    for (const ws of wb.worksheets) {
      expect(ws.views[0], ws.name).toMatchObject({ state: "frozen", ySplit: TABLE_ROW });
      expect(ws.pageSetup, ws.name).toMatchObject({ paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: `${TABLE_ROW}:${TABLE_ROW}` });
      expect(ws.headerFooter.oddFooter, ws.name).toContain("Page &P of &N");
      expect(ws.headerFooter.oddFooter, ws.name).toContain("confidential");
      expect(str(ws.getCell("A4").value)).toBe(SENSITIVE_NOTE);
      expect(Object.keys((ws as unknown as { _merges: object })._merges), ws.name).toEqual([]); // no merged cells
    }
    const reg = wb.getWorksheet("Equipment Register")!;
    expect(str(reg.getCell("A1").value)).toBe("Equipment Register — Building C CCTV");
    expect(str(reg.getCell("A2").value)).toBe("Westgate Logistics — Building C  ·  Westgate Logistics Pty Ltd  ·  Site ref WG-C  ·  12 Example Road, Eastern Creek NSW 2766");
    expect(values(reg, TABLE_ROW)).toEqual(["No.", "Asset ID", "Equipment", "Category", "Type", "Location", "Make", "Model", "Serial no.", "Firmware", "IP address", "Status", "Last inspected"]);
    expect(reg.autoFilter).toBe(`A6:M${TABLE_ROW + 14}`);
    expect(reg.views[0]).toMatchObject({ xSplit: 3 });
    expect(reg.getCell(`L${TABLE_ROW + 1}`).dataValidation).toMatchObject({ type: "list", formulae: ['"Operational,Needs attention,Faulty,Offline,Not tested"'] });
    expect(reg.getCell(`D${TABLE_ROW + 1}`).dataValidation).toMatchObject({ type: "list" });
    expect(reg.getCell(`C${TABLE_ROW + 1}`).alignment).toMatchObject({ wrapText: true, vertical: "top" });
  });

  it("exports core equipment values exactly as entered", async () => {
    const { wb } = await open(cctvInstall());
    const reg = rows(wb.getWorksheet("Equipment Register")!);
    expect(reg[0]).toEqual({
      "No.": "1",
      "Asset ID": "WG-NVR-01",
      Equipment: "NVR-01",
      Category: "NVR / server",
      Type: "NVR",
      Location: "Comms room rack A",
      Make: "ExampleVision",
      Model: "NVR-32P",
      "Serial no.": "EVN32P-000123",
      Firmware: "V4.2.1 build 230915",
      "IP address": "10.20.0.10",
      Status: "Operational",
      "Last inspected": "2026-10-27",
    });
    expect(reg[7]).toMatchObject({ Equipment: "CAM-06", Firmware: "V5.7.3", Status: "Needs attention" });
    expect(wb.getWorksheet("Equipment Register")!.getCell(`A${TABLE_ROW + 1}`).value).toBe(1); // a real number for sorting
  });

  it("lists network devices and their configuration", async () => {
    const { wb } = await open(cctvInstall());
    const net = rows(wb.getWorksheet("Network Configuration")!);
    expect(Object.keys(net[0]!)).toEqual(["No.", "Equipment", "Location", "IP address", "Subnet / prefix", "Gateway", "Primary DNS", "Secondary DNS", "VLAN", "MAC address", "Hostname", "Switch", "Switch port", "PoE"]);
    expect(net).toHaveLength(14);
    expect(net[2]).toMatchObject({ "No.": "3", Equipment: "CAM-01", "IP address": "10.20.0.101", "Subnet / prefix": "255.255.255.0", Gateway: "10.20.0.1", VLAN: "20", "MAC address": "00:11:22:33:45:10", Switch: "SW-CAM-01", "Switch port": "1", PoE: "PoE 802.3af", "Secondary DNS": "" });
    // Detectors without network values stay off the sheet; a panel with an IP appears.
    const intr = rows((await open(intruderSystem())).wb.getWorksheet("Network Configuration")!);
    expect(intr.map((r) => r.Equipment)).toEqual(["Panel"]);
  });

  it("puts access requirements and maintenance side by side, ladder and mounting height separate", async () => {
    const { wb } = await open(cctvInstall());
    const acc = rows(wb.getWorksheet("Access & Maintenance")!);
    expect(Object.keys(acc[0]!)).toEqual(["No.", "Equipment", "Location", "Ladder height", "Ladder type", "Mounting height", "Access notes", "Status", "Fault", "Work completed", "Recommendations", "Last inspected"]);
    expect(acc[3]).toMatchObject({ Equipment: "CAM-02", "Ladder height": "3.6 m", "Ladder type": "Platform ladder", "Mounting height": "approx. 4.5 m" });
    expect(acc[12]).toMatchObject({ Equipment: "CAM-11", "Ladder height": "", "Ladder type": "", "Mounting height": "Roof parapet" }); // nothing inferred
    expect(acc[7]).toMatchObject({ Equipment: "CAM-06", Recommendations: "Update firmware to match the other cameras." });
  });

  it("lists every entered field — including custom fields — on Full Equipment Details", async () => {
    const r = mixedSite();
    const { wb } = await open(r);
    const det = rows(wb.getWorksheet("Full Equipment Details")!);
    expect(Object.keys(det[0]!)).toEqual(["No.", "Equipment", "Section", "Field", "Value"]);
    const gate = det.filter((x) => x.Equipment === "CAM-Gate").map((x) => [x.Section, x.Field, x.Value]);
    expect(gate).toEqual([
      ["Basic details", "Category", "IP camera"],
      ["Basic details", "Equipment name", "CAM-Gate"],
      ["Basic details", "Location", "Gate"],
      ["Hardware", "Manufacturer / make", "ExampleVision"],
      ["Hardware", "Model", "BL-8MP"],
      ["Hardware", "Firmware / software version", "V5.7.10"],
      ["Network configuration", "IP address", "192.168.10.21"],
      ["Network configuration", "Subnet mask or prefix", "255.255.255.0"],
      ["Network configuration", "Default gateway", "192.168.10.1"],
      ["Access requirements", "Ladder height required", "4.2 m"],
      ["Access requirements", "Ladder type required", "Extension ladder"],
      ["Access requirements", "Mounting height", "approx. 5 m on pole"],
      ["Access requirements", "Access instructions / notes", "Traffic management needed — gate lane."],
      ["Custom fields", "Lens", "2.8–12 mm motorised"],
      ["Custom fields", "IR range", "60 m (datasheet)"],
    ]);
    // Malformed values are exported exactly as typed (warnings never rewrite).
    const intercom = det.filter((x) => x.Equipment === "Gate intercom");
    expect(intercom.find((x) => x.Field === "IP address")?.Value).toBe("192.168.10.300");
    expect(intercom.find((x) => x.Field === "VLAN ID")?.Value).toBe("5000");
  });

  it("keeps optional blanks blank and invents nothing", async () => {
    const r = makeRegister({ siteName: "Bare" }, [{ category: "detector" }]);
    const { wb } = await open(r);
    expect(rows(wb.getWorksheet("Equipment Register")!)[0]).toEqual({
      "No.": "1", "Asset ID": "", Equipment: "Alarm detector 1", Category: "Alarm detector", Type: "", Location: "", Make: "", Model: "", "Serial no.": "", Firmware: "", "IP address": "", Status: "", "Last inspected": "",
    });
    expect(wb.getWorksheet("Network Configuration")!.getCell(TABLE_ROW + 1, 1).value).toBe("No entries.");
    const det = rows(wb.getWorksheet("Full Equipment Details")!);
    expect(det).toEqual([{ "No.": "1", Equipment: "Alarm detector 1", Section: "Basic details", Field: "Category", Value: "Alarm detector" }]);
    expect(wb.getWorksheet("Equipment Register")!.getCell(TABLE_ROW + 1, 2).value).toBeNull(); // truly empty, not ""
  });

  it("includes site information and general notes", async () => {
    const { wb } = await open(cctvInstall());
    const site = Object.fromEntries(rows(wb.getWorksheet("Site Information")!).map((r) => [r.Field, r.Value]));
    expect(site).toMatchObject({
      "Register name": "Building C CCTV",
      "Site name": "Westgate Logistics — Building C",
      Customer: "Westgate Logistics Pty Ltd",
      "Site address": "12 Example Road\nEastern Creek NSW 2766",
      "Site reference": "WG-C",
      Technician: "Sam Nguyen",
      "Equipment entries": "14",
      "Site notes": "Comms room key from site office. Camera VLAN 20.",
    });
    expect(site.Created).toMatch(/2026/);
  });

  it("handles access control, intruder and 100+ entry registers", async () => {
    const acc = (await open(accessSystem())).wb;
    expect(rows(acc.getWorksheet("Equipment Register")!)).toHaveLength(10);
    const intr = (await open(intruderSystem())).wb;
    expect(rows(intr.getWorksheet("Access & Maintenance")!).find((r) => r.Equipment === "Reed switch 1")).toMatchObject({ Status: "Faulty", Fault: "Fails to seal; gap too wide after door realignment" });
    const { wb, buffer } = await open(largeSite());
    const reg = wb.getWorksheet("Equipment Register")!;
    expect(reg.rowCount).toBe(TABLE_ROW + 120);
    for (let i = 1; i <= 120; i++) expect(reg.getCell(TABLE_ROW + i, 1).value).toBe(i);
    expect(reg.autoFilter).toBe(`A6:M${TABLE_ROW + 120}`);
    expect(rows(wb.getWorksheet("Network Configuration")!)).toHaveLength(120);
    const xml = await (await JSZip.loadAsync(buffer)).file("xl/workbook.xml")!.async("string");
    expect(xml).toContain(`&apos;Equipment Register&apos;!$A$1:$M$${TABLE_ROW + 120}`);
  });
});

describe("technical workbook safety", () => {
  it("never writes formulas or links, and formula-like text stays text", async () => {
    let r = makeRegister({ name: "=HYPERLINK(\"http://evil.example\",\"x\")", siteName: "+61 2 9999 0000" }, [
      { category: "ip-camera", name: "=1+1", ip: "-2+3", firmware: "@SUM(A1)", notes: "\t=cmd|' /C calc'!A0", customFields: [{ id: "c", name: "=evil", value: "＝A1" }] },
    ]);
    r = applyRegisterEdit(r, { type: "set", patch: { notes: "=SUM(1,2)" } });
    const { wb, buffer } = await open(r);
    expect(allCells(wb).some((c) => c.type === ExcelJS.ValueType.Formula || c.type === ExcelJS.ValueType.Hyperlink)).toBe(false);
    const reg = rows(wb.getWorksheet("Equipment Register")!)[0]!;
    expect(reg.Equipment).toBe("'=1+1");
    expect(reg["IP address"]).toBe("'-2+3");
    expect(reg.Firmware).toBe("'@SUM(A1)");
    const det = rows(wb.getWorksheet("Full Equipment Details")!);
    expect(det.find((x) => x.Field === "Technician notes")?.Value).toBe("'=cmd|' /C calc'!A0"); // trimmed, still neutralised
    expect(det.find((x) => x.Section === "Custom fields")).toMatchObject({ Field: "'=evil", Value: "'＝A1" });
    expect(str(wb.getWorksheet("Equipment Register")!.getCell("A1").value)).toBe(`Equipment Register — =HYPERLINK("http://evil.example","x")`); // not at the start of the cell
    const zip = await JSZip.loadAsync(buffer);
    expect(Object.keys(zip.files).some((f) => f.includes("externalLink"))).toBe(false);
    for (const f of Object.keys(zip.files).filter((f) => f.startsWith("xl/worksheets/sheet"))) expect(await zip.file(f)!.async("string")).not.toContain("<f>");
  });

  it("keeps long text complete: preview in tables, whole text split across detail rows", async () => {
    const long = Array.from({ length: 400 }, (_, i) => `Note ${i + 1}: cable run checked, conduit intact.`).join(" ");
    const huge = "x".repeat(40_000);
    const r = makeRegister({}, [{ category: "ip-camera", name: "CAM", fault: long, accessNotes: huge }]);
    const { wb } = await open(r);
    const acc = rows(wb.getWorksheet("Access & Maintenance")!)[0]!;
    expect(acc.Fault).toMatch(/… full text on the Full Equipment Details sheet\.$/);
    const det = rows(wb.getWorksheet("Full Equipment Details")!);
    const parts = (field: string) => det.filter((x) => x.Field!.startsWith(field)).map((x) => x.Value);
    expect(parts("Fault description").join(" ").replace(/\s+/g, " ")).toBe(long);
    expect(parts("Access instructions").join("")).toBe(huge);
    expect(det.find((x) => x.Field!.startsWith("Fault description"))!.Field).toMatch(/\(part 1 of \d+\)$/);
    expect(allCells(wb).every((c) => str(c.value).length <= MAX_CELL)).toBe(true);
    for (const ws of wb.worksheets) ws.eachRow((row) => expect(row.height ?? 15).toBeLessThanOrEqual(MAX_ROW_HEIGHT));
  });

  it("works for an empty register", async () => {
    const { wb } = await open({ ...createRegister(), equipment: [] });
    expect(wb.worksheets).toHaveLength(5);
    expect(str(wb.getWorksheet("Equipment Register")!.getCell("A1").value)).toBe("Equipment Register — Untitled register");
    expect(wb.getWorksheet("Equipment Register")!.autoFilter).toBeFalsy();
  });

  it("client-facing service report exports have no network fields", async () => {
    const raw = (await buildWorkbook(shortCctv(), ExcelJS).xlsx.writeBuffer()) as ArrayBuffer;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(raw);
    const text = allCells(wb).map((c) => str(c.value)).join(" ");
    for (const t of ["IP address", "MAC", "VLAN", "Gateway", "Firmware", "Serial"]) expect(text).not.toContain(t);
    expect(blankEquipment()).not.toHaveProperty("password");
  });
});
