export const metadata = {
  title: "How It Works",
  description:
    "Learn how TournamentInsights provides structured tournament listings and official links to support confident planning.",
  alternates: { canonical: "/how-it-works" },
};

export default function HowItWorksPage() {
  return (
    <main className="page">
      <div className="shell">
        <h1 style={{ marginTop: 0 }}>How TournamentInsights Works</h1>

        <section
          className="bodyCard"
          aria-labelledby="ti-story"
          style={{
            background: "linear-gradient(135deg, rgba(6, 25, 147, 0.06), rgba(25, 115, 209, 0.06))",
            border: "1px solid rgba(25, 115, 209, 0.25)",
            borderRadius: 14,
            padding: "22px 22px",
            boxShadow: "0 12px 26px rgba(0,0,0,0.06)",
          }}
        >
          <div style={{ maxWidth: "72ch", margin: "0 auto" }}>
            <h2 id="ti-story" style={{ margin: "0 0 10px 0", fontWeight: 700 }}>
              Built With Tournament Families in Mind
            </h2>
            <p style={{ margin: "0 0 12px 0", lineHeight: 1.6, color: "#0f172a" }}>
              TournamentInsights was inspired and vetted by a tournament mom and youth coach who understands the reality
              of tournament weekends — early mornings, hotel bookings, field changes, tight schedules, and long drives
              home.
            </p>
            <p style={{ margin: "0 0 12px 0", lineHeight: 1.6, color: "#0f172a" }}>
              We didn’t want another hype site.
              <br />
              We wanted clarity.
            </p>
            <p style={{ margin: "0 0 8px 0", lineHeight: 1.6, color: "#0f172a", fontWeight: 600 }}>TI focuses on:</p>
            <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.6, color: "#0f172a" }}>
              <li>Dates and locations you can trust</li>
              <li>Clean tournament listings</li>
              <li>Direct links to official event information</li>
              <li>A simple way to compare options</li>
            </ul>
          </div>
        </section>

        <section className="bodyCard" aria-labelledby="ti-steps">
          <h2 id="ti-steps" style={{ marginTop: 0 }}>How it works (3 quick steps)</h2>
          <ol style={{ paddingLeft: 18, color: "#1f2937", lineHeight: 1.6, margin: 0 }}>
            <li>Find events by sport, state, and month with clean listings and verified dates/locations.</li>
            <li>Open official links directly from each listing to confirm schedules and registration details.</li>
            <li>Compare options quickly—no ratings or noise—so you can plan travel, hotels, and carpools faster.</li>
          </ol>
        </section>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <a className="cta primary" href="/tournaments">
            Browse tournaments
          </a>
          <a className="cta secondary" href="/list-your-tournament">
            List your tournament
          </a>
        </div>
      </div>
    </main>
  );
}
