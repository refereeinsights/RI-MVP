export const metadata = {
  title: "TournamentInsights — Youth Tournament Directory",
  description:
    "Browse youth tournaments by sport, state, and month with verified dates, locations, and official links—no ratings or reviews.",
  alternates: { canonical: "/" },
};

export default function Home() {
  return (
    <main className="page">
      <div className="shell">
        <section className="hero" aria-labelledby="ti-title">
          <div className="logoBlock">
            <img
              className="heroLogo"
              src="/brand/tournamentinsights_logo.svg"
              alt="TournamentInsights"
              width={360}
              height={120}
            />
            <div className="subBrand">
              <span className="subBrandLabel">Powered by</span>
              <a className="subBrandLink" href="https://tournyx.com" rel="noopener noreferrer">
                Tournyx
              </a>
            </div>
          </div>

          <h1 id="ti-title">Insight Before You Commit.</h1>

          <p className="muted heroCopy">
            Tournament Insights curates verified logistics—dates, locations, sports, and official links—so you can plan
            confidently without ratings or reviews.
          </p>

          <div className="ctaRow">
            <a className="cta primary" href="/tournaments">
              Browse tournaments
            </a>
            <a className="cta secondary" href="/how-it-works">
              How it works
            </a>
            <a className="cta secondary" href="/list-your-tournament">
              List your tournament
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
          <div style={{ maxWidth: "72ch", margin: "0 auto" }}>
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

        <section className="bodyCard" aria-labelledby="ti-provides">
          <h2 id="ti-provides">What TournamentInsights provides</h2>
          <ul className="list">
            <li>Clear tournament basics: sport, dates, city/state, and official links.</li>
            <li>Filterable directory by sport, state, and month.</li>
            <li>Neutral, moderated information—no ratings or public reviews.</li>
            <li>Lightweight detail pages focused on logistics and planning.</li>
          </ul>
        </section>

        <section className="notice" role="note" aria-label="Not a review platform">
          <p className="clarity">
            Tournament Insights is not a review or rating platform. Information is moderated and designed to support
            faster, clearer decisions for families, teams, and officials.
          </p>
        </section>

        <footer className="footer">
          <span>© TournamentInsights</span>
          <div className="footerLinks">
            <a href="https://tournyx.com/privacy" rel="noopener noreferrer">
              Privacy
            </a>
            <a href="https://tournyx.com/terms" rel="noopener noreferrer">
              Terms
            </a>
          </div>
        </footer>
      </div>
    </main>
  );
}
