import "../tournaments/tournaments.css";
import WeekendPlannerClient from "./WeekendPlannerClient";

export const revalidate = 3600;

export async function generateMetadata() {
  return {
    title: "Tournament Weekend Planner | TournamentInsights",
    description: "Find hotels and vacation rentals for your next youth sports tournament weekend.",
    alternates: { canonical: "/weekend-planner" },
  };
}

export default function WeekendPlannerPage() {
  return (
    <main className="pitchWrap tournamentsWrap">
      <section className="field tournamentsField">
        <div className="headerBlock">
          <h1 className="title">Plan your tournament weekend</h1>
          <p className="subtitle">
            Find hotels, vacation rentals, venues, and local spots for youth sports travel.
          </p>
          <p className="subtitle" style={{ marginTop: 10, opacity: 0.9 }}>
            Tip: Enter the city where your tournament is being played.
          </p>
        </div>

        <WeekendPlannerClient />

        <div style={{ maxWidth: 900, margin: "18px auto 0", textAlign: "center" }}>
          <p style={{ fontSize: 14, color: "rgba(16,34,19,0.75)", margin: 0 }}>
            TournamentInsights may earn a commission when you book through travel links, at no extra cost to you.
          </p>
        </div>
      </section>
    </main>
  );
}

