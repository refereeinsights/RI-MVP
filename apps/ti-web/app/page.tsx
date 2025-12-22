export default function Home() {
  return (
    <main className="page">
      <div className="shell">
        <section className="hero" aria-labelledby="ti-title">
          <div className="logoBlock">
            <img
              className="heroLogo"
              src="/ti-logo.png"
              alt="TournamentInsights"
              width={320}
              height={96}
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
            Clear, moderated tournament information to help families and coaches make better
            decisions about time, travel, and cost.
          </p>

          <div className="ctaRow">
            <a className="cta primary" href="https://tournyx.com" rel="noopener noreferrer">
              Visit Tournyx
            </a>
            <a
              className="cta secondary"
              href="https://www.refereeinsights.com"
              rel="noopener noreferrer"
            >
              Visit RefereeInsights
            </a>
          </div>
        </section>

        <section className="bodyCard" aria-labelledby="ti-provides">
          <h2 id="ti-provides">What TournamentInsights provides</h2>
          <ul className="list">
            <li>Clear tournament overviews</li>
            <li>Organization and logistics clarity</li>
            <li>Neutral, moderated information</li>
            <li>Decision-focused summaries (not ratings)</li>
          </ul>
        </section>

        <section className="notice" role="note" aria-label="Not a review platform">
          <p className="clarity">
            TournamentInsights is not a review or rating platform. Information is moderated and
            designed to support informed decisions.
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
