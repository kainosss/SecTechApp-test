// @vitest-environment node
/** Writes the sample technical workbooks (and their register JSON, for seeding the UI) to FIELDWISE_SAMPLE_DIR (skipped otherwise). */
import { it } from "vitest";
import { writeFileSync } from "node:fs";
import ExcelJS from "exceljs";
import { finalizeXlsx } from "@/lib/reports/xlsx-layout";
import { buildTechWorkbook } from "@/lib/techdocs/excel";
import { TECH_SAMPLES } from "./fixtures";

const dir = process.env.FIELDWISE_SAMPLE_DIR;
it.skipIf(!dir)("writes sample technical workbooks", async () => {
  const registers = Object.entries(TECH_SAMPLES).map(([name, make]) => [name, make()] as const);
  for (const [name, r] of registers) {
    const buf = await finalizeXlsx((await buildTechWorkbook(r, ExcelJS, new Date(2026, 9, 27, 12)).xlsx.writeBuffer()) as ArrayBuffer);
    writeFileSync(`${dir}/tech-${name}.xlsx`, Buffer.from(buf));
  }
  writeFileSync(`${dir}/tech-registers.json`, JSON.stringify({ version: 1, registers: Object.fromEntries(registers.map(([, r]) => [r.id, r])) }));
});
