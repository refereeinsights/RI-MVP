import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tournament Insights — Insight Before You Commit",
  description:
    "Tournament Insights provides structured information to help teams, families, and organizations make informed decisions about youth sports tournaments.",
  icons: {
    icon: [
      { url: "/ti-logo.png", type: "image/png", sizes: "32x32" },
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
      <body>{children}</body>
    </html>
  );
}
