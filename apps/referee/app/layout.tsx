import type { ReactNode } from "react";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import PostHogClientProvider from "@/providers/PostHogProvider";
import Header from "@/components/Header";
import PlausibleAnalytics from "@/components/PlausibleAnalytics";
import "./globals.css";
import "@/components/header.css";

export const metadata = {
  title: "Referee Insights — Insight Before You Accept",
  description: "Referee-first insights on tournaments so you can decide before accepting assignments.",
  icons: {
    icon: [
      { url: "/refereeinsights_mark.svg", type: "image/svg+xml" },
      { url: "/refereeinsights_black_on_white.png", type: "image/png", sizes: "512x512" },
    ],
    shortcut: "/refereeinsights_mark.svg",
    apple: "/refereeinsights_black_on_white.png",
  },
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return (
    <html lang="en">
      <body>
        <PlausibleAnalytics />
        <PostHogClientProvider>
          <Header isAuthenticated={!!user} />

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
              <a href="/feedback" style={{ textDecoration: "none", color: "inherit" }}>
                Feedback
              </a>
            </div>
            <p style={{ margin: 0 }}>
              By using Referee Insights, you agree to our Terms and Privacy Policy.
            </p>
            <p style={{ margin: 0, fontSize: 12, color: "#555" }}>
              RefereeInsights is currently in public beta. Features and availability may change.
            </p>
            <div>© {new Date().getFullYear()} RefereeInsights™. All rights reserved.</div>
            <div style={{ fontSize: 12, color: "#555" }}>
              RefereeInsights™ is a trademark of Referee Insights.
            </div>
          </footer>
        </PostHogClientProvider>
      </body>
    </html>
  );
}
