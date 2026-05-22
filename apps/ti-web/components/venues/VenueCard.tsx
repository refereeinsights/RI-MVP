import Link from "next/link";
import type { ReactNode } from "react";
import VenueIndexBadge from "@/components/VenueIndexBadge";
import { buildHotelsHref, canShowBookingCta } from "@/lib/booking/venueBooking";
import StartQuickVenueCheckButton from "@/components/venues/StartQuickVenueCheckButton";
import styles from "./VenueCard.module.css";

type MapLinks = {
  google: string;
  apple: string;
  waze: string;
} | null;

type Props = {
  venueId: string;
  venueSeoSlug?: string | null;
  name: string;
  city: string | null;
  state: string | null;
  address: string | null;
  zip: string | null;
  notes?: string | null;
  tier: "explorer" | "insider" | "weekend_pro";
  isDemo?: boolean;
  showPlanningCtas?: boolean;
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
  venueSeoSlug,
  name,
  city,
  state,
  address,
  zip,
  notes,
  tier,
  isDemo = false,
  showPlanningCtas = false,
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
  const effectiveTier = isDemo ? "weekend_pro" : tier;
  const canReviewVenue = tier !== "explorer";
  const reviewHref = `/venues/reviews?venueId=${encodeURIComponent(venueId)}`;
  const detailsHref = `/venues/${venueSeoSlug || venueId}`;
  const hotelsHref = buildHotelsHref({ venueId });
  const showBooking = canShowBookingCta({ zip });
  const hasCity = Boolean((city ?? "").trim());
  const stateUpper = String(state ?? "")
    .trim()
    .toUpperCase();
  const hasState = /^[A-Z]{2}$/.test(stateUpper);
  const showVrbo = hasState && hasCity;
  const vrboHref = `/go/vrbo?${new URLSearchParams({
    source: "venue_directory",
    venueId,
  }).toString()}`;
  const tournamentMapHref =
    upcomingTournaments[0]?.slug ? `/tournaments/${encodeURIComponent(upcomingTournaments[0].slug)}/map` : null;

  return (
    <article className={`card ${sportCardClass} ${styles.card}`}>
      {hasOwlsEye ? (
        <img
          className={styles.owlBadge}
          src="/svg/ri/owls_eye_badge.svg"
          alt="Owl's Eye insights available for this venue"
        />
      ) : null}
      <div className="cardWhistle" style={{ top: "1.1rem" }}>
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

      {effectiveTier === "explorer" ? (
        <div
          style={{
            border: "1px dashed rgba(255,255,255,0.3)",
            borderRadius: 12,
            padding: "10px 12px",
            fontSize: 13,
            opacity: 0.9,
          }}
        >
          Venue scores locked. Create a free Insider account to view.
        </div>
      ) : (
        <VenueIndexBadge
          restroom_cleanliness_avg={restroom_cleanliness_avg}
          shade_score_avg={shade_score_avg}
          vendor_score_avg={vendor_score_avg}
          parking_convenience_score_avg={parking_convenience_score_avg}
          review_count={review_count}
          reviews_last_updated_at={reviews_last_updated_at}
        />
      )}

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

      {notes && effectiveTier === "weekend_pro" ? <p className={styles.notes}>{notes}</p> : null}

      <div className="cardFooter">
        <Link href={detailsHref} className={`primaryLink ${styles.detailsLink}`}>
          Details
        </Link>

        {canReviewVenue ? (
          showPlanningCtas ? (
            <StartQuickVenueCheckButton className="secondaryLink" venueId={venueId}>
              Review
            </StartQuickVenueCheckButton>
          ) : (
            <Link href={reviewHref} className="secondaryLink">
              Review
            </Link>
          )
        ) : null}

        {venueUrl ? (
          <a href={venueUrl} target="_blank" rel="noopener noreferrer" className={`secondaryLink ${styles.siteLink}`}>
            <span>Site</span>
          </a>
        ) : (
          <div className={`secondaryLink ${styles.siteLink}`} aria-disabled="true" style={{ cursor: "default" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", lineHeight: 1.2 }}>
              <span>Site</span>
              <span className="tbdText">TBD</span>
            </div>
          </div>
        )}

        {mapLinks ? (
          <a href={mapLinks.apple} target="_blank" rel="noopener noreferrer" className={`primaryLink ${styles.mapLink}`}>
            Map
          </a>
        ) : (
          <span className={`primaryLink ${styles.mapLink}`} aria-disabled="true" style={{ opacity: 0.55, pointerEvents: "none" }}>
            Map
          </span>
        )}
      </div>

      {showPlanningCtas ? (
        <div className={styles.planningRow}>
          {showBooking ? (
            <a href={hotelsHref} target="_blank" rel="noopener noreferrer sponsored" className={`secondaryLink ${styles.planningLink}`}>
              🏨 Find Hotels
            </a>
          ) : null}
          {showVrbo ? (
            <a href={vrboHref} target="_blank" rel="noopener noreferrer sponsored" className={`secondaryLink ${styles.planningLink}`}>
              🏠 Find Rentals
            </a>
          ) : null}
          {tournamentMapHref ? (
            <a href={tournamentMapHref} target="_blank" rel="noopener noreferrer" className={`secondaryLink ${styles.planningLink}`}>
              View Nearby Places
            </a>
          ) : null}
        </div>
      ) : showBooking ? (
        <div className={styles.bookingRow}>
          <a href={hotelsHref} target="_blank" rel="noopener noreferrer sponsored" className={`secondaryLink ${styles.bookingLink}`}>
            🏨 Check hotel availability
          </a>
        </div>
      ) : null}
    </article>
  );
}
