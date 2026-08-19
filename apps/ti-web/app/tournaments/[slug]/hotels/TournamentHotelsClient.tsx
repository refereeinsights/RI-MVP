"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { trackTiEvent } from "@/lib/tiAnalyticsClient";
import {
  buildHotelPlannerBookingAttribution,
  createOutboundAttributionId,
  HOTEL_PLANNER_BOOKING_PLACEMENTS,
  HOTEL_PLANNER_GROUP_REQUEST_PLACEMENTS,
  sanitizeHotelPlannerSpreadsheetContext,
} from "@/lib/hotelPlannerAttribution";
import { readOrCreateLodgingSessionId } from "@/lib/lodgingSession";
import {
  appendHotelMeasurementParams,
  readOrRememberHotelDistributionSource,
  resolveHotelTrafficSource,
  type HotelDistributionSource,
} from "@/lib/hotelMeasurement";
import { buildTeamHotelBookingHref } from "@/lib/teamHotelBooking";
import {
  mmDdYyyyToIso,
  nullableFiniteNumber,
  type TournamentHotelsDateSource,
  type TournamentHotelsVenue,
} from "@/lib/lodging/tournamentHotels";
import styles from "./TournamentHotels.module.css";

type Tournament = {
  id: string;
  slug: string;
  name: string;
  sport: string | null;
  city: string | null;
  state: string | null;
  startDate: string | null;
  endDate: string | null;
};

type Hotel = {
  propertyId: string;
  name: string;
  addressLine1: string | null;
  city: string | null;
  state: string | null;
  distanceMiles: number | null;
  rating: number | null;
  reviewCount: number | null;
  thumbnailUrl: string | null;
  fromPrice: number | null;
  currency: string | null;
  hotelIDTypeID: number | null;
  detailUrl: string | null;
  outboundRequestId: string;
};

type SearchResponse = {
  sessionId?: string | null;
  provider?: string | null;
  hotels?: unknown[];
  fallback?: { showHotelFallback?: boolean; reason?: string | null } | null;
  resolvedCheckIn?: string | null;
  resolvedCheckOut?: string | null;
  error?: string | null;
};

function text(value: unknown) {
  const result = typeof value === "string" ? value.trim() : "";
  return result || null;
}

function normalizeHotel(value: unknown): Hotel | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const propertyId = text(row.propertyId ?? row.id ?? row.hotelId);
  const name = text(row.name ?? row.hotelName);
  if (!propertyId || !name) return null;
  return {
    propertyId,
    name,
    addressLine1: text(row.addressLine1 ?? row.address),
    city: text(row.city),
    state: text(row.state),
    distanceMiles: nullableFiniteNumber(row.distanceMiles),
    rating: nullableFiniteNumber(row.rating),
    reviewCount: nullableFiniteNumber(row.reviewCount),
    thumbnailUrl: text(row.thumbnailUrl ?? row.imageUrl),
    fromPrice: nullableFiniteNumber(row.fromPrice),
    currency: text(row.currency),
    hotelIDTypeID: nullableFiniteNumber(row.hotelIDTypeID),
    detailUrl: text(row.detailUrl),
    outboundRequestId: analyticsUuid(),
  };
}

function uniqueHotels(values: unknown[]) {
  const seen = new Set<string>();
  return values.flatMap((value) => {
    const hotel = normalizeHotel(value);
    if (!hotel || seen.has(hotel.propertyId)) return [];
    seen.add(hotel.propertyId);
    return [hotel];
  });
}

