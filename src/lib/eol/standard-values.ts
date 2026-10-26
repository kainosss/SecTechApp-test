/**
 * Standard resistor values and how to make a non-standard value from them.
 * A target that is not a single standard value is usually still achievable:
 * e.g. 4k4 = 2k2 + 2k2 in series.
 */

/** E12 is what most installers carry; E24 adds the in-between values. */
export const E12 = [1.0, 1.2, 1.5, 1.8, 2.2, 2.7, 3.3, 3.9, 4.7, 5.6, 6.8, 8.2];
export const E24 = [1.0, 1.1, 1.2, 1.3, 1.5, 1.6, 1.8, 2.0, 2.2, 2.4, 2.7, 3.0, 3.3, 3.6, 3.9, 4.3, 4.7, 5.1, 5.6, 6.2, 6.8, 7.5, 8.2, 9.1];

/** Decades covered: 10 Ω to 1 MΩ. */
function expand(series: number[]): number[] {
  const out: number[] = [];
  for (let decade = 10; decade <= 100_000; decade *= 10) for (const v of series) out.push(Math.round(v * decade * 100) / 100);
  out.push(1_000_000);
  return out;
}

export const E12_VALUES = expand(E12);
export const E24_VALUES = expand(E24);

/** Quick picks offered in the resistor editor. */
export const COMMON_EOL_VALUES = [1000, 1500, 2200, 3300, 4700, 5600, 6800, 10000, 12000, 22000, 47000];

/** Relative tolerance for treating a combination as exactly the target. */
const EXACT = 0.001;

export function isStandardValue(ohms: number, series: number[] = E24_VALUES): boolean {
  return series.some((v) => Math.abs(v - ohms) <= ohms * EXACT);
}

export interface Realisation {
  /** Physical resistor values used. */
  parts: number[];
  arrangement: "single" | "series" | "parallel";
  /** Equivalent resistance of the parts. */
  ohms: number;
  /** True when the equivalent equals the target (within 0.1%). */
  exact: boolean;
}

/**
 * How to build a target value from standard parts: a single standard value if
 * possible, else two standard values in series or parallel (E12 preferred,
 * then E24). Falls back to the nearest single E24 value, marked inexact.
 */
export function realise(target: number): Realisation {
  for (const series of [E12_VALUES, E24_VALUES]) {
    const single = series.find((v) => Math.abs(v - target) <= target * EXACT);
    if (single !== undefined) return { parts: [single], arrangement: "single", ohms: single, exact: true };
  }
  for (const series of [E12_VALUES, E24_VALUES]) {
    // Series pair: prefer two equal parts, then the largest first part.
    const candidates: Realisation[] = [];
    for (const a of series) {
      if (a >= target) break;
      const b = series.find((v) => Math.abs(a + v - target) <= target * EXACT);
      if (b !== undefined && b <= a) candidates.push({ parts: [a, b], arrangement: "series", ohms: a + b, exact: true });
    }
    // Parallel pair.
    for (const a of series) {
      if (a <= target) continue;
      const needed = (a * target) / (a - target);
      const b = series.find((v) => Math.abs(v - needed) <= needed * EXACT);
      if (b !== undefined && b >= a) candidates.push({ parts: [a, b], arrangement: "parallel", ohms: (a * b) / (a + b), exact: true });
    }
    if (candidates.length > 0) {
      candidates.sort(
        (x, y) =>
          Number(y.parts[0] === y.parts[1]) - Number(x.parts[0] === x.parts[1]) ||
          Number(x.arrangement === "parallel") - Number(y.arrangement === "parallel"),
      );
      return candidates[0]!;
    }
  }
  const nearest = E24_VALUES.reduce((best, v) => (Math.abs(v - target) < Math.abs(best - target) ? v : best));
  return { parts: [nearest], arrangement: "single", ohms: nearest, exact: false };
}

/**
 * Parses technician input: "4k7", "4.7k", "4.7 kΩ", "4700", "4700R", "1M", "10 kohm".
 * Returns ohms, or null when the input is not a valid positive resistance (10 Ω–10 MΩ).
 */
export function parseResistance(input: string): number | null {
  const s = input.trim().toLowerCase().replace(/\s+/g, "").replace(/ω|ohms?$/g, "");
  if (!s) return null;
  let value: number;
  const code = s.match(/^(\d+)([rkm])(\d*)$/); // RKM code, e.g. 4k7, 470r, 1m
  if (code) {
    const [, whole, unit, frac] = code;
    value = Number(`${whole}.${frac || "0"}`) * (unit === "k" ? 1e3 : unit === "m" ? 1e6 : 1);
  } else {
    const m = s.match(/^(\d+(?:\.\d+)?|\.\d+)([km]?)$/);
    if (!m) return null;
    value = Number(m[1]) * (m[2] === "k" ? 1e3 : m[2] === "m" ? 1e6 : 1);
  }
  if (!Number.isFinite(value) || value < 10 || value > 10_000_000) return null;
  return Math.round(value * 1000) / 1000;
}
