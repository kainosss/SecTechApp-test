import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

// next/font only works inside the Next compiler.
vi.mock("next/font/google", () => ({ IBM_Plex_Sans: () => ({ variable: "" }), IBM_Plex_Mono: () => ({ variable: "" }) }));
vi.mock("next/navigation", () => ({ usePathname: () => "/" }));

import { GET } from "@/app/manifest.webmanifest/route";
import { THEME_COLOR, webManifest } from "@/lib/pwa-manifest";
import robots from "@/app/robots";
import { renderToStaticMarkup } from "react-dom/server";
import RootLayout, { metadata, viewport } from "@/app/layout";

const root = process.cwd();
/** Width × height from a PNG's IHDR chunk. */
function pngSize(file: string): [number, number] {
  const b = readFileSync(join(root, "public", file));
  expect(b.subarray(1, 4).toString()).toBe("PNG");
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
}

describe("web app manifest", () => {
  const m = webManifest();
  it("is served as JSON at /manifest.webmanifest", async () => {
    const res = GET();
    expect(res.headers.get("Content-Type")).toMatch(/^application\/manifest\+json/);
    expect(await res.json()).toEqual(JSON.parse(JSON.stringify(m)));
  });

  it("is installable as a standalone app named Fieldwise", () => {
    expect(m).toMatchObject({ name: "Fieldwise", short_name: "Fieldwise", start_url: "/", scope: "/", display: "standalone", theme_color: THEME_COLOR, background_color: THEME_COLOR });
  });

  it("lists 192, 512 and maskable PNG icons that exist at those sizes", () => {
    const icons = m.icons!;
    for (const [size, purpose] of [["192x192", "any"], ["512x512", "any"], ["512x512", "maskable"]]) {
      const icon = icons.find((i) => i.sizes === size && i.purpose === purpose)!;
      expect(icon, `${size} ${purpose}`).toBeDefined();
      const [w, h] = pngSize(icon.src);
      expect(`${w}x${h}`).toBe(size);
    }
  });
});

describe("page metadata", () => {
  it("has Apple home-screen metadata, icons and a theme colour", () => {
    expect(metadata.appleWebApp).toMatchObject({ capable: true, title: "Fieldwise", statusBarStyle: "black" });
    const apple = (metadata.icons as { apple: { url: string }[] }).apple[0]!;
    expect(pngSize(apple.url)).toEqual([180, 180]);
    expect(existsSync(join(root, "public/icons/icon.svg"))).toBe(true);
    expect(viewport.themeColor).toBe(THEME_COLOR);
    expect(viewport.viewportFit).toBe("cover");
  });

  it("links the manifest with credentials, so installing works behind password protection", () => {
    const html = renderToStaticMarkup(RootLayout({ children: null }));
    expect(html).toContain('<link rel="manifest" href="/manifest.webmanifest" crossorigin="use-credentials"/>');
  });

  it("keeps the pilot out of search engines", () => {
    expect(metadata.robots).toMatchObject({ index: false, follow: false });
    expect(robots().rules).toEqual({ userAgent: "*", disallow: "/" });
  });

  it("has no service worker that could serve stale pages or cache records", () => {
    expect(existsSync(join(root, "public/sw.js"))).toBe(false);
    expect(existsSync(join(root, "public/service-worker.js"))).toBe(false);
  });
});
