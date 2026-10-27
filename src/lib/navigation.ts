export type IconName = "home" | "library" | "eol" | "fault" | "lab" | "report" | "search";

export interface NavItem {
  href: string;
  label: string;
  icon: IconName;
  /** Hidden from the five-slot mobile bottom bar (still in the sidebar and on the dashboard). */
  mobile?: false;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Home", icon: "home" },
  { href: "/devices", label: "Devices", icon: "library" },
  { href: "/eol", label: "EOL", icon: "eol" },
  { href: "/fault-finder", label: "Faults", icon: "fault" },
  { href: "/reports", label: "Reports", icon: "report" },
  { href: "/circuit-lab", label: "Lab", icon: "lab", mobile: false },
];

export interface ToolDefinition {
  id: string;
  title: string;
  description: string;
  href: string;
  icon: IconName;
  status: "available" | "preview" | "planned";
  keywords: string[];
}

export const TOOLS: ToolDefinition[] = [
  {
    id: "device-library",
    title: "Device Library",
    description: "Terminals, specifications, install notes and manufacturer manuals.",
    href: "/devices",
    icon: "library",
    status: "available",
    keywords: ["devices", "terminals", "datasheet", "manual", "voltage"],
  },
  {
    id: "eol-assistant",
    title: "EOL Wiring Assistant",
    description: "End-of-line resistor references by panel, input and contact arrangement.",
    href: "/eol",
    icon: "eol",
    status: "preview",
    keywords: ["eol", "end of line", "resistor", "wiring", "zone", "double eol"],
  },
  {
    id: "fault-finder",
    title: "Guided Fault Finder",
    description: "Guided diagnosis for common faults: answer questions, enter meter readings, get likely causes.",
    href: "/fault-finder",
    icon: "fault",
    status: "available",
    keywords: ["fault", "troubleshoot", "tamper", "diagnose", "trouble", "zone open", "short", "pir", "door", "lock", "access control"],
  },
  {
    id: "service-reports",
    title: "Service Reports",
    description: "Record equipment and findings on site, then generate an editable Excel report in one tap.",
    href: "/reports",
    icon: "report",
    status: "available",
    keywords: ["report", "service report", "job sheet", "excel", "xlsx", "maintenance", "inspection", "equipment register"],
  },
  {
    id: "circuit-lab",
    title: "Circuit Lab",
    description: "Practise wiring a dual EOL detector, measure it with a virtual multimeter, and find faults.",
    href: "/circuit-lab",
    icon: "lab",
    status: "preview",
    keywords: ["lab", "practice", "training", "wiring", "exercise", "pir", "dual eol", "learn", "multimeter", "meter", "fault finding"],
  },
];

/** True when `pathname` is within the section rooted at `href`. */
export function isActivePath(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