function analyticsUuid() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-0000-4000-8000-000000000000`;
}

function destinationForVenue(venue: TournamentHotelsVenue | null, tournament: Tournament) {
  const venueLocality = [venue?.city, venue?.state].filter(Boolean).join(", ");
  if (venue?.name && venueLocality) return `${venue.name}, ${venueLocality}`;
  if (venueLocality) return venueLocality;
  return [tournament.city, tournament.state].filter(Boolean).join(", ");
}

export default function TournamentHotelsClient({
  tournament,
  venues,
  searchableVenues,
  initialVenueId,
  initialDates,
  showTournamentSupportDisclosure,
  tournamentContext,
}: {
  tournament: Tournament;
  venues: TournamentHotelsVenue[];
  searchableVenues: TournamentHotelsVenue[];
  initialVenueId: string | null;
  initialDates: { checkin: string; checkout: string; source: Exclude<TournamentHotelsDateSource, "user_adjusted" | "unavailable"> };
  showTournamentSupportDisclosure: boolean;
  tournamentContext: string | null;
}) {
  const [selectedVenueId, setSelectedVenueId] = useState(initialVenueId);
  const [checkin, setCheckin] = useState(initialDates.checkin);
  const [checkout, setCheckout] = useState(initialDates.checkout);
  const [dateSource, setDateSource] = useState<TournamentHotelsDateSource>(initialDates.source);
  const [hotels, setHotels] = useState<Hotel[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fallback, setFallback] = useState(false);
  const [searchSessionId, setSearchSessionId] = useState<string | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const requestGenerationRef = useRef(0);
  const pageViewedRef = useRef(false);
  const sessionIdRef = useRef<string | null>(null);
  const distributionSourceRef = useRef<HotelDistributionSource | null>(null);

  const selectedVenue = useMemo(
    () => searchableVenues.find((venue) => venue.id === selectedVenueId) ?? null,
    [searchableVenues, selectedVenueId]
  );
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const datesValid = Boolean(checkin && checkout && checkin >= today && checkout > checkin);
  const tournamentIsPast = Boolean((tournament.endDate ?? tournament.startDate) && (tournament.endDate ?? tournament.startDate)! < today);
  const destination = destinationForVenue(selectedVenue, tournament);

  useEffect(() => {
    sessionIdRef.current = readOrCreateLodgingSessionId();
    distributionSourceRef.current = readOrRememberHotelDistributionSource();
    if (pageViewedRef.current) return;
    pageViewedRef.current = true;
    void trackTiEvent("tournament_hotels_page_viewed", {
      tournament_id: tournament.id,
      tournament_slug: tournament.slug,
      sport: tournament.sport,
      venue_count: venues.length,
      searchable_venue_count: searchableVenues.length,
      has_valid_venues: searchableVenues.length > 0,
      initial_date_source: initialDates.source,
      page_type: "tournament_hotels",
      session_id: sessionIdRef.current,
      distribution_source: distributionSourceRef.current,
    });
  }, [initialDates.source, searchableVenues.length, tournament, venues.length]);

  useEffect(() => {
    if (!selectedVenue || !datesValid) {
      requestRef.current?.abort();
      setLoading(false);
      setHotels([]);
      return;
    }

    const generation = ++requestGenerationRef.current;
    const timer = window.setTimeout(async () => {
      requestRef.current?.abort();
      const controller = new AbortController();
      requestRef.current = controller;
      setLoading(true);
      setError(null);
      setFallback(false);

      const attribution = buildHotelPlannerBookingAttribution({
        sourcePageType: "tournament_hotels",
        placement: HOTEL_PLANNER_BOOKING_PLACEMENTS.tournamentHotelsViewAll,
        venueId: selectedVenue.id,
        tournamentRef: tournament.slug,
        custom8: sanitizeHotelPlannerSpreadsheetContext(tournament.name),
      });

      try {
        const response = await fetch("/api/lodging/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            venueId: selectedVenue.id,
            tournamentId: tournament.id,
            checkin,
            checkout,
            rooms: 1,
            adults: 2,
            source: "tournament_hotels",
            page_type: "tournament_hotels",
            page_url: window.location.pathname,
            session_id: sessionIdRef.current,
            traffic_source: resolveHotelTrafficSource({
              distributionSource: distributionSourceRef.current,
            }),
            cta_placement: HOTEL_PLANNER_BOOKING_PLACEMENTS.tournamentHotelsViewAll,
            sc: attribution.sc,
            keyword: attribution.keyword,
            jobCode: attribution.jobCode,
            custom1: attribution.custom1,
            custom2: attribution.custom2,
            custom4: attribution.custom4,
            custom5: attribution.custom5,
            custom8: attribution.custom8,
          }),
        });
        const payload = ((await response.json().catch(() => null)) ?? {}) as SearchResponse;
        if (generation !== requestGenerationRef.current || controller.signal.aborted) return;

        const resolvedCheckin = mmDdYyyyToIso(payload.resolvedCheckIn);
        const resolvedCheckout = mmDdYyyyToIso(payload.resolvedCheckOut);
        if (resolvedCheckin && resolvedCheckout) {
          if (resolvedCheckin !== checkin || resolvedCheckout !== checkout) setDateSource("booking_safe_fallback");
          setCheckin(resolvedCheckin);
          setCheckout(resolvedCheckout);
        }
        setSearchSessionId(payload.sessionId ?? null);

        if (!response.ok) {
          setHotels([]);
          setFallback(true);
          setError(response.status === 429 ? "Hotel search is busy. Please try again shortly." : "Live hotel results are temporarily unavailable.");
          return;
        }

        const nextHotels = uniqueHotels(Array.isArray(payload.hotels) ? payload.hotels : []);
        setHotels(nextHotels);
        setFallback(Boolean(payload.fallback?.showHotelFallback) || nextHotels.length === 0);
        if (nextHotels.length === 0) setError("No live hotel results were returned for this venue and these dates.");
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        if (generation !== requestGenerationRef.current) return;
        setHotels([]);
        setFallback(true);
        setError("Live hotel results are temporarily unavailable.");
      } finally {
        if (generation === requestGenerationRef.current && !controller.signal.aborted) setLoading(false);
      }
    }, 400);

    return () => {
      window.clearTimeout(timer);
      requestRef.current?.abort();
    };
  }, [checkin, checkout, datesValid, selectedVenue, tournament.id, tournament.name, tournament.slug]);

  function attributedHref(path: "/go/hotels" | "/go/hotels/property", placement: string, hotel?: Hotel) {
    const outboundRequestId = hotel?.outboundRequestId ?? analyticsUuid();
    const outboundAttributionId = createOutboundAttributionId(() => outboundRequestId);
    const attribution = buildHotelPlannerBookingAttribution({
      outboundAttributionId,
      sourcePageType: "tournament_hotels",
      placement,
      venueId: selectedVenue?.id ?? null,
      tournamentRef: tournament.slug,
      custom8: sanitizeHotelPlannerSpreadsheetContext(tournament.name),
    });
    const url = new URL(path, window.location.origin);
    if (hotel) {
      url.searchParams.set("hotelId", hotel.propertyId);
      url.searchParams.set("idTypeId", String(hotel.hotelIDTypeID ?? 0));
      url.searchParams.set("inDate", checkin);
      url.searchParams.set("outDate", checkout);
      if (hotel.detailUrl) url.searchParams.set("detail_url", hotel.detailUrl);
    } else {
      url.searchParams.set("checkin", checkin);
      url.searchParams.set("checkout", checkout);
      if (destination) url.searchParams.set("ss", destination);
      if (selectedVenue?.latitude != null) url.searchParams.set("latitude", String(selectedVenue.latitude));
      if (selectedVenue?.longitude != null) url.searchParams.set("longitude", String(selectedVenue.longitude));
    }
    url.searchParams.set("source", "tournament_hotels");
    url.searchParams.set("page_type", "tournament_hotels");
    url.searchParams.set("cta_placement", placement);
    url.searchParams.set("tournamentId", tournament.id);
    if (!selectedVenue && tournamentContext) {
      url.searchParams.set("tournament_context", tournamentContext);
    }
    url.searchParams.set("tournament_slug", tournament.slug);
    if (selectedVenue) url.searchParams.set("venueId", selectedVenue.id);
    appendHotelMeasurementParams(url, {
      sessionId: sessionIdRef.current,
      distributionSource: distributionSourceRef.current,
    });
    const trafficSource = resolveHotelTrafficSource({ distributionSource: distributionSourceRef.current });
    if (trafficSource) url.searchParams.set("traffic_source", trafficSource);
    if (searchSessionId) url.searchParams.set("lodging_search_id", searchSessionId);
    url.searchParams.set("outbound_request_id", outboundRequestId);
    url.searchParams.set("outbound_attribution_id", outboundAttributionId);
    url.searchParams.set("page_url", window.location.pathname);
    url.searchParams.set("sc", attribution.sc);
    if (attribution.keyword) url.searchParams.set("kw", attribution.keyword);
    url.searchParams.set("jobCode", attribution.jobCode);
    for (const index of [1, 2, 3, 4, 5, 6, 7, 8] as const) {
      const value = attribution[`custom${index}`];
      if (value) url.searchParams.set(`custom${index}`, value);
    }
    return { href: url.toString(), outboundRequestId };
  }

  function trackPropertyClick(hotel: Hotel) {
    void trackTiEvent("hotel_card_click", {
      page_type: "tournament_hotels",
      tournament_id: tournament.id,
      tournament_slug: tournament.slug,
      venue_id: selectedVenue?.id ?? null,
      property_id: hotel.propertyId,
      date_source: dateSource,
      source_page_type: "tournament_hotels",
      session_id: sessionIdRef.current,
      distribution_source: distributionSourceRef.current,
    });
  }

  function openViewAll() {
    const handoff = attributedHref("/go/hotels", HOTEL_PLANNER_BOOKING_PLACEMENTS.tournamentHotelsViewAll);
    const ctaInstanceId = analyticsUuid();
    const ctaInteractionId = analyticsUuid();
    void trackTiEvent("hotel_cta_clicked", {
      session_id: sessionIdRef.current,
      cta_instance_id: ctaInstanceId,
      cta_interaction_id: ctaInteractionId,
      cta_type: "hotel",
      cta_placement: HOTEL_PLANNER_BOOKING_PLACEMENTS.tournamentHotelsViewAll,
      flow_type: "direct_outbound",
      page_type: "tournament_hotels",
      source_page_type: "tournament_hotels",
      page_url: window.location.pathname,
      device_type: window.innerWidth < 768 ? "mobile" : "desktop",
      traffic_source: resolveHotelTrafficSource({ distributionSource: distributionSourceRef.current }),
      distribution_source: distributionSourceRef.current,
      venue_id: selectedVenue?.id ?? null,
      tournament_id: tournament.id,
      tournament_slug: tournament.slug,
      date_source: dateSource,
      referrer: document.referrer || null,
      outbound_request_id: handoff.outboundRequestId,
    });
    window.open(handoff.href, "_blank", "noopener,noreferrer");
  }

  const teamHref = buildTeamHotelBookingHref({
    destination,
    city: selectedVenue?.city ?? tournament.city,
    state: selectedVenue?.state ?? tournament.state,
    checkin,
    checkout,
    tournamentId: tournament.id,
    tournamentSlug: tournament.slug,
    tournamentName: tournament.name,
    venueId: selectedVenue?.id,
    venueName: selectedVenue?.name,
    sport: tournament.sport,
    entrySource: "tournament_hotels",
    entryPageType: "tournament_hotels",
    entryPath: `/tournaments/${tournament.slug}/hotels`,
    entryPlacement: HOTEL_PLANNER_GROUP_REQUEST_PLACEMENTS.tournamentHotelsTeamBlock,
  });

  return (
    <section className={styles.experience}>
      <section className={styles.controls} aria-labelledby="hotel-search-heading">
        <div>
          <p className={styles.sectionLabel}>Plan your stay</p>
          <h2 id="hotel-search-heading">Hotels near where you play</h2>
        </div>

        {searchableVenues.length > 1 ? (
          <label className={styles.field}>
            <span>Where are you playing?</span>
            <select value={selectedVenueId ?? ""} onChange={(event) => setSelectedVenueId(event.target.value)}>
              {searchableVenues.map((venue) => (
                <option key={venue.id} value={venue.id}>
                  {venue.name || "Tournament venue"}{[venue.city, venue.state].filter(Boolean).length ? ` — ${[venue.city, venue.state].filter(Boolean).join(", ")}` : ""}
                </option>
              ))}
            </select>
          </label>
        ) : selectedVenue ? (
          <div className={styles.selectedVenue}>
            <strong>{selectedVenue.name || "Tournament venue"}</strong>
            <span>{[selectedVenue.address, selectedVenue.city, selectedVenue.state].filter(Boolean).join(", ")}</span>
          </div>
        ) : null}

        <div className={styles.dateGrid}>
          <label className={styles.field}>
            <span>Check-in</span>
            <input type="date" min={today} value={checkin} onChange={(event) => { setCheckin(event.target.value); setDateSource("user_adjusted"); }} />
          </label>
          <label className={styles.field}>
            <span>Check-out</span>
            <input type="date" min={checkin || today} value={checkout} onChange={(event) => { setCheckout(event.target.value); setDateSource("user_adjusted"); }} />
          </label>
        </div>
        <p className={styles.helper}>
          {tournamentIsPast
            ? "This tournament has ended, so we selected future lodging dates. Adjust them as needed."
            : "Showing hotels for your tournament weekend — adjust dates if needed."}
        </p>
        {!datesValid ? <p className={styles.error} role="alert">Choose a future check-in date and a check-out date after check-in.</p> : null}

        {venues.length > searchableVenues.length ? (
          <details className={styles.venueContext}>
            <summary>All tournament venues ({venues.length})</summary>
            <ul>
              {venues.map((venue) => (
                <li key={venue.id}>{venue.name || "Tournament venue"} · {[venue.city, venue.state].filter(Boolean).join(", ") || "Location unavailable"}</li>
              ))}
            </ul>
          </details>
        ) : null}
      </section>

      {showTournamentSupportDisclosure ? <div className={styles.supportNotice}>Bookings through this tournament hotel page help support the tournament.</div> : null}

      {searchableVenues.length === 0 ? (
        <div className={styles.fallbackBox}>
          <h2>Venue-specific hotel results aren’t available yet</h2>
          <p>We don’t have verified coordinates for this tournament’s venues. You can still search by tournament destination or request a team block.</p>
        </div>
      ) : null}

      {loading ? <p className={styles.status} role="status" aria-live="polite">Loading live hotel options…</p> : null}
      {error ? <p className={styles.error} role="alert">{error}</p> : null}

      {hotels.length > 0 ? (
        <div className={styles.results} aria-live="polite">
          <div className={styles.resultsHeading}>
            <h2>Hotel options near {selectedVenue?.name || "the tournament"}</h2>
            <span>{hotels.length} live option{hotels.length === 1 ? "" : "s"}</span>
          </div>
          <div className={styles.hotelList}>
            {hotels.map((hotel) => {
              const location = [hotel.addressLine1, hotel.city, hotel.state].filter(Boolean).join(", ");
              const propertyHandoff = attributedHref(
                "/go/hotels/property",
                HOTEL_PLANNER_BOOKING_PLACEMENTS.tournamentHotelsProperty,
                hotel
              );
              return (
                <article className={styles.hotelCard} key={hotel.propertyId}>
                  {hotel.thumbnailUrl ? (
                    // HotelPlanner images are provider-hosted and not constrained to a stable Next Image remote pattern.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={hotel.thumbnailUrl} alt="" loading="lazy" />
                  ) : <div className={styles.imageFallback} aria-hidden="true">Hotel</div>}
                  <div className={styles.hotelBody}>
                    <h3>{hotel.name}</h3>
                    {location ? <p>{location}</p> : null}
                    <div className={styles.hotelMeta}>
                      {hotel.distanceMiles != null ? <span>{hotel.distanceMiles.toFixed(1)} mi from venue</span> : null}
                      {hotel.rating != null ? <span>{hotel.rating.toFixed(1)}★{hotel.reviewCount != null ? ` (${hotel.reviewCount})` : ""}</span> : null}
                    </div>
                    <div className={styles.hotelActionRow}>
                      <div>{hotel.fromPrice != null ? <><span className={styles.from}>From</span><strong>{new Intl.NumberFormat("en-US", { style: "currency", currency: hotel.currency || "USD", maximumFractionDigits: 0 }).format(hotel.fromPrice)}</strong><span className={styles.from}> / night</span></> : <span className={styles.from}>See live availability</span>}</div>
                      <a
                        href={propertyHandoff.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => trackPropertyClick(hotel)}
                      >
                        View hotel
                      </a>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      ) : null}

      {(selectedVenue || destination) && datesValid ? (
        <div className={styles.actions}>
          <button type="button" className={styles.primaryAction} onClick={openViewAll}>View all hotels</button>
          {fallback ? <span>See additional availability on HotelPlanner.</span> : null}
        </div>
      ) : (
        <a className={styles.primaryAction} href="/book-travel">Search tournament travel</a>
      )}

      <a
        className={styles.teamAction}
        href={teamHref}
        onClick={() => {
          void trackTiEvent("team_hotel_cta_clicked", {
            surface: "tournament_hotels",
            source_surface: "tournament_hotels",
            source_page_type: "tournament_hotels",
            cta_type: "team_hotel",
            cta_placement: HOTEL_PLANNER_GROUP_REQUEST_PLACEMENTS.tournamentHotelsTeamBlock,
            context_type: "team_hotel",
            tournament_id: tournament.id,
            tournament_slug: tournament.slug,
            venue_id: selectedVenue?.id ?? null,
            entry_source: "tournament_hotels",
            entry_page_type: "tournament_hotels",
            entry_path: `/tournaments/${tournament.slug}/hotels`,
            entry_placement: HOTEL_PLANNER_GROUP_REQUEST_PLACEMENTS.tournamentHotelsTeamBlock,
            current_page_type: "tournament_hotels",
            current_page_path: window.location.pathname,
            date_source: dateSource,
            sport: tournament.sport,
            session_id: sessionIdRef.current,
            distribution_source: distributionSourceRef.current,
          });
        }}
      >
        Need 5+ rooms? Request a team hotel block
      </a>

      <p className={styles.disclosure}>Hotel links are affiliate links. TournamentInsights may earn a commission at no additional cost to you.</p>
    </section>
  );
}
