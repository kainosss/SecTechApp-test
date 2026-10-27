import { beforeEach, describe, expect, it } from "vitest";
import { loadReports, REPORTS_KEY } from "@/lib/reports/store";
import { createRegister } from "@/lib/techdocs/register";
import { deleteRegister, getRegister, loadRegisters, parseRegisters, REGISTERS_KEY, saveRegister } from "@/lib/techdocs/store";
import { cctvInstall, largeSite, mixedSite } from "./fixtures";

beforeEach(() => window.localStorage.clear());

describe("register storage", () => {
  it("saves, reopens and deletes registers with every value intact", () => {
    const a = cctvInstall();
    const b = mixedSite();
    expect(saveRegister(a)).toBe(true);
    expect(saveRegister(b)).toBe(true);
    expect(getRegister(a.id)).toEqual(a);
    expect(getRegister(b.id)!.equipment[0]!.customFields).toEqual(b.equipment[0]!.customFields);
    expect(loadRegisters().registers).toHaveLength(2);
    deleteRegister(a.id);
    expect(loadRegisters().registers.map((r) => r.id)).toEqual([b.id]);
  });

  it("keeps multiple site registers, newest first", () => {
    const old = { ...createRegister(), siteName: "Old", updatedAt: "2026-01-01T00:00:00.000Z" };
    const recent = { ...createRegister(), siteName: "Recent", updatedAt: "2026-10-01T00:00:00.000Z" };
    saveRegister(old);
    saveRegister(recent);
    expect(loadRegisters().registers.map((r) => r.siteName)).toEqual(["Recent", "Old"]);
  });

  it("stores large registers", () => {
    const l = largeSite();
    saveRegister(l);
    expect(getRegister(l.id)!.equipment).toHaveLength(120);
  });

  it("skips damaged entries instead of failing", () => {
    const good = cctvInstall();
    window.localStorage.setItem(REGISTERS_KEY, JSON.stringify({ version: 1, registers: { [good.id]: good, bad: { id: "bad", version: 99 } } }));
    expect(loadRegisters()).toMatchObject({ registers: [good], skipped: 1 });
    expect(parseRegisters("{not json")).toEqual({ registers: [], skipped: 1 });
    expect(parseRegisters(null)).toEqual({ registers: [], skipped: 0 });
  });

  it("is separate from service reports", () => {
    saveRegister(cctvInstall());
    expect(window.localStorage.getItem(REPORTS_KEY)).toBeNull();
    expect(loadReports().reports).toEqual([]);
  });
});
