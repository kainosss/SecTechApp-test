import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { contentSecurityPolicy, securityHeaders } from "@/lib/security-headers";
import nextConfig from "../../next.config";
import pkg from "../../package.json";

const header = (h: { key: string; value: string }[], key: string) => h.find((x) => x.key === key)?.value;

describe("security headers", () => {
  it("sends a strict production CSP without eval and blocks framing", () => {
    const csp = contentSecurityPolicy();
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("upgrade-insecure-requests");
    expect(csp).not.toContain("unsafe-eval");
    // No third-party origins anywhere.
    expect(csp).not.toMatch(/https?:\/\//);
    // The PDF preview (blob: iframe) and data: logos keep working.
    expect(csp).toContain("frame-src 'self' blob:");
    expect(csp).toContain("img-src 'self' data: blob:");
  });

  it("allows eval and the dev websocket only in development", () => {
    expect(contentSecurityPolicy(true)).toContain("'unsafe-eval'");
    expect(contentSecurityPolicy(true)).not.toContain("upgrade-insecure-requests");
  });

  it("sets the standard hardening headers", () => {
    const h = securityHeaders();
    expect(header(h, "X-Content-Type-Options")).toBe("nosniff");
    expect(header(h, "Referrer-Policy")).toBe("no-referrer");
    expect(header(h, "X-Frame-Options")).toBe("DENY");
    expect(header(h, "Strict-Transport-Security")).toMatch(/max-age=\d{8}/);
    expect(header(h, "Permissions-Policy")).toMatch(/camera=\(\).*microphone=\(\).*geolocation=\(\)/);
    expect(header(h, "X-Robots-Tag")).toBe("noindex, nofollow");
  });

  it("applies them to every route through next.config", async () => {
    const rules = await nextConfig.headers!();
    const all = rules.find((r) => r.source === "/:path*")!;
    expect(all.headers.map((h) => h.key)).toEqual(expect.arrayContaining(["Content-Security-Policy", "X-Content-Type-Options", "Referrer-Policy", "Permissions-Policy"]));
    expect(nextConfig.poweredByHeader).toBe(false);
    expect(nextConfig.productionBrowserSourceMaps).toBe(false);
  });
});

describe("deployment configuration", () => {
  it("builds the app version from package.json and declares the Node version", () => {
    expect(nextConfig.env?.NEXT_PUBLIC_APP_VERSION).toBe(pkg.version);
    expect(pkg.engines.node).toMatch(/>=\s*20/);
    expect(pkg.scripts.build).toBe("next build");
  });

  it("documents only non-secret build variables, and no public variable holds a secret", () => {
    const env = readFileSync(join(process.cwd(), ".env.example"), "utf8");
    const names = [...env.matchAll(/^#?\s*([A-Z][A-Z0-9_]+)=/gm)].map((m) => m[1]);
    expect(names.sort()).toEqual(["FIELDWISE_DEMO_MODE", "NEXT_PUBLIC_FEEDBACK_EMAIL"]);
    for (const n of names) expect(n).not.toMatch(/SECRET|PASSWORD|TOKEN|KEY/);
  });

  it("has no API routes or middleware that would need server-side protection (only the static manifest)", async () => {
    const { globSync } = await import("node:fs");
    expect(globSync("src/app/**/route.{ts,tsx,js}", { cwd: process.cwd() })).toEqual(["src/app/manifest.webmanifest/route.ts"]);
    expect(globSync("{src/,}{middleware,proxy}.{ts,js}", { cwd: process.cwd() })).toEqual([]);
  });
});
