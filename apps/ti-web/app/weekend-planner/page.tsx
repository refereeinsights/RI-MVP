import "../tournaments/tournaments.css";
import WeekendPlannerClient from "./WeekendPlannerClient";
import styles from "./WeekendPlanner.module.css";

export const revalidate = 3600;

export async function generateMetadata() {
  return {
    title: "Plan Your Tournament Weekend | TournamentInsights",
    description: "Find hotels, vacation rentals, venues, and local spots for youth sports tournament travel.",
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
          <p className={`subtitle ${styles.heroHelper}`}>
            Tip: Enter the city where your tournament is being played.
          </p>
        </div>

        <WeekendPlannerClient />

        <p className={styles.disclosure}>
          TournamentInsights may earn a commission when you book through travel links, at no extra cost to you.
        </p>
      </section>
    </main>
  );
}
