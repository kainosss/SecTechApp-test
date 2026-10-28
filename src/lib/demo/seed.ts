/**
 * The demo site: a fictional commercial building for exploring Fieldwise
 * without real customer information. Everything here is invented and
 * labelled DEMO — names, address, identifiers and service records.
 *
 * - IP addresses come from the documentation ranges reserved by RFC 5737
 *   (192.0.2.0/24, 198.51.100.0/24) and MAC addresses from the documentation
 *   block reserved by RFC 7042 (00:00:5E:00:53:xx); none are real devices.
 * - Model references and serials are placeholders ("DEMO-…"). No
 *   manufacturer specifications are stated. No credentials or alarm codes.
 *
 * The data is built with the app's own functions (register edits, report
 * links, history sync, confirmed updates), so it behaves exactly like real
 * records. It is only ever written to the demo workspace's storage keys.
 */
import { applyEdit, createReport } from "@/lib/reports/report";
import type { Report, ReportItem } from "@/lib/reports/schema";
import { applyEquipmentUpdate, linkedItem, linkReport, proposedChanges, syncReportHistory } from "@/lib/sites/link";
import { saveWithHistory } from "@/lib/techdocs/history";
import { blankEquipment, createRegister } from "@/lib/techdocs/register";
import type { Category, Equipment, TechRegister } from "@/lib/techdocs/schema";

export const DEMO_SITE = {
  name: "Riverside Business Centre (DEMO)",
  siteName: "Riverside Business Centre",
  customer: "Riverside Property Management (fictional)",
  siteAddress: "DEMO ADDRESS — 1 Example Parade\nSampletown NSW 2999 (fictional)",
  siteReference: "DEMO-RBC",
  technician: "Demo Technician",
} as const;

type Entry = Partial<Omit<Equipment, "id" | "category">> & { category: Category };

const pad = (n: number) => String(n).padStart(2, "0");
const doc = "Documentation-range address (RFC 5737) — demo only";

const CAMERA_LOCATIONS = ["Main entry", "Lobby", "Loading dock", "Car park level 1", "Car park level 2", "Lift lobby L2", "Rear lane", "Plant room"];

