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
            padding: "1.5rem 1rem",
            borderBottom: "2px solid #000",
            display: "flex",
            justifyContent: "center",
          }}
        >
          <Image
            src="/logo-stacked-bw.png"
            alt="Referee Insights logo"
            width={260}
            height={260}
            priority
            style={{ height: "auto", width: "200px" }}
          />
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

