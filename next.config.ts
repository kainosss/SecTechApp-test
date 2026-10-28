import type { NextConfig } from "next";
import pkg from "./package.json" with { type: "json" };
import { securityHeaders } from "./src/lib/security-headers";

const dev = process.env.NODE_ENV !== "production";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Never publish browser source maps (the default, stated so it isn't changed by accident).
  productionBrowserSourceMaps: false,
  // Shown in Help and copied into feedback reports (typed by the tester's choice to send them).
  env: { NEXT_PUBLIC_APP_VERSION: pkg.version },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders(dev) },
      // The manifest and icons change rarely but must not be cached forever (installed apps re-read them).
      { source: "/manifest.webmanifest", headers: [{ key: "Cache-Control", value: "public, max-age=0, must-revalidate" }] },
      { source: "/icons/:file*", headers: [{ key: "Cache-Control", value: "public, max-age=86400" }] },
    ];
  },
};

export default nextConfig;
