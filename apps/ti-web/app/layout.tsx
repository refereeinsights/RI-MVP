import type { Metadata } from "next";
import Link from "next/link";
import PlausibleScript from "../components/PlausibleScript";
import { BRAND_TI } from "@/lib/brand";
import "./globals.css";

const SITE_ORIGIN = "https://www.tournamentinsights.com";
const PLAUSIBLE_DOMAIN = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN || "tournamentinsights.com";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_ORIGIN),
  title: {
    default: "TournamentInsights — Youth Sports Tournament Directory",
    template: "%s | TournamentInsights",
  },
  description:
    "Browse youth sports tournaments by sport, state, and date. Clear listings with official links and basic venue information.",
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    type: "website",
    siteName: "TournamentInsights",
    title: "TournamentInsights — Youth Sports Tournament Directory",
    description: "Browse youth sports tournaments by sport, state, and date.",
    url: SITE_ORIGIN,
    images: [{ url: "/og-default.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "TournamentInsights — Youth Sports Tournament Directory",
    description: "Browse youth sports tournaments by sport, state, and date.",
    images: ["/og-default.png"],
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
        <div className="ti-app">
          <header className="ti-header">
            <div className="ti-header-shell">
              <Link href="/" className="ti-logo" aria-label="Tournament Insights home">
                <span className="ti-logo-frame">
                  <img
                    src="/svg/ti/tournamentinsights_logo.svg"
                    alt="Tournament Insights"
                    className="ti-logo-img"
                  />
                </span>
              </Link>
              <div className="ti-pill">Public Beta</div>
              <nav className="ti-nav" aria-label="Main navigation">
                <Link href="/tournaments">Tournament Directory</Link>
                <Link href="/venues">Venue Insights</Link>
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
          <footer className="ti-legal-footer">
            <div className="ti-legal-footer__inner">
              <span>© {BRAND_TI}</span>
              <nav className="ti-legal-footer__links" aria-label="Legal links">
                <Link href="/terms">Terms</Link>
                <Link href="/privacy">Privacy</Link>
                <Link href="/disclaimer">Disclaimer</Link>
              </nav>
            </div>
          </footer>
          <PlausibleScript domain={PLAUSIBLE_DOMAIN} />
        </div>
      </body>
    </html>
  );
}
