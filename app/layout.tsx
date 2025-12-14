import type { ReactNode } from "react";
import "./globals.css";

export const metadata = {
  title: "Referee Insights",
  description: "Insight before you accept.",
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <header style={{ padding: "1rem", borderBottom: "2px solid #000" }}>
          <h1 style={{ margin: 0 }}>Referee Insights</h1>
        </header>

        <main style={{ minHeight: "70vh" }}>{children}</main>

        <footer
          style={{
            padding: "1rem",
            borderTop: "2px solid #000",
            textAlign: "center",
          }}
        >
          <p>
            © {new Date().getFullYear()} Referee Insights. All rights reserved.
          </p>
        </footer>
      </body>
    </html>
  );
}
