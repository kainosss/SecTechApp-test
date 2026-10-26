/**
 * Virtual multimeter (resistance range) for Circuit Lab.
 *
 * Measures between the two actual probe nodes on the assembled circuit graph
 * with the netlist evaluator — never a reading looked up per exercise. The
 * simulated circuit is de-energised: detector power is isolated and the zone
 * cable is disconnected from the panel input, whose internal circuitry is not
 * modelled. Supply terminals can't be probed.
 */
import { resistanceBetween, type Element } from "@/lib/eol/netlist";
import { circuitNetlist, POINTS_BY_ID, POWER_POINTS, type ContactState, type PlacedComponent, type PointId } from "./bench";

export type DetectorState = "sealed" | "alarm" | "tamper";

export const DETECTOR_STATES: { kind: DetectorState; label: string; short: string }[] = [
  { kind: "sealed", label: "Sealed (contacts closed)", short: "Sealed" },
  { kind: "alarm", label: "Alarm (alarm contact open)", short: "Alarm" },
  { kind: "tamper", label: "Tamper (cover off, tamper contact open)", short: "Tamper" },
];

/** Contact positions for each named detector state. */
export function contactsFor(state: DetectorState): ContactState {
  return { alarm: state === "alarm" ? "open" : "closed", tamper: state === "tamper" ? "open" : "closed" };
}

/** The named state matching these contact positions, or null (e.g. both open). */
export function stateFor(contacts: ContactState): DetectorState | null {
  return DETECTOR_STATES.find((s) => {
    const c = contactsFor(s.kind);
    return c.alarm === contacts.alarm && c.tamper === contacts.tamper;
  })?.kind ?? null;
}

export interface Probes {
  red: PointId | null;
  black: PointId | null;
}
export const NO_PROBES: Probes = { red: null, black: null };

/** Above this the meter shows OL (typical 40 MΩ top range). */
export const OL_LIMIT = 40e6;

export type MeterReading =
  | { status: "idle"; message: string }
  | { status: "blocked"; message: string }
  | { status: "error"; message: string }
  | { status: "ok"; ohms: number; value: string; unit: string };

/** Terminals carrying supply voltage in a real installation. */
export function isSupplyPoint(id: PointId): boolean {
  return POWER_POINTS.includes(id) || POINTS_BY_ID[id].group === "panel-power";
}

export const SUPPLY_WARNING =
  "Supply terminals can't be probed on the resistance range. Never measure resistance on a powered circuit: isolate power and disconnect the conductors first. Use the voltage range for supply checks.";

/** Auto-ranging display, like a 4-digit meter: 0.0 Ω, 220.0 Ω, 2.200 kΩ, 10.00 kΩ, OL. */
export function formatMeter(ohms: number): { value: string; unit: string } {
  if (!Number.isFinite(ohms) || ohms > OL_LIMIT) return { value: "OL", unit: "MΩ" };
  const scaled = (v: number) => (v < 10 ? v.toFixed(3) : v < 100 ? v.toFixed(2) : v.toFixed(1));
  if (ohms < 1000) return { value: ohms.toFixed(1), unit: "Ω" };
  if (ohms < 1e6) return { value: scaled(ohms / 1e3), unit: "kΩ" };
  return { value: scaled(ohms / 1e6), unit: "MΩ" };
}

export function measure(components: PlacedComponent[], probes: Probes, state: DetectorState | ContactState, extra: Element[] = []): MeterReading {
  const { red, black } = probes;
  if (!red || !black) return { status: "idle", message: `Place the ${!red && !black ? "red and black probes" : !red ? "red probe" : "black probe"} on a terminal.` };
  if (isSupplyPoint(red) || isSupplyPoint(black)) return { status: "blocked", message: SUPPLY_WARNING };
  if (components.some((c) => POWER_POINTS.includes(c.a) || POWER_POINTS.includes(c.b))) {
    return {
      status: "error",
      message: "Wiring is connected to the detector's power terminals. The detector's internal electronics aren't modelled, so no trustworthy reading can be given. Remove that wiring first.",
    };
  }
  const contacts = typeof state === "string" ? contactsFor(state) : state;
  const r = resistanceBetween(circuitNetlist(components, contacts, extra), red, black);
  if (!r.ok) return { status: "error", message: `No reading: ${r.reason}` };
  return { status: "ok", ohms: r.ohms, ...formatMeter(r.ohms) };
}
