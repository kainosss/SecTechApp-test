import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import { AppShell } from "@/components/layout/AppShell";
import { THEME_COLOR } from "@/lib/pwa-manifest";
import "./globals.css";

const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-plex-sans",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Fieldwise", template: "%s · Fieldwise" },
  description: "Technical reference and troubleshooting for electronic security technicians.",
  applicationName: "Fieldwise",
  icons: {
    icon: [
      { url: "/icons/icon.svg", type: "image/svg+xml" },
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
  // iPhone home-screen web app: standalone window with an opaque status bar (content never sits underneath it).
  appleWebApp: { capable: true, title: "Fieldwise", statusBarStyle: "black" },
  formatDetection: { telephone: false },
  // Pilot: keep the site out of search engines (also sent as an X-Robots-Tag header and robots.txt).
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: THEME_COLOR,
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-AU" className={`${plexSans.variable} ${plexMono.variable}`}>
      <head>
        {/* With credentials, so installing still works when the pilot site is behind password protection. */}
        <link rel="manifest" href="/manifest.webmanifest" crossOrigin="use-credentials" />
      </head>
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
