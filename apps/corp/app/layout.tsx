import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tournyx — Youth Sports Intelligence Platform",
  description:
    "Tournyx builds insight-driven platforms for youth sports organizations, officials, and families.",
  icons: {
    icon: [
      { url: "/tournyx-logo.svg", type: "image/svg+xml" },
      { url: "/tournyx-logo.png", type: "image/png", sizes: "32x32" },
      { url: "/favicon.ico" },
    ],
    apple: "/tournyx-logo.png",
    shortcut: "/tournyx-logo.png",
  },
  themeColor: "#0f3d2e",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
