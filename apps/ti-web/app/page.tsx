export default function Home() {
  return (
    <main className="page">
      <div className="shell">
        <section className="hero">
          <div className="logoMark" aria-label="TournamentInsights logo">
            <span className="logoImage" role="img" aria-label="TournamentInsights">
              <img src="/ti-logo.png" alt="TournamentInsights" />
            </span>
            <span>TournamentInsights</span>
          </div>
          <h1>Insight Before You Commit.</h1>
          <p className="muted">
            TournamentInsights helps parents, coaches, and players understand youth sports
            tournaments before committing time, travel, and cost.
          </p>
        </section>

        <section className="bodyCard">
          <h2>What TournamentInsights will provide</h2>
          <ul className="list">
            <li>Clear tournament overviews</li>
            <li>Organization and logistics insight</li>
            <li>Neutral, moderated information</li>
            <li>Decision-focused summaries (not ratings)</li>
          </ul>
        </section>

        <section className="bodyCard">
          <p className="clarity">
            TournamentInsights is not a review or rating platform. Information will be moderated and
            designed to support informed decisions.
          </p>
        </section>

        <section className="bodyCard">
          <p className="clarity">
            TournamentInsights is powered by Tournyx, the platform behind RefereeInsights.
          </p>
          <a className="cta" href="https://www.refereeinsights.com">
            Visit RefereeInsights
          </a>
        </section>

        <footer className="footer">
          <span>© TournamentInsights</span>
          <div className="footerLinks">
            <a href="https://www.refereeinsights.com/privacy">Privacy</a>
            <a href="https://www.refereeinsights.com/terms">Terms</a>
          </div>
        </footer>
      </div>
    </main>
  );
}
