import Link from "next/link";

export default function Home() {
  return (
    <main className="bridgePage" data-version="bridge-2026-02-25">
      <section className="bridgeCard">
        <h1 className="bridgeTitle">Tournyx</h1>
        <p className="bridgeBody">
          Tournyx now serves as a bridge to our public platforms.
        </p>
        <div className="bridgeActions">
          <Link
            href="https://www.tournamentinsights.com"
            className="bridgeButton bridgeButtonPrimary"
            prefetch={false}
          >
            Go to TournamentInsights
          </Link>
          <Link
            href="https://www.refereeinsights.com"
            className="bridgeButton bridgeButtonSecondary"
            prefetch={false}
          >
            Go to RefereeInsights
          </Link>
        </div>
        <p className="bridgeFooter">
          Youth sports tournaments and referee insight.
        </p>
      </section>
    </main>
  );
}
