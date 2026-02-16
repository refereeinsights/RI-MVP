import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tournament Insights — Insight Before You Commit",
  description:
    "Tournament Insights provides structured information to help teams, families, and organizations make informed decisions about youth sports tournaments.",
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
                <Image
                  src="/brand/tournamentinsights_logo.svg"
                  alt="Tournament Insights"
                  width={200}
                  height={70}
                  priority
                />
              </Link>
              <div className="ti-pill">Public Beta</div>
              <Link href="/list-your-tournament" className="ti-cta">
                List your tournament
              </Link>
            </div>

            <nav className="ti-nav">
              <Link href="/tournaments">Tournament Directory</Link>
              <Link href="/how-it-works">How it works</Link>
              <Link href="/list-your-tournament">List your tournament</Link>
            </nav>
          </header>

          <main className="ti-main">
            <div className="ti-shell">{children}</div>
          </main>
        </div>
      </body>
    </html>
  );
}
