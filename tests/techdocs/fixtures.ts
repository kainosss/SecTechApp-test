/** Representative technical registers for tests and visual QA (illustrative values only). */
import { applyRegisterEdit, blankEquipment, createRegister } from "@/lib/techdocs/register";
import type { Category, Equipment, TechRegister } from "@/lib/techdocs/schema";

type Entry = Partial<Omit<Equipment, "id" | "category">> & { category: Category };

export function makeRegister(details: Partial<TechRegister>, entries: Entry[]): TechRegister {
  let r = { ...createRegister("Sam Nguyen", new Date(2026, 9, 27, 9, 0)), ...details };
  for (const { category, ...rest } of entries) r = applyRegisterEdit(r, { type: "save-item", item: { ...blankEquipment(category), ...rest } }, new Date(2026, 9, 27, 10, 0));
  return r;
}

const pad = (n: number) => String(n).padStart(2, "0");

export const cctvInstall = () =>
  makeRegister(
    { name: "Building C CCTV", siteName: "Westgate Logistics — Building C", customer: "Westgate Logistics Pty Ltd", siteReference: "WG-C", siteAddress: "12 Example Road\nEastern Creek NSW 2766", notes: "Comms room key from site office. Camera VLAN 20." },
    [
      { category: "nvr", name: "NVR-01", type: "NVR", location: "Comms room rack A", assetId: "WG-NVR-01", make: "ExampleVision", model: "NVR-32P", serial: "EVN32P-000123", firmware: "V4.2.1 build 230915", ip: "10.20.0.10", subnet: "255.255.255.0", gateway: "10.20.0.1", dns1: "10.20.0.1", vlan: "20", mac: "00:11:22:33:44:01", hostname: "wg-nvr-01", switchName: "SW-CORE", switchPort: "1/0/24", status: "operational", lastInspected: "2026-10-27" },
      { category: "network", name: "SW-CAM-01", type: "PoE switch", location: "Comms room rack A", make: "ExampleNet", model: "PS-24P", firmware: "2.1.0", ip: "10.20.0.2", subnet: "/24", gateway: "10.20.0.1", vlan: "20", status: "operational" },
      ...Array.from({ length: 12 }, (_, i): Entry => ({
        category: "ip-camera",
        name: `CAM-${pad(i + 1)}`,
        type: i % 4 === 3 ? "PTZ camera" : "Dome camera",
        location: ["Gate 1", "Gate 2", "Dock 1", "Dock 2", "Dock 3", "Car park north", "Car park south", "Reception", "Warehouse aisle 1", "Warehouse aisle 2", "Roof east", "Roof west"][i],
        assetId: `WG-CAM-${pad(i + 1)}`,
        make: "ExampleVision",
        model: i % 4 === 3 ? "PTZ-25X" : "DM-4MP",
        serial: `EVD4-${1000 + i}`,
        firmware: i === 5 ? "V5.7.3" : "V5.7.10",
        ip: `10.20.0.${101 + i}`,
        subnet: "255.255.255.0",
        gateway: "10.20.0.1",
        vlan: "20",
        mac: `00:11:22:33:45:${pad(i + 10)}`,
        switchName: "SW-CAM-01",
        switchPort: String(i + 1),
        poe: i % 4 === 3 ? "PoE+ 802.3at" : "PoE 802.3af",
        connectedTo: "NVR-01",
        cameraNumber: String(i + 1),
        nvrVms: "NVR-01",
        ladderHeight: i >= 10 ? "" : i % 2 ? "3.6 m" : "2.4 m",
        ladderType: i >= 10 ? "" : i % 2 ? "Platform ladder" : "Step ladder",
        mountingHeight: i >= 10 ? "Roof parapet" : i % 2 ? "approx. 4.5 m" : "approx. 3 m",
        accessNotes: i >= 10 ? "Roof access via hatch in plant room; harness point on east side. Arrange with facilities." : "",
        status: i === 5 ? "attention" : "operational",
        recommendations: i === 5 ? "Update firmware to match the other cameras." : "",
        lastInspected: "2026-10-27",
      })),
    ],
  );

export const intruderSystem = () =>
  makeRegister(
    { name: "Riverside Medical — intruder", siteName: "Riverside Medical Centre", customer: "Riverside Health", siteReference: "RMC-01" },
    [
      { category: "alarm-panel", name: "Panel", type: "Alarm panel", location: "Plant room", make: "ExampleSecure", model: "ES-8000", serial: "ES8K-55120", firmware: "3.10", controller: "Panel", ip: "192.168.1.50", subnet: "255.255.255.0", gateway: "192.168.1.1", status: "operational" },
      { category: "alarm-panel", type: "Keypad", location: "Reception", make: "ExampleSecure", model: "ES-KP", controller: "Panel" },
      ...["Reception", "Consult 1", "Consult 2", "Consult 3", "Waiting room", "Corridor"].map((loc, i): Entry => ({ category: "detector", type: "PIR", location: loc, make: "ExampleSense", model: "PIR-12", zoneNumber: String(i + 1), controller: "Panel", mountingHeight: "approx. 2.4 m", ladderHeight: "1.8 m", ladderType: "Step ladder", status: i === 2 ? "attention" : "operational", fault: i === 2 ? "Partially blocked by new shelving" : "" })),
      { category: "detector", type: "Reed switch", location: "Rear door", zoneNumber: "7", controller: "Panel", status: "faulty", fault: "Fails to seal; gap too wide after door realignment" },
      { category: "detector", type: "Duress button", location: "Reception desk", zoneNumber: "8", controller: "Panel", status: "not-tested" },
    ],
  );

