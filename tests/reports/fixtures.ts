/** Representative reports for workbook tests and visual QA. */
import { applyEdit, createReport } from "@/lib/reports/report";
import type { JobType, Report, ReportItem } from "@/lib/reports/schema";

type ItemInput = Partial<Omit<ReportItem, "id">> & { type: string };

export function build(jobType: JobType, details: Partial<Report>, items: ItemInput[], summary: Partial<Report["summary"]> = {}): Report {
  let r = createReport(jobType, details.technician ?? "Sam Nguyen", new Date(2026, 9, 27, 9, 0));
  r = applyEdit(r, { type: "set", patch: { ...details } });
  for (const it of items) {
    r = applyEdit(r, { type: "add-item", itemType: it.type });
    r = applyEdit(r, { type: "update-item", id: r.equipment.at(-1)!.id, patch: it });
  }
  return applyEdit(r, { type: "summary", patch: summary });
}

export const shortCctv = () =>
  build(
    "cctv",
    { siteName: "Harbour Depot", customer: "Acme Logistics", reference: "JOB-1042", siteAddress: "1 Wharf Road, Pyrmont NSW 2009" },
    [
      { type: "Camera", location: "Gate 2", status: "fault", findings: "No video on channel 3. PoE port shows no power draw.", recommendations: "Replace PoE injector", priority: "High" },
      { type: "Camera", location: "Loading dock", status: "pass", work: "Cleaned dome, checked focus" },
      { type: "NVR", location: "Comms room", makeModel: "Generic 16-channel NVR", status: "pass", work: "Checked recording retention (30 days)" },
    ],
    { workCompleted: "Service of 3 CCTV items. Cleaned cameras and checked recording.", faults: "• Camera 1 (Gate 2): No video on channel 3", parts: "1 × PoE injector" },
  );

export const cctvFaults = () =>
  build(
    "cctv",
    { siteName: "Parkside Shopping Centre", customer: "Parkside Centre Management", reference: "CC-3307", siteAddress: "88 Park Avenue, Chatswood NSW 2067" },
    [
      { type: "NVR", location: "Security office", makeModel: "Generic 32-channel NVR", status: "fault", findings: "Drive 2 reporting SMART errors; recording gaps overnight", work: "Exported last 7 days of footage for client", recommendations: "Replace HDD 2 and verify retention", priority: "High" },
      { type: "Camera", location: "Car park level 1", status: "fault", findings: "Image out of focus after bracket was knocked", work: "Re-aimed camera; focus still soft", recommendations: "Replace bracket and refocus", priority: "Medium" },
      { type: "Camera", location: "Car park level 2", status: "pass", work: "Cleaned and checked" },
      { type: "Camera", location: "Loading dock", status: "fault", findings: "No IR at night" },
      { type: "Camera", location: "Food court", status: "pass" },
      { type: "Network switch", location: "Comms rack", status: "recommendation", findings: "Switch at 92% PoE budget", recommendations: "Plan PoE budget before adding cameras", priority: "Low" },
      { type: "Monitor", location: "Security office", status: "pass" },
    ],
    { workCompleted: "Quarterly CCTV service. Cleaned cameras, checked recording and exported footage requested by the centre manager.", outstanding: "Return visit needed to replace HDD 2 and the level 1 bracket." },
  );

