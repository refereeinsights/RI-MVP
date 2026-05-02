"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import ShareWeekendButton from "@/components/ShareWeekendButton";
import UpgradeWeekendProButton from "@/components/UpgradeWeekendProButton";
import WeekendProUpgradeModalTrigger from "@/components/premium/WeekendProUpgradeModalTrigger";
import { trackTiEvent } from "@/lib/tiAnalyticsClient";
import { getTier } from "@/lib/entitlements";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";
import { DEMO_STARFIRE_VENUE_ID } from "@/lib/owlsEyeScores";
import { isPremiumPreviewTournamentSlug } from "@/lib/premiumPreview";
import styles from "./TournamentVenueMap.module.css";

type VenueCounts = { coffee: number; food: number; hotels: number; quick_eats: number; hangouts: number };
type OwlCategory = "coffee" | "food" | "hotels" | "quick_eats" | "hangouts" | "sporting_goods";
type TiTier = "explorer" | "insider" | "weekend_pro" | "unknown";

type OwlPlace = {
  place_id: string | null;
  name: string | null;
  address: string | null;
  distance_meters: number | null;
  maps_url: string | null;
  provider: string | null;
  place_latitude: number | null;
  place_longitude: number | null;
};

type OwlGroup = {
  count: number;
  has_coords: boolean;
  items: OwlPlace[];
};

