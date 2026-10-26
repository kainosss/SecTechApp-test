import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DeviceBrowser } from "@/components/devices/DeviceBrowser";
import { listDevices, listManufacturers } from "@/lib/content/repository";
import type { DeviceFilter } from "@/lib/devices/filter";
import { readLibraryState } from "@/lib/storage/library-state";

async function setup(initialFilter: DeviceFilter = {}) {
  render(<DeviceBrowser devices={await listDevices()} manufacturers={await listManufacturers()} initialFilter={initialFilter} />);
  return userEvent.setup();
}

afterEach(() => vi.unstubAllEnvs());

const rows = () => within(screen.getAllByRole("list").at(-1)!).getAllByRole("link");

describe("DeviceBrowser", () => {
  it("lists all devices, narrows by search, and keeps the URL and saved position in sync", async () => {
    const user = await setup();
    expect(screen.getByText(`${(await listDevices()).length} devices`)).toBeInTheDocument();

    await user.type(screen.getByRole("searchbox"), "rd10");
    expect(rows()).toHaveLength(1);
    expect(rows()[0]).toHaveAttribute("href", "/devices/arclight-demo-rd-10");
    expect(window.location.search).toBe("?q=rd10");
    expect(readLibraryState()?.url).toBe("/devices?q=rd10");
  });

  it("filters by equipment group and manufacturer, and clears filters", async () => {
    const user = await setup();
    await user.click(screen.getByRole("button", { name: /^Card readers/ }));
    expect(rows().map((r) => r.getAttribute("href")).sort()).toEqual(["/devices/arclight-demo-rd-10", "/devices/inner-range-sifer-reader"]);
    expect(window.location.search).toBe("?group=readers");

    await user.click(screen.getAllByRole("button", { name: "Clear filters" })[0]!);
    await user.selectOptions(screen.getByRole("combobox"), "halden-demo");
    expect(rows().map((r) => r.textContent)).toEqual([expect.stringContaining("HC-4D"), expect.stringContaining("NV-8")]);
  });

  it("explains empty groups differently from failed searches", async () => {
    vi.stubEnv("FIELDWISE_DEMO_MODE", "false");
    const user = await setup({ group: "contacts" });
    expect(screen.getByText(/No reed switches & contacts are in the library yet/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^All/ }));
    await user.type(screen.getByRole("searchbox"), "nothing-like-this");
    expect(screen.getByText(/No devices match/)).toBeInTheDocument();
  });
});
