/** Loads the bundled PDF fonts from /public for tests and sample generation. */
import { readFileSync } from "node:fs";
import type { FontLoader } from "@/lib/handover/pdf";

export const nodeFonts: FontLoader = async () => ({
  regular: readFileSync("public/fonts/Carlito-Regular.ttf").toString("base64"),
  bold: readFileSync("public/fonts/Carlito-Bold.ttf").toString("base64"),
});
