import { techWorkbookBytes } from "./excel";
import { exportFileName } from "./register";
import type { TechRegister } from "./schema";

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** Builds the technical workbook in the browser and saves it as a file. Returns the file name. */
export async function downloadTechWorkbook(register: TechRegister): Promise<string> {
  const bytes = await techWorkbookBytes(register);
  const name = exportFileName(register);
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
