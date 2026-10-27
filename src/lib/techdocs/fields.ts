/**
 * Field and section definitions shared by the equipment form and the
 * workbook, so labels and grouping stay identical everywhere. Categories only
 * change which sections are shown first; every field stays available.
 */
import type { Category, EquipmentTextField } from "./schema";

export type SectionId = "basic" | "hardware" | "network" | "connectivity" | "access" | "references" | "maintenance" | "custom";

export interface FieldDef {
  key: EquipmentTextField | "status";
  label: string;
  kind?: "area" | "date" | "status";
  placeholder?: string;
  /** Suggestions offered in a datalist (free text is always allowed). */
  suggestions?: readonly string[];
  /** Monospace input for addresses and identifiers. */
  mono?: boolean;
}

export interface SectionDef {
  id: SectionId;
  title: string;
  fields: FieldDef[];
  note?: string;
}

const LADDER_TYPES = ["Step ladder", "Platform ladder", "Dual-purpose ladder", "Extension ladder"] as const;

export const SECTIONS: SectionDef[] = [
  {
    id: "basic",
    title: "Basic details",
    fields: [
      { key: "name", label: "Equipment name", placeholder: "e.g. CAM-01 Front gate" },
      { key: "type", label: "Equipment type", placeholder: "e.g. Dome camera" },
      { key: "location", label: "Location", placeholder: "e.g. Car park entry, north wall" },
      { key: "assetId", label: "Asset ID / reference", mono: true },
    ],
  },
  {
    id: "hardware",
    title: "Hardware",
    fields: [
      { key: "make", label: "Manufacturer / make" },
      { key: "model", label: "Model" },
      { key: "serial", label: "Serial number", mono: true },
      { key: "firmware", label: "Firmware / software version", mono: true, placeholder: "As shown on the device" },
      { key: "hardwareRevision", label: "Hardware revision (if known)", mono: true },
    ],
  },
  {
    id: "network",
    title: "Network configuration",
    fields: [
      { key: "ip", label: "IP address", mono: true, placeholder: "e.g. 192.168.1.64" },
      { key: "subnet", label: "Subnet mask or prefix", mono: true, placeholder: "255.255.255.0 or /24" },
      { key: "gateway", label: "Default gateway", mono: true },
      { key: "dns1", label: "Primary DNS", mono: true },
      { key: "dns2", label: "Secondary DNS", mono: true },
      { key: "vlan", label: "VLAN ID", mono: true, placeholder: "1–4094" },
      { key: "mac", label: "MAC address", mono: true, placeholder: "AA:BB:CC:DD:EE:FF" },
      { key: "hostname", label: "Hostname", mono: true },
    ],
  },
  {
    id: "connectivity",
    title: "Connectivity",
    fields: [
      { key: "switchName", label: "Network switch" },
      { key: "switchPort", label: "Switch port", mono: true },
      { key: "poe", label: "PoE details", placeholder: "e.g. PoE+ 802.3at" },
      { key: "connectedTo", label: "Connected NVR / server / controller" },
      { key: "systemRef", label: "System reference" },
    ],
  },
  {
    id: "access",
    title: "Access requirements",
    note: "Recorded as entered. Ladder and mounting height are separate — Fieldwise doesn't assess ladder suitability.",
    fields: [
      { key: "ladderHeight", label: "Ladder height required", placeholder: "e.g. 3.6 m" },
      { key: "ladderType", label: "Ladder type required", suggestions: LADDER_TYPES, placeholder: "e.g. Platform ladder" },
      { key: "mountingHeight", label: "Mounting height", placeholder: "e.g. approx. 4.5 m" },
      { key: "accessNotes", label: "Access instructions / notes", kind: "area" },
    ],
  },
  {
    id: "references",
    title: "Security system references",
    fields: [
      { key: "cameraNumber", label: "Camera number", mono: true },
      { key: "doorNumber", label: "Door number", mono: true },
      { key: "zoneNumber", label: "Zone number", mono: true },
      { key: "controller", label: "Controller / panel" },
      { key: "nvrVms", label: "NVR / VMS" },
    ],
  },
  {
    id: "maintenance",
    title: "Maintenance & notes",
    fields: [
      { key: "status", label: "Operational status", kind: "status" },
      { key: "lastInspected", label: "Last inspected", kind: "date" },
      { key: "fault", label: "Fault description", kind: "area" },
      { key: "work", label: "Work completed", kind: "area" },
      { key: "recommendations", label: "Recommendations", kind: "area" },
      { key: "notes", label: "Technician notes", kind: "area" },
    ],
  },
  { id: "custom", title: "Custom fields", fields: [] },
];

export const SECTION_TITLE = Object.fromEntries(SECTIONS.map((s) => [s.id, s.title])) as Record<SectionId, string>;
export const FIELD_LABEL = Object.fromEntries(SECTIONS.flatMap((s) => s.fields.map((f) => [f.key, f.label]))) as Record<FieldDef["key"], string>;

/** Sections each category opens first (in order); the rest follow, collapsed but available. */
export const CATEGORY_PRIORITY: Record<Category, SectionId[]> = {
  "ip-camera": ["basic", "hardware", "network", "connectivity", "references", "access"],
  nvr: ["basic", "hardware", "network", "references"],
  network: ["basic", "hardware", "network", "connectivity"],
  "alarm-panel": ["basic", "hardware", "references", "network"],
  detector: ["basic", "hardware", "references", "access"],
  "access-reader": ["basic", "references", "hardware", "maintenance"],
  "access-controller": ["basic", "hardware", "references", "network"],
  power: ["basic", "hardware", "access"],
  other: ["basic", "hardware"],
};

/** Categories that usually carry an IP configuration (others appear on the network sheet only if one was entered). */
export const NETWORK_CATEGORIES: ReadonlySet<Category> = new Set(["ip-camera", "nvr", "network", "access-controller"]);

/** Type suggestions per category (free text is always allowed). */
export const TYPE_SUGGESTIONS: Record<Category, readonly string[]> = {
  "ip-camera": ["Dome camera", "Bullet camera", "Turret camera", "PTZ camera", "Fisheye camera", "LPR camera"],
  nvr: ["NVR", "VMS server", "Workstation", "Storage server"],
  network: ["PoE switch", "Network switch", "Router", "Firewall", "Wireless bridge", "Media converter"],
  "alarm-panel": ["Alarm panel", "Expander", "Keypad", "Communicator", "Siren / strobe"],
  detector: ["PIR", "Dual-tech detector", "Reed switch", "Glass-break detector", "Vibration sensor", "Duress button", "Smoke detector"],
  "access-reader": ["Card reader", "Keypad reader", "REX button", "Maglock", "Electric strike", "Door contact", "Break-glass"],
  "access-controller": ["Door controller", "Lift controller", "I/O module"],
  power: ["Power supply", "Battery", "UPS"],
  other: [],
};

/** Section order for a category: prioritised sections first, then the rest in their usual order. */
export function sectionOrder(category: Category): SectionId[] {
  const first = CATEGORY_PRIORITY[category];
  return [...first, ...SECTIONS.map((s) => s.id).filter((id) => !first.includes(id))];
}
