import type { Metadata } from "next";

const SITE_ORIGIN = "https://www.tournamentinsights.com";

export const metadata: Metadata = {
  title: "About TournamentInsights | Youth Tournament Directory",
  description:
    "Learn about TournamentInsights, the youth tournament directory focused on clear event listings, official links, and practical planning support.",
  alternates: { canonical: "/about" },
};

export default function AboutPage() {
  const organizationJsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "TournamentInsights",
    url: SITE_ORIGIN,
    logo: `${SITE_ORIGIN}/brand/ti-email-logo.png`,
  };

  return (
    <main className="page">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }} />
      <div className="shell">
        <section className="bodyCard" style={{ maxWidth: 840, margin: "0 auto", display: "grid", gap: 16 }}>
          <h1 style={{ margin: 0 }}>About TournamentInsights</h1>

          <p style={{ margin: 0, lineHeight: 1.7 }}>
            TournamentInsights is a youth sports tournament directory built to make event discovery and planning clearer.
            The goal is simple: help families, coaches, teams, and clubs find tournament information without digging through
            scattered links, outdated pages, and incomplete event details.
          </p>

          <p style={{ margin: 0, lineHeight: 1.7 }}>
            We focus on structured tournament listings, official event links, and planning-friendly context. That includes
            sport, location, dates, and venue-related details that support real tournament weekends, not just registration.
          </p>

          <p style={{ margin: 0, lineHeight: 1.7 }}>
            TournamentInsights is designed for practical use. The product aims to reduce guesswork around where events are,
            how to compare them, and what information is reliable enough to act on.
          </p>

          <p style={{ margin: 0, lineHeight: 1.7 }}>
            TournamentInsights is a sister product to RefereeInsights. RefereeInsights focuses on referee operations,
            assignor workflows, and referee-specific tooling. TournamentInsights focuses on tournament discovery, planning,
            and venue intelligence for the broader youth sports community.
          </p>

          <p style={{ margin: 0, lineHeight: 1.7 }}>
            As the directory expands, the priority remains the same: clear data, traceable sources, and a better planning
            experience for the people actually traveling to tournaments.
          </p>
        </section>
      </div>
    </main>
  );
}
