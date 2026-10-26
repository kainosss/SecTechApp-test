import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DeviceBrowser } from "@/components/devices/DeviceBrowser";
import { getDeviceListItems, getManufacturers } from "@/lib/content/repository";

function setup(initialFilter = {}) {
  render(
    <DeviceBrowser devices={getDeviceListItems()} manufacturers={getManufacturers()} initialFilter={initialFilter} />,
  );
  return userEvent.setup();
}

const rows = () => within(screen.getAllByRole("list").at(-1)!).getAllByRole("link");

describe("DeviceBrowser", () => {
  it("lists all devices, then narrows by search and updates the URL", async () => {
    const user = setup();
    const total = getDeviceListItems().length;
    expect(screen.getByText(`${total} devices`)).toBeInTheDocument();

    await user.type(screen.getByRole("searchbox"), "rd10");
    expect(rows()).toHaveLength(1);
    expect(rows()[0]).toHaveAttribute("href", "/devices/arclight-demo-rd-10");
    expect(window.location.search).toBe("?q=rd10");
  });

  it("filters by category chip and manufacturer, and clears filters", async () => {
    const user = setup();
    await user.click(screen.getByRole("button", { name: /^Card reader/ }));
    expect(rows()).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    await user.selectOptions(screen.getByRole("combobox"), "halden-demo");
    expect(rows().map((r) => r.textContent)).toEqual([expect.stringContaining("HC-4D"), expect.stringContaining("NV-8")]);
  });

  it("starts from the filter in the URL and explains empty results", async () => {
    const user = setup({ category: "siren" });
    expect(rows()).toHaveLength(1);
    await user.type(screen.getByRole("searchbox"), "nothing-like-this");
    expect(screen.getByText(/No devices match/)).toBeInTheDocument();
  });
});
