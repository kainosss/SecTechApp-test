import { describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

import { UniversalSearch } from "@/components/dashboard/UniversalSearch";
import { DeviceShortlists } from "@/components/dashboard/DeviceShortlists";
import { FavouriteButton } from "@/components/devices/FavouriteButton";
import { buildSearchIndex } from "@/lib/search/build-index";
import { listDevices } from "@/lib/content/repository";
import { RECENT_KEY } from "@/lib/storage/device-lists";

describe("UniversalSearch", () => {
  it("shows live results and submits to the search page", async () => {
    const user = userEvent.setup();
    render(<UniversalSearch index={await buildSearchIndex()} />);
    const input = screen.getByRole("searchbox");
    await user.type(input, "pir12");
    const links = screen.getAllByRole("link", { name: /KS-PIR12/ });
    expect(links[0]).toHaveAttribute("href", "/devices/kestrel-demo-ks-pir12");
    expect(links.map((l) => l.getAttribute("href"))).toContain("/eol/demo-ap8-dual-eol-pir");
    await user.keyboard("{Enter}");
    expect(push).toHaveBeenCalledWith("/search?q=pir12");
  });

  it("explains when nothing matches", async () => {
    const user = userEvent.setup();
    render(<UniversalSearch index={await buildSearchIndex()} />);
    await user.type(screen.getByRole("searchbox"), "zzzz");
    expect(screen.getByText(/No matches/)).toBeInTheDocument();
  });
});

describe("DeviceShortlists", () => {
  it("shows empty states, then favourites and recent devices from storage", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(["kestrel-demo-ks-rs1", "unknown-id"]));
    render(
      <>
        <DeviceShortlists devices={await listDevices()} />
        <FavouriteButton deviceId="northgate-demo-ap-8" />
      </>,
    );

    const recent = screen.getByRole("region", { name: "Recently viewed" });
    expect(recent).toHaveTextContent("KS-RS1");
    const favourites = screen.getByRole("region", { name: "Favourites" });
    expect(favourites).toHaveTextContent(/Tap the star/);

    await user.click(screen.getByRole("button", { name: "Add to favourites" }));
    expect(favourites).toHaveTextContent("AP-8");
    expect(screen.getByRole("button", { name: "Saved to favourites" })).toHaveAttribute("aria-pressed", "true");

    await act(() => user.click(screen.getByRole("button", { name: "Clear" })));
    expect(recent).toHaveTextContent(/Devices you open/);
  });
});
