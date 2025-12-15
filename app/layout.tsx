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

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        {/* Header */}
        <header
          style={{
            padding: "1.25rem 2rem",
            borderBottom: "2px solid #000",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          {/* Logo / Home */}
          <a href="/" style={{ display: "inline-block" }}>
            <Image
              src="/logo-stacked-bw.png"
              alt="Referee Insights logo"
              width={200}
              height={200}
              priority
              style={{ height: "auto", width: "160px" }}
            />
          </a>

          {/* Navigation */}
          <nav style={{ display: "flex", gap: "1.5rem" }}>
            <a
              href="/tournaments"
              style={{
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                fontSize: "0.75rem",
                textDecoration: "none",
                color: "#000",
              }}
            >
              Tournaments
            </a>
          </nav>
        </header>

        {/* Main content */}
        <main style={{ minHeight: "70vh" }}>{children}</main>

        {/* Footer */}
        <footer
          style={{
            padding: "1rem",
            borderTop: "2px solid #000",
            textAlign: "center",
            fontSize: "14px",
          }}
        >
          © {new Date().getFullYear()} Referee Insights. All rights reserved.
        </footer>
      </body>
    </html>
  );
}


