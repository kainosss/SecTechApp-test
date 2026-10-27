import { workbookBytes } from "./excel";
import { workbookFileName } from "./report";
import type { Report } from "./schema";

export const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** Builds the workbook in the browser and saves it as a file. Returns the file name. */
export async function downloadWorkbook(report: Report): Promise<string> {
  const bytes = await workbookBytes(report);
  const name = workbookFileName(report);
  const url = URL.createObjectURL(new Blob([bytes], { type: XLSX_MIME }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return name;
}