export const accessSystem = () =>
  makeRegister(
    { name: "Northgate access control", siteName: "Northgate Offices", customer: "Northgate Property Group" },
    [
      { category: "access-controller", name: "ACC-1", type: "Door controller", location: "Comms cupboard L1", make: "ExampleAccess", model: "DC-4", serial: "DC4-7781", firmware: "1.8.2", ip: "172.16.5.20", subnet: "/24", gateway: "172.16.5.1", vlan: "50", mac: "AA-BB-CC-00-11-22" },
      ...["Main entry", "Side entry", "Store room", "Server room"].flatMap((door, i): Entry[] => [
        { category: "access-reader", type: "Card reader", location: door, doorNumber: `D${i + 1}`, controller: "ACC-1", make: "ExampleAccess", model: "RD-10", status: i === 0 ? "faulty" : "operational", fault: i === 0 ? "Reader offline; no LED" : "" },
        { category: "access-reader", type: i === 2 ? "Electric strike" : "Maglock", location: door, doorNumber: `D${i + 1}`, controller: "ACC-1", ladderType: "Step ladder", mountingHeight: "Door head, approx. 2.1 m" },
      ]),
      { category: "power", type: "Power supply", location: "Comms cupboard L1", make: "ExamplePower", model: "PS-12V-5A", notes: "Battery dated 2021", customFields: [{ id: "cf1", name: "Battery date", value: "2021-03" }] },
    ],
  );

export const mixedSite = () =>
  makeRegister(
    { name: "Harbour Depot — all systems", siteName: "Harbour Depot", customer: "Acme Logistics", siteAddress: "1 Wharf Road, Pyrmont NSW 2009" },
    [
      { category: "ip-camera", name: "CAM-Gate", location: "Gate", make: "ExampleVision", model: "BL-8MP", firmware: "V5.7.10", ip: "192.168.10.21", subnet: "255.255.255.0", gateway: "192.168.10.1", ladderHeight: "4.2 m", ladderType: "Extension ladder", mountingHeight: "approx. 5 m on pole", accessNotes: "Traffic management needed — gate lane.", customFields: [{ id: "c1", name: "Lens", value: "2.8–12 mm motorised" }, { id: "c2", name: "IR range", value: "60 m (datasheet)" }] },
      { category: "ip-camera", name: "CAM-Dock", location: "Dock", ip: "192.168.10.21", firmware: "V5.7.10" }, // duplicate IP on purpose
      { category: "nvr", name: "NVR", location: "Office", ip: "192.168.10.10", firmware: "V4.1.0", hostname: "depot-nvr" },
      { category: "alarm-panel", name: "Alarm panel", location: "Office", firmware: "2.3", zoneNumber: "—" },
      { category: "detector", type: "PIR", location: "Office", zoneNumber: "1" },
      { category: "access-reader", type: "Card reader", location: "Office door", doorNumber: "1" },
      { category: "network", name: "Router", location: "Office", ip: "fe80::1ff:fe23:4567:890a", subnet: "/64", notes: "ISP-managed" },
      { category: "other", name: "Gate intercom", location: "Gate", ip: "192.168.10.300", vlan: "5000", mac: "not-a-mac" }, // malformed on purpose
    ],
  );

export const largeSite = () =>
  makeRegister(
    { name: "Stadium precinct", siteName: "Stadium Precinct", customer: "Venue Operations" },
    Array.from({ length: 120 }, (_, i): Entry => ({
      category: i % 20 === 0 ? "network" : "ip-camera",
      name: i % 20 === 0 ? `SW-${pad(i / 20 + 1)}` : `CAM-${String(i + 1).padStart(3, "0")}`,
      location: `Zone ${Math.floor(i / 10) + 1} · Position ${(i % 10) + 1}`,
      assetId: `ST-${String(i + 1).padStart(3, "0")}`,
      make: "ExampleVision",
      model: "DM-4MP",
      serial: `SN${100000 + i}`,
      firmware: i % 7 === 0 ? "V5.6.0" : "V5.7.10",
      ip: `10.50.${Math.floor(i / 100)}.${(i % 100) + 20}`,
      subnet: "/16",
      gateway: "10.50.0.1",
      vlan: "50",
      switchName: `SW-${pad(Math.floor(i / 20) + 1)}`,
      switchPort: String((i % 20) + 1),
      status: (["operational", "operational", "operational", "attention", "faulty", ""] as const)[i % 6],
      ladderHeight: i % 3 === 0 ? "3.6 m" : "",
      ladderType: i % 3 === 0 ? "Platform ladder" : "",
      mountingHeight: "approx. 4 m",
    })),
  );

export const TECH_SAMPLES = { cctvInstall, intruderSystem, accessSystem, mixedSite, largeSite };
