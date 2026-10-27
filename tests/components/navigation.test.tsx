import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({ usePathname: () => "/devices/kestrel-demo-ks-rs1" }));

import { BottomNav } from "@/components/layout/BottomNav";

describe("BottomNav", () => {
  it("renders all primary destinations and marks the active section", () => {
    render(<BottomNav />);
    for (const label of ["Home", "Devices", "EOL", "Faults", "Reports"]) {
      expect(screen.getByRole("link", { name: label })).toBeInTheDocument();
    }
    expect(screen.getByRole("link", { name: "Devices" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Home" })).not.toHaveAttribute("aria-current");
  });
});
