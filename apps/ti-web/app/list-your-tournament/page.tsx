export const metadata = {
  title: "List Your Tournament",
  description: "Submit your event so families and teams can find dates, locations, and official information in one place.",
  alternates: { canonical: "/list-your-tournament" },
};

export default function ListYourTournamentPage() {
  return (
    <main className="pitchWrap">
      <section className="field bodyCard" style={{ maxWidth: 980, margin: "0 auto" }}>
        <h1 style={{ marginTop: 0 }}>List your tournament</h1>
        <p style={{ color: "#1f2937", lineHeight: 1.6, marginTop: 10 }}>
          Tournament Insights highlights clear, structured details—no ratings or public reviews. Share the basics below
          and we will add your event to the directory so families, teams, and officials can plan confidently.
        </p>
        <ul style={{ paddingLeft: 18, color: "#1f2937", lineHeight: 1.6 }}>
          <li>Event name, sport, dates, and city/state</li>
          <li>Official registration or information link</li>
          <li>Primary venue and any schedule notes</li>
          <li>Contact email for confirmations or updates</li>
        </ul>
        <div style={{ marginTop: 18, display: "flex", gap: 12, flexWrap: "wrap" }}>
          <a className="cta primary" href="mailto:rod@refereeinsights.com?subject=List%20my%20tournament">
            Email details
          </a>
          <a className="cta secondary" href="/tournaments">
            View directory
          </a>
        </div>
      </section>
    </main>
  );
}
