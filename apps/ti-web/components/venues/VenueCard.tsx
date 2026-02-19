import type { ReactNode } from "react";
import styles from "./VenueCard.module.css";

type MapLinks = {
  google: string;
  apple: string;
  waze: string;
} | null;

type Props = {
  name: string;
  city: string | null;
  state: string | null;
  address: string | null;
  zip: string | null;
  notes?: string | null;
  sports: string[];
  tournamentCount: number;
  venueUrl?: string | null;
  mapLinks: MapLinks;
  sportsLabel: (sport: string) => string;
  icon?: ReactNode;
};

export default function VenueCard({
  name,
  city,
  state,
  address,
  zip,
  notes,
  sports,
  tournamentCount,
  venueUrl,
  mapLinks,
  sportsLabel,
  icon,
}: Props) {
  const locationLabel = [city, state].filter(Boolean).join(", ");
  const addressLabel = [address, city, state, zip].filter(Boolean).join(", ");

  return (
    <article className={`card bg-sport-default ${styles.card}`}>
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

      {tournamentCount > 0 ? <p className={`dates ${styles.dates}`}>Hosted {tournamentCount} tournaments</p> : null}

      {sports.length > 0 ? (
        <div className={styles.tags}>
          {sports.map((sport) => (
            <span key={sport} className={styles.tag}>
              {sportsLabel(sport)}
            </span>
          ))}
        </div>
      ) : null}

      {notes ? <p className={styles.notes}>{notes}</p> : null}

      <div className="cardFooter">
        {venueUrl ? (
          <a href={venueUrl} target="_blank" rel="noopener noreferrer" className="secondaryLink">
            <span>Venue site</span>
          </a>
        ) : mapLinks ? (
          <a href={mapLinks.google} target="_blank" rel="noopener noreferrer" className="secondaryLink">
            <span>Google Maps</span>
          </a>
        ) : (
          <div className="secondaryLink" aria-disabled="true" style={{ cursor: "default" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", lineHeight: 1.2 }}>
              <span>Venue site</span>
              <span className="tbdText">TBD</span>
            </div>
          </div>
        )}

        {mapLinks ? (
          <a href={mapLinks.apple} target="_blank" rel="noopener noreferrer" className="primaryLink">
            View map
          </a>
        ) : (
          <span className="primaryLink" aria-disabled="true" style={{ opacity: 0.55, pointerEvents: "none" }}>
            View map
          </span>
        )}
      </div>
    </article>
  );
}
