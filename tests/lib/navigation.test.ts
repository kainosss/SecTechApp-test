import { describe, expect, it } from "vitest";
import { isActivePath } from "@/lib/navigation";

describe("isActivePath", () => {
  it("only matches home exactly", () => {
    expect(isActivePath("/", "/")).toBe(true);
    expect(isActivePath("/devices", "/")).toBe(false);
  });

  it("matches nested routes but not prefixes of other words", () => {
    expect(isActivePath("/devices/abc", "/devices")).toBe(true);
    expect(isActivePath("/devices-old", "/devices")).toBe(false);
  });
});
