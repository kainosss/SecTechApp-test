import { describe, expect, it } from "vitest";
import { addedEvent, changeEvents, eventDay, fieldChanges, historyFor, saveWithHistory, withHistory } from "@/lib/techdocs/history";
import { blankEquipment } from "@/lib/techdocs/register";
import { registerSchema } from "@/lib/techdocs/schema";
import { reportSchema } from "@/lib/reports/schema";
import { cctvInstall } from "./fixtures";

describe("equipment history from Technical Docs edits", () => {
  it("records 'Added to register' for a new entry", () => {
    const r = cctvInstall();
    const item = { ...blankEquipment("ip-camera"), name: "CAM-13" };
    const next = saveWithHistory(r, item, { technician: "Sam", now: new Date(2026, 10, 1, 9) });
    expect(next.history).toEqual([expect.objectContaining({ equipmentId: item.id, equipmentName: "CAM-13", type: "added", description: "Added to register", technician: "Sam", reportId: "" })]);
  });

  it("records changed fields with previous and new values; firmware gets its own event", () => {
    const r = cctvInstall();
    const c = r.equipment[2]!;
    const next = saveWithHistory(r, { ...c, firmware: "V5.8.0", ip: "10.20.0.150", ladderType: "" }, { technician: "Sam", now: new Date(2026, 10, 1, 9) });
    expect(next.history.map((e) => [e.type, e.description])).toEqual([
      ["firmware", "Firmware / software version: V5.7.10 → V5.8.0"],
      ["details", "IP address: 10.20.0.101 → 10.20.0.150; Ladder type required: Step ladder → (cleared)"],
    ]);
    expect(next.history[1]!.changes).toEqual([
      { field: "ip", label: "IP address", from: "10.20.0.101", to: "10.20.0.150" },
      { field: "ladderType", label: "Ladder type required", from: "Step ladder", to: "" },
    ]);
  });

  it("records nothing when an entry is saved unchanged", () => {
    const r = cctvInstall();
    expect(saveWithHistory(r, { ...r.equipment[0]! }, { technician: "" }).history).toEqual([]);
  });

  it("tracks category, status and custom field changes", () => {
    const a = { ...blankEquipment("other"), customFields: [{ id: "1", name: "Lens", value: "2.8 mm" }] };
    const b = { ...a, category: "ip-camera" as const, status: "faulty" as const, customFields: [{ id: "1", name: "Lens", value: "4 mm" }] };
    expect(fieldChanges(a, b).map((c) => [c.label, c.from, c.to])).toEqual([
      ["Category", "Other", "IP camera"],
      ["Operational status", "", "Faulty"],
      ["Custom fields", "Lens: 2.8 mm", "Lens: 4 mm"],
    ]);
  });

  it("lists one entry's events newest first and replaces same-id events instead of duplicating", () => {
    let r = cctvInstall();
    const id = r.equipment[0]!.id;
    const old = { ...addedEvent(r.equipment[0]!, "NVR-01", "", new Date(2026, 0, 1)), id: "a" };
    const svc = { ...old, id: "svc", type: "inspection" as const, date: "2026-06-01", description: "Service inspection — Pass." };
    const later = changeEvents([{ field: "serial", label: "Serial number", from: "1", to: "2" }], { equipmentId: id, equipmentName: "NVR-01", technician: "", now: new Date(2026, 8, 1) })[0]!;
    r = withHistory(r, [old, svc, later]);
    r = withHistory(r, [{ ...svc, description: "Service inspection — Fault." }]);
    expect(historyFor(r, id).map((e) => e.description)).toEqual(["Serial number: 1 → 2", "Service inspection — Fault.", "Added to register"]);
    expect(eventDay(svc)).toBe("2026-06-01");
  });
});

describe("existing data survives the update", () => {
  it("v0.7.0 registers and v0.6 reports (no links or history) still load", () => {
    const { history: _h, ...oldRegister } = cctvInstall();
    void _h;
    expect(registerSchema.parse(JSON.parse(JSON.stringify(oldRegister))).history).toEqual([]);
    const oldReport = {
      id: "r1", version: 1, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", jobType: "cctv", siteName: "Depot",
      siteAddress: "", customer: "", technician: "", reference: "", date: "2026-01-01", description: "",
      equipment: [{ id: "i1", name: "", type: "Camera", location: "", makeModel: "", status: "pass", findings: "", work: "", recommendations: "", notes: "", priority: "" }],
      summary: { workCompleted: "", faults: "", outstanding: "", recommendations: "", parts: "", notes: "" },
    };
    const parsed = reportSchema.parse(oldReport);
    expect(parsed.registerId).toBe("");
    expect(parsed.equipment[0]!.source).toBeNull();
  });
});
