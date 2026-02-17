export const metadata = {
  title: "How it works",
  description: "See how Tournament Insights curates tournament details without ratings or reviews.",
  alternates: { canonical: "/how-it-works" },
};

export default function HowItWorksPage() {
  return (
    <main className="pitchWrap">
      <section className="field bodyCard" style={{ maxWidth: 980, margin: "0 auto" }}>
        <h1 style={{ marginTop: 0 }}>How Tournament Insights works</h1>
        <p style={{ color: "#1f2937", lineHeight: 1.6, marginTop: 12 }}>
          Tournament Insights focuses on verified logistics: dates, locations, sports, and official links. We do not
          surface referee ratings or public reviews. Instead, we aggregate structured details from organizers and public
          sources so families, teams, and officials can plan confidently.
        </p>
        <ol style={{ paddingLeft: 18, color: "#1f2937", lineHeight: 1.6 }}>
          <li>We collect tournament basics: name, sport, dates, city/state, and official/registration links.</li>
          <li>We normalize data into a consistent directory so you can filter by state, sport, and month.</li>
          <li>No ratings or comments are displayed—just factual logistics to help you decide quickly.</li>
          <li>When organizers update details, we refresh the listing and keep historical data archived.</li>
        </ol>
        <div style={{ marginTop: 18, display: "flex", gap: 12, flexWrap: "wrap" }}>
          <a className="cta primary" href="/tournaments">
            Browse tournaments
          </a>
          <a className="cta secondary" href="/list-your-tournament">
            List your tournament
          </a>
        </div>
      </section>
    </main>
  );
}
