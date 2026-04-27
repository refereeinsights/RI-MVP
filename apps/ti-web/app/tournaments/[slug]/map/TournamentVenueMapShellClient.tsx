"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import TournamentVenueMapClient, { type MapVenue } from "./TournamentVenueMapClient";
import styles from "./TournamentVenueMap.module.css";

export default function TournamentVenueMapShellClient({
  tournament,
  venues,
  sportKey,
  mapEnabled,
}: {
  tournament: { id: string; slug: string; name: string; sport: string | null };
  venues: MapVenue[];
  sportKey: string;
  mapEnabled: boolean;
}) {
  const [selectedVenueId, setSelectedVenueId] = useState<string | null>(() => (venues.length === 1 ? venues[0]?.id ?? null : null));
  const [detailMode, setDetailMode] = useState<boolean>(() => venues.length === 1);

  const selectedVenue = useMemo(() => venues.find((v) => v.id === selectedVenueId) ?? null, [venues, selectedVenueId]);
  const selectedVenueLabel = useMemo(() => {
    if (!selectedVenue) return null;
    const loc = [selectedVenue.city, selectedVenue.state].filter(Boolean).join(", ");
    if (!loc) return selectedVenue.name || "Venue";
    return `${selectedVenue.name || "Venue"} — ${loc}`;
  }, [selectedVenue]);

  const heroText =
    detailMode && selectedVenueLabel ? selectedVenueLabel : "Select a venue to explore fields and nearby options.";

  return (
    <>
      <section
        className={`detailHero bg-sport-default ${styles.mapHero}`}
        style={{
          backgroundImage: `url(/brand/headers/ti-map-hero-${sportKey}.webp), url(/brand/headers/ti-map-hero.webp)`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        <div className={styles.heroOverlay}>
          <div className={styles.heroBottomRow}>
            <div className={styles.heroPrompt}>{heroText}</div>
            <Link className={styles.heroBackBtn} href={`/tournaments/${encodeURIComponent(tournament.slug)}`}>
              {`Back to ${tournament.name}`}
            </Link>
          </div>
        </div>
      </section>

      <TournamentVenueMapClient
        tournament={tournament}
        venues={venues}
        mapEnabled={mapEnabled}
        selectedVenueId={selectedVenueId}
        setSelectedVenueId={setSelectedVenueId}
        detailMode={detailMode}
        setDetailMode={setDetailMode}
      />
    </>
  );
}
