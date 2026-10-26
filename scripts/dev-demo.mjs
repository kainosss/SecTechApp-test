/**
 * Runs the dev server with demonstration content enabled. Cross-platform
 * alternative to `FIELDWISE_DEMO_MODE=true next dev`. Extra args pass through,
 * e.g. `npm run dev:demo -- -H 0.0.0.0`.
 */
import { spawn } from "node:child_process";

const child = spawn("npx", ["next", "dev", ...process.argv.slice(2)], {
  stdio: "inherit",
  shell: process.platform === "win32",
  env: { ...process.env, FIELDWISE_DEMO_MODE: "true" },
});
child.on("exit", (code) => process.exit(code ?? 0));
