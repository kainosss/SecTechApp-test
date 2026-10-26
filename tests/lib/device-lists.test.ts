import { describe, expect, it } from "vitest";
import { parseIdList, pushRecent, toggleFavourite } from "@/lib/storage/device-lists";

describe("device lists", () => {
  it("puts the latest view first without duplicates", () => {
    expect(pushRecent(["a", "b", "c"], "b")).toEqual(["b", "a", "c"]);
  });

  it("caps the recent list", () => {
    expect(pushRecent(["a", "b", "c"], "d", 3)).toEqual(["d", "a", "b"]);
  });

  it("toggles favourites", () => {
    expect(toggleFavourite(["a"], "b")).toEqual(["a", "b"]);
    expect(toggleFavourite(["a", "b"], "a")).toEqual(["b"]);
  });

  it("ignores corrupt stored data", () => {
    expect(parseIdList(null)).toEqual([]);
    expect(parseIdList("{not json")).toEqual([]);
    expect(parseIdList('{"a":1}')).toEqual([]);
    expect(parseIdList('["a", 2, "b"]')).toEqual(["a", "b"]);
  });
});
