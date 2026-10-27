/**
 * Expected zone readings for the Fault Finder, calculated with the EOL engine
 * from a supported topology — never looked up or assumed per panel.
 *
 * Supported topology (generic dual EOL): R1, the EOL resistor, in series with
 * the loop; R2, the alarm resistor, across the NC alarm contact; the NC tamper
 * contact in series. Sealed = R1, alarm = R1 + R2, tamper = open circuit.
 * Other topologies (tamper resistors, triple EOL, R2 elsewhere) are not
 * supported and must be rejected rather than guessed.
 */
import { networkResistance, OPEN_CIRCUIT, SHORT_CIRCUIT } from "@/lib/eol/engine";
import type { CircuitNode } from "@/lib/eol/model";
import { parseResistance } from "@/lib/eol/standard-values";

export interface EolConfig {
  /** EOL (seal) resistor in series with the loop, Ω. */
  r1: number;
  /** Alarm resistor across the NC alarm contact, Ω. */
  r2: number;
}

/**
 * Measurement tolerance used to classify a reading against an expected value:
 * allows for typical 5 % resistor tolerance plus cable resistance and meter
 * accuracy. It is a diagnostic aid, not a panel threshold — panels apply their
 * own (manufacturer-specific) bands.
 */
export const READING_TOLERANCE = 0.1;
/** Readings at or above this are treated as open circuit (OL). */
export const OPEN_FROM = 1e6;
/** Below this a loop is effectively shorted (capped at 100 Ω). */
export const shortBelow = (sealed: number) => Math.min(0.025 * sealed, 100);

export const MIN_RESISTOR = 10;
export const MAX_RESISTOR = 100_000;

export function dualEolNetwork({ r1, r2 }: EolConfig): CircuitNode {
  return {
    kind: "series",
    children: [
      {
        kind: "parallel",
        children: [
          { kind: "contact", id: "ALM", function: "alarm", type: "NC", sourceRefs: [] },
          { kind: "resistor", id: "R2", ohms: r2, role: "alarm", sourceRefs: [] },
        ],
      },
      { kind: "resistor", id: "R1", ohms: r1, role: "end-of-line", sourceRefs: [] },
      { kind: "contact", id: "TMP", function: "tamper", type: "NC", sourceRefs: [] },
    ],
  };
}

export interface ExpectedReadings {
  sealed: number;
  alarm: number;
  tamper: number;
  /** Cable faults (not calculated from components). */
  open: number;
  short: number;
}

/** Zone readings in each state, calculated by the EOL engine for the generic dual EOL topology. */
export function expectedReadings(cfg: EolConfig): ExpectedReadings {
  const net = dualEolNetwork(cfg);
  return {
    sealed: networkResistance(net, { ALM: "closed", TMP: "closed" }),
    alarm: networkResistance(net, { ALM: "open", TMP: "closed" }),
    tamper: networkResistance(net, { ALM: "closed", TMP: "open" }),
    open: OPEN_CIRCUIT,
    short: SHORT_CIRCUIT,
  };
}

export const ZONE_BANDS = ["short", "low", "sealed", "between", "alarm", "high", "open"] as const;
export type ZoneBand = (typeof ZONE_BANDS)[number];

export const BAND_LABELS: Record<ZoneBand, string> = {
  short: "Short (near 0 Ω)",
  low: "Below the sealed reading",
  sealed: "About the sealed reading",
  between: "Between sealed and alarm readings",
  alarm: "About the alarm reading",
  high: "Above the alarm reading",
  open: "Open circuit (OL)",
};

export interface Band {
  band: ZoneBand;
  /** Inclusive lower bound, Ω. */
  min: number;
  /** Exclusive upper bound, Ω (Infinity for open). */
  max: number;
}

export type BandResult = { ok: true; expected: ExpectedReadings; bands: Band[] } | { ok: false; reason: string };

/** Classification bands for a configuration, or the reason it can't be supported. */
export function zoneBands(cfg: EolConfig): BandResult {
  for (const [name, v] of [
    ["R1 (EOL resistor)", cfg.r1],
    ["R2 (alarm resistor)", cfg.r2],
  ] as const) {
    if (!Number.isFinite(v) || v < MIN_RESISTOR || v > MAX_RESISTOR) {
      return { ok: false, reason: `${name} must be between 10 Ω and 100 kΩ for this guide.` };
    }
  }
  const expected = expectedReadings(cfg);
  const t = READING_TOLERANCE;
  const sealedLo = expected.sealed * (1 - t);
  const sealedHi = expected.sealed * (1 + t);
  const alarmLo = expected.alarm * (1 - t);
  const alarmHi = expected.alarm * (1 + t);
  if (sealedHi >= alarmLo) {
    return {
      ok: false,
      reason: `With these values the alarm reading (${fmt(expected.alarm)}) is within measurement tolerance of the sealed reading (${fmt(expected.sealed)}), so a meter reading can't reliably tell them apart. Check the resistor values.`,
    };
  }
  const shortHi = shortBelow(expected.sealed);
  return {
    ok: true,
    expected,
    bands: [
      { band: "short", min: 0, max: shortHi },
      { band: "low", min: shortHi, max: sealedLo },
      { band: "sealed", min: sealedLo, max: sealedHi },
      { band: "between", min: sealedHi, max: alarmLo },
      { band: "alarm", min: alarmLo, max: alarmHi },
      { band: "high", min: alarmHi, max: OPEN_FROM },
      { band: "open", min: OPEN_FROM, max: Number.POSITIVE_INFINITY },
    ],
  };
}

export function classifyZoneReading(cfg: EolConfig, ohms: number): ZoneBand | null {
  const b = zoneBands(cfg);
  if (!b.ok || Number.isNaN(ohms) || ohms < 0) return null;
  if (!Number.isFinite(ohms)) return "open";
  return b.bands.find((x) => ohms >= x.min && ohms < x.max)?.band ?? null;
}

/** Parses a resistor value as written on site ("4k7", "2.2k", "2200"). */
export function parseResistor(text: string): number | null {
  return parseResistance(text);
}

export function fmt(ohms: number): string {
  if (!Number.isFinite(ohms)) return "OL";
  if (ohms >= 1e6) return `${Number((ohms / 1e6).toPrecision(3))} MΩ`;
  if (ohms >= 1e3) return `${Number((ohms / 1e3).toPrecision(3))} kΩ`;
  return `${Number(ohms.toPrecision(3))} Ω`;
}