export const intruderInspection = () =>
  build(
    "intruder",
    {
      siteName: "Riverside Medical Centre",
      customer: "Riverside Health Pty Ltd",
      reference: "INSP-2026-118",
      siteAddress: "Level 2, 45 River Street\nParramatta NSW 2150",
      description: "Six-monthly preventative maintenance inspection of the intruder alarm system, including walk testing all detectors, siren test and communicator test to the monitoring centre.",
    },
    [
      { type: "Alarm panel", location: "Plant room", status: "pass", work: "Battery tested under load, firmware version recorded", makeModel: "Generic 8-zone panel" },
      { type: "Keypad", location: "Reception", status: "pass", work: "Walk tested" },
      { type: "PIR", location: "Reception", status: "pass", work: "Walk tested" },
      { type: "PIR", location: "Consult 1", status: "pass", work: "Walk tested" },
      { type: "PIR", location: "Consult 2", status: "recommendation", findings: "Detector partially blocked by new shelving", recommendations: "Relocate detector or move shelving" },
      { type: "Reed switch", location: "Rear door", status: "fault", findings: "Zone fails to seal; reed gap too wide after door realignment", work: "Adjusted magnet, still intermittent", recommendations: "Replace reed switch and magnet", priority: "Medium" },
      { type: "Siren/strobe", location: "External east wall", status: "pass", work: "Siren and strobe tested" },
      { type: "Communicator", location: "Plant room", status: "pass", work: "Test signal received by monitoring centre" },
      { type: "Duress device", location: "Reception desk", status: "not-tested", notes: "Staff unavailable to test during visit" },
    ],
    {
      workCompleted: "• Walk tested all detectors\n• Tested siren/strobe\n• Battery load test\n• Communicator test signal confirmed",
      faults: "• Reed switch 1 (Rear door): fails to seal",
      recommendations: "• Replace rear door reed switch\n• Relocate Consult 2 PIR",
      outstanding: "• Duress device not tested — staff unavailable",
      notes: "Site contact: practice manager. Access via rear lane.",
    },
  );

export const accessFaults = () =>
  build(
    "access",
    { siteName: "Northgate Offices", customer: "Northgate Property Group", reference: "AC-7781" },
    [
      { type: "Controller", location: "Comms cupboard L1", status: "pass" },
      { type: "Card reader", location: "Main entry", status: "fault", findings: "Reader offline; no LED", recommendations: "Check reader cable and replace reader if faulty", priority: "High" },
      { type: "Maglock", location: "Main entry", status: "fault", findings: "Door doesn't release on REX; 12 V remains on lock", recommendations: "Check relay wiring and fire trip interface", priority: "High" },
      { type: "REX device", location: "Main entry", status: "pass" },
      { type: "Electric strike", location: "Store room", status: "fault", findings: "Strike binds under door load", recommendations: "Adjust door closer / strike alignment" },
      { type: "Power supply", location: "Comms cupboard L1", status: "recommendation", findings: "Battery date 2021", recommendations: "Replace standby battery" },
    ],
    { faults: "Three faults at main entry and store room — see Outstanding Actions." },
  );

const paragraph = (n: number) =>
  Array.from({ length: n }, (_, i) => `Observation ${i + 1}: cable run inspected along the ceiling space; minor abrasion noted near the junction box, insulation intact, recommend protective conduit.`).join(" ");

export const longText = () =>
  build(
    "general",
    {
      siteName: "Westfield Distribution Warehouse — Building C (North Annex, including mezzanine storage and dock offices)",
      customer: "Example Logistics Australia Pty Ltd",
      reference: "GEN-0099",
      siteAddress: "Unit 4, 1200 Example Highway\nIndustrial Estate\nEastern Creek NSW 2766",
      description: paragraph(12),
    },
    [
      { type: "Camera", location: "Dock 4", status: "fault", findings: paragraph(30), recommendations: paragraph(4), notes: "=HYPERLINK(\"http://evil.example\")" },
      { type: "Network switch", location: "Comms", status: "pass", work: "Line one\nLine two\nLine three" },
    ],
    { workCompleted: paragraph(60), notes: "Ünïcödé ✓ 日本語 😀 <tag> & \"quotes\"" },
  );

export const largeRegister = () =>
  build(
    "cctv",
    { siteName: "Stadium Precinct", customer: "Venue Operations", reference: "BIG-100" },
    Array.from({ length: 120 }, (_, i): ItemInput => ({
      type: i % 10 === 0 ? "NVR" : "Camera",
      location: `Zone ${Math.floor(i / 10) + 1} · Position ${(i % 10) + 1}`,
      status: (["pass", "pass", "pass", "fault", "recommendation", "not-tested"] as const)[i % 6],
      findings: i % 6 === 3 ? "Image noisy at night; IR illuminator not working" : "",
      recommendations: i % 6 >= 3 && i % 6 < 5 ? "Replace camera" : "",
    })),
  );

export const emptyReport = () => build("general", { siteName: "Unit 4 Office" }, []);

export const SAMPLES = { emptyReport, shortCctv, cctvFaults, intruderInspection, accessFaults, longText, largeRegister };
