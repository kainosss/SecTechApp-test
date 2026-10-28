import type { SVGProps } from "react";

export type IconKey =
  | "home"
  | "library"
  | "eol"
  | "fault"
  | "lab"
  | "lock"
  | "report"
  | "docs"
  | "pir"
  | "search"
  | "star"
  | "star-filled"
  | "clock"
  | "chevron-right"
  | "external"
  | "shield"
  | "alert"
  | "close"
  | "help"
  | "feedback";

const PATHS: Record<IconKey, React.ReactNode> = {
  home: <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1z" />,
  library: (
    <>
      <rect x="3.5" y="4" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="4" width="7" height="7" rx="1.5" />
      <rect x="3.5" y="14" width="7" height="6" rx="1.5" />
      <path d="M13.5 15.5h7M13.5 19h4.5" />
    </>
  ),
  // Resistor zig-zag between two leads
  eol: <path d="M2 12h4l1.5-4 3 8 3-8 3 8 1.5-4h4" />,
  // Decision tree: one question branching to outcomes
  fault: (
    <>
      <rect x="9" y="3" width="6" height="5" rx="1.2" />
      <rect x="3" y="16" width="6" height="5" rx="1.2" />
      <rect x="15" y="16" width="6" height="5" rx="1.2" />
      <path d="M12 8v4M6 16v-2a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2" />
    </>
  ),
  // Breadboard: two terminals joined by a lead
  lab: (
    <>
      <rect x="3.5" y="5" width="17" height="14" rx="2" />
      <circle cx="8" cy="10" r="1.3" />
      <circle cx="16" cy="14" r="1.3" />
      <path d="M8 11.3v1.2a1.5 1.5 0 0 0 1.5 1.5h5.2" />
    </>
  ),
  // Clipboard with lines
  report: (
    <>
      <rect x="5" y="4.5" width="14" height="16" rx="2" />
      <path d="M9 4.5V3.5h6v1M8.5 10h7M8.5 13.5h7M8.5 17h4" />
    </>
  ),
  // Stacked documents with a table
  docs: (
    <>
      <path d="M8 3.5h8.5L20 7v11.5a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1v-14a1 1 0 0 1 1-1z" />
      <path d="M16.5 3.5V7H20M10 11h7M10 14h7M10 17h4M13.5 11v6" />
      <path d="M4 7v13a1 1 0 0 0 1 1h10" />
    </>
  ),
  // Padlock
  lock: (
    <>
      <rect x="5" y="10.5" width="14" height="10" rx="2" />
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5M12 14.5v2.5" />
    </>
  ),
  // Detector with detection arcs
  pir: (
    <>
      <rect x="9" y="3.5" width="6" height="7" rx="2" />
      <path d="M6.5 14.5a8 8 0 0 0 11 0M4 17.5a12 12 0 0 0 16 0" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4.5 4.5" />
    </>
  ),
  star: <path d="m12 3.8 2.5 5.1 5.6.8-4 4 .9 5.5-5-2.6-5 2.6.9-5.5-4-4 5.6-.8z" />,
  "star-filled": <path fill="currentColor" d="m12 3.8 2.5 5.1 5.6.8-4 4 .9 5.5-5-2.6-5 2.6.9-5.5-4-4 5.6-.8z" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  "chevron-right": <path d="m9.5 6 6 6-6 6" />,
  external: <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />,
  shield: (
    <>
      <path d="M12 3.5 19 6v5.5c0 4.2-3 7.6-7 9-4-1.4-7-4.8-7-9V6z" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
  alert: (
    <>
      <path d="M12 4 21 19.5H3z" />
      <path d="M12 10v4.5M12 17.2v.3" />
    </>
  ),
  close: <path d="M6 6l12 12M18 6 6 18" />,
  help: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M9.6 9.5a2.5 2.5 0 1 1 3.4 2.3c-.6.3-1 .8-1 1.5v.4M12 16.6v.3" />
    </>
  ),
  // Speech bubble with lines
  feedback: (
    <>
      <path d="M4.5 5.5h15a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H10l-4.5 3.5V16.5h-1a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1z" />
      <path d="M8 9.5h8M8 12.5h5" />
    </>
  ),
};

export function Icon({ name, className = "size-5", ...props }: { name: IconKey } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
      {...props}
    >
      {PATHS[name]}
    </svg>
  );
}
