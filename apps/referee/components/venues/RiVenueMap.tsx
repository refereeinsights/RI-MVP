"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import MobileMapLink from "./MobileMapLink";
import { captureRiEvent } from "@/lib/riAnalytics";
import { buildMapDirectionsLinks, normalizeLngLat } from "../../../../packages/lib/tournament-map";
import styles from "./RiVenueMap.module.css";

type Props = {
  venueId: string;
  venueName: string;
  addressLabel: string | null;
  city: string | null;
  state: string | null;
  latitude: number | null;
  longitude: number | null;
  linkedTournamentCount: number;
};

function buildAnalyticsPayload(props: Props) {
  return {
    site: "refereeinsights",
    venue_id: props.venueId,
    venue_name: props.venueName,
    venue_city: props.city ?? null,
    venue_state: props.state ?? null,
    linked_tournament_count: props.linkedTournamentCount,
    source_page: "venue_detail_map",
  };
}

export default function RiVenueMap(props: Props) {
  const mapRef = useRef<any>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewedRef = useRef(false);
  const interactedRef = useRef(false);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const coords = useMemo(() => normalizeLngLat(props.latitude, props.longitude), [props.latitude, props.longitude]);
  const directions = useMemo(
    () =>
      buildMapDirectionsLinks({
        latitude: props.latitude,
        longitude: props.longitude,
        label: props.venueName,
        address: props.addressLabel,
      }),
    [props.addressLabel, props.latitude, props.longitude, props.venueName]
  );

  useEffect(() => {
    let cancelled = false;
    setMapReady(false);
    setMapError(null);

    async function init() {
      if (!coords || !containerRef.current) {
        setMapReady(true);
        return;
      }

      const token = (process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN ?? "").trim();
      if (!token) {
        setMapError("Map unavailable right now.");
        return;
      }

      let mod: any;
      try {
        mod = await import("mapbox-gl");
      } catch {
        setMapError("Map unavailable right now.");
        return;
      }
      if (cancelled) return;

      const mapboxgl = mod.default ?? mod;
      mapboxgl.accessToken = token;

      const map = new mapboxgl.Map({
        container: containerRef.current,
        style: "mapbox://styles/mapbox/streets-v12",
        center: [coords.lng, coords.lat],
        zoom: 12.5,
        cooperativeGestures: true,
      });

      map.dragRotate.disable?.();
      map.touchZoomRotate.disableRotation?.();
      mapRef.current = map;

      const marker = document.createElement("div");
      marker.className = styles.marker;
      marker.setAttribute("aria-label", `${props.venueName} map marker`);
      new mapboxgl.Marker({ element: marker, anchor: "bottom" }).setLngLat([coords.lng, coords.lat]).addTo(map);

      try {
        if (typeof ResizeObserver !== "undefined" && containerRef.current) {
          resizeObserverRef.current = new ResizeObserver(() => map.resize?.());
          resizeObserverRef.current.observe(containerRef.current);
        }
      } catch {
        resizeObserverRef.current = null;
      }

      const emitInteraction = (interactionType: string) => {
        if (interactedRef.current) return;
        interactedRef.current = true;
        void captureRiEvent("ri_venue_map_interacted", {
          pageType: "venue_detail",
          properties: {
            ...buildAnalyticsPayload(props),
            interaction_type: interactionType,
          },
        });
      };

      map.on("load", () => {
        if (cancelled) return;
        map.resize?.();
        setMapReady(true);
        if (!viewedRef.current) {
          viewedRef.current = true;
          void captureRiEvent("ri_venue_map_viewed", {
            pageType: "venue_detail",
            properties: {
              ...buildAnalyticsPayload(props),
              has_coordinates: true,
            },
          });
        }
      });

      map.on("click", () => emitInteraction("click"));
      map.on("dragend", () => emitInteraction("drag"));
      map.on("zoomend", () => emitInteraction("zoom"));
      map.on("error", () => setMapError("Map unavailable right now."));
    }

    void init();

    return () => {
      cancelled = true;
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;
      mapRef.current?.remove?.();
      mapRef.current = null;
    };
  }, [coords, props]);

  const detailLabel = props.addressLabel || "Address unavailable";

  return (
    <section className={styles.shell} aria-label="Venue map and directions">
      <div className={styles.card}>
        <div className={styles.toolbar}>
          <div>
            <h2 className={styles.title}>Venue location</h2>
            <p className={styles.hint}>Confirm where the complex sits before you travel, then open turn-by-turn directions.</p>
          </div>
          {directions ? (
            <MobileMapLink
              provider="google"
              query={directions.query}
              fallbackHref={directions.google}
              className={styles.action}
              onClick={() => {
                void captureRiEvent("ri_venue_directions_clicked", {
                  pageType: "venue_detail",
                  properties: {
                    ...buildAnalyticsPayload(props),
                    target_kind: "venue_directions_google",
                    has_coordinates: Boolean(coords),
                  },
                });
              }}
            >
              Get directions
            </MobileMapLink>
          ) : null}
        </div>
        <div className={styles.frame}>
          {!mapReady ? <div className={styles.status}>Loading map…</div> : null}
          {coords && !mapError ? <div ref={containerRef} className={styles.canvas} aria-label={`Map centered on ${props.venueName}`} /> : null}
          {mapError ? <div className={styles.status}>{mapError}</div> : null}
          {!coords ? (
            <div className={styles.fallback}>
              <div className={styles.fallbackInner}>
                <div>Map unavailable until this venue has verified coordinates.</div>
                <div>{detailLabel}</div>
              </div>
            </div>
          ) : null}
        </div>
        <div className={styles.details}>
          <div className={styles.eyebrow}>Venue details</div>
          <p className={styles.name}>{props.venueName}</p>
          <p className={styles.address}>{detailLabel}</p>
          <p className={styles.meta}>
            {coords ? "One verified venue marker is centered on this facility." : "Directions still work from the verified address while coordinates are cleaned up."}
          </p>
        </div>
      </div>
    </section>
  );
}
