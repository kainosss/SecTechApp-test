/** Loads the bundled PDF fonts from /public for tests and sample generation. */
import { readFileSync } from "node:fs";
import type { FontLoader } from "@/lib/handover/pdf";

const read = (f: string) => readFileSync(`public/fonts/${f}`).toString("base64");

export const nodeFonts: FontLoader = async (set = "text") =>
  set === "symbols" ? { regular: read("FieldwiseSymbols.ttf"), bold: read("FieldwiseSymbols-Bold.ttf") } : { regular: read("Carlito-Regular.ttf"), bold: read("Carlito-Bold.ttf") };
