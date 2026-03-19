import Link from "next/link";
import type { ReactNode } from "react";
import VenueIndexBadge from "@/components/VenueIndexBadge";
import styles from "./VenueCard.module.css";

type MapLinks = {
  google: string;
  apple: string;
  waze: string;
} | null;

type Props = {
  venueId: string;
  name: string;
  city: string | null;
  state: string | null;
  address: string | null;
  zip: string | null;
  notes?: string | null;
  sportCardClass: string;
  upcomingTournaments: {
    id: string;
    name: string;
    slug: string;
    start_date: string | null;
  }[];
  venueUrl?: string | null;
  mapLinks: MapLinks;
  icon?: ReactNode;
  hasOwlsEye?: boolean;
  restroom_cleanliness_avg?: number | null;
  shade_score_avg?: number | null;
  vendor_score_avg?: number | null;
  parking_convenience_score_avg?: number | null;
  review_count?: number | null;
  reviews_last_updated_at?: string | null;
};

export default function VenueCard({
  venueId,
  name,
  city,
  state,
  address,
  zip,
  notes,
  sportCardClass,
  upcomingTournaments,
  venueUrl,
  mapLinks,
  icon,
  hasOwlsEye = false,
  restroom_cleanliness_avg,
  shade_score_avg,
  vendor_score_avg,
  parking_convenience_score_avg,
  review_count,
  reviews_last_updated_at,
}: Props) {
  const locationLabel = [city, state].filter(Boolean).join(", ");
  const addressLabel = [address, city, state, zip].filter(Boolean).join(", ");

  return (
    <article className={`card ${sportCardClass} ${styles.card}`}>
      {hasOwlsEye ? (
        <img
          className={styles.owlBadge}
          src="/svg/ri/owls_eye_badge.svg"
          alt="Owl's Eye insights available for this venue"
        />
      ) : null}
      <div className="cardWhistle">
        <div className="summaryIcon" aria-hidden="true">
          {icon ?? "📍"}
        </div>
      </div>

      <h2>{name}</h2>

      <p className={`meta ${styles.meta}`}>
        <strong>Venue</strong>
        {locationLabel ? ` • ${locationLabel}` : ""}
      </p>

      <p className={`dates ${styles.dates}`}>{addressLabel || "Address TBA"}</p>

      <VenueIndexBadge
        restroom_cleanliness_avg={restroom_cleanliness_avg}
        shade_score_avg={shade_score_avg}
        vendor_score_avg={vendor_score_avg}
        parking_convenience_score_avg={parking_convenience_score_avg}
        review_count={review_count}
        reviews_last_updated_at={reviews_last_updated_at}
      />

      {upcomingTournaments.length > 0 ? (
        <div className={styles.upcomingBlock}>
          <p className={styles.upcomingTitle}>Coming up at this venue</p>
          <ul className={styles.upcomingList}>
            {upcomingTournaments.map((tournament) => (
              <li key={tournament.id}>
                <Link href={`/tournaments/${tournament.slug}`}>{tournament.name}</Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {notes ? <p className={styles.notes}>{notes}</p> : null}

      <div className="cardFooter">
        <Link href={`/venues/${venueId}`} className={`primaryLink ${styles.detailsLink}`}>
          Venue details
        </Link>

        {venueUrl ? (
          <a href={venueUrl} target="_blank" rel="noopener noreferrer" className={`secondaryLink ${styles.siteLink}`}>
            <span>Venue site</span>
          </a>
        ) : mapLinks ? (
          <a href={mapLinks.google} target="_blank" rel="noopener noreferrer" className={`secondaryLink ${styles.siteLink}`}>
            <span>Google Maps</span>
          </a>
        ) : (
          <div className={`secondaryLink ${styles.siteLink}`} aria-disabled="true" style={{ cursor: "default" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", lineHeight: 1.2 }}>
              <span>Venue site</span>
              <span className="tbdText">TBD</span>
            </div>
          </div>
        )}

        {mapLinks ? (
          <a href={mapLinks.apple} target="_blank" rel="noopener noreferrer" className={`primaryLink ${styles.mapLink}`}>
            View map
          </a>
        ) : (
          <span className={`primaryLink ${styles.mapLink}`} aria-disabled="true" style={{ opacity: 0.55, pointerEvents: "none" }}>
            View map
          </span>
        )}
      </div>
    </article>
  );
}
