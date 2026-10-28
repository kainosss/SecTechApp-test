import { webManifest } from "@/lib/pwa-manifest";

// Generated once at build time; no request data is read.
export const dynamic = "force-static";

export function GET() {
  return new Response(JSON.stringify(webManifest()), {
    headers: { "Content-Type": "application/manifest+json; charset=utf-8" },
  });
}
