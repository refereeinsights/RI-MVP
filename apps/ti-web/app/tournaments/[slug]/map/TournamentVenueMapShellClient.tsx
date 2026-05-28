"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import TournamentVenueMapClient, { type MapVenue } from "./TournamentVenueMapClient";
import styles from "./TournamentVenueMap.module.css";
import { trackTiEvent } from "@/lib/tiAnalyticsClient";

export default function TournamentVenueMapShellClient({
  tournament,
  venues,
  sportKey,
  mapEnabled,
  initialSelectedVenueId,
  source,
}: {
  tournament: { id: string; slug: string; name: string; sport: string | null; state: string | null };
  venues: MapVenue[];
  sportKey: string;
  mapEnabled: boolean;
  initialSelectedVenueId?: string | null;
  source?: string | null;
}) {
  const [selectedVenueId, setSelectedVenueId] = useState<string | null>(() => {
    if (initialSelectedVenueId) return initialSelectedVenueId;
    return venues.length === 1 ? venues[0]?.id ?? null : null;
  });
  const [detailMode, setDetailMode] = useState<boolean>(() => Boolean(initialSelectedVenueId) || venues.length === 1);

  const venueOriginTrackedRef = useRef(false);
  useEffect(() => {
    if (venueOriginTrackedRef.current) return;
    const cleanedSource = String(source ?? "").trim();
    if (!cleanedSource) return;
    if (cleanedSource !== "venue_directory" && cleanedSource !== "venue_details") return;
    if (!initialSelectedVenueId) return;
    venueOriginTrackedRef.current = true;
    void trackTiEvent("tournament_map_loaded_from_venue", {
      tournament_id: tournament.id,
      tournament_slug: tournament.slug,
      venue_id: initialSelectedVenueId,
      source: cleanedSource,
    });
  }, [initialSelectedVenueId, source, tournament.id, tournament.slug]);

  const selectedVenue = useMemo(() => venues.find((v) => v.id === selectedVenueId) ?? null, [venues, selectedVenueId]);
  const selectedVenueLabel = useMemo(() => {
    if (!selectedVenue) return null;
    const loc = [selectedVenue.city, selectedVenue.state].filter(Boolean).join(", ");
    if (!loc) return selectedVenue.name || "Venue";
    return `${selectedVenue.name || "Venue"} — ${loc}`;
  }, [selectedVenue]);

  const heroText =
    detailMode && selectedVenueLabel ? selectedVenueLabel : "Select a venue to explore fields and nearby options.";

  const backHref = `/tournaments/${encodeURIComponent(tournament.slug)}`;

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
            <Link
              className={styles.heroBackBtn}
              href={backHref}
              onClick={() => {
                void trackTiEvent("tournament_map_back_to_tournament_clicked", {
                  page_type: "tournament_map",
                  tournament_id: tournament.id,
                  tournament_slug: tournament.slug,
                  source_page: "tournament_map",
                  cta: "back_to_tournament",
                  href: backHref,
                });
              }}
            >
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
