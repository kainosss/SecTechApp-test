export type IconName = "home" | "library" | "eol" | "fault" | "search";

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
    description: "Terminals, power requirements and manufacturer documents.",
    href: "/devices",
    icon: "library",
    status: "preview",
    keywords: ["devices", "terminals", "datasheet", "manual", "voltage"],
  },
  {
    id: "eol-assistant",
    title: "EOL Wiring Assistant",
    description: "Verified end-of-line resistor references by panel and input.",
    href: "/eol",
    icon: "eol",
    status: "planned",
    keywords: ["eol", "end of line", "resistor", "wiring", "zone", "double eol"],
  },
  {
    id: "fault-finder",
    title: "Guided Fault Finder",
    description: "Step-by-step diagnostics for common site faults.",
    href: "/fault-finder",
    icon: "fault",
    status: "planned",
    keywords: ["fault", "troubleshoot", "tamper", "diagnose", "trouble"],
  },
];

/** True when `pathname` is within the section rooted at `href`. */
export function isActivePath(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