function equipmentList(): Entry[] {
  const cameras: Entry[] = CAMERA_LOCATIONS.map((location, i) => ({
    category: "ip-camera",
    name: `CAM-${pad(i + 1)}`,
    type: i === 3 || i === 4 ? "Bullet camera" : "Dome camera",
    location,
    assetId: `DEMO-RBC-CAM-${pad(i + 1)}`,
    make: "Example Vision (demo)",
    model: i === 3 || i === 4 ? "DEMO-BULLET-4MP" : "DEMO-DOME-4MP",
    serial: `DEMO-SN-C${pad(i + 1)}00`,
    firmware: i === 6 ? "demo-1.2.0" : "demo-1.3.1",
    ip: `192.0.2.${101 + i}`,
    subnet: "255.255.255.0",
    gateway: "192.0.2.1",
    dns1: "192.0.2.1",
    vlan: "20",
    mac: `00:00:5E:00:53:${(0x10 + i).toString(16).toUpperCase()}`,
    switchName: "DEMO-SW-01",
    switchPort: String(i + 1),
    poe: "PoE (802.3af)",
    connectedTo: "DEMO-NVR-01",
    cameraNumber: String(i + 1),
    nvrVms: "DEMO-NVR-01",
    ladderHeight: i === 3 || i === 4 ? "" : "2.4 m",
    ladderType: i === 3 || i === 4 ? "Elevated work platform arranged by building manager" : "Platform ladder",
    mountingHeight: i === 3 || i === 4 ? "approx. 4.5 m (car park soffit)" : "approx. 3 m",
    accessNotes: i === 6 ? "Rear lane — check with building manager for vehicle access. (demo note)" : "",
    status: "operational",
    lastInspected: "2026-07-14",
  }));
  return [
    {
      category: "nvr",
      name: "DEMO-NVR-01",
      type: "NVR",
      location: "Comms room, level 1",
      assetId: "DEMO-RBC-NVR-01",
      make: "Example Vision (demo)",
      model: "DEMO-NVR-16",
      serial: "DEMO-SN-N0100",
      firmware: "demo-4.0.2",
      ip: "192.0.2.10",
      subnet: "/24",
      gateway: "192.0.2.1",
      dns1: "192.0.2.1",
      vlan: "20",
      mac: "00:00:5E:00:53:01",
      hostname: "demo-nvr-01",
      switchName: "DEMO-SW-01",
      switchPort: "24",
      status: "operational",
      lastInspected: "2026-07-14",
      notes: doc,
    },
    {
      category: "network",
      name: "DEMO-SW-01",
      type: "PoE switch",
      location: "Comms room, level 1",
      assetId: "DEMO-RBC-SW-01",
      make: "Example Networks (demo)",
      model: "DEMO-POE-24",
      serial: "DEMO-SN-S0100",
      firmware: "demo-2.1",
      ip: "192.0.2.2",
      subnet: "/24",
      gateway: "192.0.2.1",
      vlan: "20",
      mac: "00:00:5E:00:53:02",
      status: "operational",
    },
    ...cameras,
    {
      category: "alarm-panel",
      name: "Alarm controller",
      type: "Integriti controller",
      location: "Comms room, level 1",
      assetId: "DEMO-RBC-ALM-01",
      make: "Inner Range",
      model: "Integriti controller (demo record)",
      serial: "DEMO-SN-A0100",
      ip: "198.51.100.30",
      subnet: "255.255.255.0",
      gateway: "198.51.100.1",
      controller: "Alarm controller",
      status: "operational",
      notes: "Demo record only. No codes, credentials or panel programming are stored in Fieldwise.",
    },
    { category: "alarm-panel", name: "Keypad 1", type: "Keypad", location: "Main entry", make: "Example Security (demo)", model: "DEMO-KP", controller: "Alarm controller", status: "operational" },
    ...["Lobby", "Office A", "Office B", "Meeting room", "Corridor L1", "Corridor L2"].map(
      (location, i): Entry => ({
        category: "detector",
        type: "PIR",
        location,
        make: "Example Sensors (demo)",
        model: "DEMO-PIR-12",
        zoneNumber: String(i + 1),
        controller: "Alarm controller",
        mountingHeight: "approx. 2.4 m",
        ladderHeight: "1.8 m",
        ladderType: "Step ladder",
        status: i === 3 ? "attention" : "operational",
        fault: i === 3 ? "Partly obstructed by a new display stand (demo)" : "",
      }),
    ),
    ...["Main entry door", "Rear door"].map((location, i): Entry => ({ category: "detector", type: "Reed switch", location, zoneNumber: String(7 + i), controller: "Alarm controller", status: "operational" })),
    {
      category: "access-controller",
      name: "Door controller",
      type: "Door controller",
      location: "Comms room, level 1",
      assetId: "DEMO-RBC-ACC-01",
      make: "Example Access (demo)",
      model: "DEMO-DC-4",
      serial: "DEMO-SN-D0100",
      firmware: "demo-1.8",
      ip: "198.51.100.20",
      subnet: "/24",
      gateway: "198.51.100.1",
      mac: "00:00:5E:00:53:20",
      status: "operational",
    },
    ...["Main entry", "Rear door", "Comms room", "Lift lobby L2"].map(
      (location, i): Entry => ({
        category: "access-reader",
        type: "Card reader",
        location,
        doorNumber: `D${i + 1}`,
        controller: "Door controller",
        make: "Example Access (demo)",
        model: "DEMO-RDR",
        status: i === 1 ? "faulty" : "operational",
        fault: i === 1 ? "Reader intermittently offline (demo)" : "",
      }),
    ),
    ...["Main entry", "Comms room"].map((location, i): Entry => ({
      category: "access-reader",
      type: "Electric strike",
      location,
      doorNumber: `D${i === 0 ? 1 : 3}`,
      controller: "Door controller",
      ladderType: "Step ladder",
      mountingHeight: "Door frame, approx. 1.1 m",
      status: "operational",
    })),
  ];
}

export interface DemoData {
  registers: TechRegister[];
  reports: Report[];
}

