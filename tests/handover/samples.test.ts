// @vitest-environment node
/** Writes sample handover PDFs to FIELDWISE_SAMPLE_DIR for visual QA (skipped otherwise). */
import { it } from "vitest";
import { writeFileSync } from "node:fs";
import { DEFAULT_OPTIONS } from "@/lib/handover/content";
import { generateHandover } from "@/lib/handover/pdf";
import { HANDOVER_SAMPLES } from "./fixtures";
import { nodeFonts } from "./fonts";

const dir = process.env.FIELDWISE_SAMPLE_DIR;
it.skipIf(!dir)("writes sample handover PDFs", async () => {
  for (const [name, { report, branding, options }] of Object.entries(HANDOVER_SAMPLES)) {
    const h = await generateHandover(report(), { ...DEFAULT_OPTIONS, ...options }, branding(), nodeFonts);
    writeFileSync(`${dir}/${name}.pdf`, Buffer.from(h.bytes));
  }
}, 60000);
