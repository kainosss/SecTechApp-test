import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cloudflareHeadersFile, headerRules, securityHeaders } from "@/lib/security-headers";
import pkg from "../../package.json";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

/** Parses a Pages `_headers` file into { pattern: { header: value } }. */
function parse(file: string): Record<string, Record<string, string>> {
  const rules: Record<string, Record<string, string>> = {};
  let current = "";
  for (const line of file.split("\n")) {
    if (!line.trim() || line.startsWith("#")) continue;
    if (!line.startsWith(" ")) rules[(current = line.trim())] = {};
    else {
      const [key, ...value] = line.trim().split(": ");
      rules[current]![key!] = value.join(": ");
    }
  }
  return rules;
}

describe("Cloudflare Pages _headers", () => {
  const file = cloudflareHeadersFile();
  const rules = parse(file);

  it("applies every security header to every path, unchanged", () => {
    expect(rules["/*"]).toEqual(Object.fromEntries(securityHeaders(false).map((h) => [h.key, h.value])));
    expect(rules["/*"]!["Content-Security-Policy"]).not.toContain("unsafe-eval");
  });

  it("keeps the manifest, icon and hashed-asset cache rules", () => {
    expect(rules["/manifest.webmanifest"]).toEqual({ "Cache-Control": "public, max-age=0, must-revalidate" });
    expect(rules["/icons/*"]).toEqual({ "Cache-Control": "public, max-age=86400" });
    expect(rules["/_next/static/*"]).toEqual({ "Cache-Control": "public, max-age=31536000, immutable" });
  });

  it("matches the next.config rules (same headers on Vercel / next start and on Pages)", () => {
    for (const r of headerRules(false)) {
      const pattern = r.source.replace(/:[a-z]+\*$/i, "*");
      expect(rules[pattern]).toEqual(Object.fromEntries(r.headers.map((h) => [h.key, h.value])));
    }
  });

  it("stays within Pages limits (100 rules, 2,000 characters per line)", () => {
    expect(Object.keys(rules).length).toBeLessThanOrEqual(100);
    for (const line of file.split("\n")) expect(line.length).toBeLessThanOrEqual(2000);
  });
});

describe("build configuration", () => {
  it("the normal build keeps next.config headers and a server-capable output", async () => {
    const { default: config } = await import("../../next.config");
    expect(config.output).toBeUndefined();
    expect(typeof config.headers).toBe("function");
  });

  it("the Cloudflare build is a static export without next.config headers", async () => {
    vi.stubEnv("FIELDWISE_STATIC_EXPORT", "true");
    const { default: config } = await import("../../next.config");
    expect(config.output).toBe("export");
    expect(config.images?.unoptimized).toBe(true);
    expect(config.headers).toBeUndefined();
    expect(config.env?.NEXT_PUBLIC_APP_VERSION).toBe(pkg.version);
  });

  it("has a Cloudflare build script and a pinned Node major version", () => {
    expect(pkg.scripts["build:cloudflare"]).toContain("scripts/build-static.mjs");
    expect(readFileSync(join(process.cwd(), ".node-version"), "utf8").trim()).toBe("22");
    const script = readFileSync(join(process.cwd(), "scripts/build-static.mjs"), "utf8");
    expect(script).toContain('FIELDWISE_STATIC_EXPORT: "true"');
    expect(script).toContain("_headers");
  });
});
