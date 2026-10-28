import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

vi.mock("next/navigation", () => ({ usePathname: () => "/reports" }));
vi.mock("@/lib/reports/download", () => ({ downloadWorkbook: async () => "report.xlsx" }));
// Real generation, with the bundled fonts read from disk instead of fetched.
vi.mock("@/lib/handover/pdf", async (orig) => {
  const actual = await orig<typeof import("@/lib/handover/pdf")>();
  const { nodeFonts } = await import("./fonts");
  return { ...actual, generateHandover: (r: never, o: never, b: never) => actual.generateHandover(r, o, b, nodeFonts) };
});

import { ReportsApp } from "@/components/reports/ReportsApp";
import { BRANDING_KEY, loadBranding } from "@/lib/handover/branding";
import { saveReport } from "@/lib/reports/store";
import { cctvFaults, emptyReport } from "../reports/fixtures";

beforeEach(() => {
  window.localStorage.clear();
  Object.assign(URL, { createObjectURL: vi.fn(() => "blob:pdf"), revokeObjectURL: vi.fn() });
});

function openReport(r = cctvFaults()) {
  saveReport(r);
  window.history.replaceState(null, "", `/reports?id=${r.id}`);
  render(<ReportsApp />);
  return r;
}
const pages = () => screen.findAllByRole("img", { name: /^Page \d+ of \d+$/ }, { timeout: 8000 });
const pageText = () => screen.getAllByRole("img", { name: /^Page \d+ of \d+$/ }).map((p) => p.textContent).join("\n");

describe("client handover workflow", () => {
  it("opens from a report, previews the exact pages and downloads the PDF", async () => {
    const r = openReport();
    expect(screen.getByRole("button", { name: "Generate Excel" })).toBeInTheDocument(); // Excel unchanged
    fireEvent.click(screen.getByRole("button", { name: "Client handover PDF" }));
    expect(window.location.search).toBe(`?id=${r.id}&view=handover`);
    const ps = await pages();
    expect(ps.length).toBeGreaterThanOrEqual(2);
    const text = pageText();
    expect(text).toContain("SECURITY SERVICE REPORT");
    expect(text).toContain("Parkside Shopping Centre");
    expect(text).toContain("IDENTIFIED DEFECTS");
    expect(text).toContain(`Page 1 of ${ps.length}`);
    expect(text).not.toMatch(/Example Security|ABN/); // unbranded by default

    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    fireEvent.click(screen.getByRole("button", { name: "Download PDF" }));
    expect(click).toHaveBeenCalledOnce();
    expect(screen.getByTestId("handover-status")).toHaveTextContent("Downloaded Service-Report-Parkside-Shopping-Centre-CC-3307-2026-10-27.pdf");
    click.mockRestore();
  });

  it("refreshes the preview when sections are switched off", async () => {
    openReport();
    fireEvent.click(screen.getByRole("button", { name: "Client handover PDF" }));
    await pages();
    expect(pageText()).toContain("EQUIPMENT INSPECTION SCHEDULE");
    fireEvent.click(screen.getByRole("checkbox", { name: /Equipment inspection schedule/ }));
    await waitFor(() => expect(pageText()).not.toContain("EQUIPMENT INSPECTION SCHEDULE"), { timeout: 8000 });
    expect(pageText()).toContain("RECOMMENDATIONS");
  });

  it("disables sections with nothing to show for a minimal report", async () => {
    openReport(emptyReport());
    fireEvent.click(screen.getByRole("button", { name: "Client handover PDF" }));
    expect(await pages()).toHaveLength(1);
    expect(screen.getByRole("checkbox", { name: /Recommendations/ })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: /Inspection overview/ })).toBeEnabled();
  });

  it("applies optional branding, saved on this device", async () => {
    openReport();
    fireEvent.click(screen.getByRole("button", { name: "Client handover PDF" }));
    await pages();
    const branding = screen.getByTestId("branding");
    fireEvent.change(within(branding).getByLabelText("Company name"), { target: { value: "Example Security Services" } });
    fireEvent.change(within(branding).getByLabelText("ABN"), { target: { value: "00 000 000 000" } });
    await waitFor(() => expect(pageText()).toContain("Example Security Services"), { timeout: 8000 });
    expect(pageText()).toContain("ABN 00 000 000 000");
    expect(loadBranding()).toMatchObject({ companyName: "Example Security Services", abn: "00 000 000 000", logo: null });
    expect(window.localStorage.getItem(BRANDING_KEY)).not.toBeNull();
  });

  it("rejects a file that isn't a PNG or JPEG logo", async () => {
    openReport();
    fireEvent.click(screen.getByRole("button", { name: "Client handover PDF" }));
    await pages();
    const input = within(screen.getByTestId("branding")).getByLabelText("Logo file");
    fireEvent.change(input, { target: { files: [new File(["<svg></svg>"], "logo.png", { type: "image/png" })] } });
    expect(await within(screen.getByTestId("branding")).findByRole("alert")).toHaveTextContent("Use a PNG or JPEG image");
    expect(loadBranding().logo).toBeNull();
  });

  it("returns to the report editor", async () => {
    openReport();
    fireEvent.click(screen.getByRole("button", { name: "Client handover PDF" }));
    await pages();
    fireEvent.click(screen.getByRole("button", { name: "Back to report" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Generate Excel" })).toBeInTheDocument());
  });
});
