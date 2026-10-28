import { beforeEach, describe, expect, it } from "vitest";
import { BACKUP_META_KEY, recordBackup } from "@/lib/backup/meta";
import { buildDemoData, DEMO_SITE } from "@/lib/demo/seed";
import { DEMO_KEYS, enterDemo, exitDemo, resetDemo } from "@/lib/demo/workspace";
import { BRANDING_KEY, loadBranding, saveBranding, EMPTY_BRANDING } from "@/lib/handover/branding";
import { createReport } from "@/lib/reports/report";
import { loadReports, loadTechnician, REPORTS_KEY, saveReport, saveTechnician, TECHNICIAN_KEY } from "@/lib/reports/store";
import { createRegister } from "@/lib/techdocs/register";
import { loadRegisters, REGISTERS_KEY, saveRegister } from "@/lib/techdocs/store";
import { demoKey, isDemoWorkspace, WORKSPACE_KEY } from "@/lib/workspace";

const realKeys = [REGISTERS_KEY, REPORTS_KEY, TECHNICIAN_KEY, BRANDING_KEY, BACKUP_META_KEY];
const snapshot = () => Object.fromEntries(realKeys.map((k) => [k, window.localStorage.getItem(k)]));

beforeEach(() => window.localStorage.clear());

function seedReal() {
  saveRegister({ ...createRegister("Real Tech"), name: "Real site" });
  saveReport(createReport("cctv", "Real Tech"));
  saveBranding({ ...EMPTY_BRANDING, companyName: "Real Co" });
  saveTechnician({ name: "Real Tech", company: "" });
  recordBackup(new Date("2026-10-01T00:00:00Z"));
}

describe("demo workspace isolation", () => {
  it("entering shows only demo records and never touches the real keys", () => {
    seedReal();
    const before = snapshot();
    expect(enterDemo()).toBe(true);
    expect(isDemoWorkspace()).toBe(true);
    expect(loadRegisters().registers.map((r) => r.name)).toEqual([DEMO_SITE.name]);
    expect(loadReports().reports).toHaveLength(2);
    expect(loadBranding().companyName).toBe("");
    // Edits in the demo go to demo keys only.
    saveRegister({ ...createRegister("Demo"), name: "Added in demo" });
    saveBranding({ ...EMPTY_BRANDING, companyName: "Demo Co" });
    expect(loadTechnician().name).toBe("");
    saveTechnician({ name: "Someone in the demo", company: "" });
    expect(snapshot()).toEqual(before);
    exitDemo();
    expect(isDemoWorkspace()).toBe(false);
    expect(loadRegisters().registers.map((r) => r.name)).toEqual(["Real site"]);
    expect(loadBranding().companyName).toBe("Real Co");
  });

  it("demo changes survive leaving and re-entering; reset restores the original demo", () => {
    enterDemo();
    saveRegister({ ...createRegister("Demo"), name: "Added in demo" });
    exitDemo();
    enterDemo();
    expect(loadRegisters().registers.map((r) => r.name)).toContain("Added in demo");
    expect(resetDemo()).toBe(true);
    expect(loadRegisters().registers.map((r) => r.name)).toEqual([DEMO_SITE.name]);
    expect(loadReports().reports).toHaveLength(2);
  });

  it("reset never touches real records, even from the real workspace", () => {
    seedReal();
    const before = snapshot();
    resetDemo();
    exitDemo();
    expect(snapshot()).toEqual(before);
    expect(window.localStorage.getItem(WORKSPACE_KEY)).toBeNull();
  });

  it("uses only demo-prefixed keys", () => {
    expect(DEMO_KEYS).toEqual(realKeys.map(demoKey));
    for (const k of DEMO_KEYS) expect(k.startsWith("fieldwise:demo:")).toBe(true);
  });
});

describe("demo site content", () => {
  const { registers, reports } = buildDemoData();
  const site = registers[0]!;
  const count = (pred: (e: (typeof site.equipment)[number]) => boolean) => site.equipment.filter(pred).length;

  it("has the planned system", () => {
    expect(count((e) => e.category === "ip-camera")).toBe(8);
    expect(count((e) => e.category === "nvr")).toBe(1);
    expect(count((e) => e.category === "network")).toBe(1);
    expect(count((e) => e.category === "detector" && /PIR/i.test(`${e.type} ${e.name}`))).toBe(6);
    expect(count((e) => e.category === "detector" && /reed/i.test(`${e.type} ${e.name}`))).toBe(2);
    expect(count((e) => /reader/i.test(`${e.type} ${e.name}`))).toBe(4);
    expect(count((e) => /strike/i.test(`${e.type} ${e.name}`))).toBe(2);
  });

  it("is labelled fictional and uses documentation-only addresses", () => {
    expect(site.name).toMatch(/DEMO/);
    expect(site.customer).toMatch(/fictional/i);
    expect(site.siteAddress).toMatch(/DEMO|fictional/);
    for (const e of site.equipment) {
      for (const v of [e.ip, e.gateway, e.dns1, e.dns2]) if (v) expect(v).toMatch(/^(192\.0\.2|198\.51\.100|203\.0\.113)\./);
      if (e.mac) expect(e.mac.toUpperCase()).toMatch(/^00:00:5E:00:53:/);
    }
    expect(site.equipment.filter((e) => e.ip).length).toBeGreaterThanOrEqual(10);
    for (const r of reports) expect(r.reference).toMatch(/^DEMO-/);
  });

  it("holds no credentials or codes", () => {
    const text = JSON.stringify({ registers, reports }).toLowerCase();
    expect(text).not.toMatch(/password"\s*:\s*"[^"]+"|pin code|user code \d/);
  });

  it("has linked reports with history", () => {
    expect(reports.every((r) => r.registerId === site.id)).toBe(true);
    expect(site.history.filter((h) => h.reportId).length).toBeGreaterThan(0);
  });
});
