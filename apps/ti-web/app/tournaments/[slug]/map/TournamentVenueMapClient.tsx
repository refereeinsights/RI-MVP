"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import ShareWeekendButton from "@/components/ShareWeekendButton";
import { trackTiEvent } from "@/lib/tiAnalyticsClient";
import UpgradeWeekendProButton from "@/components/UpgradeWeekendProButton";
import WeekendProUpgradeModalTrigger from "@/components/premium/WeekendProUpgradeModalTrigger";
import { getTier } from "@/lib/entitlements";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";
import { DEMO_STARFIRE_VENUE_ID } from "@/lib/owlsEyeScores";
import { isPremiumPreviewTournamentSlug } from "@/lib/premiumPreview";
import { buildHotelsHref } from "@/lib/booking/venueBooking";
import NavigationChooser, { type NavProvider } from "./NavigationChooser";
import styles from "./TournamentVenueMap.module.css";

type VenueCounts = { coffee: number; food: number; hotels: number; quick_eats: number; hangouts: number };
type OwlCategory = "coffee" | "food" | "hotels" | "quick_eats" | "hangouts" | "sporting_goods";
type TiTier = "explorer" | "insider" | "weekend_pro" | "unknown";

type OwlPlace = {
  place_id: string | null;
  name: string | null;
  category: string | null;
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

type HotelPin = {
  propertyId: string;
  name: string;
  addressLine1?: string | null;
  city?: string | null;
  state?: string | null;
  distanceMiles?: number | null;
  rating?: number | null;
  reviewCount?: number | null;
  thumbnailUrl?: string | null;
  fromPrice?: number | null;
  currency?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  hotelIDTypeID?: number | null;
  detailUrl?: string | null;
  resolvedCheckIn: string | null;
  resolvedCheckOut: string | null;
  raw?: unknown;
};

type HotelSearchFallback = {
  showHotelFallback: boolean;
  showVrboFallback: boolean;
  reason?: "provider_error" | "low_inventory" | "no_dates" | "no_venue_coordinates";
};

type HotelSearchResponse = {
  sessionId?: string;
  provider?: string;
  hotels: HotelPin[];
  fallback?: HotelSearchFallback;
  resolvedCheckIn?: string | null;
  resolvedCheckOut?: string | null;
  error?: string;
  code?: string;
};

type TeamBlockFormState = {
  teamName: string;
  contactFirstName: string;
  contactLastName: string;
  email: string;
  phone: string;
  rooms: string;
  adultsPerRoom: string;
  childrenPerRoom: string;
  notes: string;
};

type TeamBlockSuccessState = {
  requestId: string | null;
};

const DEFAULT_TEAM_BLOCK_FORM: TeamBlockFormState = {
  teamName: "",
  contactFirstName: "",
  contactLastName: "",
  email: "",
  phone: "",
  rooms: "10",
  adultsPerRoom: "2",
  childrenPerRoom: "0",
  notes: "",
};

function buildVenueHotelsHref(args: {
  venue: MapVenue;
  tournamentId: string;
  source?: "venue_map" | "venue_card" | "preview_card";
}) {
  return buildHotelsHref({
    venueId: args.venue.id,
    tournamentId: args.tournamentId,
    source: String(args.source ?? "venue_map").trim() || "venue_map",
    provider: "hotelplanner",
    latitude: args.venue.latitude,
    longitude: args.venue.longitude,
  });
}

type NavSheetState = {
  open: boolean;
  title: string;
  destinationLabel: string;
  providerHrefs: Partial<Record<NavProvider, string>>;
  copyText: string | null;
  onProviderClick?: (provider: NavProvider) => void;
};

type NearestAirport = {
  id: string;
  name: string;
  municipality: string | null;
  iso_region: string | null;
  iso_country: string;
  iata_code: string | null;
  ident: string;
  latitude_deg: number;
  longitude_deg: number;
  distance_miles: number;
  is_major: boolean;
  is_commercial: boolean;
  scheduled_service: boolean;
  major_rank: number | null;
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
  tournament: { id: string; slug: string; name: string; sport: string | null; state: string | null };
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
  const previewMarkersRef = useRef<Map<string, { marker: any; category: OwlCategory }>>(new Map());
  const popupRef = useRef<any>(null);
  const venuesByIdRef = useRef<Map<string, MapVenue>>(new Map());
  const openVenueNavChooserRef = useRef<((venue: MapVenue, source: "venue_marker") => void) | null>(null);
  const hotelPinMarkersRef = useRef<Map<string, { marker: any }>>(new Map());
  const lodgingSearchInFlightRef = useRef(0);
  const teamBlockPanelRef = useRef<HTMLDivElement | null>(null);
  const teamBlockFirstInputRef = useRef<HTMLInputElement | null>(null);
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

  const selectedVenue = useMemo(() => venues.find((v) => v.id === selectedVenueId) ?? null, [venues, selectedVenueId]);

  useEffect(() => {
    venuesByIdRef.current = new Map(venues.map((v) => [v.id, v]));
  }, [venues]);
  const [owlPanelMode, setOwlPanelMode] = useState<"teaser" | "premium" | "unlock">("teaser");
  const [owlPremiumByVenueId, setOwlPremiumByVenueId] = useState<Record<string, OwlPremiumResponse | null>>({});
  const [owlPremiumLoadingVenueId, setOwlPremiumLoadingVenueId] = useState<string | null>(null);
  const [owlPremiumError, setOwlPremiumError] = useState<string | null>(null);
  const [activePinCategories, setActivePinCategories] = useState<OwlCategory[]>([]);
  const [selectedPlaceKey, setSelectedPlaceKey] = useState<string | null>(null);
  const [owlEyePreviewMode, setOwlEyePreviewMode] = useState<boolean>(false);
  const [owlPreviewByVenueId, setOwlPreviewByVenueId] = useState<Record<string, { loaded: boolean; items: OwlPlace[] } | null>>({});
  const [owlPreviewLoadingVenueId, setOwlPreviewLoadingVenueId] = useState<string | null>(null);
  const [selectedPreviewKey, setSelectedPreviewKey] = useState<string | null>(null);
  const [hotelPins, setHotelPins] = useState<HotelPin[]>([]);
  const [hotelPinsLoading, setHotelPinsLoading] = useState<boolean>(false);
  const [hotelPinsError, setHotelPinsError] = useState<string | null>(null);
  const [hotelPinsFallback, setHotelPinsFallback] = useState<HotelSearchFallback | null>(null);
  const [hotelSearchResolvedCheckIn, setHotelSearchResolvedCheckIn] = useState<string | null>(null);
  const [hotelSearchResolvedCheckOut, setHotelSearchResolvedCheckOut] = useState<string | null>(null);
  const [selectedHotelId, setSelectedHotelId] = useState<string | null>(null);
  const [hotelHandoffError, setHotelHandoffError] = useState<string | null>(null);
  const [hotelRatingFilter, setHotelRatingFilter] = useState<number>(0);
  const [isHotelResultsCollapsed, setIsHotelResultsCollapsed] = useState(true);
  const [hotelPinCap, setHotelPinCap] = useState<number>(10);
  const [mapHotelPinVisibleCount, setMapHotelPinVisibleCount] = useState<number>(0);
  const [teamBlockOpen, setTeamBlockOpen] = useState(false);
  const [teamBlockSubmitting, setTeamBlockSubmitting] = useState(false);
  const [teamBlockError, setTeamBlockError] = useState<string | null>(null);
  const [teamBlockSuccess, setTeamBlockSuccess] = useState<TeamBlockSuccessState | null>(null);
  const [teamBlockForm, setTeamBlockForm] = useState<TeamBlockFormState>(DEFAULT_TEAM_BLOCK_FORM);
  const [entitlementTier, setEntitlementTier] = useState<TiTier>("unknown");
  const [navSheet, setNavSheet] = useState<NavSheetState>(() => ({
    open: false,
    title: "",
    destinationLabel: "",
    providerHrefs: {},
    copyText: null,
  }));
  const [nearestAirportByVenueId, setNearestAirportByVenueId] = useState<Record<string, NearestAirport | null>>({});
  const [nearestAirportLoadingVenueId, setNearestAirportLoadingVenueId] = useState<string | null>(null);
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
  const filteredHotelPins = useMemo(
    () =>
      hotelPins.filter((pin) => {
        if (hotelRatingFilter <= 0) return true;
        const rating = pin.rating;
        return typeof rating === "number" && Number.isFinite(rating) && rating >= hotelRatingFilter;
      }),
    [hotelPins, hotelRatingFilter]
  );
  const hotelResultCount = hotelPins.length;
  const selectedHotelPin = useMemo(
    () => hotelPins.find((pin) => pin.propertyId === selectedHotelId) ?? null,
    [hotelPins, selectedHotelId]
  );

  useEffect(() => {
    if (openedTrackedRef.current) return;
    openedTrackedRef.current = true;
    void trackTiEvent("venue_map_opened", {
      page_type: "venue_map",
      tournament_id: tournament.id,
      tournament_slug: tournament.slug,
      sport: tournament.sport ?? null,
      state: tournament.state ?? null,
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
        const importMapbox = async () => await import("mapbox-gl");
        try {
          mod = await importMapbox();
        } catch (err) {
          // In dev, chunk URLs can go stale right after a server restart / HMR rebuild.
          // A short retry often resolves "Loading chunk ... failed" without requiring a hard refresh.
          await new Promise<void>((r) => setTimeout(r, 150));
          mod = await importMapbox();
        }
      } catch (err) {
        const msg = String((err as any)?.message ?? err ?? "unknown");
        const isChunkLoad = /Loading chunk|ChunkLoadError|_next\/undefined/i.test(msg);
        setMapError(
          isChunkLoad
            ? `Failed to load map library (chunk load). If you just restarted the dev server, do a hard refresh and try again. (${msg})`
            : `Failed to load map library: ${msg}`
        );
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
            if (validCoords.length === 1) {
              const only = validCoords[0];
              map.easeTo({ center: [only.lng, only.lat], zoom: 12, duration: 0 });
              return;
            }

            const bounds = new mapboxgl.LngLatBounds();
            for (const v of validCoords) bounds.extend([v.lng, v.lat]);
            const isDesktop = window.matchMedia("(min-width: 900px)").matches;
            map.fitBounds(bounds, {
              // Panel is a separate column (not an overlay), so keep padding symmetric.
              padding: isDesktop ? { top: 80, bottom: 80, left: 80, right: 80 } : { top: 70, bottom: 70, left: 50, right: 50 },
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

        btn.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();

          setSelectedVenueId(v.id);
          setDetailMode(true);

          const venue = venuesByIdRef.current.get(v.id) ?? null;
          if (venue) {
            void trackTiEvent("venue_select", {
              page_type: "venue_map",
              tournament_id: tournament.id,
              tournament_slug: tournament.slug,
              venue_id: venue.id,
              venue_name: venue.name ?? null,
              source: "venue_marker",
              hasCoordinates: typeof venue.latitude === "number" && typeof venue.longitude === "number",
              hasOwlEyeData: Boolean(venue.hasOwl),
            });
          }

          // Show a small popup so users can open the navigation chooser directly from the map.
          try {
            popupRef.current?.remove?.();
          } catch {
            // ignore
          } finally {
            popupRef.current = null;
            setSelectedPlaceKey(null);
          }

          if (!venue) return;
          const openChooser = openVenueNavChooserRef.current;
          if (!openChooser) return;

          const popupRoot = document.createElement("div");
          popupRoot.className = styles.venuePopup;

          const title = document.createElement("div");
          title.className = styles.venuePopupTitle;
          title.textContent = venue.name?.trim() || "Tournament venue";

          const meta = document.createElement("div");
          meta.className = styles.venuePopupMeta;
          meta.textContent = [venue.city, venue.state].filter(Boolean).join(", ") || "Location TBA";

          const actions = document.createElement("div");
          actions.className = styles.venuePopupActions;

          const directionsBtn = document.createElement("button");
          directionsBtn.type = "button";
          directionsBtn.className = styles.venuePopupBtn;
          directionsBtn.textContent = "Directions";
          directionsBtn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            openChooser(venue, "venue_marker");
            try {
              popupRef.current?.remove?.();
            } catch {
              // ignore
            } finally {
              popupRef.current = null;
            }
          });

          actions.appendChild(directionsBtn);
          popupRoot.appendChild(title);
          popupRoot.appendChild(meta);
          popupRoot.appendChild(actions);

          try {
            // closeOnClick=false to prevent marker clicks from immediately closing the popup in some browsers.
            const popup = new mapboxgl.Popup({ closeButton: true, closeOnClick: false, anchor: "top", offset: 12, maxWidth: "280px" });
            popup.addClassName(styles.placePopup);
            popup.setLngLat([v.lng, v.lat]).setDOMContent(popupRoot).addTo(map);
            popupRef.current = popup;
          } catch {
            // ignore
          }
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
    setSelectedPreviewKey(null);
    for (const value of previewMarkersRef.current.values()) {
      try {
        value.marker?.remove?.();
      } catch {
        // ignore
      }
    }
    previewMarkersRef.current.clear();
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

  const normalizeCategoryForPreview = (raw: string | null | undefined): OwlCategory | null => {
    const v = String(raw ?? "").trim().toLowerCase();
    if (!v) return null;
    if (v === "coffee") return "coffee";
    if (v === "quick_eats") return "quick_eats";
    if (v === "hangouts") return "hangouts";
    if (v === "hotel" || v === "hotels") return "hotels";
    if (v === "food") return "food";
    return null;
  };

  const fetchLimitedPreviewPlaces = async (venueId: string) => {
    if (owlPreviewLoadingVenueId === venueId) return null;
    setOwlPreviewLoadingVenueId(venueId);
    try {
      const url = new URL(`/api/venues/${encodeURIComponent(venueId)}/owls-eye-places`, window.location.origin);
      // Request only the categories we might use in limited preview.
      url.searchParams.set("categories", ["hotel", "hotels", "quick_eats", "hangouts", "coffee", "food"].join(","));
      const resp = await fetch(url.toString(), { method: "GET" });
      const json = (await resp.json().catch(() => null)) as any;
      const places = (json?.places as OwlPlace[] | undefined) ?? [];
      if (!Array.isArray(places)) {
        setOwlPreviewByVenueId((prev) => ({ ...prev, [venueId]: { loaded: true, items: [] } }));
        return [];
      }
      setOwlPreviewByVenueId((prev) => ({ ...prev, [venueId]: { loaded: true, items: places } }));
      return places;
    } catch {
      setOwlPreviewByVenueId((prev) => ({ ...prev, [venueId]: { loaded: true, items: [] } }));
      return [];
    } finally {
      setOwlPreviewLoadingVenueId((cur) => (cur === venueId ? null : cur));
    }
  };

  const pickPreviewPins = (venue: MapVenue, items: OwlPlace[]) => {
    const groups = new Map<OwlCategory, OwlPlace[]>();
    for (const item of items) {
      const cat = normalizeCategoryForPreview((item as any)?.category);
      if (!cat) continue;
      const hasCoordsItem = typeof item.place_latitude === "number" && typeof item.place_longitude === "number";
      if (!hasCoordsItem) continue;
      const list = groups.get(cat) ?? [];
      list.push(item);
      groups.set(cat, list);
    }

    const sortByDistance = (a: OwlPlace, b: OwlPlace) => {
      const da = typeof a.distance_meters === "number" ? a.distance_meters : Number.POSITIVE_INFINITY;
      const db = typeof b.distance_meters === "number" ? b.distance_meters : Number.POSITIVE_INFINITY;
      if (da !== db) return da - db;
      return String(a.name ?? "").localeCompare(String(b.name ?? ""));
    };
    for (const [cat, list] of groups.entries()) {
      list.sort(sortByDistance);
      groups.set(cat, list);
    }

    const hangoutKeyword = /\b(brewery|breweries|taproom|tap room|brewpub|brew pub)\b/i;
    const pickHangout = () => {
      const list = groups.get("hangouts") ?? [];
      if (!list.length) return null;
      const matching = list.filter((i) => hangoutKeyword.test(String(i.name ?? "")));
      return (matching.length ? matching : list)[0] ?? null;
    };

    const picks: Array<{ category: OwlCategory; item: OwlPlace }> = [];
    const tryAdd = (category: OwlCategory, item: OwlPlace | null) => {
      if (!item) return;
      picks.push({ category, item });
    };

    tryAdd("hotels", (groups.get("hotels") ?? [])[0] ?? null);
    tryAdd("quick_eats", (groups.get("quick_eats") ?? [])[0] ?? null);
    tryAdd("hangouts", pickHangout());
    tryAdd("coffee", (groups.get("coffee") ?? [])[0] ?? null);

    // Fill open slots with food as fallback, max 4 total.
    if (picks.length < 4) {
      const food = (groups.get("food") ?? [])[0] ?? null;
      if (food) picks.push({ category: "food", item: food });
    }

    const capped = picks.slice(0, 4);
    return capped.map((p) => ({
      ...p,
      key: `${venue.id}:${String((p.item as any)?.place_id ?? "").trim() || p.item.name || p.category}`,
    }));
  };

  const pickPreviewListItems = (venue: MapVenue, items: OwlPlace[]) => {
    const groups = new Map<OwlCategory, OwlPlace[]>();
    for (const item of items) {
      const cat = normalizeCategoryForPreview((item as any)?.category);
      if (!cat) continue;
      const list = groups.get(cat) ?? [];
      list.push(item);
      groups.set(cat, list);
    }

    const sortByDistance = (a: OwlPlace, b: OwlPlace) => {
      const da = typeof a.distance_meters === "number" ? a.distance_meters : Number.POSITIVE_INFINITY;
      const db = typeof b.distance_meters === "number" ? b.distance_meters : Number.POSITIVE_INFINITY;
      if (da !== db) return da - db;
      return String(a.name ?? "").localeCompare(String(b.name ?? ""));
    };
    for (const [cat, list] of groups.entries()) {
      list.sort(sortByDistance);
      groups.set(cat, list);
    }

    const hangoutKeyword = /\b(brewery|breweries|taproom|tap room|brewpub|brew pub)\b/i;
    const pickHangout = () => {
      const list = groups.get("hangouts") ?? [];
      if (!list.length) return null;
      const matching = list.filter((i) => hangoutKeyword.test(String(i.name ?? "")));
      return (matching.length ? matching : list)[0] ?? null;
    };

    const picks: Array<{ category: OwlCategory; item: OwlPlace }> = [];
    const tryAdd = (category: OwlCategory, item: OwlPlace | null) => {
      if (!item) return;
      picks.push({ category, item });
    };

    tryAdd("hotels", (groups.get("hotels") ?? [])[0] ?? null);
    tryAdd("quick_eats", (groups.get("quick_eats") ?? [])[0] ?? null);
    tryAdd("hangouts", pickHangout());
    tryAdd("coffee", (groups.get("coffee") ?? [])[0] ?? null);

    if (picks.length < 4) {
      const food = (groups.get("food") ?? [])[0] ?? null;
      if (food) picks.push({ category: "food", item: food });
    }

    const capped = picks.slice(0, 4);
    return capped.map((p) => ({
      ...p,
      key: `${venue.id}:${String((p.item as any)?.place_id ?? "").trim() || p.item.name || p.category}`,
    }));
  };

  const renderPreviewPins = (venue: MapVenue, pins: Array<{ key: string; category: OwlCategory; item: OwlPlace }>) => {
    const mapboxgl = mapboxglRef.current;
    const map = mapRef.current;
    if (!mapboxgl || !map) return;

    for (const value of previewMarkersRef.current.values()) {
      try {
        value.marker?.remove?.();
      } catch {
        // ignore
      }
    }
    previewMarkersRef.current.clear();

    for (const pin of pins) {
      const item = pin.item;
      const lat = item.place_latitude;
      const lng = item.place_longitude;
      if (typeof lat !== "number" || typeof lng !== "number") continue;

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = styles.placeMarkerBtn;
      btn.setAttribute("aria-label", item.name ? `Preview ${item.name}` : "Preview nearby place");

      const inner = document.createElement("div");
      inner.className = `${styles.placeMarker} ${styles.placeMarkerPreview}`;
      inner.textContent = emojiForCategory(pin.category);

      btn.appendChild(inner);
      btn.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        setSelectedPreviewKey(pin.key);
        void trackTiEvent("owls_eye_preview_pin_click", {
          page_type: "venue_map",
          tournament_id: tournament.id,
          tournament_slug: tournament.slug,
          venue_id: venue.id,
          category: pin.category,
          has_coords: true,
        });
        // Do not pan/zoom on pin click (prevents the map from shifting unexpectedly after the user already targeted a pin).
        // Match the Weekend Pro pin interaction: show the on-map popup with actions.
        openPlacePopup({ venue, category: pin.category, item, tier: entitlementTier, isPreview: true });
      });

      const marker = new mapboxgl.Marker({ element: btn, anchor: "bottom" }).setLngLat([lng, lat]).addTo(map);
      previewMarkersRef.current.set(pin.key, { marker, category: pin.category });
    }
  };

  const trackLodgingEvent = (name: string, properties: Record<string, unknown>) => {
    void trackTiEvent(name as Parameters<typeof trackTiEvent>[0], properties as never);
  };

  const loadHotelPinsForVenue = async (venue: MapVenue) => {
    if (!venue) return;
    const runId = ++lodgingSearchInFlightRef.current;
    setHotelPinsLoading(true);
    setHotelPinsError(null);
    setHotelPinsFallback(null);
    setHotelPins([]);
    setHotelHandoffError(null);
    setSelectedHotelId(null);
    setHotelSearchResolvedCheckIn(null);
    setHotelSearchResolvedCheckOut(null);
    setMapHotelPinVisibleCount(0);
    clearHotelMarkers();

    try {
      const res = await fetch(new URL("/api/lodging/search", window.location.origin), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          venueId: venue.id,
          tournamentId: tournament.id,
          source: "venue_map",
          kw: "Tournament weekend stay",
          sc: "tournamentinsights",
        }),
      }).then(async (r) => {
        const payload = await r.json().catch(() => null);
        const data = (payload ?? {}) as HotelSearchResponse;
        if (!r.ok) {
          const fallback: HotelSearchFallback = { showHotelFallback: true, showVrboFallback: true, reason: "provider_error" };
          return {
            ok: false,
            status: r.status,
            data,
            fallback,
          } as const;
        }
        return { ok: true, status: r.status, data } as const;
      });

      if (runId !== lodgingSearchInFlightRef.current) return;

      if (!res.ok) {
        if (res.status === 429) {
          setHotelPinsFallback({ showHotelFallback: true, showVrboFallback: true, reason: "provider_error" });
          setHotelPinsError("Search temporarily unavailable. Please try again shortly.");
          setMapHotelPinVisibleCount(0);
          trackLodgingEvent("lodging_map_impression", {
            page_type: "venue_map",
            tournament_id: tournament.id,
            venue_id: venue.id,
            provider: "hotelplanner",
            result_count: 0,
            session_id: null,
            status: "rate_limited",
          });
          trackLodgingEvent("hotel_pin_impression", {
            page_type: "venue_map",
            tournament_id: tournament.id,
            venue_id: venue.id,
            count: 0,
            status: "rate_limited",
          });
          return;
        }
        setHotelPinsError(res.data.error ? String(res.data.error) : "Unable to load hotels right now.");
        setHotelPinsFallback(res.fallback ?? { showHotelFallback: true, showVrboFallback: true });
        return;
      }

      const checkIn = (res.data.resolvedCheckIn ?? null) as string | null;
      const checkOut = (res.data.resolvedCheckOut ?? null) as string | null;
      setHotelSearchResolvedCheckIn(checkIn);
      setHotelSearchResolvedCheckOut(checkOut);
      setHotelHandoffError(null);
      setHotelPinsFallback(res.data.fallback ?? null);

      const normalized = normalizeHotelPins(res.data.hotels ?? [], checkIn, checkOut);
      setHotelPins(normalized.pins.concat(normalized.listOnly));
      setHotelPinsFallback(
        normalized.pins.length === 0 && normalized.listOnly.length === 0
          ? { ...(res.data.fallback ?? { showHotelFallback: true, showVrboFallback: true }), showHotelFallback: true }
          : res.data.fallback ?? null
      );

      const pinsShown = normalized.pins.length;
      if (normalized.pins.length === 0 && normalized.listOnly.length > 0) {
        setHotelPinsFallback((current) => (current ? { ...current, reason: current.reason || "no_venue_coordinates" } : null));
      }

      trackLodgingEvent("lodging_map_impression", {
        page_type: "venue_map",
        tournament_id: tournament.id,
        venue_id: venue.id,
        provider: res.data.provider || "hotelplanner",
        result_count: res.data.hotels?.length ?? 0,
        session_id: res.data.sessionId ?? null,
      });
      trackLodgingEvent("hotel_pin_impression", {
        page_type: "venue_map",
        tournament_id: tournament.id,
        venue_id: venue.id,
        provider: res.data.provider || "hotelplanner",
        count: pinsShown,
        session_id: res.data.sessionId ?? null,
      });
    } catch (err) {
      if (runId !== lodgingSearchInFlightRef.current) return;
      setHotelPinsError("Unable to load hotels right now.");
      setHotelPinsFallback({ showHotelFallback: true, showVrboFallback: true, reason: "provider_error" });
    } finally {
      if (runId === lodgingSearchInFlightRef.current) {
        setHotelPinsLoading(false);
      }
    }
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(max-width: 768px)");
    const updateCap = () => setHotelPinCap(media.matches ? 6 : 10);
    updateCap();
    const onChange = (event: MediaQueryListEvent) => {
      setHotelPinCap(event.matches ? 6 : 10);
    };

    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", onChange);
      return () => media.removeEventListener("change", onChange);
    }

    media.addListener?.(onChange as () => void);
    return () => media.removeListener?.(onChange as () => void);
  }, []);

  useEffect(() => {
    if (!selectedVenueId) return;
    if (!selectedVenue) return;
    if (!effectiveMapEnabled) return;
    if (!mapReady) return;

    void loadHotelPinsForVenue(selectedVenue);
  }, [selectedVenueId, mapReady, effectiveMapEnabled, selectedVenue]);

  useEffect(() => {
    if (!selectedVenue) return;
    if (!effectiveMapEnabled) return;
    if (!mapReady) return;
    renderHotelPins(selectedVenue, filteredHotelPins);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedVenueId, mapReady, effectiveMapEnabled, filteredHotelPins, hotelPinCap, selectedHotelId]);

  const renderHotelPins = (venue: MapVenue, pins: HotelPin[]) => {
    const mapboxgl = mapboxglRef.current;
    const map = mapRef.current;
    if (!mapboxgl || !map) return;

    clearHotelMarkers();
    const cappedPins = pins.filter((pin) => typeof pin.latitude === "number" && typeof pin.longitude === "number").slice(0, hotelPinCap);
    setMapHotelPinVisibleCount(cappedPins.length);

    for (const pin of cappedPins) {
      const key = `hotel:${venue.id}:${pin.propertyId}`;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `${styles.placeMarkerBtn} ${styles.hotelPlaceMarkerBtn} ${
        selectedHotelId === pin.propertyId ? styles.hotelPlaceMarkerSelected : ""
      }`;
      const markerPrice = formatCurrency(pin.fromPrice, pin.currency || "USD") ?? "Price on request";
      const markerLabel = `${pin.name} · ${markerPrice}`;
      btn.setAttribute("aria-label", `Hotel ${pin.name}. ${markerPrice}`);

      const inner = document.createElement("div");
      inner.className = `${styles.hotelPlaceMarker}`;

      const emoji = document.createElement("span");
      emoji.className = styles.hotelPlaceMarkerIcon;
      emoji.textContent = "🏨";
      inner.appendChild(emoji);

      const name = document.createElement("span");
      name.className = styles.hotelPlaceMarkerName;
      name.title = pin.name;
      name.textContent = pin.name;
      inner.appendChild(name);

      const rating = document.createElement("span");
      rating.className = styles.hotelPlaceMarkerPrice;
      rating.textContent = pin.rating != null ? `${pin.rating.toFixed(1)}★` : "—";
      inner.appendChild(rating);

      const price = document.createElement("span");
      price.className = styles.hotelPlaceMarkerPrice;
      price.textContent = markerPrice;
      inner.appendChild(price);

      btn.appendChild(inner);
      btn.title = markerLabel;

      btn.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const currentDates = getCurrentPropertyHandoffDates(pin);
        void trackTiEvent("hotel_pin_click" as Parameters<typeof trackTiEvent>[0], {
          page_type: "venue_map",
          tournament_id: tournament.id,
          venue_id: venue.id,
          property_id: pin.propertyId,
          checkin: currentDates?.checkIn ?? null,
          checkout: currentDates?.checkOut ?? null,
        } as never);
        setSelectedHotelId(pin.propertyId);
        setIsHotelResultsCollapsed(false);
        openHotelPropertyHandoff(pin, venue.id, "hotel_pin_click");
      });

      const marker = new mapboxgl.Marker({ element: btn, anchor: "bottom" })
        .setLngLat([pin.longitude as number, pin.latitude as number])
        .addTo(map);
      const markerElement = marker.getElement?.() as HTMLElement | null;
      if (markerElement) markerElement.style.zIndex = selectedHotelId === pin.propertyId ? "18" : "12";
      hotelPinMarkersRef.current.set(key, { marker });
    }
  };

  const syncVenueMarkerStackOrder = () => {
    for (const venue of venues) {
      const marker = markersRef.current.get(venue.id);
      if (!marker) continue;
      const markerElement = marker.getElement?.() as HTMLElement | null;
      if (!markerElement) continue;
      markerElement.style.zIndex = venue.id === selectedVenueId ? "40" : "30";
    }
  };

  const getCurrentPropertyHandoffDates = (pin: HotelPin) => {
    const checkIn = hotelSearchResolvedCheckIn ?? pin.resolvedCheckIn;
    const checkOut = hotelSearchResolvedCheckOut ?? pin.resolvedCheckOut;
    if (!checkIn || !checkOut) return null;
    return { checkIn, checkOut };
  };

  const formatHotelPlannerPropertyDate = (value: string) => {
    const match = value.match(/^\s*(\d{2})\/(\d{2})\/(\d{4})\s*$/);
    if (!match) return null;
    const [, mm, dd, yyyy] = match;
    return `${mm}/${dd}/${yyyy.slice(-2)}`;
  };

  const extractHotelDetailUrl = (pin: HotelPin) => {
    if (pin.detailUrl) return pin.detailUrl;
    if (!pin.raw || typeof pin.raw !== "object") return null;
    const raw = pin.raw as Record<string, unknown>;
    const detailUrl = raw.detailUrl ?? raw.hotelDetailUrl ?? raw.hotelDetailLink ?? raw.hotelDetailsLink ?? raw.detailsUrl ?? raw.hotelUrl ?? raw.link;
    return typeof detailUrl === "string" && detailUrl.trim() ? detailUrl.trim() : null;
  };

  const buildHotelPlannerPropertyUrl = (pin: HotelPin) => {
    const baseUrl = String(process.env.NEXT_PUBLIC_HOTELPLANNER_WHITE_LABEL_URL ?? "").trim();
    if (!baseUrl) return null;
    const dateRange = getCurrentPropertyHandoffDates(pin);
    if (!dateRange) return null;
    const inDate = formatHotelPlannerPropertyDate(dateRange.checkIn);
    const outDate = formatHotelPlannerPropertyDate(dateRange.checkOut);
    if (!inDate || !outDate) return null;

    const directUrl = extractHotelDetailUrl(pin);
    const url = directUrl ? new URL(directUrl, baseUrl) : new URL("/Hotel/HotelRoomTypes.htm", baseUrl);
    url.pathname = "/Hotel/HotelRoomTypes.htm";
    url.search = "";
    url.searchParams.delete("hotelID");
    url.searchParams.delete("hotelId");
    url.searchParams.delete("idtypeid");
    url.searchParams.delete("idTypeId");
    url.searchParams.set("hotelId", pin.propertyId);
    url.searchParams.set("idTypeId", String(pin.hotelIDTypeID ?? 0));
    url.searchParams.set("inDate", inDate);
    url.searchParams.set("outDate", outDate);
    url.searchParams.set("NumRooms", "1");
    url.searchParams.set("sc", "tournamentinsights");
    url.searchParams.set("source", "venue_map");
    url.searchParams.set("kw", "Tournament weekend stay");
    url.searchParams.set("jobCode", "TI-VENUE-MAP");
    url.searchParams.set("Custom1", `ven:${selectedVenue?.id ?? hotelVenueId ?? ""}`);
    url.searchParams.set("Custom2", tournament.slug);
    url.hash = "content";
    return {
      url: url.toString(),
      checkIn: dateRange.checkIn,
      checkOut: dateRange.checkOut,
    };
  };

  const openHotelPropertyHandoff = (
    pin: HotelPin,
    venueId: string | null,
    sourceEvent: "hotel_pin_click" | "hotel_card_click"
  ) => {
    setHotelHandoffError(null);
    const handoff = buildHotelPlannerPropertyUrl(pin);
    if (!handoff) {
      setHotelHandoffError("Hotel details require valid tournament dates before opening HotelPlanner.");
      return;
    }

    trackLodgingEvent("hotel_checkout_handoff", {
      page_type: "venue_map",
      tournament_id: tournament.id,
      venue_id: venueId,
      property_id: pin.propertyId,
      source: sourceEvent,
      checkin: handoff.checkIn,
      checkout: handoff.checkOut,
    });

    window.open(handoff.url, "_blank", "noopener,noreferrer");
  };

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
    syncVenueMarkerStackOrder();

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

  const previewPins = useMemo(() => {
    if (!owlEyePreviewMode || !selectedVenue) return [];
    const cached = owlPreviewByVenueId[selectedVenue.id];
    const items = cached?.items ?? [];
    return pickPreviewPins(selectedVenue, items);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owlEyePreviewMode, selectedVenueId, owlPreviewByVenueId]);

  useEffect(() => {
    if (!owlEyePreviewMode) return;
    if (!selectedVenue) return;
    // Do not run preview mode for users who can already view full Owl’s Eye.
    if (entitlementTier === "weekend_pro" || selectedVenue.id === DEMO_STARFIRE_VENUE_ID || isPremiumPreviewTournamentSlug(tournament.slug)) {
      setOwlEyePreviewMode(false);
      return;
    }

    const cached = owlPreviewByVenueId[selectedVenue.id];
    const hasLoaded = Boolean(cached?.loaded);

    (async () => {
      if (!hasLoaded) {
        void trackTiEvent("owls_eye_preview_shown", {
          page_type: "venue_map",
          tournament_id: tournament.id,
          tournament_slug: tournament.slug,
          venue_id: selectedVenue.id,
        });
        await fetchLimitedPreviewPlaces(selectedVenue.id);
      }
    })().catch(() => {
      // ignore
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owlEyePreviewMode, selectedVenueId, entitlementTier]);

  useEffect(() => {
    if (!owlEyePreviewMode) return;
    if (!selectedVenue) return;
    if (!effectiveMapEnabled) return;
    if (!mapReady) return;
    renderPreviewPins(selectedVenue, previewPins);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owlEyePreviewMode, selectedVenueId, effectiveMapEnabled, mapReady, previewPins]);

  useEffect(() => {
    if (!owlEyePreviewMode) return;
    const v = selectedVenue;
    if (!v) return;
    if (typeof v.latitude !== "number" || typeof v.longitude !== "number") return;
    const map = mapRef.current;
    if (!map) return;

    // Safari can change viewport/scrollbars when dismissing a fixed modal, which triggers a map resize and
    // makes markers feel like they "jump" off-screen. After enabling preview mode, re-center on the
    // selected venue so the primary pin stays in view.
    const recenter = () => {
      try {
        map.resize?.();
      } catch {
        // ignore
      }
      try {
        map.jumpTo({ center: [v.longitude, v.latitude] });
      } catch {
        // ignore
      }
    };

    try {
      requestAnimationFrame(recenter);
      window.setTimeout(recenter, 0);
      window.setTimeout(recenter, 80);
      window.setTimeout(recenter, 200);
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owlEyePreviewMode]);

  useEffect(() => {
    if (owlEyePreviewMode) return;
    setSelectedPreviewKey(null);
    for (const value of previewMarkersRef.current.values()) {
      try {
        value.marker?.remove?.();
      } catch {
        // ignore
      }
    }
    previewMarkersRef.current.clear();
  }, [owlEyePreviewMode]);

  const venueLocation = (v: MapVenue) => [v.city, v.state].filter(Boolean).join(", ") || "Location TBA";
  const venueDestinationLabel = (v: MapVenue) => {
    const name = String(v.name ?? "").trim();
    const loc = [v.city, v.state].filter(Boolean).join(", ");
    return [name || "Tournament venue", loc].filter(Boolean).join(" • ") || "Tournament venue";
  };
  const safeVenueCopyText = (v: MapVenue) => {
    const parts = [v.name, v.city, v.state].filter(Boolean).map((s) => String(s).trim()).filter(Boolean);
    return parts.length ? parts.join(", ") : null;
  };
  const countsLine = (v: MapVenue) => {
    if (!v.hasOwl || !v.counts) return null;
    const liveHotelCount = hotelVenueId === v.id && !hotelPinsLoading && !hotelPinsError ? hotelResultCount : null;
    const parts = [`☕ ${v.counts.coffee}`, `🍔 ${v.counts.food}`];
    const hotelCount = liveHotelCount ?? v.counts.hotels;
    if (hotelCount || hotelCount === 0) parts.push(`🏨 ${hotelCount} hotels`);
    if (v.counts.quick_eats) parts.push(`🌮 ${v.counts.quick_eats} quick eats`);
    return parts.join(" • ");
  };
  const enhancedCounts = (v: MapVenue) => {
    if (!v.hasOwl || !v.counts) return null;
    const parts: string[] = [];
    if (v.counts.hangouts) parts.push(`🎳 ${v.counts.hangouts} hangouts`);
    return parts.length ? parts.join(" • ") : null;
  };

  const primaryVenue = venues[0] ?? null;
  const hotelVenueId = selectedVenue?.id ?? primaryVenue?.id ?? null;
  const orderedHotelPins = useMemo(() => {
    if (!selectedHotelId) return filteredHotelPins;
    const selectedIndex = filteredHotelPins.findIndex((pin) => pin.propertyId === selectedHotelId);
    if (selectedIndex === -1) return filteredHotelPins;
    if (selectedIndex === 0) return filteredHotelPins;
    return [filteredHotelPins[selectedIndex], ...filteredHotelPins.slice(0, selectedIndex), ...filteredHotelPins.slice(selectedIndex + 1)];
  }, [filteredHotelPins, selectedHotelId]);
  const teamBlockAnchorPin = useMemo(() => orderedHotelPins[0] ?? null, [orderedHotelPins]);
  useEffect(() => {
    if (!selectedHotelId) return;
    setIsHotelResultsCollapsed(false);
  }, [selectedHotelId]);
  useEffect(() => {
    setTeamBlockOpen(false);
    setTeamBlockError(null);
    setTeamBlockSuccess(null);
    setTeamBlockForm(DEFAULT_TEAM_BLOCK_FORM);
  }, [hotelVenueId]);
  useEffect(() => {
    setIsHotelResultsCollapsed(true);
  }, [hotelVenueId]);
  useEffect(() => {
    if (!selectedHotelId) return;
    if (filteredHotelPins.some((pin) => pin.propertyId === selectedHotelId)) return;
    setSelectedHotelId(null);
  }, [filteredHotelPins, selectedHotelId]);
  const hotelVenueForRedirect =
    selectedVenue ??
    (hotelVenueId
      ? {
          id: hotelVenueId,
          seo_slug: null,
          name: null,
          city: null,
          state: null,
          latitude: null,
          longitude: null,
          hasOwl: false,
          counts: null,
        }
      : null);
  const hotelLoadingFallbackVenue = selectedVenue?.id === hotelVenueId ? selectedVenue : null;
  const hotelLoadingFallbackVisible = hotelPinsLoading && Boolean(hotelLoadingFallbackVenue);
  const mapHotelLoadingVisible = mapReady && hotelPinsLoading && selectedVenue?.id === hotelVenueId;
  const hotelFallbackCardVisible =
    (hotelPinsFallback?.showHotelFallback || hotelPinsFallback?.showVrboFallback || filteredHotelPins.length === 0) && Boolean(hotelPinsFallback);
  const hotelPanelSummary = hotelPinsLoading
    ? "Searching HotelPlanner results…"
    : hotelPinsError
      ? hotelPinsError
      : hotelFallbackCardVisible
        ? "Limited hotel results available"
        : hotelRatingFilter > 0
          ? `Showing ${hotelResultCount} hotel results (${filteredHotelPins.length} match filter, ${mapHotelPinVisibleCount} on map)`
          : `Showing ${hotelResultCount} hotel result${hotelResultCount === 1 ? "" : "s"} (${mapHotelPinVisibleCount} on map)`;

  const getCurrentTeamBlockDates = (pin: HotelPin | null) => {
    if (!pin) return null;
    const checkIn = pin.resolvedCheckIn ?? hotelSearchResolvedCheckIn ?? null;
    const checkOut = pin.resolvedCheckOut ?? hotelSearchResolvedCheckOut ?? null;
    if (!checkIn || !checkOut) return null;
    return { checkIn, checkOut };
  };

  const getTeamBlockAreaLabel = () =>
    [selectedVenue?.name, selectedVenue?.city, selectedVenue?.state].filter(Boolean).join(", ") ||
    [teamBlockAnchorPin?.city, teamBlockAnchorPin?.state].filter(Boolean).join(", ") ||
    tournament.name;

  const getTeamBlockDestination = () =>
    [selectedVenue?.city, selectedVenue?.state].filter(Boolean).join(", ") ||
    [teamBlockAnchorPin?.city, teamBlockAnchorPin?.state].filter(Boolean).join(", ") ||
    getTeamBlockAreaLabel();

  const openTeamBlockForm = () => {
    const dateRange = getCurrentTeamBlockDates(teamBlockAnchorPin);
    const venueId = selectedVenue?.id ?? hotelVenueId ?? null;
    trackLodgingEvent("team_block_cta_click", {
      page_type: "venue_map",
      tournament_id: tournament.id,
      tournament_slug: tournament.slug,
      venue_id: venueId ?? "",
      property_id: teamBlockAnchorPin?.propertyId ?? null,
      checkin: dateRange?.checkIn ?? null,
      checkout: dateRange?.checkOut ?? null,
    });
    if (!teamBlockAnchorPin) return;
    if (!dateRange) return;
    setTeamBlockError(null);
    setTeamBlockSuccess(null);
    setTeamBlockOpen(true);
    trackLodgingEvent("team_block_rfp_start", {
      page_type: "venue_map",
      tournament_id: tournament.id,
      tournament_slug: tournament.slug,
      venue_id: venueId ?? "",
      property_id: teamBlockAnchorPin.propertyId,
      checkin: dateRange.checkIn,
      checkout: dateRange.checkOut,
    });
  };

  useEffect(() => {
    if (!teamBlockOpen) return;
    const panel = teamBlockPanelRef.current;
    const input = teamBlockFirstInputRef.current;
    if (panel) {
      panel.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    const timer = window.setTimeout(() => {
      input?.focus();
    }, 180);
    return () => window.clearTimeout(timer);
  }, [teamBlockOpen]);

  const buildTeamBlockComments = () => {
    const parts = [
      teamBlockForm.teamName ? `Team: ${teamBlockForm.teamName}` : null,
      teamBlockForm.phone ? `Phone: ${teamBlockForm.phone}` : null,
      teamBlockForm.notes ? `Notes: ${teamBlockForm.notes}` : null,
    ].filter(Boolean);
    return parts.join("\n");
  };

  const submitTeamBlockForm = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!teamBlockAnchorPin) {
      setTeamBlockError("Hotel results are required before requesting a team block.");
      return;
    }
    const dateRange = getCurrentTeamBlockDates(teamBlockAnchorPin);
    if (!dateRange) {
      setTeamBlockError("Tournament dates are required before submitting a team hotel block request.");
      return;
    }

    const rooms = Number(teamBlockForm.rooms);
    if (!Number.isInteger(rooms) || rooms < 5) {
      setTeamBlockError("Enter at least 5 rooms for a team hotel block request.");
      return;
    }

    setTeamBlockSubmitting(true);
    setTeamBlockError(null);
    setTeamBlockSuccess(null);

    try {
      const response = await fetch(new URL("/api/lodging/group-request", window.location.origin), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          propertyId: teamBlockAnchorPin.propertyId,
          destination: getTeamBlockDestination(),
          checkin: dateRange.checkIn,
          checkout: dateRange.checkOut,
          rooms,
          adults: Number(teamBlockForm.adultsPerRoom),
          children: Number(teamBlockForm.childrenPerRoom),
          split: 1,
          rating: "3",
          roomTypeCode: "8",
          firstName: teamBlockForm.contactFirstName,
          lastName: teamBlockForm.contactLastName,
          email: teamBlockForm.email,
          groupName: teamBlockForm.teamName,
          phone: teamBlockForm.phone,
          comments: buildTeamBlockComments(),
          source: "venue_map",
          sc: "tournamentinsights",
          kw: "Team hotel block",
          jobCode: "TI-TEAM-BLOCK",
          custom1: `ven:${selectedVenue?.id ?? hotelVenueId ?? ""}`,
          custom2: tournament.slug,
          groupTypeCode: "143",
        }),
      });

      const payload = (await response.json().catch(() => null)) as
        | { success?: boolean; requestId?: string; error?: string }
        | null;

      if (!response.ok || !payload?.success) {
        const message = payload?.error ? String(payload.error) : "Unable to submit the team hotel block request right now.";
        setTeamBlockError(message);
        trackLodgingEvent("team_block_rfp_submit", {
          page_type: "venue_map",
          tournament_id: tournament.id,
          tournament_slug: tournament.slug,
          venue_id: selectedVenue?.id ?? hotelVenueId ?? "",
          property_id: teamBlockAnchorPin.propertyId,
          checkin: dateRange.checkIn,
          checkout: dateRange.checkOut,
          rooms,
          success: false,
          request_id: null,
          error: message,
        });
        return;
      }

      setTeamBlockSuccess({ requestId: payload.requestId ?? null });
      setTeamBlockOpen(false);
      setTeamBlockForm(DEFAULT_TEAM_BLOCK_FORM);
      trackLodgingEvent("team_block_rfp_submit", {
        page_type: "venue_map",
        tournament_id: tournament.id,
        tournament_slug: tournament.slug,
        venue_id: selectedVenue?.id ?? hotelVenueId ?? "",
        property_id: teamBlockAnchorPin.propertyId,
        checkin: dateRange.checkIn,
        checkout: dateRange.checkOut,
        rooms,
        success: true,
        request_id: payload.requestId ?? null,
        error: null,
      });
    } catch {
      const message = "Unable to submit the team hotel block request right now.";
      setTeamBlockError(message);
      trackLodgingEvent("team_block_rfp_submit", {
        page_type: "venue_map",
        tournament_id: tournament.id,
        tournament_slug: tournament.slug,
        venue_id: selectedVenue?.id ?? hotelVenueId ?? "",
        property_id: teamBlockAnchorPin.propertyId,
        checkin: dateRange.checkIn,
        checkout: dateRange.checkOut,
        rooms,
        success: false,
        request_id: null,
        error: message,
      });
    } finally {
      setTeamBlockSubmitting(false);
    }
  };

  const buildNavProviderHrefsForLatLng = (lat: number, lng: number) => ({
    google: `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${lat},${lng}`)}`,
    apple: `https://maps.apple.com/?daddr=${encodeURIComponent(`${lat},${lng}`)}`,
    waze: `https://waze.com/ul?ll=${encodeURIComponent(`${lat},${lng}`)}&navigate=yes`,
  });

  const buildNavProviderHrefsForQuery = (query: string) => ({
    google: `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(query)}`,
    apple: `https://maps.apple.com/?daddr=${encodeURIComponent(query)}`,
    waze: `https://waze.com/ul?q=${encodeURIComponent(query)}&navigate=yes`,
  });

  const openNavChooserForVenue = (v: MapVenue, source: "venue_card" | "selected_venue_panel" | "venue_marker") => {
    const hasCoords = typeof v.latitude === "number" && typeof v.longitude === "number";
    const providerHrefs = hasCoords
      ? buildNavProviderHrefsForLatLng(v.latitude as number, v.longitude as number)
      : buildNavProviderHrefsForQuery(safeVenueCopyText(v) ?? [tournament.name, tournament.slug].filter(Boolean).join(" "));

    const destinationLabel = venueDestinationLabel(v);
    const copyText = safeVenueCopyText(v);

    setNavSheet({
      open: true,
      title: "Directions",
      destinationLabel,
      providerHrefs,
      copyText,
      onProviderClick: (provider) => {
        void trackTiEvent("directions_click", {
          page_type: "venue_map",
          tournament_id: tournament.id,
          tournament_slug: tournament.slug,
          venue_id: v.id,
          venue_name: v.name ?? null,
          source,
          provider,
          hasCoordinates: hasCoords,
          hasOwlEyeData: Boolean(v.hasOwl),
        });
      },
    });
  };

  openVenueNavChooserRef.current = (venue, source) => openNavChooserForVenue(venue, source);

  const openNavChooserForAirport = (airport: NearestAirport, venue: MapVenue, source: "selected_venue_panel") => {
    const providerHrefs = buildNavProviderHrefsForLatLng(airport.latitude_deg, airport.longitude_deg);
    const labelParts = [
      airport.name,
      airport.iata_code || airport.ident ? `(${airport.iata_code || airport.ident})` : "",
      airport.municipality,
      airport.iso_region,
    ]
      .map((s) => String(s ?? "").trim())
      .filter(Boolean);

    setNavSheet({
      open: true,
      title: "Nearest airport",
      destinationLabel: labelParts.join(" • "),
      providerHrefs,
      copyText: labelParts.join(", "),
      onProviderClick: (provider) => {
        void trackTiEvent("nearest_airport_click", {
          page_type: "venue_map",
          tournament_id: tournament.id,
          tournament_slug: tournament.slug,
          venue_id: venue.id,
          venue_name: venue.name ?? null,
          source,
          provider,
          airport_id: airport.id,
          airport_name: airport.name,
          airport_iata: airport.iata_code ?? null,
        });
      },
    });
  };

  const openNavChooserForPreviewPlace = (args: {
    venue: MapVenue;
    category: OwlCategory;
    item: OwlPlace;
    source: "preview_card" | "map_preview_pin";
  }) => {
    const { venue, category, item, source } = args;
    const hasCoords = typeof item.place_latitude === "number" && typeof item.place_longitude === "number";
    if (!hasCoords) return;

    const providerHrefs = buildNavProviderHrefsForLatLng(item.place_latitude as number, item.place_longitude as number);
    const destinationLabel = [item.name || "Nearby place", venueDestinationLabel(venue)].filter(Boolean).join(" • ");
    const copyText = String(item.name ?? "").trim() || null;
    const placeId = String(item.place_id ?? "").trim() || null;

    setNavSheet({
      open: true,
      title: "Directions",
      destinationLabel,
      providerHrefs,
      copyText,
      onProviderClick: (provider) => {
        void trackTiEvent("owls_eye_preview_directions_click", {
          page_type: "venue_map",
          tournament_id: tournament.id,
          tournament_slug: tournament.slug,
          venue_id: venue.id,
          category,
          place_id: placeId,
          source,
          provider,
          has_coords: true,
        });
      },
    });
  };

  const formatDistance = (meters: number | null) => {
    if (typeof meters !== "number" || !Number.isFinite(meters)) return null;
    const miles = meters / 1609.344;
    if (miles < 0.1) return `${Math.round(meters)} m`;
    return `${miles.toFixed(miles >= 10 ? 0 : 1)} mi`;
  };

  const formatCurrency = (value: number | null | undefined, currency = "USD") => {
    if (typeof value !== "number" || !Number.isFinite(value)) return null;
    try {
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency,
        maximumFractionDigits: 0,
      }).format(value);
    } catch {
      return `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
    }
  };

  const getPinAddress = (pin: HotelPin) => {
    return [pin.addressLine1, pin.city, pin.state].filter(Boolean).join(", ") || null;
  };

  const normalizeHotelPin = (raw: unknown, fallback: { checkIn: string | null; checkOut: string | null }): HotelPin | null => {
    if (!raw || typeof raw !== "object") return null;
    const property = raw as Record<string, unknown>;
    const propertyId = typeof property.id === "string" ? property.id.trim() : "";
    if (!propertyId) return null;
    const lat = typeof property.lat === "number" ? property.lat : null;
    const lng = typeof property.lng === "number" ? property.lng : null;
    const fromPrice = typeof property.fromPrice === "number" ? property.fromPrice : null;
    const rating = typeof property.rating === "number" ? property.rating : null;
    const reviewCount = typeof property.reviewCount === "number" ? property.reviewCount : null;
    const distance = typeof property.distanceMiles === "number" ? property.distanceMiles : null;
    const name = String(property.name ?? "").trim() || "Hotel";

    return {
      propertyId,
      name,
      addressLine1: property.addressLine1 == null ? null : String(property.addressLine1),
      city: property.city == null ? null : String(property.city),
      state: property.state == null ? null : String(property.state),
      distanceMiles: Number.isFinite(distance) ? distance : null,
      rating: Number.isFinite(rating) ? rating : null,
      reviewCount: Number.isFinite(reviewCount) ? reviewCount : null,
      thumbnailUrl: property.thumbnailUrl == null ? null : String(property.thumbnailUrl),
      currency: property.currency == null ? null : String(property.currency),
      fromPrice: fromPrice != null ? fromPrice : null,
      latitude: Number.isFinite(lat) ? lat : null,
      longitude: Number.isFinite(lng) ? lng : null,
      hotelIDTypeID: typeof property.hotelIDTypeID === "number" && Number.isFinite(property.hotelIDTypeID) && property.hotelIDTypeID >= 0
        ? property.hotelIDTypeID
        : 0,
      detailUrl: property.detailUrl == null ? null : String(property.detailUrl),
      resolvedCheckIn: fallback.checkIn,
      resolvedCheckOut: fallback.checkOut,
      raw: property.raw,
    };
  };

  const normalizeHotelPins = (hotels: unknown[], checkIn: string | null, checkOut: string | null) => {
    const dedupe = new Map<string, HotelPin>();
    for (const item of hotels) {
      const pin = normalizeHotelPin(item, { checkIn, checkOut });
      if (!pin) continue;
      if (dedupe.has(pin.propertyId)) continue;
      dedupe.set(pin.propertyId, pin);
    }
    const sorted = Array.from(dedupe.values()).sort((a, b) => {
      const distanceDelta = (a.distanceMiles ?? Number.POSITIVE_INFINITY) - (b.distanceMiles ?? Number.POSITIVE_INFINITY);
      if (Number.isFinite(distanceDelta) && distanceDelta !== 0) return distanceDelta;
      const fromA = a.fromPrice ?? Number.POSITIVE_INFINITY;
      const fromB = b.fromPrice ?? Number.POSITIVE_INFINITY;
      if (fromA !== fromB) return fromA - fromB;
      return a.name.localeCompare(b.name);
    });

    const withCoords = sorted.filter((pin) => typeof pin.latitude === "number" && typeof pin.longitude === "number");
    const listOnly = sorted.filter((pin) => typeof pin.latitude !== "number" || typeof pin.longitude !== "number");
    return { pins: withCoords, listOnly, allWithCoords: withCoords };
  };

  const clearHotelMarkers = () => {
    for (const value of hotelPinMarkersRef.current.values()) {
      try {
        value.marker?.remove?.();
      } catch {
        // ignore
      }
    }
    hotelPinMarkersRef.current.clear();
    setMapHotelPinVisibleCount(0);
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

  const openPlacePopup = (args: { venue: MapVenue; category: OwlCategory; item: OwlPlace; tier: TiTier; isPreview?: boolean }) => {
    const map = mapRef.current;
    const mapboxgl = mapboxglRef.current;
    if (!map || !mapboxgl) return;
    const { venue, category, item, tier, isPreview } = args;

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

    const titleText = (item.name ?? "").trim() || "Nearby place";
    const title = escapeHtml(titleText);
    const addressText = (item.address ?? "").trim();
    const address = escapeHtml(addressText);
    const distance = formatDistance(item.distance_meters);
    const distanceHtml = distance ? escapeHtml(distance) : "";
    const searchUrl =
      category === "hotels"
            ? buildVenueHotelsHref({ venue, tournamentId: tournament.id })
            : buildGoogleSearchUrl({ item, venue });
    const searchHtml = searchUrl
      ? `<a class="${styles.popupLinkSecondary}" href="${escapeHtml(searchUrl)}" target="_blank" rel="noopener noreferrer${category === "hotels" ? " sponsored" : ""}">${category === "hotels" ? "Check rates" : "Search"}</a>`
      : "";
    const destinationLabel = [titleText, [venue.city, venue.state].filter(Boolean).join(", ")].filter(Boolean).join(" • ");
    const copyText = [titleText, addressText, [venue.city, venue.state].filter(Boolean).join(", ")].filter(Boolean).join(", ") || null;

    // closeOnClick=false to prevent marker clicks from immediately closing the popup in some browsers.
    const popup = new mapboxgl.Popup({
      closeButton: true,
      closeOnClick: false,
      anchor: "top",
      offset: 12,
      maxWidth: "280px",
      focusAfterOpen: false,
    });
    popup.addClassName(styles.placePopup);

    const root = document.createElement("div");
    root.className = styles.popupBody;

    const titleEl = document.createElement("div");
    titleEl.className = styles.popupTitle;
    titleEl.textContent = `${emojiForCategory(category)} ${titleText}`;
    root.appendChild(titleEl);

    if (distanceHtml || address) {
      const metaEl = document.createElement("div");
      metaEl.className = styles.popupMeta;
      metaEl.textContent = [distance, addressText].filter(Boolean).join(distance && addressText ? " • " : "");
      root.appendChild(metaEl);
    }

    const footer = document.createElement("div");
    footer.className = styles.popupFooter;

    const directionsBtn = document.createElement("button");
    directionsBtn.type = "button";
    directionsBtn.className = styles.popupLink;
    directionsBtn.textContent = "Directions";
    directionsBtn.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      setNavSheet({
        open: true,
        title: "Directions",
        destinationLabel,
        providerHrefs: buildNavProviderHrefsForLatLng(lat, lng),
        copyText,
        onProviderClick: (provider) => {
          if (isPreview) {
            void trackTiEvent("owls_eye_preview_directions_click", {
              page_type: "venue_map",
              tournament_id: tournament.id,
              tournament_slug: tournament.slug,
              venue_id: venue.id,
              category,
              place_id: (item.place_id ?? "").trim() || null,
              source: "map_preview_pin",
              provider,
              has_coords: true,
            });
            return;
          }

          void trackTiEvent("owls_eye_directions_clicked", {
            page_type: "venue_map",
            tournament_id: tournament.id,
            tournament_slug: tournament.slug,
            venue_id: venue.id,
            category,
            tier,
          });
        },
      });
      try {
        popupRef.current?.remove?.();
      } catch {
        // ignore
      } finally {
        popupRef.current = null;
      }
    });

    footer.appendChild(directionsBtn);

    if (searchUrl) {
      const searchLink = document.createElement("a");
      searchLink.className = styles.popupLinkSecondary;
      searchLink.href = searchUrl;
      searchLink.target = "_blank";
      searchLink.rel = `noopener noreferrer${category === "hotels" ? " sponsored" : ""}`;
      searchLink.textContent = category === "hotels" ? "Check rates" : "Search";
      footer.appendChild(searchLink);
    }

    root.appendChild(footer);

    popup.setLngLat([lng, lat]).setDOMContent(root).addTo(map);
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
      void trackTiEvent("tier_gate_hit", {
        feature: "owls_eye",
        user_tier: entitlementTier,
        page_type: "venue_map",
        tournament_id: tournament.id,
        tournament_slug: tournament.slug,
        venue_id: v.id,
      });
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
    void trackTiEvent("tier_gate_hit", {
      feature: "owls_eye",
      user_tier: tier,
      page_type: "venue_map",
      tournament_id: tournament.id,
      tournament_slug: tournament.slug,
      venue_id: v.id,
    });
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
        // Do not pan/zoom on pin click (prevents the map from shifting unexpectedly after the user already targeted a pin).
        setSelectedPlaceKey(key);
        openPlacePopup({ venue: v, category, item, tier: cached.tier ?? "unknown" });
      });

      const marker = new mapboxgl.Marker({ element: btn, anchor: "bottom" })
        .setLngLat([item.place_longitude as number, item.place_latitude as number])
        .addTo(map);
      placeMarkersRef.current.set(key, { marker, category });
    }
  };

  const loadNearestAirport = async (v: MapVenue) => {
    if (!v?.id) return null;
    if (typeof v.latitude !== "number" || typeof v.longitude !== "number") return null;
    if (nearestAirportLoadingVenueId === v.id) return null;
    if (Object.prototype.hasOwnProperty.call(nearestAirportByVenueId, v.id)) {
      return nearestAirportByVenueId[v.id] ?? null;
    }

    setNearestAirportLoadingVenueId(v.id);
    try {
      const url = new URL("/api/airports/nearest", window.location.origin);
      url.searchParams.set("lat", String(v.latitude));
      url.searchParams.set("lng", String(v.longitude));
      if (v.state) url.searchParams.set("state", String(v.state));
      const resp = await fetch(url.toString(), { method: "GET" });
      const json = (await resp.json().catch(() => null)) as any;
      const airport = json?.ok ? (json.airport as NearestAirport) : null;
      setNearestAirportByVenueId((prev) => ({ ...prev, [v.id]: airport }));
      return airport;
    } catch {
      setNearestAirportByVenueId((prev) => ({ ...prev, [v.id]: null }));
      return null;
    } finally {
      setNearestAirportLoadingVenueId((cur) => (cur === v.id ? null : cur));
    }
  };

  const handleContinueLimitedResults = async () => {
    const v = selectedVenue;
    if (!v) return;

    // Preserve scroll position so dismissing the modal doesn't jump the page (common on mobile when focus returns).
    const scrollSnapshot =
      typeof window !== "undefined"
        ? { x: window.scrollX, y: window.scrollY }
        : null;

    setOwlEyePreviewMode(true);
    setOwlPanelMode("teaser");
    setOwlPremiumError(null);
    void trackTiEvent("owls_eye_limited_continue", {
      page_type: "venue_map",
      tournament_id: tournament.id,
      tournament_slug: tournament.slug,
      venue_id: v.id,
    });
    const cached = owlPreviewByVenueId[v.id];
    if (!cached?.loaded) {
      await fetchLimitedPreviewPlaces(v.id);
    }

    if (scrollSnapshot && typeof window !== "undefined") {
      try {
        const restore = () => {
          try {
            window.scrollTo(scrollSnapshot.x, scrollSnapshot.y);
          } catch {
            // ignore
          }
        };
        requestAnimationFrame(restore);
        window.setTimeout(restore, 0);
        window.setTimeout(restore, 50);
        window.setTimeout(restore, 200);
      } catch {
        // ignore
      }
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
                    <div key={v.id} className={styles.venueRowWrap} role="listitem">
                      <button
                        type="button"
                        className={`${styles.venueRow} ${selected ? styles.venueRowSelected : ""}`}
                        onClick={() => {
                          setSelectedVenueId(v.id);
                          setDetailMode(true);
                          void trackTiEvent("venue_select", {
                            page_type: "venue_map",
                            tournament_id: tournament.id,
                            tournament_slug: tournament.slug,
                            venue_id: v.id,
                            venue_name: v.name ?? null,
                            source: "venue_card",
                            hasCoordinates: typeof v.latitude === "number" && typeof v.longitude === "number",
                            hasOwlEyeData: Boolean(v.hasOwl),
                          });
                        }}
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

                      <div className={styles.venueRowActions}>
                        <button
                          type="button"
                          className={styles.venueActionBtn}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            openNavChooserForVenue(v, "venue_card");
                          }}
                        >
                          Directions
                        </button>
                        <a
                          className={styles.venueActionBtn}
                          href={buildVenueHotelsHref({ venue: v, tournamentId: tournament.id, source: "venue_card" })}
                          target="_blank"
                          rel="noopener noreferrer sponsored"
                          onClick={(e) => {
                            e.stopPropagation();
                            void trackTiEvent("hotels_click", {
                              page_type: "venue_map",
                              tournament_id: tournament.id,
                              tournament_slug: tournament.slug,
                              venue_id: v.id,
                              venue_name: v.name ?? null,
                              source: "venue_card",
                            });
                          }}
                        >
                          Hotels
                        </a>
                        <Link
                          className={styles.venueActionBtn}
                          href={v.seo_slug ? `/venues/${encodeURIComponent(v.seo_slug)}` : `/venues/${encodeURIComponent(v.id)}`}
                          onClick={() => {
                            void trackTiEvent("venue_view_click", {
                              page_type: "venue_map",
                              tournament_id: tournament.id,
                              tournament_slug: tournament.slug,
                              venue_id: v.id,
                              venue_name: v.name ?? null,
                              source: "venue_card",
                            });
                          }}
                        >
                          View
                        </Link>
                      </div>
                    </div>
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

              {typeof selectedVenue.latitude === "number" && typeof selectedVenue.longitude === "number" ? (
                <div className={styles.airportRow}>
                  <button
                    type="button"
                    className={styles.airportBtn}
                    disabled={nearestAirportLoadingVenueId === selectedVenue.id}
                    onClick={async () => {
                      const cached = Object.prototype.hasOwnProperty.call(nearestAirportByVenueId, selectedVenue.id)
                        ? nearestAirportByVenueId[selectedVenue.id]
                        : undefined;
                      const airport = cached ?? (await loadNearestAirport(selectedVenue));
                      if (airport) openNavChooserForAirport(airport, selectedVenue, "selected_venue_panel");
                    }}
                    aria-label="Navigate to nearest airport"
                    title="Nearest airport"
                  >
                    ✈️
                    <span className={styles.airportBtnLabel}>
                      {nearestAirportLoadingVenueId === selectedVenue.id
                        ? "Nearest airport…"
                        : nearestAirportByVenueId[selectedVenue.id]?.iata_code || "Airport"}
                    </span>
                  </button>
                  {nearestAirportByVenueId[selectedVenue.id]?.distance_miles ? (
                    <span className={styles.airportMeta}>
                      {nearestAirportByVenueId[selectedVenue.id]!.distance_miles} mi
                    </span>
                  ) : null}
                </div>
              ) : null}

              {owlEyePreviewMode ? (
                <div className={styles.owlPreviewBanner} role="status" aria-live="polite">
                  <div className={styles.owlPreviewBannerCopy}>
                    Showing a limited preview near this venue. Unlock nearby hotels, food, coffee, and rentals.
                  </div>
                  <div className={styles.owlPreviewBannerActions}>
                    <WeekendProUpgradeModalTrigger
                      className={styles.owlPreviewBannerBtn}
                      source_page="venue_map"
                      source_context="limited_preview_banner"
                      tournament_slug={tournament.slug}
                      venue_slug={selectedVenue.seo_slug ?? selectedVenue.id}
                      entry_point="limited_preview_banner_modal"
                      cta_label="Upgrade to Weekend Pro"
                      label="See nearby options"
                      user_tier={entitlementTier}
                      has_affiliate_visible={false}
                      onContinueLimited={() => void handleContinueLimitedResults()}
                      onOpen={() => {
                        void trackTiEvent("owls_eye_preview_upgrade_click", {
                          page_type: "venue_map",
                          tournament_id: tournament.id,
                          tournament_slug: tournament.slug,
                          venue_id: selectedVenue.id,
                          source: "limited_banner",
                        });
                      }}
                    />
                    <button
                      type="button"
                      className={styles.owlPreviewBannerDismiss}
                      onClick={() => setOwlEyePreviewMode(false)}
                      aria-label="Dismiss preview notice"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ) : null}

              {selectedVenue.hasOwl && selectedVenue.counts ? (
                <div className={styles.owlPreview}>
                  <div className={styles.owlPreviewTitle}>
                    Weekend Guide (Owl&apos;s Eye)
                  </div>
                  <div className={styles.owlPreviewSub}>A quick look at what’s nearby.</div>
                  {countsLine(selectedVenue) ? (
                    <div className={styles.venueCounts} style={{ marginTop: 8 }}>
                      {countsLine(selectedVenue)}
                    </div>
                  ) : null}
                  {enhancedCounts(selectedVenue) ? (
                    <div className={styles.venueCounts}>
                      {enhancedCounts(selectedVenue)}
                    </div>
                  ) : null}
                  <div className={styles.owlPreviewValue}>
                    Closest hotels, quick food, and local favorites mapped to your fields
                  </div>
                  <div className={styles.owlPreviewHint}>Tap to see coffee, food, hotels, and more on the map.</div>
                </div>
              ) : null}

              {owlEyePreviewMode ? (
                (() => {
                  const cached = owlPreviewByVenueId[selectedVenue.id];
                  const items = cached?.items ?? [];
                  const listItems = pickPreviewListItems(selectedVenue, items);
                  const loading = owlPreviewLoadingVenueId === selectedVenue.id && !cached?.loaded;

                  if (loading) {
                    return <div className={styles.owlPreviewPanelNote}>Loading limited preview…</div>;
                  }

                  if (!listItems.length) {
                    return (
                      <div className={styles.owlPreviewPanelNote}>
                        No preview places are available for this venue yet. Upgrade to see the full nearby plan.
                      </div>
                    );
                  }

	                  return (
	                    <details className={styles.owlPreviewPanel}>
	                      <summary className={styles.owlPreviewPanelSummary}>
	                        Preview results <span className={styles.owlPreviewPanelCount}>({listItems.length})</span>
	                      </summary>
	                      <div className={styles.owlPreviewPanelSub}>
	                        A small sample near this venue — Weekend Pro unlocks the full set.
	                      </div>
	                      <div className={styles.owlPreviewList}>
	                        {listItems.map(({ key, category, item }) => {
                          const isHotel = category === "hotels";
                          const hasCoordsItem =
                            typeof item.place_latitude === "number" && typeof item.place_longitude === "number";
                          const distance = formatDistance(item.distance_meters);

                          const baseHotelsHref = buildVenueHotelsHref({
                            venue: selectedVenue,
                            tournamentId: tournament.id,
                            source: "preview_card",
                          });

                          return (
                            <div key={key} className={styles.owlPreviewItem}>
                              <div className={styles.owlPreviewBadge}>Preview result</div>
                              <div className={styles.owlPreviewItemTitle}>
                                {emojiForCategory(category)} {item.name ?? "Nearby place"}
                              </div>
                              <div className={styles.owlPreviewItemMeta}>
                                <span className={styles.owlPreviewItemCat}>{labelForCategory(category)}</span>
                                {distance ? <span> • {distance}</span> : null}
                              </div>
                              <div className={styles.owlPreviewItemActions}>
                                {isHotel ? (
                                  <a
                                    className={styles.owlPreviewActionBtn}
                                    href={baseHotelsHref}
                                    target="_blank"
                                    rel="noopener noreferrer sponsored"
                                    onClick={() => {
                                      void trackTiEvent("owls_eye_preview_hotel_booking_click", {
                                        page_type: "venue_map",
                                        tournament_id: tournament.id,
                                        tournament_slug: tournament.slug,
                                        venue_id: selectedVenue.id,
                                        place_id: item.place_id ?? null,
                                      });
                                    }}
                                  >
                                    Check availability
                                  </a>
                                ) : null}

                                <button
                                  type="button"
                                  className={styles.owlPreviewActionBtn}
                                  disabled={!hasCoordsItem}
                                  onClick={() => {
                                    setSelectedPreviewKey(key);
                                    openNavChooserForPreviewPlace({
                                      venue: selectedVenue,
                                      category,
                                      item,
                                      source: "preview_card",
                                    });
                                  }}
                                >
                                  Get directions
                                </button>

                                <WeekendProUpgradeModalTrigger
                                  className={`${styles.owlPreviewActionBtn} ${styles.owlPreviewActionBtnSecondary}`}
                                  source_page="venue_map"
                                  source_context="limited_preview_card_upgrade"
                                  tournament_slug={tournament.slug}
                                  venue_slug={selectedVenue.seo_slug ?? selectedVenue.id}
                                  entry_point="limited_preview_card_upgrade_modal"
                                  cta_label="Upgrade to Weekend Pro"
                                  label="See nearby options"
                                  user_tier={entitlementTier}
                                  has_affiliate_visible={false}
                                  onContinueLimited={() => void handleContinueLimitedResults()}
                                  onOpen={() => {
                                    void trackTiEvent("owls_eye_preview_upgrade_click", {
                                      page_type: "venue_map",
                                      tournament_id: tournament.id,
                                      tournament_slug: tournament.slug,
                                      venue_id: selectedVenue.id,
                                      source: "preview_card",
                                    });
                                  }}
                                />
                              </div>
                              <div className={styles.owlPreviewItemLocked}>
                                Unlock Weekend Pro to see all nearby {category === "hotels" ? "hotels" : category.replaceAll("_", " ")} options.
                              </div>
                            </div>
                          );
	                        })}
	                      </div>
	                    </details>
	                  );
                })()
              ) : null}

                {hotelVenueId && hotelVenueForRedirect ? (
                  <>
                    <div className={`${styles.ctaRow} ${styles.stayCtaRow}`}>
                      <button
                        type="button"
                        className={styles.affiliateCta}
                        onClick={() => openNavChooserForVenue(selectedVenue, "selected_venue_panel")}
                      >
                        Directions
                      </button>
                      <a
                        className={`${styles.affiliateCta} ${styles.affiliateCtaPrimary}`}
                        href={buildVenueHotelsHref({
                          venue: hotelVenueForRedirect,
                          tournamentId: tournament.id,
                        })}
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
                        View all nearby hotels
                      </a>
                      <a
                        className={styles.affiliateCta}
                        href={`/go/vrbo?venueId=${encodeURIComponent(hotelVenueId)}&tournamentId=${encodeURIComponent(tournament.id)}`}
                        target="_blank"
                        rel="noopener noreferrer sponsored"
                      >
                        Rentals nearby
                      </a>
                      <Link
                        className={styles.affiliateCta}
                        href={
                          selectedVenue.seo_slug
                            ? `/venues/${encodeURIComponent(selectedVenue.seo_slug)}`
                            : `/venues/${encodeURIComponent(selectedVenue.id)}`
                        }
                        onClick={() => {
                          void trackTiEvent("venue_view_click", {
                            page_type: "venue_map",
                            tournament_id: tournament.id,
                            tournament_slug: tournament.slug,
                            venue_id: selectedVenue.id,
                            venue_name: selectedVenue.name ?? null,
                            source: "selected_venue_panel",
                          });
                        }}
                      >
                        View venue
                      </Link>
                      <button
                        type="button"
                        className={`${styles.affiliateCta} ${styles.affiliateCtaPrimary} ${styles.teamBlockQuickCta}`}
                        disabled={!teamBlockAnchorPin || !getCurrentTeamBlockDates(teamBlockAnchorPin)}
                        onClick={() => {
                          setIsHotelResultsCollapsed(false);
                          openTeamBlockForm();
                        }}
                      >
                        Need 5+ rooms? Request team block
                      </button>
                    </div>
                    {!teamBlockAnchorPin ? (
                      <div className={styles.teamBlockQuickHint}>Hotel results are required before requesting a team block.</div>
                    ) : !getCurrentTeamBlockDates(teamBlockAnchorPin) ? (
                      <div className={styles.teamBlockQuickHint}>Tournament dates are required before submitting a team hotel block request.</div>
                    ) : (
                      <div className={styles.teamBlockQuickHint}>
                        Request group options for <strong>{getTeamBlockAreaLabel()}</strong> without leaving TournamentInsights
                      </div>
                    )}
                    <div className={styles.teamBlockPanel} ref={teamBlockPanelRef}>
                      <div className={styles.teamBlockHeader}>
                        <div className={styles.teamBlockTitle}>Request team hotel block</div>
                        <div className={styles.teamBlockSub}>
                          Tell us about your group and HotelPlanner will follow up with options for this venue area.
                        </div>
                      </div>

                      {teamBlockSuccess ? (
                        <div className={styles.teamBlockSuccess}>
                          <div className={styles.teamBlockSuccessTitle}>Request submitted</div>
                          <div>
                            HotelPlanner will follow up with group options for this venue area.
                            {teamBlockSuccess.requestId ? ` Ref ${teamBlockSuccess.requestId}.` : ""}
                          </div>
                        </div>
                      ) : null}

                      <div className={styles.teamBlockSelected}>
                        <div className={styles.teamBlockSelectedTitle}>{getTeamBlockAreaLabel()}</div>
                        <div className={styles.teamBlockSelectedMeta}>
                          {getCurrentTeamBlockDates(teamBlockAnchorPin)
                            ? `${getCurrentTeamBlockDates(teamBlockAnchorPin)?.checkIn} → ${getCurrentTeamBlockDates(teamBlockAnchorPin)?.checkOut}`
                            : "Tournament dates are required before submitting a team hotel block request."}
                        </div>
                      </div>

                      {teamBlockError ? <div className={styles.lodgingError}>{teamBlockError}</div> : null}

                      {teamBlockOpen ? (
                        <form className={styles.teamBlockForm} onSubmit={submitTeamBlockForm}>
                          <div className={styles.teamBlockFieldGrid}>
                            <label className={styles.teamBlockField}>
                              <span className={styles.hotelFilterLabel}>Team name</span>
                              <input
                                ref={teamBlockFirstInputRef}
                                className={styles.teamBlockInput}
                                type="text"
                                required
                                value={teamBlockForm.teamName}
                                onChange={(event) => setTeamBlockForm((current) => ({ ...current, teamName: event.target.value }))}
                              />
                            </label>
                            <label className={styles.teamBlockField}>
                              <span className={styles.hotelFilterLabel}>Contact first name</span>
                              <input
                                className={styles.teamBlockInput}
                                type="text"
                                required
                                value={teamBlockForm.contactFirstName}
                                onChange={(event) =>
                                  setTeamBlockForm((current) => ({ ...current, contactFirstName: event.target.value }))
                                }
                              />
                            </label>
                            <label className={styles.teamBlockField}>
                              <span className={styles.hotelFilterLabel}>Contact last name</span>
                              <input
                                className={styles.teamBlockInput}
                                type="text"
                                required
                                value={teamBlockForm.contactLastName}
                                onChange={(event) =>
                                  setTeamBlockForm((current) => ({ ...current, contactLastName: event.target.value }))
                                }
                              />
                            </label>
                            <label className={styles.teamBlockField}>
                              <span className={styles.hotelFilterLabel}>Email</span>
                              <input
                                className={styles.teamBlockInput}
                                type="email"
                                required
                                value={teamBlockForm.email}
                                onChange={(event) => setTeamBlockForm((current) => ({ ...current, email: event.target.value }))}
                              />
                            </label>
                            <label className={styles.teamBlockField}>
                              <span className={styles.hotelFilterLabel}>Phone</span>
                              <input
                                className={styles.teamBlockInput}
                                type="tel"
                                required
                                value={teamBlockForm.phone}
                                onChange={(event) => setTeamBlockForm((current) => ({ ...current, phone: event.target.value }))}
                              />
                            </label>
                            <label className={styles.teamBlockField}>
                              <span className={styles.hotelFilterLabel}>Rooms</span>
                              <input
                                className={styles.teamBlockInput}
                                type="number"
                                min={5}
                                required
                                value={teamBlockForm.rooms}
                                onChange={(event) => setTeamBlockForm((current) => ({ ...current, rooms: event.target.value }))}
                              />
                            </label>
                            <label className={styles.teamBlockField}>
                              <span className={styles.hotelFilterLabel}>Adults / room</span>
                              <input
                                className={styles.teamBlockInput}
                                type="number"
                                min={1}
                                required
                                value={teamBlockForm.adultsPerRoom}
                                onChange={(event) =>
                                  setTeamBlockForm((current) => ({ ...current, adultsPerRoom: event.target.value }))
                                }
                              />
                            </label>
                            <label className={styles.teamBlockField}>
                              <span className={styles.hotelFilterLabel}>Children / room</span>
                              <input
                                className={styles.teamBlockInput}
                                type="number"
                                min={0}
                                value={teamBlockForm.childrenPerRoom}
                                onChange={(event) =>
                                  setTeamBlockForm((current) => ({ ...current, childrenPerRoom: event.target.value }))
                                }
                              />
                            </label>
                          </div>
                          <label className={styles.teamBlockField}>
                            <span className={styles.hotelFilterLabel}>Notes</span>
                            <textarea
                              className={styles.teamBlockTextarea}
                              rows={3}
                              value={teamBlockForm.notes}
                              onChange={(event) => setTeamBlockForm((current) => ({ ...current, notes: event.target.value }))}
                            />
                          </label>
                          <div className={styles.teamBlockActions}>
                            <button
                              type="submit"
                              className={`${styles.affiliateCta} ${styles.affiliateCtaPrimary}`}
                              disabled={teamBlockSubmitting}
                            >
                              {teamBlockSubmitting ? "Submitting…" : "Submit team block request"}
                            </button>
                            <button
                              type="button"
                              className={styles.affiliateCta}
                              disabled={teamBlockSubmitting}
                              onClick={() => {
                                setTeamBlockOpen(false);
                                setTeamBlockError(null);
                              }}
                            >
                              Cancel
                            </button>
                          </div>
                        </form>
                      ) : null}
                    </div>
                    <div className={styles.stayBlock}>
                      <button
                        type="button"
                        className={styles.stayHeaderButton}
                        onClick={() => setIsHotelResultsCollapsed((collapsed) => !collapsed)}
                        aria-expanded={!isHotelResultsCollapsed}
                      >
                        <div className={styles.stayHeaderCopy}>
                          <div className={styles.stayTitle}>Hotels near this venue</div>
                          <div className={styles.staySub}>Compare nearby hotels, ratings, and rates.</div>
                          <div className={styles.staySummary}>{hotelPanelSummary}</div>
                        </div>
                        <span
                          className={`${styles.hotelAvailabilityToggleIcon} ${
                            isHotelResultsCollapsed ? styles.hotelAvailabilityToggleIconCollapsed : ""
                          }`}
                          aria-hidden="true"
                        >
                          ▾
                        </span>
                      </button>

                      {!isHotelResultsCollapsed ? (
                        <>
                          {hotelPinsLoading ? (
                            <div className={styles.hotelLoadingState}>
                              <div className={styles.lodgingNoticeSrOnly} aria-live="polite">
                                Searching HotelPlanner results…
                              </div>
                              <div className={styles.hotelSkeletonList} aria-hidden="true">
                                {Array.from({ length: 3 }).map((_, index) => (
                                  <div key={`hotel-skeleton-${index}`} className={styles.hotelSkeletonCard}>
                                    <div className={`${styles.hotelSkeletonLine} ${styles.hotelSkeletonTitle}`} />
                                    <div className={`${styles.hotelSkeletonLine} ${styles.hotelSkeletonMeta}`} />
                                    <div className={`${styles.hotelSkeletonLine} ${styles.hotelSkeletonMetaShort}`} />
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : null}
                          {!hotelPinsLoading && hotelPinsError ? <div className={styles.lodgingError}>{hotelPinsError}</div> : null}

                          {hotelLoadingFallbackVisible ? (
                            <div className={styles.lodgingFallback}>
                              <div className={styles.lodgingFallbackReason}>
                                HotelPlanner and rental links are available while nearby hotel results load.
                              </div>
                              <div className={styles.lodgingFallbackActions}>
                                <a
                                  className={`${styles.affiliateCta} ${styles.affiliateCtaPrimary}`}
                                  href={buildVenueHotelsHref({
                                    venue: hotelLoadingFallbackVenue!,
                                    tournamentId: tournament.id,
                                  })}
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
                                  View HotelPlanner results
                                </a>
                                <a
                                  className={styles.affiliateCta}
                                  href={`/go/vrbo?venueId=${encodeURIComponent(hotelVenueId)}&tournamentId=${encodeURIComponent(tournament.id)}`}
                                  target="_blank"
                                  rel="noopener noreferrer sponsored"
                                >
                                  Rentals nearby
                                </a>
                              </div>
                            </div>
                          ) : null}

                          {!hotelPinsLoading && hotelFallbackCardVisible ? (
                            <div className={styles.lodgingFallback}>
                              <div className={styles.lodgingFallbackReason}>
                                {hotelPinsFallback?.reason === "no_dates"
                                  ? "Hotel search requires valid dates from the tournament schedule."
                                  : hotelPinsFallback?.reason === "no_venue_coordinates"
                                    ? "Venue coordinates were missing for precise results."
                                    : "Limited hotel inventory was returned for this venue."}
                              </div>
                              <div className={styles.lodgingFallbackActions}>
                                <a
                                  className={`${styles.affiliateCta} ${styles.affiliateCtaPrimary}`}
                                  href={buildVenueHotelsHref({
                                    venue: hotelVenueForRedirect,
                                    tournamentId: tournament.id,
                                  })}
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
                                  View HotelPlanner results
                                </a>
                                <a
                                  className={styles.affiliateCta}
                                  href={`/go/vrbo?venueId=${encodeURIComponent(hotelVenueId)}&tournamentId=${encodeURIComponent(tournament.id)}`}
                                  target="_blank"
                                  rel="noopener noreferrer sponsored"
                                >
                                  Rentals nearby
                                </a>
                              </div>
                            </div>
                          ) : (
                            <div className={styles.hotelPanelSection}>
                              <div className={styles.hotelFilterRow}>
                                <label className={styles.hotelFilterLabel} htmlFor="hotel-rating-filter">
                                  Min rating
                                </label>
                                <select
                                  id="hotel-rating-filter"
                                  className={styles.hotelFilterSelect}
                                  value={hotelRatingFilter}
                                  onChange={(event) => setHotelRatingFilter(Number(event.target.value))}
                                >
                                  <option value={0}>Any</option>
                                  <option value={3}>3+ stars</option>
                                  <option value={4}>4+ stars</option>
                                  <option value={5}>5 stars</option>
                                </select>
                              </div>
                              <div className={styles.lodgingMeta}>{hotelPanelSummary}</div>
                              {hotelHandoffError ? <div className={styles.lodgingError}>{hotelHandoffError}</div> : null}

                              <div className={styles.hotelList}>
                                {orderedHotelPins.map((pin) => (
                                  <button
                                    key={pin.propertyId}
                                    type="button"
                                    className={`${styles.hotelCard} ${selectedHotelId === pin.propertyId ? styles.hotelCardSelected : ""}`}
                                    onClick={() => {
                                      setSelectedHotelId(pin.propertyId);
                                      setIsHotelResultsCollapsed(false);
                                      const currentDates = getCurrentPropertyHandoffDates(pin);
                                      trackLodgingEvent("hotel_card_click", {
                                        page_type: "venue_map",
                                        tournament_id: tournament.id,
                                        venue_id: selectedVenue?.id ?? null,
                                        property_id: pin.propertyId,
                                        checkin: currentDates?.checkIn ?? null,
                                        checkout: currentDates?.checkOut ?? null,
                                      });
                                      openHotelPropertyHandoff(pin, selectedVenue?.id ?? null, "hotel_card_click");
                                    }}
                                  >
                                    <div className={styles.hotelCardTitle}>{pin.name}</div>
                                    <div className={styles.hotelCardMeta}>
                                      <span>{getPinAddress(pin) || "Address on file"}</span>
                                      {pin.distanceMiles != null ? <span> • {pin.distanceMiles.toFixed(1)} mi</span> : null}
                                    </div>
                                    <div className={styles.hotelCardMeta}>
                                      <span>
                                        {pin.rating != null
                                          ? `${pin.rating.toFixed(1)}★${pin.reviewCount ? ` (${pin.reviewCount})` : ""}`
                                          : "—"}
                                      </span>
                                      <span> • </span>
                                      <span>{formatCurrency(pin.fromPrice, pin.currency || "USD") || "Price on request"}</span>
                                    </div>
                                    <div className={styles.hotelCardMeta}>
                                      {pin.latitude == null || pin.longitude == null ? "No map coordinates" : "Open HotelPlanner property page"}
                                    </div>
                                  </button>
                                ))}
                              </div>
                      </div>
                          )}
                        </>
                      ) : null}
                    </div>
                  </>
                ) : null}

              <div className={styles.owlCtaNudge}>Most teams stay within 10–15 minutes of this venue.</div>

              <div className={styles.owlCtaNudge} style={{ marginTop: 6 }}>
                Use this venue as your weekend planning anchor.
              </div>

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
                    label="See closest hotels, food & coffee"
                    user_tier={entitlementTier}
                    has_affiliate_visible={false}
                    onContinueLimited={() => void handleContinueLimitedResults()}
                  />
                )}
              </div>

              <div className={styles.ctaRow}>
                <Link
                  className={styles.cta}
                  href={`/weekend/${encodeURIComponent(tournament.slug)}?venue=${encodeURIComponent(selectedVenue.id)}`}
                  onClick={() => {
                    const href = `/weekend/${encodeURIComponent(tournament.slug)}?venue=${encodeURIComponent(selectedVenue.id)}`;
                    void trackTiEvent("tournament_map_add_to_planner_clicked", {
                      page_type: "tournament_map",
                      tournament_id: tournament.id,
                      tournament_slug: tournament.slug,
                      venue_id: selectedVenue.id,
                      venue_name: selectedVenue.name ?? null,
                      source_page: "tournament_map",
                      cta: "add_to_planner",
                      href,
                    });
                  }}
                >
                  Add to planner
                </Link>

                <ShareWeekendButton
                  tournamentSlug={tournament.slug}
                  tournamentName={tournament.name}
                  venueLabel={selectedVenue.name ? `${selectedVenue.name}${venueLocation(selectedVenue) ? ` (${venueLocation(selectedVenue)})` : ""}` : null}
                  venue={selectedVenue.seo_slug ?? selectedVenue.id}
                  sourcePage="venue_map"
                  buttonLabel="Share this plan"
                  className={`${styles.cta} ${styles.ctaSecondary}`}
                />

                <Link
                  className={`${styles.cta} ${styles.ctaSecondary}`}
                  href={`/weekend/${encodeURIComponent(tournament.slug)}?venue=${encodeURIComponent(selectedVenue.id)}`}
                  onClick={() => {
                    const href = `/weekend/${encodeURIComponent(tournament.slug)}?venue=${encodeURIComponent(selectedVenue.id)}`;
                    void trackTiEvent("tournament_map_weekend_plan_clicked", {
                      page_type: "tournament_map",
                      tournament_id: tournament.id,
                      tournament_slug: tournament.slug,
                      source_page: "tournament_map",
                      cta: "weekend_plan",
                      href,
                      venue: selectedVenue.id,
                    });
                  }}
                >
                  View weekend plan →
                </Link>

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
                                          openPlacePopup({ venue: selectedVenue, category: cat, item, tier, isPreview: false });
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
                                        if (cat === "hotels") {
                                          const href = buildVenueHotelsHref({
                                            venue: selectedVenue,
                                            tournamentId: tournament.id,
                                            source: "venue_map",
                                          });
                                          return (
                                            <a
                                              className={styles.owlActionLink}
                                              href={href}
                                              target="_blank"
                                              rel="noopener noreferrer sponsored"
                                            >
                                              Check rates
                                            </a>
                                          );
                                        }

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
                    <a className={`${styles.owlUnlockBtn} ${styles.owlUnlockBtnSecondary}`} href="/premium">
                      Learn more
                    </a>
                  </div>
                </div>
              ) : null}
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
              {mapHotelLoadingVisible ? (
                <div className={styles.mapHotelLoadingBadge} aria-live="polite">
                  Loading nearby hotels on map…
                </div>
              ) : null}
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

      <NavigationChooser
        open={navSheet.open}
        title={navSheet.title}
        destinationLabel={navSheet.destinationLabel}
        providerHrefs={navSheet.providerHrefs}
        copyText={navSheet.copyText}
        onProviderClick={navSheet.onProviderClick}
        onClose={() => setNavSheet((prev) => ({ ...prev, open: false }))}
      />
    </div>
  );
}
