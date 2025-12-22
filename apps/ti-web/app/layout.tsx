import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TournamentInsights | Insight Before You Commit",
  description:
    "TournamentInsights helps parents, coaches, and players understand youth sports tournaments before committing time, travel, and cost.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
