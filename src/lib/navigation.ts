export type IconName = "home" | "library" | "eol" | "fault" | "lab" | "search";

export interface NavItem {
  href: string;
  label: string;
  icon: IconName;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Home", icon: "home" },
  { href: "/devices", label: "Devices", icon: "library" },
  { href: "/eol", label: "EOL", icon: "eol" },
  { href: "/fault-finder", label: "Faults", icon: "fault" },
  { href: "/circuit-lab", label: "Lab", icon: "lab" },
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
    description: "Step-by-step diagnostics for common site faults.",
    href: "/fault-finder",
    icon: "fault",
    status: "preview",
    keywords: ["fault", "troubleshoot", "tamper", "diagnose", "trouble"],
  },
  {
    id: "circuit-lab",
    title: "Circuit Lab",
    description: "Practise wiring a dual EOL detector and check it in every state.",
    href: "/circuit-lab",
    icon: "lab",
    status: "preview",
    keywords: ["lab", "practice", "training", "wiring", "exercise", "pir", "dual eol", "learn"],
  },
];

/** True when `pathname` is within the section rooted at `href`. */
export function isActivePath(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
