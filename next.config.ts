import type { NextConfig } from "next";
import pkg from "./package.json" with { type: "json" };
import { headerRules } from "./src/lib/security-headers";

const dev = process.env.NODE_ENV !== "production";
/** Cloudflare Pages build (`npm run build:cloudflare`): plain static files in `out/`, headers from `out/_headers`. */
const staticExport = process.env.FIELDWISE_STATIC_EXPORT === "true";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Never publish browser source maps (the default, stated so it isn't changed by accident).
  productionBrowserSourceMaps: false,
  // Shown in Help and copied into feedback reports (typed by the tester's choice to send them).
  env: { NEXT_PUBLIC_APP_VERSION: pkg.version },
  ...(staticExport
    ? // No image optimisation server on static hosting (the app has no next/image, so nothing changes).
      { output: "export" as const, images: { unoptimized: true } }
    : { headers: async () => headerRules(dev) }),
};

export default nextConfig;
