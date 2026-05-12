// /weekend-planner renders the same experience and will redirect here once the calendar-based
// Weekend Planner product is ready to claim that route.
import "../tournaments/tournaments.css";
import WeekendPlannerClient from "../weekend-planner/WeekendPlannerClient";
import styles from "../weekend-planner/WeekendPlanner.module.css";
import { AffiliateDisclosure } from "@/components/AffiliateDisclosure";

export const revalidate = 3600;

export async function generateMetadata() {
  return {
    title: "Tournament Travel Hotels & Rentals | TournamentInsights",
    description:
      "Find hotels and vacation rentals near youth sports tournaments, venues, fields, gyms, and event locations. Compare tournament-friendly stays for families and teams.",
    alternates: { canonical: "/book-travel" },
  };
}

export default function BookTravelPage() {
  return (
    <main className="pitchWrap tournamentsWrap">
      <section className="field tournamentsField">
        <div className="headerBlock">
          <h1 className="title">Book travel for youth sports tournaments</h1>
          <p className="subtitle">
            Find hotels and vacation rentals near any venue, city, or tournament location — even if the event is not listed on TournamentInsights.
          </p>
          <p className={`subtitle ${styles.heroHelper}`}>
            Enter a city, venue, or event location to search nearby stays. Your event does not need to be listed on TournamentInsights.
          </p>
        </div>

        <WeekendPlannerClient />

        <section className={styles.faqBlock} aria-label="Book travel FAQs">
          <h2 className={styles.faqTitle}>FAQs for tournament travel</h2>

          <div className={styles.faqItem}>
            <p className={styles.faqQ}>Should I search by venue, city, or address?</p>
            <p className={styles.faqA}>
              If you know the venue or address, start there for the tightest results. If you only know the city, search the city first, then narrow down once you know where games are played.
            </p>
          </div>

          <div className={styles.faqItem}>
            <p className={styles.faqQ}>Are hotels or vacation rentals better for tournament weekends?</p>
            <p className={styles.faqA}>
              Hotels are great for short stays and flexibility. Rentals can work better for teams and families who want kitchens, laundry, or more space.
            </p>
          </div>

          <div className={styles.faqItem}>
            <p className={styles.faqQ}>Should I add tournament dates before searching?</p>
            <p className={styles.faqA}>
              Yes when you can — dates help partners show more accurate pricing and availability. If you’re still deciding dates, start with a city or venue search to compare areas.
            </p>
          </div>

          <div className={styles.faqItem}>
            <p className={styles.faqQ}>Can I use this if my tournament is not listed on TournamentInsights?</p>
            <p className={styles.faqA}>
              Yes. Search by city, venue name, or address. If you want venue-level planning features, you can submit your event so we can add it.
            </p>
          </div>

          <div className={styles.faqItem}>
            <p className={styles.faqQ}>How does TournamentInsights help with tournament travel?</p>
            <p className={styles.faqA}>
              When your tournament is listed, you can plan around the fields with venue maps, directions, and nearby options to help pick the right area to stay.
            </p>
          </div>
        </section>

        <section aria-label="Browse tournaments by sport" style={{ marginTop: 14 }}>
          <div style={{ fontWeight: 900, color: "#0b1f14" }}>Browse tournaments by sport</div>
          <div className={styles.sportLinksRow}>
            <a className={styles.sportLinkChip} href="/tournaments/soccer">
              Soccer
            </a>
            <a className={styles.sportLinkChip} href="/tournaments/baseball">
              Baseball
            </a>
            <a className={styles.sportLinkChip} href="/tournaments/softball">
              Softball
            </a>
            <a className={styles.sportLinkChip} href="/tournaments/basketball">
              Basketball
            </a>
            <a className={styles.sportLinkChip} href="/tournaments/lacrosse">
              Lacrosse
            </a>
            <a className={styles.sportLinkChip} href="/tournaments/hockey">
              Hockey
            </a>
          </div>
        </section>

        <div className={styles.disclosure}>
          <AffiliateDisclosure />
        </div>
      </section>
    </main>
  );
}
