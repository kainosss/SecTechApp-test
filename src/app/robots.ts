import type { MetadataRoute } from "next";

// Generated once at build time (required for the static Cloudflare export).
export const dynamic = "force-static";

/** Private pilot: ask all crawlers to stay out. Access protection is still required (robots.txt is advisory). */
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", disallow: "/" } };
}