type OwlPremiumResponse =
  | {
      ok: true;
      venueId: string;
      tournamentSlug: string | null;
      tier: TiTier;
      runId: string | null;
      groups: Partial<Record<OwlCategory, OwlGroup>>;
    }
  | { ok: false; error: string; tier?: TiTier };

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
  const mapboxglRef = useRef<any>(null);
  const markersRef = useRef<Map<string, any>>(new Map());
  const placeMarkersRef = useRef<Map<string, { marker: any; category: OwlCategory }>>(new Map());
  const popupRef = useRef<any>(null);
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
      "lacrosse",
      "wrestling",
      "hockey",
      "futsal",
    ]);
    const sportKey = allowed.has(raw) ? raw : "generic";
    return `/brand/headers/ti-map-hero-${sportKey}.webp`;
  });

  const selectedVenue = useMemo(() => venues.find((v) => v.id === selectedVenueId) ?? null, [venues, selectedVenueId]);
  const [owlPanelMode, setOwlPanelMode] = useState<"teaser" | "premium" | "unlock">("teaser");
  const [owlPremiumByVenueId, setOwlPremiumByVenueId] = useState<Record<string, OwlPremiumResponse | null>>({});
  const [owlPremiumLoadingVenueId, setOwlPremiumLoadingVenueId] = useState<string | null>(null);
  const [owlPremiumError, setOwlPremiumError] = useState<string | null>(null);
  const [activePinCategories, setActivePinCategories] = useState<OwlCategory[]>([]);
  const [selectedPlaceKey, setSelectedPlaceKey] = useState<string | null>(null);
  const [entitlementTier, setEntitlementTier] = useState<TiTier>("unknown");
  const validCoords = useMemo(
    () =>
      venues
        .filter((v) => typeof v.latitude === "number" && typeof v.longitude === "number" && Number.isFinite(v.latitude) && Number.isFinite(v.longitude))
        .map((v) => ({ id: v.id, lat: v.latitude as number, lng: v.longitude as number })),
    [venues]
  );
  const validCoordsKey = useMemo(
    () => validCoords.map((v) => `${v.id}:${v.lat.toFixed(5)},${v.lng.toFixed(5)}`).join("|"),
    [validCoords]
  );

  const clientToken = (process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN ?? "").trim();
  const effectiveMapEnabled = mapEnabled && Boolean(clientToken);

  // Track interactive map opens/loads for billing-relevant adoption.
  const analyticsHref =
    typeof window !== "undefined"
      ? window.location.href
      : `/tournaments/${encodeURIComponent(tournament.slug)}/map`;
  const openedTrackedRef = useRef(false);
  const loadedTrackedRef = useRef(false);

  useEffect(() => {
    if (openedTrackedRef.current) return;
    openedTrackedRef.current = true;
    void trackTiEvent("venue_map_opened", {
      page_type: "venue_map",
      tournament_id: tournament.id,
      tournament_slug: tournament.slug,
      sport: tournament.sport ?? null,
      venue_count: venues.length,
      href: typeof window !== "undefined" ? window.location.href : analyticsHref,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tournament.id, tournament.slug]);

  useEffect(() => {
    if (!effectiveMapEnabled) return;
    if (!containerRef.current) return;
    if (!validCoords.length) return;
    let cancelled = false;
    let resizeObserver: ResizeObserver | null = null;
    let initTimer: number | null = null;
    setMapError(null);
    setMapReady(false);

    (async () => {
      const token = clientToken;
      if (!token) {
        setMapError("Missing NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN");
        return;
      }

      // Defer initialization until the map container has a real size. If Mapbox boots
      // when the container is 0x0 (common during App Router/layout transitions),
      // it may never start rendering or requesting tiles until a hard refresh.
      const waitForNonZeroContainer = async () => {
        const startedAt = Date.now();
        while (!cancelled) {
          const el = containerRef.current;
          if (!el) return false;
          const rect = el.getBoundingClientRect();
          if (rect.width >= 50 && rect.height >= 50) return true;
          if (Date.now() - startedAt > 2500) return false;
          await new Promise<void>((resolve) => {
            initTimer = window.setTimeout(() => resolve(), 50);
          });
        }
        return false;
      };

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
      mapboxglRef.current = mapboxgl;

      const styleUrl = (process.env.NEXT_PUBLIC_MAPBOX_STYLE_URL ?? "").trim() || "mapbox://styles/mapbox/streets-v12";
      const fallbackStyleUrl = "mapbox://styles/mapbox/streets-v12";
      let attemptedFallbackStyle = false;

      const okToInit = await waitForNonZeroContainer();
      if (cancelled) return;
      if (!okToInit) {
        setMapError("Map container was not visible/sized. Try a refresh; if this persists, check for layout/CSS preventing the map from getting a height.");
        setMapReady(true);
        return;
      }

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
      // In App Router navigations and panel/layout transitions, the map container can start at a
      // zero size and then expand. Mapbox GL needs explicit resize calls to render reliably.
      try {
        if (typeof ResizeObserver !== "undefined" && containerRef.current) {
          resizeObserver = new ResizeObserver(() => {
            try {
              requestAnimationFrame(() => {
                try {
                  map.resize?.();
                  map.triggerRepaint?.();
                } catch {
                  // ignore
                }
              });
            } catch {
              // ignore
            }
          });
          resizeObserver.observe(containerRef.current);
        }
      } catch {
        // ignore
      }
      map.on("load", () => {
        // A couple resizes after load help avoid a blank/gray map on first render.
        try {
          const doResize = () => {
            try {
              map.resize?.();
              map.triggerRepaint?.();
            } catch {
              // ignore
            }
          };
          requestAnimationFrame(doResize);
          window.setTimeout(doResize, 250);
          window.setTimeout(doResize, 1000);
        } catch {
          // ignore
        }

        // Fit bounds first so the tile-ready check is based on the final viewport.
        // (Otherwise areTilesLoaded() can briefly be true before the new tile requests are queued.)
        const fitToBounds = () => {
          try {
            const bounds = new mapboxgl.LngLatBounds();
            for (const v of validCoords) bounds.extend([v.lng, v.lat]);
            const isDesktop = window.matchMedia("(min-width: 900px)").matches;
            map.fitBounds(bounds, {
              padding: isDesktop
                ? { top: 80, bottom: 80, left: 460, right: 40 }
                : { top: 80, bottom: 80, left: 40, right: 40 },
              duration: 0,
              maxZoom: 12,
            });
          } catch {
            // ignore
          }
        };
        try {
          requestAnimationFrame(fitToBounds);
        } catch {
          fitToBounds();
        }

        // Only clear the loading overlay once tiles are actually ready; otherwise the user
        // just sees a blank/gray map area. Fall back after a timeout so we don't block forever.
        try {
          let done = false;
          let consecutiveReady = 0;
          const markReadyIfTiles = () => {
            if (done) return;
            try {
              const ready = Boolean(map.isStyleLoaded?.() && map.areTilesLoaded?.());
              consecutiveReady = ready ? consecutiveReady + 1 : 0;
              if (consecutiveReady < 3) return;
              done = true;
              // Give the browser/GPU a frame to paint after tiles report ready.
              requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                  setMapReady(true);
                });
              });
            } catch {
              // ignore
            }
          };
          map.on?.("idle", markReadyIfTiles);
          const interval = window.setInterval(markReadyIfTiles, 200);
          window.setTimeout(() => {
            try {
              map.off?.("idle", markReadyIfTiles);
            } catch {
              // ignore
            }
            window.clearInterval(interval);
            if (!done) {
              // If tiles still aren't ready, try swapping to the known-good public style once.
              // This helps in dev when a custom style is restricted or unavailable.
              if (!attemptedFallbackStyle && styleUrl !== fallbackStyleUrl) {
                attemptedFallbackStyle = true;
                consecutiveReady = 0;
                try {
                  map.setStyle?.(fallbackStyleUrl);
                } catch {
                  // ignore
                }
                // Give the fallback style a moment to load; keep the loading overlay visible.
                window.setTimeout(markReadyIfTiles, 700);
                window.setTimeout(markReadyIfTiles, 1700);
                return;
              }

              // If we still can't load tiles, show a helpful message instead of a blank map.
              setMapError((prev) => prev ?? "Map is taking longer than expected to load. Check Mapbox token/style URL restrictions for this origin.");
              setMapReady(true);
            }
          }, 6500);
        } catch {
          setMapReady(true);
        }
        if (!loadedTrackedRef.current) {
          loadedTrackedRef.current = true;
          void trackTiEvent("venue_map_loaded", {
            page_type: "venue_map",
            tournament_id: tournament.id,
            tournament_slug: tournament.slug,
            sport: tournament.sport ?? null,
            venue_count: venues.length,
            href: typeof window !== "undefined" ? window.location.href : analyticsHref,
          });
        }
      });
      map.on("error", (e: any) => {
        const err = e?.error ?? e;
        const msg = String(err?.message ?? "");
        const status = typeof err?.status === "number" ? ` (status ${err.status})` : "";
        const url = err?.url ? ` ${String(err.url)}` : "";
        const derived = (msg || status || url ? `${msg}${status}${url}` : "").trim();
        // Only surface the first meaningful error; Mapbox can emit multiple.
        if (derived) setMapError((prev) => prev ?? derived.slice(0, 260));
      });

      map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
      map.on("click", () => {
        try {
          popupRef.current?.remove?.();
        } catch {
          // ignore
        } finally {
          popupRef.current = null;
          setSelectedPlaceKey(null);
        }
      });

      const markerById = markersRef.current;
      markerById.clear();
      for (const value of placeMarkersRef.current.values()) {
        try {
          value.marker?.remove?.();
        } catch {
          // ignore
        }
      }
      placeMarkersRef.current.clear();

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
    })();

    return () => {
      cancelled = true;
      if (initTimer) {
        try {
          window.clearTimeout(initTimer);
        } catch {
          // ignore
        }
        initTimer = null;
      }
      try {
        resizeObserver?.disconnect?.();
      } catch {
        // ignore
      } finally {
        resizeObserver = null;
      }
      try {
        mapboxglRef.current = null;
        mapRef.current?.remove?.();
      } catch {
        // ignore
      } finally {
        mapRef.current = null;
      }
    };
    // We intentionally do NOT depend on `venues` (array identity changes) to avoid cancelling
    // the async map initialization mid-flight on initial renders / fast refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveMapEnabled, validCoordsKey]);

  useEffect(() => {
    if (!effectiveMapEnabled) return;
    const map = mapRef.current;
    if (!map) return;
    // Ensure the map reflows when the left panel switches between list/detail.
    try {
      requestAnimationFrame(() => {
        try {
          map.resize?.();
          map.triggerRepaint?.();
        } catch {
          // ignore
        }
      });
    } catch {
      // ignore
    }
  }, [effectiveMapEnabled, detailMode]);

  useEffect(() => {
    // Reset premium panel + pins when switching venues.
    setOwlPanelMode("teaser");
    setOwlPremiumError(null);
    setOwlPremiumLoadingVenueId(null);
    setActivePinCategories([]);
    setSelectedPlaceKey(null);
    for (const value of placeMarkersRef.current.values()) {
      try {
        value.marker?.remove?.();
      } catch {
        // ignore
      }
    }
    placeMarkersRef.current.clear();
    try {
      popupRef.current?.remove?.();
    } catch {
      // ignore
    } finally {
      popupRef.current = null;
    }
  }, [selectedVenueId]);

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

  useEffect(() => {
    for (const [key, value] of placeMarkersRef.current.entries()) {
      const el = value.marker?.getElement?.() as HTMLElement | null;
      const inner = el?.querySelector?.(`.${styles.placeMarker}`) as HTMLElement | null;
      if (!inner) continue;
      if (key === selectedPlaceKey) inner.classList.add(styles.placeMarkerSelected);
      else inner.classList.remove(styles.placeMarkerSelected);
    }
  }, [selectedPlaceKey]);

  useEffect(() => {
    // Best-effort entitlement hint for button labeling (server still enforces access).
    // Keep it resilient if profile reads fail or RLS differs by env.
    let cancelled = false;
    setEntitlementTier("unknown");

    (async () => {
      try {
        const supabase = getSupabaseBrowserClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (cancelled) return;
        if (!user || !user.email_confirmed_at) {
          setEntitlementTier("explorer");
          return;
        }

        const { data: profile } = await (supabase.from("ti_users" as any) as any)
          .select("plan,subscription_status,current_period_end,trial_ends_at")
          .eq("id", user.id)
          .maybeSingle();

        if (cancelled) return;
        setEntitlementTier(getTier(user, (profile ?? null) as any) as TiTier);
      } catch {
        if (!cancelled) setEntitlementTier("unknown");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedVenueId]);

  const venueLocation = (v: MapVenue) => [v.city, v.state].filter(Boolean).join(", ") || "Location TBA";
  const countsLine = (v: MapVenue) => {
    if (!v.hasOwl || !v.counts) return null;
    const parts = [`☕ ${v.counts.coffee}`, `🍔 ${v.counts.food}`];
    if (v.counts.hotels) parts.push(`🏨 ${v.counts.hotels}`);
    return parts.join(" • ");
  };
  const enhancedCounts = (v: MapVenue) => {
    if (!v.hasOwl || !v.counts) return null;
    const parts: string[] = [];
    if (v.counts.quick_eats) parts.push(`🌮 ${v.counts.quick_eats} quick eats`);
    if (v.counts.hangouts) parts.push(`🎳 ${v.counts.hangouts} hangouts`);
    return parts.length ? parts.join(" • ") : null;
  };

  const primaryVenue = venues[0] ?? null;
  const hotelVenueId = selectedVenue?.id ?? primaryVenue?.id ?? null;

  const formatDistance = (meters: number | null) => {
    if (typeof meters !== "number" || !Number.isFinite(meters)) return null;
    const miles = meters / 1609.344;
    if (miles < 0.1) return `${Math.round(meters)} m`;
    return `${miles.toFixed(miles >= 10 ? 0 : 1)} mi`;
  };

  const emojiForCategory = (cat: OwlCategory) => {
    if (cat === "coffee") return "☕";
    if (cat === "food") return "🍔";
    if (cat === "hotels") return "🏨";
    // Match the existing venue-map Owl’s Eye iconography.
    if (cat === "quick_eats") return "🌮";
    if (cat === "hangouts") return "🎳";
    return "⚽";
  };

  const labelForCategory = (cat: OwlCategory) => {
    if (cat === "coffee") return "Coffee nearby";
    if (cat === "food") return "Food nearby";
    if (cat === "hotels") return "Hotels nearby";
    if (cat === "quick_eats") return "Quick eats nearby";
    if (cat === "hangouts") return "Hangouts nearby";
    return "Sporting goods nearby";
  };

  const fetchPremiumNearby = async (venueId: string): Promise<OwlPremiumResponse> => {
    const url = new URL(`/api/venues/${encodeURIComponent(venueId)}/owls-eye-premium`, window.location.origin);
    url.searchParams.set("tournamentSlug", tournament.slug);
    const resp = await fetch(url.toString(), { method: "GET" });
    const json = (await resp.json().catch(() => null)) as any;
    if (!json || typeof json !== "object") {
      return { ok: false, error: "invalid_response" };
    }
    if (json.ok === true) return json as OwlPremiumResponse;
    return { ok: false, error: String(json.error ?? "unknown"), tier: (json.tier as TiTier | undefined) ?? "unknown" };
  };

  const buildSafeDirectionsUrl = (item: OwlPlace) => {
    const raw = String(item.maps_url ?? "").trim();
    if (raw) {
      try {
        const parsed = new URL(raw);
        const host = parsed.hostname.toLowerCase();
        // Avoid provider-owned URLs that can prompt for login (e.g. Foursquare app links).
        if (host.endsWith("foursquare.com") || host.endsWith("app.foursquare.com")) {
          // fall through to Google Maps builder below
        } else {
          return raw;
        }
      } catch {
        // fall through
      }
    }

    const name = String(item.name ?? "").trim();
    const address = String(item.address ?? "").trim();
    const lat = item.place_latitude;
    const lng = item.place_longitude;

    const query =
      typeof lat === "number" &&
      typeof lng === "number" &&
      Number.isFinite(lat) &&
      Number.isFinite(lng)
        ? `${lat},${lng}`
        : [name, address].filter(Boolean).join(" ");

    if (!query) return null;
    const url = new URL("https://www.google.com/maps/search/");
    url.searchParams.set("api", "1");
    url.searchParams.set("query", query);
    return url.toString();
  };

  const buildGoogleSearchUrl = (args: { item: OwlPlace; venue: MapVenue | null }) => {
    const { item, venue } = args;
    const name = String(item.name ?? "").trim();
    const address = String(item.address ?? "").trim();
    const venueLoc = venue ? [venue.city, venue.state].filter(Boolean).join(", ") : "";

    const query = [name, address, venueLoc].filter(Boolean).join(" ");
    if (!query) return null;
    const url = new URL("https://www.google.com/search");
    url.searchParams.set("q", query);
    return url.toString();
  };

  const escapeHtml = (value: string) =>
    value
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");

  const openPlacePopup = (args: { venue: MapVenue; category: OwlCategory; item: OwlPlace }) => {
    const map = mapRef.current;
    const mapboxgl = mapboxglRef.current;
    if (!map || !mapboxgl) return;
    const { venue, category, item } = args;

    const placeId = (item.place_id ?? "").trim();
    const key = placeId ? `${venue.id}:${placeId}` : null;
    if (key) setSelectedPlaceKey(key);

    const lat = item.place_latitude;
    const lng = item.place_longitude;
    if (typeof lat !== "number" || typeof lng !== "number" || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      return;
    }

    try {
      popupRef.current?.remove?.();
    } catch {
      // ignore
    } finally {
      popupRef.current = null;
    }

    const title = escapeHtml((item.name ?? "").trim() || "Nearby place");
    const address = escapeHtml((item.address ?? "").trim());
    const distance = formatDistance(item.distance_meters);
    const distanceHtml = distance ? escapeHtml(distance) : "";
    const mapsUrl = buildSafeDirectionsUrl(item);
    const searchUrl = buildGoogleSearchUrl({ item, venue });
    const directionsHtml = mapsUrl
      ? `<a class="${styles.popupLink}" href="${escapeHtml(mapsUrl)}" target="_blank" rel="noopener noreferrer">Directions</a>`
      : "";
    const searchHtml = searchUrl
      ? `<a class="${styles.popupLinkSecondary}" href="${escapeHtml(searchUrl)}" target="_blank" rel="noopener noreferrer">Search</a>`
      : "";
    const actionsHtml =
      directionsHtml || searchHtml
        ? `<div class="${styles.popupFooter}">${directionsHtml}${directionsHtml && searchHtml ? " " : ""}${searchHtml}</div>`
        : "";

    const html = `
      <div class="${styles.popupBody}">
        <div class="${styles.popupTitle}">${emojiForCategory(category)} ${title}</div>
        ${distanceHtml || address ? `<div class="${styles.popupMeta}">${distanceHtml}${distanceHtml && address ? " • " : ""}${address}</div>` : ""}
        ${actionsHtml}
      </div>
    `.trim();

    // closeOnClick=false to prevent marker clicks from immediately closing the popup in some browsers.
    const popup = new mapboxgl.Popup({ closeButton: true, closeOnClick: false, anchor: "top", offset: 12, maxWidth: "280px" });
    popup.addClassName(styles.placePopup);
    popup.setLngLat([lng, lat]).setHTML(html).addTo(map);
    popupRef.current = popup;
  };

  const ensurePremiumLoadedForSelectedVenue = async () => {
    const v = selectedVenue;
    if (!v) return;
    if (owlPremiumByVenueId[v.id]?.ok) return;
    setOwlPremiumError(null);
    setOwlPremiumLoadingVenueId(v.id);
    const result = await fetchPremiumNearby(v.id);
    setOwlPremiumLoadingVenueId(null);
    setOwlPremiumByVenueId((prev) => ({ ...prev, [v.id]: result }));
    return result;
  };

  const openPremiumPanel = async () => {
    const v = selectedVenue;
    if (!v) return;

    const isDemoVenue = v.id === DEMO_STARFIRE_VENUE_ID;
    const hasPreviewTournament = isPremiumPreviewTournamentSlug(tournament.slug);
    const canViewPremiumDetails = entitlementTier === "weekend_pro" || isDemoVenue || hasPreviewTournament;

    if (!canViewPremiumDetails) {
      setOwlPanelMode("unlock");
      void trackTiEvent("owls_eye_unlock_prompt_shown", {
        page_type: "venue_map",
        tournament_id: tournament.id,
        tournament_slug: tournament.slug,
        venue_id: v.id,
        tier: entitlementTier,
      });
      setOwlPremiumError(
        entitlementTier === "insider"
          ? "Upgrade to Weekend Pro to view full nearby lists."
          : entitlementTier === "explorer"
            ? null
            : "Weekend Pro required to view full nearby lists."
      );
      return;
    }

    const result = (await ensurePremiumLoadedForSelectedVenue()) ?? owlPremiumByVenueId[v.id] ?? null;
    const tier: TiTier = (result && "tier" in result && result.tier ? result.tier : "unknown") as TiTier;

    if (result && result.ok) {
      setOwlPanelMode("premium");
      void trackTiEvent("owls_eye_full_opened", {
        page_type: "venue_map",
        tournament_id: tournament.id,
        tournament_slug: tournament.slug,
        venue_id: v.id,
        tier,
      });
      if (!result.groups || Object.keys(result.groups).length === 0) {
        setOwlPremiumError("No nearby results captured yet for this venue.");
      }
      return;
    }

    setOwlPanelMode("unlock");
    void trackTiEvent("owls_eye_unlock_prompt_shown", {
      page_type: "venue_map",
      tournament_id: tournament.id,
      tournament_slug: tournament.slug,
      venue_id: v.id,
      tier,
    });
    setOwlPremiumError(
      tier === "insider"
        ? "Upgrade to Weekend Pro to view full nearby lists."
        : tier === "explorer"
          ? null
          : "Weekend Pro required to view full nearby lists."
    );
  };

  const togglePins = (category: OwlCategory, enabled: boolean) => {
    const v = selectedVenue;
    if (!v) return;
    const cached = owlPremiumByVenueId[v.id];
    if (!cached || !cached.ok) return;
    const group = cached.groups?.[category];
    if (!group) return;

    const tier = cached.tier ?? "unknown";
    void trackTiEvent("owls_eye_category_pins_enabled", {
      page_type: "venue_map",
      tournament_id: tournament.id,
      tournament_slug: tournament.slug,
      venue_id: v.id,
      category,
      enabled,
      tier,
    });

    const mapboxgl = mapboxglRef.current;
    const map = mapRef.current;
    if (!mapboxgl || !map) return;

    if (!enabled) {
      setActivePinCategories((prev) => prev.filter((c) => c !== category));
      for (const [key, value] of placeMarkersRef.current.entries()) {
        if (value.category !== category) continue;
        try {
          value.marker?.remove?.();
        } catch {
          // ignore
        }
        placeMarkersRef.current.delete(key);
      }
      return;
    }

    setActivePinCategories((prev) => (prev.includes(category) ? prev : [...prev, category]));
    const pinLimit = 50;
    const candidates = (group.items ?? [])
      .filter((item) => typeof item.place_latitude === "number" && typeof item.place_longitude === "number")
      .slice(0, pinLimit);

    for (const item of candidates) {
      const placeId = (item.place_id ?? "").trim();
      if (!placeId) continue;
      const key = `${v.id}:${placeId}`;
      if (placeMarkersRef.current.has(key)) continue;

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = styles.placeMarkerBtn;
      btn.setAttribute("aria-label", item.name ? `Show ${item.name}` : "Show nearby place");

      const inner = document.createElement("div");
      inner.className = styles.placeMarker;
      inner.textContent = emojiForCategory(category);

      btn.appendChild(inner);
      btn.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        if (typeof item.place_longitude === "number" && typeof item.place_latitude === "number") {
          try {
            map.flyTo({ center: [item.place_longitude, item.place_latitude], zoom: Math.max(map.getZoom?.() ?? 12, 12), speed: 1.2 });
          } catch {
            // ignore
          }
        }
        setSelectedPlaceKey(key);
        openPlacePopup({ venue: v, category, item });
      });

      const marker = new mapboxgl.Marker({ element: btn, anchor: "bottom" })
        .setLngLat([item.place_longitude as number, item.place_latitude as number])
        .addTo(map);
      placeMarkersRef.current.set(key, { marker, category });
    }
  };

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
                        {enhancedCounts(v) ? <div className={styles.venueCounts}>{enhancedCounts(v)}</div> : null}
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
                  {enhancedCounts(selectedVenue) ? (
                    <div className={styles.venueCounts}>
                      {enhancedCounts(selectedVenue)}
                    </div>
                  ) : null}
                  <div style={{ fontSize: 12, opacity: 0.86, marginTop: 8 }}>
                    Tap to see coffee, food, hotels, and more on the map.
                  </div>
                </div>
              ) : null}

              <div className={styles.primaryOwlCtaRow}>
                {entitlementTier === "weekend_pro" ||
                selectedVenue.id === DEMO_STARFIRE_VENUE_ID ||
                isPremiumPreviewTournamentSlug(tournament.slug) ? (
                  <button
                    type="button"
                    className={styles.primaryOwlCta}
                    onClick={() => void openPremiumPanel()}
                    disabled={owlPremiumLoadingVenueId === selectedVenue.id}
                  >
                    {owlPremiumLoadingVenueId === selectedVenue.id ? "Loading Owl’s Eye…" : "View full Owl’s Eye map →"}
                  </button>
                ) : (
                  <WeekendProUpgradeModalTrigger
                    className={styles.primaryOwlCta}
                    source_page="venue_map"
                    source_context="map_primary_owlseye_unlock"
                    tournament_slug={tournament.slug}
                    venue_slug={selectedVenue.seo_slug ?? selectedVenue.id}
                    entry_point="map_primary_owlseye_unlock_modal"
                    cta_label="Upgrade to Weekend Pro"
                    label="Unlock full Owl’s Eye →"
                    user_tier={entitlementTier}
                    has_affiliate_visible={false}
                  />
                )}
              </div>

              {hotelVenueId ? (
                <div className={styles.stayBlock}>
                  <div className={styles.stayTitle}>Stay near this venue</div>
                  <div className={styles.staySub}>Compare hotels and rentals closest to where you’ll play.</div>
                  <div className={styles.ctaRow}>
                    <a
                      className={styles.cta}
                      href={`/go/hotels?venueId=${encodeURIComponent(hotelVenueId)}&tournamentId=${encodeURIComponent(tournament.id)}`}
                      target="_blank"
                      rel="noopener noreferrer sponsored"
                      onClick={() => {
                        void trackTiEvent("venue_map_hotels_clicked", {
                          page_type: "venue_map",
                          tournament_id: tournament.id,
                          tournament_slug: tournament.slug,
                          venue_id: hotelVenueId,
                        });
                      }}
                    >
                      View nearby hotels
                    </a>
                    <a
                      className={`${styles.cta} ${styles.ctaSecondary}`}
                      href={`/go/vrbo?venueId=${encodeURIComponent(hotelVenueId)}&tournamentId=${encodeURIComponent(tournament.id)}`}
                      target="_blank"
                      rel="noopener noreferrer sponsored"
                    >
                      Search Vrbo rentals
                    </a>
                  </div>
                </div>
              ) : null}

              <div className={styles.ctaRow}>
                <ShareWeekendButton
                  tournamentSlug={tournament.slug}
                  tournamentName={tournament.name}
                  venueLabel={selectedVenue.name ? `${selectedVenue.name}${venueLocation(selectedVenue) ? ` (${venueLocation(selectedVenue)})` : ""}` : null}
                  venue={selectedVenue.seo_slug ?? selectedVenue.id}
                  sourcePage="venue_map"
                  buttonLabel="Share this plan"
                  className={`${styles.cta} ${styles.ctaSecondary}`}
                />

                {selectedVenue.seo_slug ? (
                  <Link
                    className={`${styles.cta} ${styles.ctaSecondary}`}
                    href={`/venues/${selectedVenue.seo_slug}?tournament=${encodeURIComponent(tournament.slug)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open venue page →
                  </Link>
                ) : null}
              </div>

                {owlPanelMode === "premium" && selectedVenue ? (
                  (() => {
                    const payload = owlPremiumByVenueId[selectedVenue.id];
                    if (!payload || !payload.ok) return null;
                    const tier: TiTier = payload.tier ?? "unknown";
                  const groups = payload.groups ?? {};
                  const ordered: OwlCategory[] = ["coffee", "food", "hotels", "quick_eats", "hangouts", "sporting_goods"];
                  const visible = ordered.filter((c) => (groups[c]?.count ?? 0) > 0);
                  if (visible.length === 0) {
                    return (
                      <div className={styles.owlPanelNote}>
                        {owlPremiumError ?? "No nearby results captured yet for this venue."}
                      </div>
                    );
                  }

                  return (
                    <div className={styles.owlPanel}>
                      {owlPremiumError ? <div className={styles.owlPanelNote}>{owlPremiumError}</div> : null}
                      {visible.map((cat) => {
                        const group = groups[cat]!;
                        const hasCoords = Boolean(group.has_coords);
                        const pinsEnabled = activePinCategories.includes(cat);
                        return (
                          <details
                            key={`owl-${selectedVenue.id}-${cat}`}
                            className={styles.owlCategory}
                            onToggle={(e) => {
                              const open = (e.currentTarget as HTMLDetailsElement).open;
                              if (open) {
                                void trackTiEvent("owls_eye_category_expanded", {
                                  page_type: "venue_map",
                                  tournament_id: tournament.id,
                                  tournament_slug: tournament.slug,
                                  venue_id: selectedVenue.id,
                                  category: cat,
                                  tier,
                                });
                              }
                            }}
                          >
                            <summary className={styles.owlCategorySummary}>
                              <span className={styles.owlCategoryLeft}>
                                <span className={styles.owlCategoryIcon} aria-hidden="true">
                                  {emojiForCategory(cat)}
                                </span>
                                <span className={styles.owlCategoryLabel}>{labelForCategory(cat)}</span>
                                <span className={styles.owlCategoryCount}>({group.count})</span>
                              </span>
                              {hasCoords ? (
                                <button
                                  type="button"
                                  className={`${styles.owlPinsBtn} ${pinsEnabled ? styles.owlPinsBtnOn : ""}`}
                                  onClick={(ev) => {
                                    ev.preventDefault();
                                    ev.stopPropagation();
                                    togglePins(cat, !pinsEnabled);
                                  }}
                                >
                                  {pinsEnabled ? "Hide pins" : "Show pins"}
                                </button>
                              ) : (
                                <span className={styles.owlPinsDisabled}>No pins</span>
                              )}
                            </summary>
                            <div className={styles.owlList}>
                              {group.items.slice(0, 50).map((item, idx) => {
                                const placeId = (item.place_id ?? "").trim();
                                const key = placeId ? `${selectedVenue.id}:${placeId}` : `${selectedVenue.id}:${cat}:${idx}`;
                                const hasCoordsItem =
                                  typeof item.place_latitude === "number" &&
                                  typeof item.place_longitude === "number" &&
                                  Number.isFinite(item.place_latitude) &&
                                  Number.isFinite(item.place_longitude);
                                const distance = formatDistance(item.distance_meters);
                                return (
                                  <div className={styles.owlRow} key={`owl-row-${key}`}>
                                    <div className={styles.owlRowMain}>
                                      <div className={styles.owlRowName}>{item.name ?? "Unnamed place"}</div>
                                      <div className={styles.owlRowMeta}>
                                        {distance ? <span>{distance}</span> : null}
                                        {distance && item.address ? <span> • </span> : null}
                                        {item.address ? <span>{item.address}</span> : null}
                                      </div>
                                    </div>
                                    <div className={styles.owlRowActions}>
                                      <button
                                        type="button"
                                        className={styles.owlActionBtn}
                                        disabled={!hasCoordsItem}
                                        onClick={() => {
                                          setSelectedPlaceKey(placeId ? `${selectedVenue.id}:${placeId}` : null);
                                          if (!hasCoordsItem) return;
                                          const map = mapRef.current;
                                          if (map) {
                                            try {
                                              map.flyTo({
                                                center: [item.place_longitude as number, item.place_latitude as number],
                                                zoom: Math.max(map.getZoom?.() ?? 12, 12),
                                                speed: 1.2,
                                              });
                                            } catch {
                                              // ignore
                                            }
                                          }
                                          openPlacePopup({ venue: selectedVenue, category: cat, item });
                                          void trackTiEvent("owls_eye_result_selected", {
                                            page_type: "venue_map",
                                            tournament_id: tournament.id,
                                            tournament_slug: tournament.slug,
                                            venue_id: selectedVenue.id,
                                            category: cat,
                                            has_coords: true,
                                            tier,
                                          });
                                        }}
                                      >
                                        Show
                                      </button>
                                      {(() => {
                                        const href = buildGoogleSearchUrl({ item, venue: selectedVenue });
                                        if (!href) return null;
                                        return (
                                          <a
                                            className={styles.owlActionLink}
                                            href={href}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                          >
                                            Search
                                          </a>
                                        );
                                      })()}
                                      {(() => {
                                        const href = buildSafeDirectionsUrl(item);
                                        if (!href) return null;
                                        return (
                                        <a
                                          className={styles.owlActionLink}
                                          href={href}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          onClick={() => {
                                            void trackTiEvent("owls_eye_directions_clicked", {
                                              page_type: "venue_map",
                                              tournament_id: tournament.id,
                                              tournament_slug: tournament.slug,
                                              venue_id: selectedVenue.id,
                                              category: cat,
                                              tier,
                                            });
                                          }}
                                        >
                                          Directions
                                        </a>
                                        );
                                      })()}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </details>
                        );
                      })}
                    </div>
                  );
                })()
              ) : owlPanelMode === "unlock" && selectedVenue ? (
                <div className={styles.owlPanel}>
                  <div className={styles.owlPanelNote}>
                    {owlPremiumError ?? "You’re viewing limited results near this venue. Upgrade to see full nearby lists and directions."}
                  </div>
                  <div className={styles.owlUnlockRow}>
                    <WeekendProUpgradeModalTrigger
                      className={styles.owlUnlockBtn}
                      source_page="venue_map"
                      source_context="map_owlseye_locked"
                      tournament_slug={tournament.slug}
                      venue_slug={selectedVenue.seo_slug ?? selectedVenue.id}
                      entry_point="map_owlseye_unlock_modal"
                      cta_label="Upgrade to Weekend Pro"
                      label="Upgrade to Weekend Pro"
                      user_tier={entitlementTier}
                      has_affiliate_visible={false}
                    />
                    <a className={`${styles.owlUnlockBtn} ${styles.owlUnlockBtnSecondary}`} href="/premium">
                      Learn more
                    </a>
                  </div>
                </div>
              ) : null}
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
              <div className={styles.mapInner}>
                <div className={styles.mapCanvas} ref={containerRef} />
              </div>
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
