/**
 * Demonstration content (fictional devices, wiring and workflows used for
 * development) is hidden unless demo mode is explicitly enabled:
 *
 *   FIELDWISE_DEMO_MODE=true      (e.g. in .env.local, or `npm run dev:demo`)
 *
 * Read on the server only. Static pages pick it up at build time.
 */
export function isDemoModeEnabled(): boolean {
  return process.env.FIELDWISE_DEMO_MODE === "true";
}

/** The app version from package.json (set at build time in next.config.ts). */
export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION || "dev";
