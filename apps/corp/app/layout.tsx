import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tournyx | Clarity for Competition",
  description:
    "Tournyx builds insight-driven tools that help officials, organizers, and participants make better decisions around youth sports tournaments.",
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
