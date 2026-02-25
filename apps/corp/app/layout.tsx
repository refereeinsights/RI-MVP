import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tournyx",
  description: "Tournyx now serves as a bridge to our public platforms.",
  robots: {
    index: false,
    follow: true,
  },
  icons: {
    icon: [
      { url: "/tournyx-logo.svg", type: "image/svg+xml" },
      { url: "/tournyx-logo.png", type: "image/png", sizes: "32x32" },
      { url: "/favicon.ico" },
    ],
    apple: "/tournyx-logo.png",
    shortcut: "/tournyx-logo.png",
  },
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
