import type { Metadata } from "next";
import Script from "next/script";
import Image from "next/image";
import Link from "next/link";
import "./globals.css";

const SITE_ORIGIN = (process.env.NEXT_PUBLIC_SITE_URL || "https://www.tournamentinsights.com").replace(/\/+$/, "");
const PLAUSIBLE_DOMAIN = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN || "tournamentinsights.com";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_ORIGIN),
  title: {
    default: "TournamentInsights — Youth Tournament Directory",
    template: "%s | TournamentInsights",
  },
  description:
    "Discover youth tournaments by sport, state, and month with verified dates, locations, and official links—no ratings or reviews.",
  alternates: {
    canonical: "/",
  },
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    type: "website",
    siteName: "TournamentInsights",
    title: "TournamentInsights — Youth Tournament Directory",
    description:
      "Discover youth tournaments by sport, state, and month with verified dates, locations, and official links—no ratings or reviews.",
    url: SITE_ORIGIN,
  },
  twitter: {
    card: "summary_large_image",
    title: "TournamentInsights — Youth Tournament Directory",
    description:
      "Discover youth tournaments by sport, state, and month with verified dates, locations, and official links—no ratings or reviews.",
  },
  icons: {
    icon: [
      { url: "/brand/ti-logo.svg", type: "image/svg+xml" },
      { url: "/ti-logo.png", type: "image/png", sizes: "512x512" },
      { url: "/favicon.ico" },
    ],
    apple: "/ti-logo.png",
    shortcut: "/ti-logo.png",
  },
};

export const viewport = {
  themeColor: "#0f3d2e",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="ti-body">
        <Script
          src="https://plausible.io/js/script.js"
          data-domain={PLAUSIBLE_DOMAIN}
          strategy="afterInteractive"
        />
        <div className="ti-app">
          <header className="ti-header">
            <div className="ti-header-shell">
              <Link href="/" className="ti-logo" aria-label="Tournament Insights home">
                <Image
                  src="/brand/tournamentinsights_logo.svg"
                  alt="Tournament Insights"
                  width={200}
                  height={70}
                  priority
                />
              </Link>
              <div className="ti-pill">Public Beta</div>
              <nav className="ti-nav" aria-label="Main navigation">
                <Link href="/tournaments">Tournament Directory</Link>
                <Link href="/how-it-works">How it works</Link>
                <Link href="/list-your-tournament">List your tournament</Link>
              </nav>
              <Link href="/list-your-tournament" className="ti-cta">
                List your tournament
              </Link>
            </div>
          </header>

          <main className="ti-main">
            <div className="ti-shell">{children}</div>
          </main>
        </div>
      </body>
    </html>
  );
}
