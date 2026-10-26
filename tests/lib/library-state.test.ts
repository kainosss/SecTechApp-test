import { describe, expect, it } from "vitest";
import { parseLibraryState } from "@/lib/storage/library-state";

describe("parseLibraryState", () => {
  it("accepts valid library positions", () => {
    expect(parseLibraryState('{"url":"/devices?q=axis&shown=60","scrollY":420}')).toEqual({ url: "/devices?q=axis&shown=60", scrollY: 420 });
  });

  it("rejects corrupt data and URLs outside the library", () => {
    expect(parseLibraryState(null)).toBeNull();
    expect(parseLibraryState("{bad")).toBeNull();
    expect(parseLibraryState('{"url":"https://evil.example","scrollY":0}')).toBeNull();
    expect(parseLibraryState('{"url":"/devices","scrollY":"x"}')).toBeNull();
  });
});
