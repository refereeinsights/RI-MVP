import type { ReactNode } from "react";
import { Inter } from "next/font/google";
import Image from "next/image";
import "./globals.css";

/* Load brand font */
const inter = Inter({
  subsets: ["latin"],
  display: "swap",
});

export const metadata = {
  title: "Referee Insights",
  description: "INSIGHT BEFORE YOU ACCEPT",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className={inter.className}>
        {/* Header */}
        <header
          style={{
            backgroundColor: "#0F3D2E", // deep pitch green
            borderBottom: "3px solid rgba(255,255,255,0.15)",
          }}
        >
          {/* Logo row */}
          <div
            style={{
              padding: "1.5rem 1rem 0.75rem",
              display: "flex",
              justifyContent: "center",
            }}
          >
            <a href="/" style={{ display: "inline-block" }}>
              <Image
                src="/logo-stacked-bw.png"
                alt="Referee Insights logo"
                width={220}
                height={220}
                priority
                style={{
                  height: "auto",
                  width: "180px",
                  filter: "drop-shadow(0 6px 14px rgba(0,0,0,0.35))",
                }}
              />
            </a>
          </div>

          {/* Navigation row */}
          <nav
            style={{
              display: "flex",
              justifyContent: "center",
              gap: "2rem",
              paddingBottom: "0.9rem",
            }}
          >
            <a
              href="/tournaments"
              style={{
                color: "#ffffff",
                fontSize: "0.8rem",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.14em",
                textDecoration: "none",
                paddingBottom: "0.25rem",
                borderBottom: "2px solid rgba(255,255,255,0.6)",
              }}
            >
              Tournaments
            </a>

            <a
              href="/signup"
              style={{
                color: "#ffffff",
                fontSize: "0.8rem",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.14em",
                textDecoration: "none",
                paddingBottom: "0.25rem",
                borderBottom: "2px solid rgba(255,255,255,0.6)",
              }}
            >
              Signup
            </a>
          </nav>
        </header>

        {/* Main content (CENTER CHILDREN HORIZONTALLY) */}
        <main
          style={{
            minHeight: "70vh",
            display: "flex",
            justifyContent: "center",
            width: "100%",
          }}
        >
          {children}
        </main>

        {/* Footer */}
        <footer
          style={{
            padding: "1rem",
            borderTop: "2px solid #000",
            textAlign: "center",
            fontSize: "14px",
            display: "flex",
            flexDirection: "column",
            gap: 8,
            alignItems: "center",
          }}
        >
          <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", justifyContent: "center" }}>
            <a href="/terms" style={{ textDecoration: "none", color: "inherit" }}>
              Terms of Service
            </a>
            <a href="/privacy" style={{ textDecoration: "none", color: "inherit" }}>
              Privacy Policy
            </a>
            <a href="/disclaimer" style={{ textDecoration: "none", color: "inherit" }}>
              Review &amp; Content Disclaimer
            </a>
          </div>
          <p style={{ margin: 0 }}>
            By using Referee Insights, you agree to our Terms and Privacy Policy.
          </p>
          <div>© {new Date().getFullYear()} Referee Insights. All rights reserved.</div>
        </footer>
      </body>
    </html>
  );
}
