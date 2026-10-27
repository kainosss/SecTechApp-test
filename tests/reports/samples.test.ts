// @vitest-environment node
/** Writes the representative workbooks to FIELDWISE_SAMPLE_DIR for visual QA (skipped otherwise). */
import { it } from "vitest";
import { writeFileSync } from "node:fs";
import ExcelJS from "exceljs";
import { buildWorkbook, finalizeXlsx } from "@/lib/reports/excel";
import { SAMPLES } from "./fixtures";

const dir = process.env.FIELDWISE_SAMPLE_DIR;
it.skipIf(!dir)("writes sample workbooks", async () => {
  for (const [name, make] of Object.entries(SAMPLES)) {
    const buf = await finalizeXlsx((await buildWorkbook(make(), ExcelJS, new Date(2026, 9, 27, 12)).xlsx.writeBuffer()) as ArrayBuffer);
    writeFileSync(`${dir}/${name}.xlsx`, Buffer.from(buf));
  }
});
