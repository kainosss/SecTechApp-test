import type { IconName } from "@/lib/navigation";

/** Plain-language tool guide used by the welcome card and the Help page. */
export interface ToolGuide {
  title: string;
  href: string;
  icon: IconName;
  what: string;
  when: string;
}

export const TOOL_GUIDE: ToolGuide[] = [
  {
    title: "Device Library",
    href: "/devices",
    icon: "library",
    what: "Look up a detector, panel or reader: terminals, specifications and links to the manufacturer's manuals.",
    when: "You're on site and need to check a device quickly. Anything not marked Verified must be checked against the manual.",
  },
  {
    title: "EOL Wiring Assistant",
    href: "/eol",
    icon: "eol",
    what: "Work out end-of-line resistor values and see the reading a zone should give when sealed, in alarm, tampered or shorted.",
    when: "Wiring or checking a zone. Values shown are examples — always match the panel's programmed configuration.",
  },
  {
    title: "Circuit Lab",
    href: "/circuit-lab",
    icon: "lab",
    what: "Practise wiring a dual EOL detector on a virtual bench and measure it with a simulated multimeter.",
    when: "Training or refreshing your skills. Nothing here is live — it's a simulation.",
  },
  {
    title: "Fault Finder",
    href: "/fault-finder",
    icon: "fault",
    what: "Answer a few questions and enter meter readings to narrow down a fault, with safe next steps.",
    when: "A zone, detector, door or reader isn't behaving. Guidance is generic, not manufacturer-specific.",
  },
  {
    title: "Technical Docs",
    href: "/tech-docs",
    icon: "docs",
    what: "Keep a register of a site's equipment: locations, firmware, network settings, access needs and history.",
    when: "Documenting a site or checking what's installed. Exports to Excel.",
  },
  {
    title: "Service Reports",
    href: "/reports",
    icon: "report",
    what: "Record a service visit — equipment checked, faults, work done — then produce a client PDF or an Excel report.",
    when: "At the end of a job. Reports can be linked to a site's register.",
  },
];
