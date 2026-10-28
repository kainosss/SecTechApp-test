import type { MetadataRoute } from "next";

export const THEME_COLOR = "#060b16";

/**
 * Installable web app (home screen). No service worker: the app always loads
 * fresh from the server. Served by app/manifest.webmanifest/route.ts and linked
 * in the layout with crossorigin="use-credentials", so the manifest is fetched
 * with the pilot's access cookie when the site is behind password protection.
 */
export function webManifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Fieldwise",
    short_name: "Fieldwise",
    description: "Reference, wiring and service tools for electronic security technicians (pilot).",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: THEME_COLOR,
    theme_color: THEME_COLOR,
    lang: "en-AU",
    categories: ["productivity", "utilities"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
