import type { ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import PostHogClientProvider from "@/providers/PostHogProvider";
import HeaderLogo from "@/components/HeaderLogo";
import "./globals.css";

export const metadata = {
  title: "Referee Insights",
  description: "INSIGHT BEFORE YOU ACCEPT",
  icons: {
    icon: "/svg/ri/refereeinsights_mark.svg",
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
        <PostHogClientProvider>
          {/* Header */}
          <header
            style={{
              backgroundColor: "#0F3D2E", // deep pitch green
              borderBottom: "3px solid rgba(255,255,255,0.15)",
            }}
          >
            {/* Logo row */}
            <div
              style={{
                padding: "1.1rem 1rem 0.6rem",
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                gap: "0.75rem",
                maxWidth: 1200,
                margin: "0 auto",
                flexWrap: "wrap",
              }}
            >
              <a
                href="/"
                style={{
                  display: "inline-block",
                  textAlign: "center",
                  width: "100%",
                }}
              >
                <div style={{ display: "inline-flex", justifyContent: "center" }}>
                  <HeaderLogo />
                </div>
              </a>
              <Link
                href={user ? "/account" : "/account/login"}
                title={user ? "My account" : "Sign in"}
                style={{
                  marginLeft: "auto",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: "999px",
                  border: `2px solid ${
                    user ? "rgba(76,175,80,0.9)" : "rgba(244,67,54,0.9)"
                  }`,
                  padding: "2px",
                  background: user ? "rgba(76,175,80,0.2)" : "rgba(244,67,54,0.2)",
                  minWidth: 44,
                  minHeight: 44,
                }}
              >
                <Image
                  src="/referee-avatar.svg"
                  alt="Account"
                  width={42}
                  height={42}
                />
              </Link>
            </div>

            {/* Navigation row */}
            <nav
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "1.5rem",
                padding: "0 1rem 0.9rem",
                position: "relative",
                width: "100%",
                maxWidth: 1200,
                margin: "0 auto",
                flexWrap: "wrap",
              }}
            >
              <div
                style={{
                  display: "flex",
                  gap: "1.3rem",
                  flexWrap: "wrap",
                  justifyContent: "center",
                  width: "100%",
                  paddingTop: "0.35rem",
                }}
              >
              <a
                href="/tournaments/list"
                style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    color: "#0f2a1a",
                    background: "#ffd700",
                    borderRadius: 999,
                    padding: "6px 14px",
                    fontSize: "0.75rem",
                    fontWeight: 800,
                    textTransform: "uppercase",
                    letterSpacing: "0.12em",
                    textDecoration: "none",
                    marginRight: 14,
                    boxShadow: "0 6px 14px rgba(0,0,0,0.25)",
                    minHeight: 44,
                  }}
                  title="Submit a tournament"
                >
                  <span aria-hidden="true">🏆</span>
                  <span style={{ color: "#0a1f12" }}>List your tournament</span>
                </a>

                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "4px 10px",
                    borderRadius: 999,
                    background: "rgba(255,255,255,0.12)",
                    color: "#ffffff",
                    fontSize: "0.72rem",
                    fontWeight: 800,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    border: "1px solid rgba(255,255,255,0.3)",
                  }}
                >
                  Pre-Beta
                </span>

                <a
                  href="/tournaments"
                  style={{
                    color: "#ffffff",
                    fontSize: "0.82rem",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.14em",
                    textDecoration: "none",
                    paddingBottom: "0.25rem",
                    borderBottom: "2px solid rgba(255,255,255,0.6)",
                  }}
                >
                  Tournament Reviews
                </a>

                <a
                  href="/schools"
                  style={{
                    color: "#ffffff",
                    fontSize: "0.82rem",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.14em",
                    textDecoration: "none",
                    paddingBottom: "0.25rem",
                    borderBottom: "2px solid rgba(255,255,255,0.6)",
                  }}
                >
                  School Reviews
                </a>

                <a
                  href="/how-it-works"
                  style={{
                    color: "#ffffff",
                    fontSize: "0.82rem",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.14em",
                    textDecoration: "none",
                    paddingBottom: "0.25rem",
                    borderBottom: "2px solid rgba(255,255,255,0.6)",
                  }}
                >
                  How it works
                </a>

                <a
                  href="/signup"
                  style={{
                    color: "#ffffff",
                    fontSize: "0.82rem",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.14em",
                    textDecoration: "none",
                    paddingBottom: "0.25rem",
                    borderBottom: "2px solid rgba(255,255,255,0.6)",
                  }}
                >
                  Signup
                </a>
              </div>

            </nav>
          </header>

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
              Referee Insights is currently in pre-beta. Features and availability may change.
            </p>
            <div>© {new Date().getFullYear()} Referee Insights. All rights reserved.</div>
          </footer>
        </PostHogClientProvider>
      </body>
    </html>
  );
}
