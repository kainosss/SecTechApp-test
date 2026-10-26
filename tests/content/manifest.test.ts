import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { rawContent } from "@content/index";

describe("content manifest", () => {
  it("is up to date with the files in /content", () => {
    expect(() =>
      execFileSync("node", ["scripts/generate-content-manifest.mjs", "--check"], { stdio: "pipe" }),
    ).not.toThrow();
  });

  it("includes one record per device file", () => {
    const files = readdirSync(path.resolve("content/devices")).filter((f) => f.endsWith(".json"));
    expect(rawContent.devices).toHaveLength(files.length);
  });
});
