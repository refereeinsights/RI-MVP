"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { TournamentMapItem } from "../../../../../packages/lib/tournament-map";
import { buildTournamentMapFeatureCollection, calculateMapBounds, normalizeLngLat } from "../../../../../packages/lib/tournament-map";
import { buildRiTournamentMapEventPayload, getRiMapDeviceType, getRiMapTrafficSource } from "@/lib/tournamentMapAnalytics";
import styles from "./TournamentMapPage.module.css";

type Props = {
  items: TournamentMapItem[];
  sourcePage: string | null;
  sport: string | null;
  stateLabel: string | null;
  city: string | null;
  month: string | null;
};

type MobileView = "map" | "list";

async function captureEvent(eventName: string, payload: Record<string, unknown>) {
  if (typeof window === "undefined" || process.env.NODE_ENV !== "production") return;
  const posthog = (await import("posthog-js")).default;
  posthog.capture(eventName, payload);
}

function formatDate(value: string | null) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function TournamentMapPageClient({ items, sourcePage, sport, stateLabel, city, month }: Props) {
  const shouldPrefetch = process.env.NODE_ENV === "production";
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const mapboxRef = useRef<any>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(items[0]?.id ?? null);
  const [mobileView, setMobileView] = useState<MobileView>("map");
  const [renderMode, setRenderMode] = useState("split");
  const lastViewKeyRef = useRef<string | null>(null);
  const analyticsContextRef = useRef({
    sourcePage,
    renderMode,
    sport,
    stateLabel,
    city,
    month,
  });

  useEffect(() => {
    analyticsContextRef.current = {
      sourcePage,
      renderMode,
      sport,
      stateLabel,
      city,
      month,
    };
  }, [city, month, renderMode, sourcePage, sport, stateLabel]);

  useEffect(() => {
    setSelectedId((current) => (current && items.some((item) => item.id === current) ? current : items[0]?.id ?? null));
  }, [items]);

  useEffect(() => {
    const updateMode = () => {
      if (typeof window === "undefined") return;
      const nextMode = window.innerWidth < 980 ? (mobileView === "list" ? "mobile_list" : "mobile_map") : "split";
      setRenderMode(nextMode);
    };
    updateMode();
    window.addEventListener("resize", updateMode);
    return () => window.removeEventListener("resize", updateMode);
  }, [mobileView]);

  const featureCollection = useMemo(
    () =>
      buildTournamentMapFeatureCollection(
        items.map((item) => ({
          ...item,
          venue: item.venue
            ? {
                ...item.venue,
              }
            : null,
        }))
      ),
    [items]
  );

  const selectedItem = useMemo(() => items.find((item) => item.id === selectedId) ?? null, [items, selectedId]);
  const validCoordinateCount = featureCollection.features.length;
  const missingCoordinateCount = items.length - validCoordinateCount;

  useEffect(() => {
    if (typeof window === "undefined" || process.env.NODE_ENV !== "production") return;

    const payload = {
      ...buildRiTournamentMapEventPayload({
        sourcePage,
        mapListState: renderMode,
        resultCount: items.length,
        sport,
        state: stateLabel,
        city,
        month,
      }),
      device_type: getRiMapDeviceType(window.innerWidth),
      traffic_source: getRiMapTrafficSource(window.location.href, document.referrer),
      has_city_filter: Boolean(city),
      has_month_filter: Boolean(month),
      has_state_filter: Boolean(stateLabel),
      has_sport_filter: Boolean(sport),
      valid_coordinate_count: validCoordinateCount,
    };

    const key = JSON.stringify(payload);
    if (lastViewKeyRef.current === key) return;
    lastViewKeyRef.current = key;

    void captureEvent("ri_tournament_map_viewed", payload);
    if (city || month || stateLabel || sport || sourcePage) {
      void captureEvent("ri_tournament_map_filter_applied", payload);
    }
  }, [city, items.length, month, renderMode, sourcePage, sport, stateLabel, validCoordinateCount]);

  useEffect(() => {
    let cancelled = false;
    let initTimer: number | null = null;
    setMapReady(false);
    setMapError(null);

    async function init() {
      if (!containerRef.current) return;
      if (!featureCollection.features.length) {
        setMapReady(true);
        return;
      }

      const token = (process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN ?? "").trim();
      if (!token) {
        setMapError("Missing NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN");
        return;
      }

      const waitForContainer = async () => {
        const startedAt = Date.now();
        while (!cancelled) {
          const rect = containerRef.current?.getBoundingClientRect();
          if (rect && rect.width >= 50 && rect.height >= 50) return true;
          if (Date.now() - startedAt > 2500) return false;
          await new Promise<void>((resolve) => {
            initTimer = window.setTimeout(resolve, 50);
          });
        }
        return false;
      };

      let mod: any;
      try {
        mod = await import("mapbox-gl");
      } catch (error) {
        setMapError(`Failed to load map library: ${String((error as Error)?.message ?? error)}`);
        return;
      }
      if (cancelled) return;

      const ok = await waitForContainer();
      if (!ok || cancelled) {
        setMapError("Map container did not become visible.");
        return;
      }

      const mapboxgl = mod.default ?? mod;
      mapboxgl.accessToken = token;
      mapboxRef.current = mapboxgl;

      const first = featureCollection.features[0];
      const coordinates = first?.geometry.coordinates;
      if (!coordinates) {
        setMapReady(true);
        return;
      }

      const map = new mapboxgl.Map({
        container: containerRef.current,
        style: "mapbox://styles/mapbox/streets-v12",
        center: coordinates,
        zoom: 4.5,
        cooperativeGestures: true,
      });

      mapRef.current = map;

      try {
        if (typeof ResizeObserver !== "undefined" && containerRef.current) {
          resizeObserverRef.current = new ResizeObserver(() => {
            map.resize?.();
          });
          resizeObserverRef.current.observe(containerRef.current);
        }
      } catch {
        resizeObserverRef.current = null;
      }

      map.on("load", () => {
        if (cancelled) return;

        map.addSource("tournaments", {
          type: "geojson",
          data: {
            ...featureCollection,
            features: featureCollection.features.map((feature) => ({
              ...feature,
              properties: {
                ...feature.properties,
                selected: false,
              },
            })),
          },
          cluster: true,
          clusterMaxZoom: 10,
          clusterRadius: 42,
        });

        map.addLayer({
          id: "clusters",
          type: "circle",
          source: "tournaments",
          filter: ["has", "point_count"],
          paint: {
            "circle-color": "#0f5132",
            "circle-radius": ["step", ["get", "point_count"], 18, 12, 22, 30, 28],
            "circle-stroke-width": 2,
            "circle-stroke-color": "#ffffff",
          },
        });

        map.addLayer({
          id: "cluster-count",
          type: "symbol",
          source: "tournaments",
          filter: ["has", "point_count"],
          layout: {
            "text-field": "{point_count_abbreviated}",
            "text-font": ["DIN Offc Pro Medium", "Arial Unicode MS Bold"],
            "text-size": 12,
          },
          paint: {
            "text-color": "#ffffff",
          },
        });

        map.addLayer({
          id: "unclustered-point",
          type: "circle",
          source: "tournaments",
          filter: ["!", ["has", "point_count"]],
          paint: {
            "circle-color": "#f97316",
            "circle-radius": 8,
            "circle-stroke-width": 2,
            "circle-stroke-color": "#ffffff",
          },
        });

        map.addLayer({
          id: "selected-point",
          type: "circle",
          source: "tournaments",
          filter: ["all", ["!", ["has", "point_count"]], ["==", ["get", "selected"], true]],
          paint: {
            "circle-color": "#ffffff",
            "circle-radius": 12,
            "circle-stroke-width": 3,
            "circle-stroke-color": "#0f172a",
          },
        });

        const bounds = calculateMapBounds(items);
        if (bounds) {
          map.fitBounds(
            [
              [bounds.minLng, bounds.minLat],
              [bounds.maxLng, bounds.maxLat],
            ],
            {
              padding: 70,
              duration: 0,
              maxZoom: bounds.minLng === bounds.maxLng && bounds.minLat === bounds.maxLat ? 10 : 8,
            }
          );
        }

        map.on("click", "clusters", (event: any) => {
          const feature = event.features?.[0];
          const clusterId = feature?.properties?.cluster_id;
          const source = map.getSource("tournaments");
          source?.getClusterExpansionZoom?.(clusterId, (error: Error | null, zoom: number) => {
            if (error) return;
            map.easeTo({
              center: feature.geometry.coordinates,
              zoom,
              duration: 300,
            });
          });
        });

        map.on("click", "unclustered-point", (event: any) => {
          const feature = event.features?.[0];
          const nextId = String(feature?.properties?.id ?? "");
          if (!nextId) return;
          setSelectedId(nextId);
          map.easeTo({ center: feature.geometry.coordinates, duration: 250, zoom: Math.max(map.getZoom(), 8) });
          const analyticsContext = analyticsContextRef.current;
          void captureEvent(
            "ri_tournament_map_marker_clicked",
            {
              ...buildRiTournamentMapEventPayload({
                sourcePage: analyticsContext.sourcePage,
                mapListState: analyticsContext.renderMode,
                resultCount: items.length,
                sport: analyticsContext.sport,
                state: analyticsContext.stateLabel,
                city: analyticsContext.city,
                month: analyticsContext.month,
                tournamentId: feature.properties.tournamentId,
                tournamentSlug: feature.properties.tournamentSlug,
                venueId: feature.properties.venueId,
              }),
              device_type: getRiMapDeviceType(window.innerWidth),
              traffic_source: getRiMapTrafficSource(window.location.href, document.referrer),
            }
          );
        });

        for (const layerId of ["clusters", "unclustered-point"]) {
          map.on("mouseenter", layerId, () => {
            map.getCanvas().style.cursor = "pointer";
          });
          map.on("mouseleave", layerId, () => {
            map.getCanvas().style.cursor = "";
          });
        }

        requestAnimationFrame(() => {
          map.resize?.();
          setMapReady(true);
        });
      });
    }

    void init();

    return () => {
      cancelled = true;
      if (initTimer !== null) window.clearTimeout(initTimer);
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;
      mapRef.current?.remove?.();
      mapRef.current = null;
    };
  }, [featureCollection, items]);

  useEffect(() => {
    const map = mapRef.current;
    const source = map?.getSource?.("tournaments");
    if (!map || !source) return;

    source.setData({
      ...featureCollection,
      features: featureCollection.features.map((feature) => ({
        ...feature,
        properties: {
          ...feature.properties,
          selected: feature.properties.id === selectedId,
        },
      })),
    });
  }, [featureCollection, selectedId]);

  const focusItem = (item: TournamentMapItem) => {
    setSelectedId(item.id);
    const coordinates = normalizeLngLat(item.venue?.latitude, item.venue?.longitude);
    if (!coordinates || !mapRef.current) return;
    mapRef.current.easeTo({
      center: [coordinates.lng, coordinates.lat],
      zoom: Math.max(mapRef.current.getZoom?.() ?? 8, 8),
      duration: 250,
    });
  };

  const handleResultClick = (item: TournamentMapItem) => {
    focusItem(item);
    if (typeof window !== "undefined") {
      const analyticsContext = analyticsContextRef.current;
      void captureEvent("ri_tournament_map_result_clicked", {
        ...buildRiTournamentMapEventPayload({
          sourcePage: analyticsContext.sourcePage,
          mapListState: analyticsContext.renderMode,
          resultCount: items.length,
          sport: analyticsContext.sport,
          state: analyticsContext.stateLabel,
          city: analyticsContext.city,
          month: analyticsContext.month,
          tournamentId: item.tournamentId,
          tournamentSlug: item.tournamentSlug,
          venueId: item.venue?.id ?? null,
        }),
        device_type: getRiMapDeviceType(window.innerWidth),
        traffic_source: getRiMapTrafficSource(window.location.href, document.referrer),
      });
    }
  };

  const captureAction = (eventName: string, item: TournamentMapItem) => {
    if (typeof window === "undefined") return;
    const analyticsContext = analyticsContextRef.current;
    void captureEvent(eventName, {
      ...buildRiTournamentMapEventPayload({
        sourcePage: analyticsContext.sourcePage,
        mapListState: analyticsContext.renderMode,
        resultCount: items.length,
        sport: analyticsContext.sport,
        state: analyticsContext.stateLabel,
        city: analyticsContext.city,
        month: analyticsContext.month,
        tournamentId: item.tournamentId,
        tournamentSlug: item.tournamentSlug,
        venueId: item.venue?.id ?? null,
      }),
      device_type: getRiMapDeviceType(window.innerWidth),
      traffic_source: getRiMapTrafficSource(window.location.href, document.referrer),
    });
  };

  return (
    <div className={styles.shell}>
      <div className={styles.topRow}>
        <div className={styles.countBadge}>
          <span>{items.length} tournaments</span>
          {missingCoordinateCount > 0 ? <span>• {missingCoordinateCount} without map pins</span> : null}
        </div>
        <div className={styles.toggleRow}>
          <button
            type="button"
            className={`${styles.toggleButton} ${mobileView === "map" ? styles.toggleButtonActive : ""}`}
            onClick={() => setMobileView("map")}
          >
            Map
          </button>
          <button
            type="button"
            className={`${styles.toggleButton} ${mobileView === "list" ? styles.toggleButtonActive : ""}`}
            onClick={() => setMobileView("list")}
          >
            List
          </button>
        </div>
      </div>

      <div className={styles.layout}>
        <section className={`${styles.mapPanel} ${mobileView === "list" ? styles.mapPanelHidden : ""}`}>
          <div className={styles.mapToolbar}>
            <div>
              <h2 className={styles.mapTitle}>Tournament travel map</h2>
              <p className={styles.mapHint}>Select a pin or result to inspect travel context and venue linkage.</p>
            </div>
          </div>
          <div className={styles.mapFrame}>
            {!mapReady ? <div className={styles.mapStatus}>Loading map…</div> : null}
            {mapError ? <div className={styles.mapStatus}>{mapError}</div> : null}
            {!mapError && !featureCollection.features.length ? (
              <div className={styles.mapEmpty}>No mapped venues match the current filters yet.</div>
            ) : null}
            <div ref={containerRef} className={styles.mapCanvas} />
          </div>
        </section>

        <aside className={`${styles.listPanel} ${mobileView === "map" ? styles.listPanelHidden : ""}`}>
          {selectedItem ? (
            <div className={styles.selectedCard}>
              <div className={styles.selectedEyebrow}>Selected tournament</div>
              <h2 className={styles.selectedTitle}>{selectedItem.tournamentName}</h2>
              <p className={styles.selectedMeta}>
                {[
                  [selectedItem.sport, selectedItem.city, selectedItem.state].filter(Boolean).join(" • "),
                  [formatDate(selectedItem.startDate), selectedItem.endDate && selectedItem.endDate !== selectedItem.startDate ? formatDate(selectedItem.endDate) : null]
                    .filter(Boolean)
                    .join(" – "),
                ]
                  .filter(Boolean)
                  .join(" • ")}
              </p>
              <p className={styles.selectedMeta}>
                {selectedItem.venue?.name ? selectedItem.venue.name : "Venue not linked yet"}
                {selectedItem.venue?.city || selectedItem.venue?.state
                  ? ` • ${[selectedItem.venue?.city, selectedItem.venue?.state].filter(Boolean).join(", ")}`
                  : ""}
              </p>
              <div className={styles.selectedActions}>
                <Link
                  href={`/tournaments/${selectedItem.tournamentSlug}`}
                  className={styles.actionLink}
                  prefetch={shouldPrefetch}
                  onClick={() => captureAction("ri_tournament_map_view_details_clicked", selectedItem)}
                >
                  View tournament travel guide
                </Link>
                {selectedItem.venue?.slug || selectedItem.venue?.id ? (
                  <Link
                    href={`/venues/${selectedItem.venue?.slug ?? selectedItem.venue?.id}`}
                    className={styles.secondaryAction}
                    prefetch={shouldPrefetch}
                    onClick={() => captureAction("ri_tournament_map_view_venue_clicked", selectedItem)}
                  >
                    View venue
                  </Link>
                ) : null}
              </div>
            </div>
          ) : null}

          <div className={styles.resultList}>
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`${styles.resultButton} ${selectedId === item.id ? styles.resultSelected : ""}`}
                onClick={() => handleResultClick(item)}
              >
                <h3 className={styles.resultTitle}>{item.tournamentName}</h3>
                <p className={styles.resultMeta}>
                  {[
                    [item.sport, item.city, item.state].filter(Boolean).join(" • "),
                    [formatDate(item.startDate), item.endDate && item.endDate !== item.startDate ? formatDate(item.endDate) : null]
                      .filter(Boolean)
                      .join(" – "),
                  ]
                    .filter(Boolean)
                    .join(" • ")}
                </p>
                <p className={`${styles.resultMeta} ${!item.venue?.latitude || !item.venue?.longitude ? styles.resultVenueMissing : ""}`}>
                  {item.venue?.name ?? "Venue not mapped yet"}
                </p>
              </button>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}
