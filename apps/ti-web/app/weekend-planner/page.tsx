// TODO: redirect /weekend-planner → /book-travel once the calendar-based Weekend Planner product
// is ready to claim this route.
import "../tournaments/tournaments.css";
import WeekendPlannerClient from "./WeekendPlannerClient";
import styles from "./WeekendPlanner.module.css";
import { AffiliateDisclosure } from "@/components/AffiliateDisclosure";

export const revalidate = 3600;

export async function generateMetadata() {
  return {
    title: "Weekend Planner (Preview) | TournamentInsights",
    description:
      "Plan your tournament weekend in one place. This preview supports travel search today and will expand into schedules, venues, maps, and shareable weekend plans.",
    alternates: { canonical: "/book-travel" },
  };
}

export default function WeekendPlannerPage() {
  return (
    <main className="pitchWrap tournamentsWrap">
      <section className="field tournamentsField">
        <div className="headerBlock">
          <h1 className="title">Weekend Planner (Preview)</h1>
          <p className="subtitle">
            This page will become the hub for schedules, venues, maps, and shareable weekend plans. For now, it supports the same hotel and rental search as{" "}
            <a href="/book-travel">/book-travel</a>.
          </p>
          <p className={`subtitle ${styles.heroHelper}`}>
            Enter a city, venue, or event location to search nearby stays. Your event does not need to be listed on TournamentInsights.
          </p>
        </div>

        <WeekendPlannerClient />

        <div className={styles.disclosure}>
          <AffiliateDisclosure />
        </div>
      </section>
    </main>
  );
}
