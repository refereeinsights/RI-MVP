import { BRAND_TI } from "@/lib/brand";
import type { Metadata } from "next";


export const metadata: Metadata = {
  metadataBase: new URL("https://www.tournamentinsights.com"),
  title: {
    absolute: "TournamentInsights | Verified Youth Sports Tournaments",
  },
  description:
    "Verified youth sports tournament directory for families, coaches, and teams. Find upcoming multisport tournaments with structured logistics and Owl's Eye™ validated venue intelligence.",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "TournamentInsights | Verified Youth Sports Tournaments",
    description:
      "Find upcoming youth sports tournaments with verified logistics, venue details, and Owl's Eye™ venue intelligence. Built for families, coaches, and teams.",
    url: "https://www.tournamentinsights.com",
    siteName: "TournamentInsights",
    type: "website",
    images: [
      {
        url: "/og/ti-og-premium.jpg",
        width: 1200,
        height: 630,
        alt: "TournamentInsights — Verified Youth Sports Tournaments",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "TournamentInsights | Verified Youth Sports Tournaments",
    description:
      "Find upcoming youth sports tournaments with verified logistics and Owl's Eye™ venue intelligence.",
    images: ["/og/ti-og-premium.jpg"],
  },
};

export default function Home() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "TournamentInsights",
    url: "https://www.tournamentinsights.com",
    description:
      "Verified youth sports tournament directory for families, coaches, and teams.",
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate:
          "https://www.tournamentinsights.com/tournaments?q={search_term_string}",
      },
      "query-input": "required name=search_term_string",
    },
  };

  return (
    <main className="page">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div className="shell">
        <section className="hero" aria-labelledby="ti-title">
          <h1 id="ti-title">TournamentInsights</h1>

          <p className="muted heroCopy">
            Public Beta — Help Build Smarter Tournament Planning
          </p>

          <p className="muted heroCopy">
            TournamentInsights is launching a new standard in youth tournament intelligence. Through our proprietary Owl&apos;s Eye™
            system, Premium members unlock validated venue intelligence — including verified addresses, nearby coffee, food, hotels,
            mobile directions, and structured Insider venue insights. Less guesswork. More clarity. Better planning.
          </p>

          <div className="ctaRow">
            <a className="cta light" href="/signup?returnTo=%2Faccount">
              Sign up
            </a>
            <a className="cta primary" href="/tournaments">
              Explore Tournaments
            </a>
            <a className="cta secondary" href="/premium">
              Request Premium Access
            </a>
          </div>
        </section>

        <section className="bodyCard bodyCardCenteredList" aria-labelledby="ti-owls-eye">
          <div style={{ display: "grid", gap: 10, justifyItems: "center", textAlign: "center" }}>
            <img
              src="/svg/ri/owls_eye_badge.svg"
              alt="Owl's Eye badge"
              width={86}
              height={86}
              style={{ width: 86, height: 86 }}
            />
            <h2 id="ti-owls-eye" style={{ margin: 0 }}>
              What is Owl&apos;s Eye™?
            </h2>
            <p style={{ margin: 0, maxWidth: "62ch" }}>
              Owl&apos;s Eye™ identifies tournaments with enhanced venue intelligence.
            </p>
            <ul className="list" style={{ textAlign: "left" }}>
              <li>Venue addresses validated</li>
              <li>Nearby coffee, food, and hotels mapped</li>
              <li>One-tap mobile directions</li>
              <li>Structured Insider venue insights</li>
            </ul>
            <p className="muted" style={{ margin: 0, fontSize: 13 }}>
              Owl&apos;s Eye™ details are available to Premium members. Select demo access may be available during Public Beta.
            </p>
            <a className="cta secondary" href="/tournaments">
              See Owl&apos;s Eye tournaments
            </a>
          </div>
        </section>

        <section
          className="bodyCard"
          aria-labelledby="ti-inspired"
          style={{
            background: "linear-gradient(135deg, rgba(6, 25, 147, 0.06), rgba(25, 115, 209, 0.06))",
            border: "1px solid rgba(25, 115, 209, 0.25)",
            borderRadius: 14,
            boxShadow: "0 12px 26px rgba(0,0,0,0.06)",
          }}
        >
          <div style={{ maxWidth: "72ch", margin: "0 auto", textAlign: "center" }}>
            <h2 id="ti-inspired" style={{ margin: "0 0 8px 0", fontWeight: 700 }}>
              Inspired by real tournament families. Built for real tournament weekends.
            </h2>
            <p style={{ margin: "0 0 8px 0", lineHeight: 1.6, color: "#0f172a" }}>
              TournamentInsights was shaped and vetted by a tournament mom and youth coach who understands the reality of
              tournament life — schedules, hotels, carpools, and long weekends at the fields.
            </p>
            <p style={{ margin: 0, fontWeight: 600, color: "#0f172a" }}>Clear. Practical. No noise.</p>
          </div>
        </section>

        <section className="bodyCard bodyCardCenteredList" aria-labelledby="ti-provides">
          <h2 id="ti-provides">What {BRAND_TI} Provides</h2>
          <ul className="list">
            <li>Verified tournament essentials — sport, dates, location, and official links</li>
            <li>Clean filtering by sport, state, and month</li>
            <li>Structured, moderated event insights</li>
            <li>Logistics-focused detail pages built for real tournament planning</li>
          </ul>
        </section>

        <section className="notice" role="note" aria-label="Tournament insights overview">
          <p className="clarity">
            TournamentInsights delivers organized, moderated tournament intelligence designed to help families, coaches,
            and teams evaluate events faster and with greater confidence.
          </p>
        </section>

      </div>
    </main>
  );
}
