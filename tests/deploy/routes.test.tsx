import { existsSync } from "node:fs";
import { join } from "node:path";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import HelpPage from "@/app/help/page";
import { DemoNotice } from "@/components/ui/DemoNotice";
import { TOOL_GUIDE } from "@/lib/guide";
import { NAV_ITEMS, TOOLS } from "@/lib/navigation";
import { createReport } from "@/lib/reports/report";
import { REPORTS_KEY, saveReport } from "@/lib/reports/store";
import { createRegister } from "@/lib/techdocs/register";
import { REGISTERS_KEY, saveRegister } from "@/lib/techdocs/store";

const page = (href: string) => join(process.cwd(), "src/app", href.split(/[?#]/)[0]!, "page.tsx");

describe("routes", () => {
  it("every navigation, tool and help link points to a page that exists", () => {
    for (const href of [...NAV_ITEMS.map((n) => n.href), ...TOOLS.map((t) => t.href), ...TOOL_GUIDE.map((t) => t.href), "/help", "/feedback"]) {
      expect(existsSync(page(href)), href).toBe(true);
    }
  });

  it("deep links use query strings on static pages, so a refresh loads the same page", () => {
    // /reports?id=…, /tech-docs?id=…&item=… and /eol?t=… are handled client-side by one static page each.
    for (const p of ["/reports", "/tech-docs", "/eol"]) expect(existsSync(page(p))).toBe(true);
    expect(existsSync(join(process.cwd(), "src/app/not-found.tsx"))).toBe(true);
    expect(existsSync(join(process.cwd(), "src/app/error.tsx"))).toBe(true);
  });
});

describe("pilot notice", () => {
  it("Help states the pilot conditions and how to install", () => {
    render(<HelpPage />);
    const notice = screen.getByTestId("pilot-notice");
    expect(notice).toHaveTextContent(/being tested/);
    expect(notice).toHaveTextContent(/incomplete or unverified/);
    expect(notice).toHaveTextContent(/Manufacturer documentation takes precedence/);
    expect(notice).toHaveTextContent(/before applying it to a live system/);
    expect(notice).toHaveTextContent(/stored in this browser only/);
    expect(notice).toHaveTextContent(/don't sync between devices/);
    expect(notice).toHaveTextContent(/clearing browser data can delete them/);
    expect(notice).toHaveTextContent(/never sent automatically/);
    expect(notice).toHaveTextContent(/fictional or non-sensitive data/);
    const install = screen.getByTestId("install-guide");
    expect(install).toHaveTextContent(/Android/);
    expect(install).toHaveTextContent(/Add to Home Screen/);
    expect(install).toHaveTextContent(/offline use isn't supported/);
    expect(install).toHaveTextContent(/vary between browsers/);
  });

  it("the dashboard notice points to it", () => {
    vi.stubEnv("FIELDWISE_DEMO_MODE", "false"); // tests run in demo mode by default; the pilot doesn't
    render(<DemoNotice compact />);
    expect(screen.getByRole("note")).toHaveTextContent(/Pilot\..*manufacturer documentation takes precedence.*fictional data/);
    expect(screen.getByRole("link", { name: "Pilot notice" })).toHaveAttribute("href", "/help#pilot");
    vi.unstubAllEnvs();
  });
});

describe("persistence across a reload", () => {
  it("records written by the stores are read back by freshly loaded modules", async () => {
    const reg = { ...createRegister("Tech"), name: "Persisted site" };
    saveRegister(reg);
    saveReport({ ...createReport("cctv", "Tech"), reference: "PERSIST-1" });
    expect(window.localStorage.getItem(REGISTERS_KEY)).toContain("Persisted site");
    expect(window.localStorage.getItem(REPORTS_KEY)).toContain("PERSIST-1");
    vi.resetModules(); // like a page reload: no in-memory state survives, only browser storage
    const techdocs = await import("@/lib/techdocs/store");
    const reports = await import("@/lib/reports/store");
    expect(techdocs.loadRegisters().registers.map((r) => r.name)).toEqual(["Persisted site"]);
    expect(reports.loadReports().reports.map((r) => r.reference)).toEqual(["PERSIST-1"]);
  });
});