/** Builds the demo site, its history and two sample service reports. Pure: nothing is stored. */
export function buildDemoData(): DemoData {
  let site: TechRegister = { ...createRegister(DEMO_SITE.technician, new Date("2026-06-02T09:00:00")), ...DEMO_SITE, notes: "DEMO — fictional site for exploring Fieldwise. Not a real customer or building." };
  const added = new Date("2026-06-02T09:30:00");
  for (const { category, ...rest } of equipmentList()) site = saveWithHistory(site, { ...blankEquipment(category), ...rest }, { technician: DEMO_SITE.technician, now: added });
  const byName = (n: string) => site.equipment.find((e) => e.name === n)!;

  // Quarterly CCTV service: one fault (repaired), one recommendation, and a confirmed NVR firmware update.
  let cctv = linkReport({ ...createReport("cctv", DEMO_SITE.technician, new Date("2026-07-14T08:00:00")), date: "2026-07-14", reference: "DEMO-JOB-1001", description: "Quarterly CCTV service (demo job)." }, site, false, new Date("2026-07-14T08:00:00"));
  const cctvItems = ["DEMO-NVR-01", ...CAMERA_LOCATIONS.map((_, i) => `CAM-${pad(i + 1)}`)].map((n) => linkedItem(site, byName(n), new Date("2026-07-14T08:05:00")));
  cctv = applyEdit(cctv, { type: "add-items", items: cctvItems });
  const set = (r: Report, name: string, patch: Partial<ReportItem>) => applyEdit(r, { type: "update-item", id: r.equipment.find((i) => i.name === name)!.id, patch });
  for (const item of cctv.equipment) cctv = set(cctv, item.name, { status: "pass", work: "Cleaned, checked image and recording" });
  cctv = set(cctv, "CAM-06", {
    status: "fault",
    findings: "No image. Switch port 6 showed no PoE power draw.",
    work: "Moved camera to a spare tested port and confirmed image and recording. (demo)",
    source: { ...cctv.equipment.find((i) => i.name === "CAM-06")!.source!, outcome: "repaired" },
  });
  cctv = set(cctv, "CAM-07", { status: "recommendation", findings: "Running older firmware than the other cameras.", recommendations: "Schedule a firmware update during the next visit.", priority: "Low" });
  cctv = set(cctv, "DEMO-NVR-01", { work: "Checked recording retention and drive health; updated firmware (demo)." });
  cctv = applyEdit(cctv, { type: "summary", patch: { workCompleted: "Quarterly service of the CCTV system: cameras cleaned and checked, recording verified, NVR firmware updated. (demo)", outstanding: "Faulty switch port 6 to be checked by the site IT contractor. (demo)" } }, new Date("2026-07-14T11:30:00"));
  const nvr = byName("DEMO-NVR-01");
  const fw = applyEquipmentUpdate(site, nvr.id, proposedChanges(nvr, { firmware: "demo-4.1.0" }), cctv, new Date("2026-07-14T10:15:00"));
  site = fw.register;
  const nvrItem = cctv.equipment.find((i) => i.name === "DEMO-NVR-01")!;
  cctv = applyEdit(cctv, { type: "update-item", id: nvrItem.id, patch: { source: { ...nvrItem.source!, applied: fw.applied.map((c) => ({ ...c, at: "2026-07-14T10:15:00.000Z" })) } } }, new Date("2026-07-14T11:30:00"));
  site = syncReportHistory(site, cctv);

  // Intruder alarm inspection.
  let alarm = linkReport({ ...createReport("intruder", DEMO_SITE.technician, new Date("2026-08-11T08:00:00")), date: "2026-08-11", reference: "DEMO-JOB-1002", description: "Six-monthly intruder alarm inspection (demo job)." }, site, false, new Date("2026-08-11T08:00:00"));
  const alarmItems = site.equipment.filter((e) => e.category === "detector" || e.category === "alarm-panel").map((e) => linkedItem(site, e, new Date("2026-08-11T08:05:00")));
  alarm = applyEdit(alarm, { type: "add-items", items: alarmItems });
  for (const item of alarm.equipment) alarm = applyEdit(alarm, { type: "update-item", id: item.id, patch: { status: "pass", work: "Walk tested / function tested" } });
  const blocked = alarm.equipment.find((i) => i.location === "Meeting room")!;
  alarm = applyEdit(alarm, { type: "update-item", id: blocked.id, patch: { status: "recommendation", findings: "Detector view partly obstructed by a display stand.", recommendations: "Relocate the display stand or the detector.", priority: "Medium" } }, new Date("2026-08-11T10:30:00"));
  site = syncReportHistory(site, alarm);

  return { registers: [site], reports: [cctv, alarm] };
}
