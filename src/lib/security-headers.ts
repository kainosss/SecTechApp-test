/**
 * HTTP security headers for every response (applied in next.config.ts). The
 * app is static, makes no third-party requests and loads fonts and scripts
 * from its own origin only. Next.js's inline bootstrap scripts need
 * 'unsafe-inline' unless nonces are used, and nonces would make every page
 * dynamic, so scripts are limited to this origin plus inline. The PDF preview
 * is a blob: iframe and downloads are blob: links.
 */
export function contentSecurityPolicy(dev = false): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src 'self'${dev ? " ws: wss:" : ""}`,
    "frame-src 'self' blob:",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "media-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(dev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

export function securityHeaders(dev = false): { key: string; value: string }[] {
  return [
    { key: "Content-Security-Policy", value: contentSecurityPolicy(dev) },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "no-referrer" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
    {
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), bluetooth=(), hid=(), midi=(), interest-cohort=(), browsing-topics=()",
    },
    // HTTPS only once deployed (ignored by browsers over plain-HTTP localhost).
    ...(dev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]),
    // Private pilot: not for search engines.
    { key: "X-Robots-Tag", value: "noindex, nofollow" },
  ];
}
