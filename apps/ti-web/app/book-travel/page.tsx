// /weekend-planner renders the same experience and will redirect here once the calendar-based
// Weekend Planner product is ready to claim that route.
import "../tournaments/tournaments.css";
import WeekendPlannerClient from "../weekend-planner/WeekendPlannerClient";
import styles from "../weekend-planner/WeekendPlanner.module.css";
import { AffiliateDisclosure } from "@/components/AffiliateDisclosure";

export const revalidate = 3600;

export async function generateMetadata() {
  return {
    title: "Book Travel for Your Event | TournamentInsights",
    description:
      "Find hotels and vacation rentals near tournaments, venues, cities, and event locations, even if the event is not listed on TournamentInsights.",
    alternates: { canonical: "/book-travel" },
  };
}

export default function BookTravelPage() {
  return (
    <main className="pitchWrap tournamentsWrap">
      <section className="field tournamentsField">
        <div className="headerBlock">
          <h1 className="title">Book travel for your tournament or event</h1>
          <p className="subtitle">
            Find hotels and vacation rentals near any venue, city, or tournament location — even if the event is not listed on TournamentInsights.
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
