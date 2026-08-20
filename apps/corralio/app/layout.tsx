import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import type { ReactNode } from "react";
import "./globals.css";

const manrope = localFont({
  src: "./fonts/Manrope[wght].ttf",
  display: "swap",
  variable: "--font-manrope",
  weight: "200 800",
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.CORRALIO_SITE_URL ?? "http://localhost:3002"),
  title: "Corralio — The planner built for sports families",
  description: "Every kid. Every team. One plan.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icons/corralio-favicon-16.png", sizes: "16x16", type: "image/png" },
      { url: "/icons/corralio-favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/corralio-icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/icons/corralio-apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  openGraph: {
    title: "Corralio — The planner built for sports families",
    description: "Every kid. Every team. One plan.",
    images: [{ url: "/social/corralio-social-avatar.png", width: 512, height: 512, alt: "Corralio" }],
  },
  robots: {
    index: false,
    follow: false,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6faf9" },
    { media: "(prefers-color-scheme: dark)", color: "#16233a" },
  ],
  colorScheme: "light dark",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html className={manrope.variable} lang="en">
      <body>{children}</body>
    </html>
  );
}
