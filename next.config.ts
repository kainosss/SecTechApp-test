import type { NextConfig } from "next";
import pkg from "./package.json" with { type: "json" };

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Shown in Help and copied into feedback reports (typed by the tester's choice to send them).
  env: { NEXT_PUBLIC_APP_VERSION: pkg.version },
};

export default nextConfig;
