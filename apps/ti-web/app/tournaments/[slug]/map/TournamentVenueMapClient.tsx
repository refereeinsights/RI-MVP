"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import ShareWeekendButton from "@/components/ShareWeekendButton";
import styles from "./TournamentVenueMap.module.css";

type VenueCounts = { coffee: number; food: number; hotels: number };

export type MapVenue = {
  id: string;
  seo_slug: string | null;
  name: string | null;
  city: string | null;
  state: string | null;
  latitude: number | null;
  longitude: number | null;
  hasOwl: boolean;
  counts: VenueCounts | null;
};

export default function TournamentVenueMapClient({
  tournament,
  venues,
  mapEnabled,
  selectedVenueId,
  setSelectedVenueId,
  detailMode,
  setDetailMode,
}: {
  tournament: { id: string; slug: string; name: string; sport: string | null };
  venues: MapVenue[];
  mapEnabled: boolean;
  selectedVenueId: string | null;
  setSelectedVenueId: (value: string | null) => void;
  detailMode: boolean;
  setDetailMode: (value: boolean) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<Map<string, any>>(new Map());
  const [mapError, setMapError] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState<boolean>(false);
  const [thumbSrc, setThumbSrc] = useState<string>(() => {
    const raw = String(tournament.sport ?? "").trim().toLowerCase();
    const allowed = new Set([
      "soccer",
      "basketball",
      "football",
      "baseball",
      "softball",
      "volleyball",
      "lacrosse",
      "wrestling",
      "hockey",
      "futsal",
    ]);
    const sportKey = allowed.has(raw) ? raw : "generic";
    return `/brand/headers/ti-venue-thumb-${sportKey}.webp`;
  });
  const [detailImgSrc, setDetailImgSrc] = useState<string>(() => {
    const raw = String(tournament.sport ?? "").trim().toLowerCase();
    const allowed = new Set([
      "soccer",
      "basketball",
      "football",
      "baseball",
      "softball",
      "volleyball",
      "lacrosse",
      "wrestling",
      "hockey",
      "futsal",
    ]);
    const sportKey = allowed.has(raw) ? raw : "generic";
    return `/brand/headers/ti-map-hero-${sportKey}.webp`;
  });

  const selectedVenue = useMemo(() => venues.find((v) => v.id === selectedVenueId) ?? null, [venues, selectedVenueId]);
  const validCoords = useMemo(
    () =>
      venues
        .filter((v) => typeof v.latitude === "number" && typeof v.longitude === "number" && Number.isFinite(v.latitude) && Number.isFinite(v.longitude))
        .map((v) => ({ id: v.id, lat: v.latitude as number, lng: v.longitude as number })),
    [venues]
  );

  const clientToken = (process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN ?? "").trim();
  const effectiveMapEnabled = mapEnabled && Boolean(clientToken);

  useEffect(() => {
    if (!effectiveMapEnabled) return;
    if (!containerRef.current) return;
    if (!validCoords.length) return;
    let cancelled = false;
    setMapError(null);
    setMapReady(false);

    (async () => {
      const token = clientToken;
      if (!token) {
        setMapError("Missing NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN");
        return;
      }

      let mod: any;
      try {
        mod = await import("mapbox-gl");
      } catch (err) {
        setMapError(`Failed to load map library: ${String((err as any)?.message ?? err ?? "unknown")}`);
        return;
      }
      if (cancelled) return;
      const mapboxgl = (mod as any).default ?? mod;
      mapboxgl.accessToken = token;

      const styleUrl = (process.env.NEXT_PUBLIC_MAPBOX_STYLE_URL ?? "").trim() || "mapbox://styles/mapbox/streets-v12";

      let map: any;
      try {
        map = new mapboxgl.Map({
          container: containerRef.current,
          style: styleUrl,
          center: [validCoords[0].lng, validCoords[0].lat],
          zoom: 10,
          cooperativeGestures: true,
        });
      } catch (err) {
        setMapError(`Map initialization failed: ${String((err as any)?.message ?? err ?? "unknown")}`);
        return;
      }

      mapRef.current = map;
      map.on("load", () => setMapReady(true));
      map.on("error", (e: any) => {
        const msg = String(e?.error?.message ?? e?.message ?? "");
        // Only surface the first meaningful error; Mapbox can emit multiple.
        if (msg) setMapError((prev) => prev ?? msg.slice(0, 220));
      });

      map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");

      const markerById = markersRef.current;
      markerById.clear();

      const venueNameById = new Map(venues.map((v) => [v.id, (v.name ?? "").trim() || "Tournament venue"] as const));

      for (const v of validCoords) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = styles.markerBtn;
        btn.setAttribute("aria-label", `Select ${venueNameById.get(v.id) ?? "venue"}`);

        const inner = document.createElement("div");
        inner.className = styles.marker;

        const ball = document.createElement("div");
        ball.className = styles.markerBall;
        ball.textContent = "⚽";
        inner.appendChild(ball);

        btn.appendChild(inner);

        btn.addEventListener("click", () => {
          setSelectedVenueId(v.id);
          setDetailMode(true);
        });

        const marker = new mapboxgl.Marker({ element: btn, anchor: "bottom" }).setLngLat([v.lng, v.lat]).addTo(map);
        markerById.set(v.id, marker);
      }

      const bounds = new mapboxgl.LngLatBounds();
      for (const v of validCoords) bounds.extend([v.lng, v.lat]);
      const isDesktop = window.matchMedia("(min-width: 900px)").matches;
      map.fitBounds(bounds, {
        padding: isDesktop ? { top: 80, bottom: 80, left: 460, right: 40 } : { top: 80, bottom: 80, left: 40, right: 40 },
        duration: 0,
        maxZoom: 12,
      });
    })();

    return () => {
      cancelled = true;
      try {
        mapRef.current?.remove?.();
      } catch {
        // ignore
      } finally {
        mapRef.current = null;
      }
    };
  }, [effectiveMapEnabled, validCoords.length, venues, clientToken]);

  useEffect(() => {
    if (!effectiveMapEnabled) return;
    const map = mapRef.current;
    if (!map) return;

    for (const venue of venues) {
      const marker = markersRef.current.get(venue.id);
      if (!marker) continue;
      const el = marker.getElement?.() as HTMLElement | null;
      const inner = el?.querySelector?.(`.${styles.marker}`) as HTMLElement | null;
      if (!inner) continue;
      if (venue.id === selectedVenueId) inner.classList.add(styles.markerSelected);
      else inner.classList.remove(styles.markerSelected);
    }

    const sel = selectedVenue;
    if (sel && typeof sel.latitude === "number" && typeof sel.longitude === "number") {
      try {
        map.flyTo({ center: [sel.longitude, sel.latitude], zoom: Math.max(map.getZoom?.() ?? 11, 11), speed: 1.2 });
      } catch {
        // ignore
      }
    }
  }, [mapEnabled, selectedVenueId, selectedVenue, venues]);

  const venueLocation = (v: MapVenue) => [v.city, v.state].filter(Boolean).join(", ") || "Location TBA";
  const countsLine = (v: MapVenue) => {
    if (!v.hasOwl || !v.counts) return null;
    const parts = [`☕ ${v.counts.coffee}`, `🍔 ${v.counts.food}`];
    if (v.counts.hotels) parts.push(`🏨 ${v.counts.hotels}`);
    return parts.join(" • ");
  };

  const primaryVenue = venues[0] ?? null;
  const hotelVenueId = selectedVenue?.id ?? primaryVenue?.id ?? null;

  return (
    <div className={styles.wrap}>
      <div className={styles.grid}>
        <div className={styles.panel}>
          {!detailMode ? (
            <>
              <div>
                <h1 className={styles.panelTitle}>Select a venue</h1>
                <p className={styles.panelSub}>
                  {tournament.name} • {venues.length} venue{venues.length === 1 ? "" : "s"}
                </p>
              </div>

              <div className={styles.venueList} role="list">
                {venues.map((v) => {
                  const selected = v.id === selectedVenueId;
                  return (
                    <button
                      key={v.id}
                      type="button"
                      className={`${styles.venueRow} ${selected ? styles.venueRowSelected : ""}`}
                      onClick={() => {
                        setSelectedVenueId(v.id);
                        setDetailMode(true);
                      }}
                      role="listitem"
                    >
                      <div className={styles.venueThumb} aria-hidden="true">
                        <img
                          className={styles.venueThumbImg}
                          src={thumbSrc}
                          alt=""
                          onError={() => {
                            if (thumbSrc !== "/brand/headers/ti-venue-thumb.webp") setThumbSrc("/brand/headers/ti-venue-thumb.webp");
                          }}
                        />
                      </div>
                      <div>
                        <div className={styles.venueName}>{v.name || "Venue TBA"}</div>
                        <div className={styles.venueMeta}>{venueLocation(v)}</div>
                        {countsLine(v) ? <div className={styles.venueCounts}>{countsLine(v)}</div> : null}
                      </div>
                    </button>
                  );
                })}
              </div>
            </>
          ) : selectedVenue ? (
            <>
              <div className={styles.detailHeader}>
                <div>
                  <h1 className={styles.panelTitle}>{selectedVenue.name || "Venue TBA"}</h1>
                  <p className={styles.panelSub}>{venueLocation(selectedVenue)}</p>
                </div>
                {venues.length > 1 ? (
                  <button type="button" className={styles.backBtn} onClick={() => setDetailMode(false)}>
                    Back
                  </button>
                ) : null}
              </div>

              <div className={styles.venueThumb} style={{ width: "100%", height: 160 }}>
                <img
                  className={styles.venueThumbImg}
                  src={detailImgSrc}
                  alt=""
                  onError={() => {
                    if (detailImgSrc !== "/brand/headers/ti-map-hero.webp") setDetailImgSrc("/brand/headers/ti-map-hero.webp");
                  }}
                />
              </div>

              {selectedVenue.hasOwl && selectedVenue.counts ? (
                <div style={{ marginTop: 2 }}>
                  <div style={{ fontSize: 12, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.08em", opacity: 0.85 }}>
                    Weekend Guide (Owl&apos;s Eye)
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.88, marginTop: 4 }}>A quick look at what’s nearby.</div>
                  <div className={styles.venueCounts} style={{ marginTop: 8 }}>
                    {`☕ ${selectedVenue.counts.coffee} coffee • 🍔 ${selectedVenue.counts.food} food • 🏨 ${selectedVenue.counts.hotels} hotels`}
                  </div>
                </div>
              ) : null}

              <div className={styles.ctaRow}>
                {hotelVenueId ? (
                  <a
                    className={styles.cta}
                    href={`/go/hotels?venueId=${encodeURIComponent(hotelVenueId)}&tournamentId=${encodeURIComponent(tournament.id)}`}
                    target="_blank"
                    rel="noopener noreferrer sponsored"
                  >
                    View nearby hotels
                  </a>
                ) : null}

                {hotelVenueId ? (
                  <a
                    className={`${styles.cta} ${styles.ctaSecondary}`}
                    href={`/go/vrbo?venueId=${encodeURIComponent(hotelVenueId)}&tournamentId=${encodeURIComponent(tournament.id)}`}
                    target="_blank"
                    rel="noopener noreferrer sponsored"
                  >
                    Search Vrbo rentals
                  </a>
                ) : null}

                {selectedVenue ? (
                  <ShareWeekendButton
                    tournamentSlug={tournament.slug}
                    tournamentName={tournament.name}
                    venueLabel={selectedVenue.name ? `${selectedVenue.name}${venueLocation(selectedVenue) ? ` (${venueLocation(selectedVenue)})` : ""}` : null}
                    venue={selectedVenue.seo_slug ?? selectedVenue.id}
                    sourcePage="venue_map"
                    buttonLabel="Share this plan"
                    className={`${styles.cta} ${styles.ctaSecondary}`}
                  />
                ) : null}

                {selectedVenue.seo_slug ? (
                  <Link
                    className={`${styles.cta} ${styles.ctaSecondary}`}
                    href={`/venues/${selectedVenue.seo_slug}?tournament=${encodeURIComponent(tournament.slug)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    View full Owl&apos;s Eye →
                  </Link>
                ) : null}
              </div>
              <div style={{ fontSize: 12, opacity: 0.86, marginTop: 2 }}>Most teams stay within 10–15 minutes of this venue.</div>
            </>
          ) : (
            <div className={styles.mapFallback}>Select a venue to see details.</div>
          )}
        </div>

        <div className={styles.map}>
          {!effectiveMapEnabled ? (
            <div className={styles.mapFallback}>
              Map unavailable right now. You can still browse the venues and open hotel options from the panel.
            </div>
          ) : (
            <>
              <div className={styles.mapInner} ref={containerRef} />
              {mapError ? (
                <div className={styles.mapFallback}>
                  <div style={{ fontWeight: 900 }}>Map failed to load.</div>
                  <div style={{ marginTop: 6, opacity: 0.92 }}>{mapError}</div>
                  <div style={{ marginTop: 8, opacity: 0.86 }}>
                    Check `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN` and that the token’s URL restrictions include this local origin.
                  </div>
                </div>
              ) : !mapReady ? (
                <div className={styles.mapFallback}>Loading map…</div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
