"use client";

import { useEffect, useRef, useState } from "react";
import BookTravelTeamBlockForm from "../book-travel/BookTravelTeamBlockForm";
import { sendTiAnalytics } from "@/lib/analytics";
import styles from "./WeekendPlanner.module.css";

const DESTINATION_STORAGE_KEY = "ti_weekend_planner_destination";
const CANONICAL_BOOK_TRAVEL_URL = "https://www.tournamentinsights.com/book-travel";

type FanaticsGearCard = {
  partnerLinkId: string | null;
  title: string;
  description: string;
  ctaLabel: string;
  disclosureText: string;
  imageSrc?: string | null;
  imageAlt?: string | null;
  tracking: {
    pageType: string;
    placement: string;
    campaign: string;
  };
};

type WeekendPlannerClientMode = "planner_beta" | "book_travel";

type BookTravelHotelResult = {
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
  hotelIDTypeID?: number | null;
  detailUrl?: string | null;
};

type BookTravelHotelFallback = {
  showHotelFallback: boolean;
  showVrboFallback: boolean;
  reason?: "provider_error" | "low_inventory" | "no_dates" | "no_venue_coordinates";
};

type BookTravelHotelSearchResponse = {
  sessionId?: string;
  provider?: string;
  hotels?: unknown[];
  fallback?: BookTravelHotelFallback | null;
  resolvedCheckIn?: string | null;
  resolvedCheckOut?: string | null;
  resolvedLatitude?: number | null;
  resolvedLongitude?: number | null;
  error?: string;
  code?: string;
};

function getPlannerSourcePage(pathname: string | null | undefined) {
  const path = String(pathname ?? "").trim().toLowerCase();
  if (path.startsWith("/weekend-planner")) return "weekend_planner";
  return "book_travel";
}

function isValidIsoDate(value: string | null) {
  const raw = String(value ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return false;
  const [y, m, d] = raw.split("-").map((n) => Number(n));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (!Number.isFinite(dt.getTime())) return false;
  return dt.toISOString().slice(0, 10) === raw;
}

function todayUtcIso() {
  const now = new Date();
  const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return todayUtc.toISOString().slice(0, 10);
}

function addDaysIso(iso: string, days: number) {
  const [y, m, d] = iso.split("-").map((n) => Number(n));
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function compareIso(a: string, b: string) {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function isoFromCompactUserDate(raw: string) {
  const digitsOnly = raw.replace(/\D/g, "");

  if (/^\d{8}$/.test(digitsOnly)) {
    const mm = digitsOnly.slice(0, 2);
    const dd = digitsOnly.slice(2, 4);
    const yyyy = digitsOnly.slice(4, 8);
    const iso = `${yyyy}-${mm}-${dd}`;
    return isValidIsoDate(iso) ? iso : null;
  }

  if (/^\d{6}$/.test(digitsOnly)) {
    const mm = digitsOnly.slice(0, 2);
    const dd = digitsOnly.slice(2, 4);
    const yy = Number(digitsOnly.slice(4, 6));
    const yyyy = String(2000 + yy);
    const iso = `${yyyy}-${mm}-${dd}`;
    return isValidIsoDate(iso) ? iso : null;
  }

  return null;
}

function mmDdYyyyToIso(value: string | null) {
  if (!value) return null;
  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  const [, mm, dd, yyyy] = match;
  const iso = `${yyyy}-${mm}-${dd}`;
  return isValidIsoDate(iso) ? iso : null;
}

function safeGetStoredDestination() {
  try {
    return String(window.localStorage.getItem(DESTINATION_STORAGE_KEY) ?? "").trim();
  } catch {
    return "";
  }
}

function safeSetStoredDestination(value: string) {
  try {
    window.localStorage.setItem(DESTINATION_STORAGE_KEY, value);
  } catch {
    // Ignore storage failures (private mode, blocked storage, etc.)
  }
}

function formatCurrency(value: number | null | undefined, currency = "USD") {
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
}

function getHotelAddress(hotel: BookTravelHotelResult) {
  return [hotel.addressLine1, hotel.city, hotel.state].filter(Boolean).join(", ") || null;
}

function normalizeBookTravelHotel(raw: unknown): BookTravelHotelResult | null {
  if (!raw || typeof raw !== "object") return null;
  const property = raw as Record<string, unknown>;
  const propertyId = typeof property.id === "string" ? property.id.trim() : "";
  if (!propertyId) return null;

  return {
    propertyId,
    name: String(property.name ?? "").trim() || "Hotel",
    addressLine1: property.addressLine1 == null ? null : String(property.addressLine1),
    city: property.city == null ? null : String(property.city),
    state: property.state == null ? null : String(property.state),
    distanceMiles: typeof property.distanceMiles === "number" && Number.isFinite(property.distanceMiles) ? property.distanceMiles : null,
    rating: typeof property.rating === "number" && Number.isFinite(property.rating) ? property.rating : null,
    reviewCount: typeof property.reviewCount === "number" && Number.isFinite(property.reviewCount) ? property.reviewCount : null,
    thumbnailUrl: property.thumbnailUrl == null ? null : String(property.thumbnailUrl),
    fromPrice: typeof property.fromPrice === "number" && Number.isFinite(property.fromPrice) ? property.fromPrice : null,
    currency: property.currency == null ? null : String(property.currency),
    hotelIDTypeID:
      typeof property.hotelIDTypeID === "number" && Number.isFinite(property.hotelIDTypeID) && property.hotelIDTypeID >= 0
        ? property.hotelIDTypeID
        : 0,
    detailUrl: property.detailUrl == null ? null : String(property.detailUrl),
  };
}

function normalizeBookTravelHotels(hotels: unknown[]) {
  const dedupe = new Map<string, BookTravelHotelResult>();
  for (const item of hotels) {
    const normalized = normalizeBookTravelHotel(item);
    if (!normalized) continue;
    if (dedupe.has(normalized.propertyId)) continue;
    dedupe.set(normalized.propertyId, normalized);
  }
  return Array.from(dedupe.values()).sort((a, b) => {
    const distanceDelta = (a.distanceMiles ?? Number.POSITIVE_INFINITY) - (b.distanceMiles ?? Number.POSITIVE_INFINITY);
    if (Number.isFinite(distanceDelta) && distanceDelta !== 0) return distanceDelta;
    const fromA = a.fromPrice ?? Number.POSITIVE_INFINITY;
    const fromB = b.fromPrice ?? Number.POSITIVE_INFINITY;
    if (fromA !== fromB) return fromA - fromB;
    return a.name.localeCompare(b.name);
  });
}

export default function WeekendPlannerClient(props: {
  fanaticsGear?: FanaticsGearCard;
  mode?: WeekendPlannerClientMode;
  initialAuthState: "signed_out" | "unverified" | "verified";
  initialEntitlement: "explorer" | "insider" | "weekend_pro" | "unknown";
}) {
  const mode = props.mode ?? "book_travel";
  const isPlannerBeta = mode === "planner_beta";
  const viewedFiredRef = useRef(false);
  const plannerTeamHotelViewedRef = useRef(false);
  const sourcePageRef = useRef<"book_travel" | "weekend_planner">("book_travel");
  const [destination, setDestination] = useState("");
  const [shareStatus, setShareStatus] = useState<"idle" | "copied" | "error">("idle");
  const [shareUrl, setShareUrl] = useState(CANONICAL_BOOK_TRAVEL_URL);
  const [canNativeShare, setCanNativeShare] = useState(false);
  const [checkinText, setCheckinText] = useState<string>("");
  const [checkoutText, setCheckoutText] = useState<string>("");
  const [teamBlockOpen, setTeamBlockOpen] = useState(false);
  const [hotelResultsLoading, setHotelResultsLoading] = useState(false);
  const [hotelResultsError, setHotelResultsError] = useState<string | null>(null);
  const [hotelResults, setHotelResults] = useState<BookTravelHotelResult[]>([]);
  const [hotelResultsFallback, setHotelResultsFallback] = useState<BookTravelHotelFallback | null>(null);
  const [hotelResolvedCheckIn, setHotelResolvedCheckIn] = useState<string | null>(null);
  const [hotelResolvedCheckOut, setHotelResolvedCheckOut] = useState<string | null>(null);
  const [hotelResolvedLatitude, setHotelResolvedLatitude] = useState<number | null>(null);
  const [hotelResolvedLongitude, setHotelResolvedLongitude] = useState<number | null>(null);

  useEffect(() => {
    sourcePageRef.current = getPlannerSourcePage(window.location?.pathname) as "book_travel" | "weekend_planner";
    const stored = safeGetStoredDestination();
    const params = new URLSearchParams(window.location.search);
    const city = String(params.get("city") ?? "").trim();
    const state = String(params.get("state") ?? "").trim();
    const derivedDestination = (() => {
      if (city && state) return `${city}, ${state}`;
      if (state) return state;
      return city || "";
    })();

    const initialDestination = derivedDestination || stored;
    if (initialDestination) setDestination(initialDestination);

    // Optional date prefill (do not auto-submit).
    const checkin = String(params.get("checkin") ?? "").trim();
    const checkout = String(params.get("checkout") ?? "").trim();
    const today = todayUtcIso();
    if (isValidIsoDate(checkin) && compareIso(checkin, today) >= 0) {
      const [y, m, d] = checkin.split("-");
      setCheckinText(`${m}-${d}-${y}`);
      if (isValidIsoDate(checkout)) {
        const safeCheckout = compareIso(checkout, checkin) <= 0 ? addDaysIso(checkin, 1) : checkout;
        const [cy, cm, cd] = safeCheckout.split("-");
        setCheckoutText(`${cm}-${cd}-${cy}`);
      }
    }

    // Avoid hydration mismatches by only enabling native share + origin-specific URL after mount.
    try {
      setShareUrl(`${window.location.origin}/book-travel`);
    } catch {
      // Ignore.
    }
    setCanNativeShare(typeof navigator !== "undefined" && typeof navigator.share === "function");

    // Fire one page-view event for planner routes (best-effort).
    // Avoid duplicate firing in strict-mode replays by guarding with a ref.
    if (!viewedFiredRef.current) {
      viewedFiredRef.current = true;
      const pagePath = (() => {
        try {
          return String(window.location.pathname || "").trim() || "/book-travel";
        } catch {
          return "/book-travel";
        }
      })();
      const sourcePage = getPlannerSourcePage(pagePath);
      const referrerPath = (() => {
        try {
          const raw = String(document.referrer || "").trim();
          if (!raw) return null;
          const u = new URL(raw);
          if (u.origin !== window.location.origin) return null;
          const out = `${u.pathname || ""}${u.search || ""}`.trim();
          return out || null;
        } catch {
          return null;
        }
      })();

      if (sourcePage === "weekend_planner") {
        void sendTiAnalytics("weekend_planner_viewed", {
          surface: "planner",
          source_page_type: "planner",
          auth_state: props.initialAuthState,
          entitlement: props.initialEntitlement,
        });
      } else {
        void sendTiAnalytics("book_travel_viewed", {
          page_path: pagePath,
          source_page: sourcePage,
          referrer_path: referrerPath,
          has_destination: Boolean(initialDestination.trim()),
          has_dates: Boolean(checkin && checkout),
        });
      }
    }
  }, [props.initialAuthState, props.initialEntitlement]);

  useEffect(() => {
    if (!isPlannerBeta || plannerTeamHotelViewedRef.current) return;
    plannerTeamHotelViewedRef.current = true;
    track("team_hotel_cta_viewed", {
      surface: "team_hotel",
      source_page_type: "planner",
      cta_type: "team_hotel",
      auth_state: props.initialAuthState,
      entitlement: props.initialEntitlement,
      context_type: "team_hotel",
    });
  }, [isPlannerBeta, props.initialAuthState, props.initialEntitlement]);

  function isoFromUserDate(value: string) {
    const raw = String(value ?? "").trim();
    if (!raw) return null;

    // Accept ISO if user pasted it.
    if (isValidIsoDate(raw)) return raw;

    // Accept compact MMDDYY / MMDDYYYY input with no separators.
    const compactIso = isoFromCompactUserDate(raw);
    if (compactIso) return compactIso;

    // Accept MM-DD-YYYY or M/D/YYYY and normalize.
    const m = raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
    if (!m) return null;
    const mm = String(m[1]).padStart(2, "0");
    const dd = String(m[2]).padStart(2, "0");
    const yyyy = String(m[3]);
    const iso = `${yyyy}-${mm}-${dd}`;
    return isValidIsoDate(iso) ? iso : null;
  }

  function openGoUrlInNewTab(pathname: string, params: URLSearchParams) {
    const url = `${pathname}?${params.toString()}`;
    // Keep user on TI by opening partner redirect in a new tab.
    const w = window.open(url, "_blank", "noopener,noreferrer");
    if (w) w.opener = null;
  }

  function handleDestinationChange(value: string) {
    const trimmed = value.replace(/\s+/g, " ");
    setDestination(trimmed);
    safeSetStoredDestination(trimmed.trim());
  }

  function buildHotelSearchParams() {
    const qp = new URLSearchParams();
    qp.set("ss", destination.trim());
    qp.set("source", sourcePageRef.current);
    const checkinIso = mmDdYyyyToIso(hotelResolvedCheckIn) ?? isoFromUserDate(checkinText);
    const checkoutIso = mmDdYyyyToIso(hotelResolvedCheckOut) ?? isoFromUserDate(checkoutText);
    if (checkinIso) qp.set("checkin", checkinIso);
    if (checkoutIso) qp.set("checkout", checkoutIso);
    if (hotelResolvedLatitude !== null) qp.set("lat", String(hotelResolvedLatitude));
    if (hotelResolvedLongitude !== null) qp.set("lng", String(hotelResolvedLongitude));
    return qp;
  }

  function toHotelPlannerPropertyDate(value: string | null) {
    const raw = String(value ?? "").trim();
    const match = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!match) return null;
    const [, mm, dd, yyyy] = match;
    return `${mm}/${dd}/${yyyy.slice(-2)}`;
  }

  function buildHotelPlannerPropertyUrl(hotel: BookTravelHotelResult) {
    const baseUrl = String(process.env.NEXT_PUBLIC_HOTELPLANNER_WHITE_LABEL_URL ?? "").trim();
    if (!baseUrl || !hotelResolvedCheckIn || !hotelResolvedCheckOut) return null;

    const inDate = toHotelPlannerPropertyDate(hotelResolvedCheckIn);
    const outDate = toHotelPlannerPropertyDate(hotelResolvedCheckOut);
    if (!inDate || !outDate) return null;

    const directUrl = hotel.detailUrl ? new URL(hotel.detailUrl, baseUrl) : new URL("/Hotel/HotelRoomTypes.htm", baseUrl);
    directUrl.pathname = "/Hotel/HotelRoomTypes.htm";
    directUrl.search = "";
    directUrl.searchParams.delete("hotelID");
    directUrl.searchParams.delete("hotelId");
    directUrl.searchParams.delete("idtypeid");
    directUrl.searchParams.delete("idTypeId");
    directUrl.searchParams.set("hotelId", hotel.propertyId);
    directUrl.searchParams.set("idTypeId", String(hotel.hotelIDTypeID ?? 0));
    directUrl.searchParams.set("inDate", inDate);
    directUrl.searchParams.set("outDate", outDate);
    directUrl.searchParams.set("NumRooms", "1");
    directUrl.searchParams.set("sc", "tournamentinsights");
    directUrl.searchParams.set("source", sourcePageRef.current);
    directUrl.searchParams.set("kw", "Tournament weekend stay");
    directUrl.searchParams.set("jobCode", "TI-BOOK-TRAVEL");
    directUrl.searchParams.set("Custom1", `src:${sourcePageRef.current}`);
    directUrl.searchParams.set("Custom2", destination.trim() || sourcePageRef.current);
    directUrl.hash = "content";
    return directUrl.toString();
  }

  async function runBookTravelHotelSearch() {
    const trimmedDestination = destination.trim();
    if (!trimmedDestination || hotelResultsLoading) return;

    setHotelResultsLoading(true);
    setHotelResultsError(null);
    setHotelResults([]);
    setHotelResultsFallback(null);
    setHotelResolvedCheckIn(null);
    setHotelResolvedCheckOut(null);
    setHotelResolvedLatitude(null);
    setHotelResolvedLongitude(null);

    try {
      const response = await fetch(new URL("/api/lodging/search", window.location.origin), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          destination: trimmedDestination,
          source: sourcePageRef.current,
          checkin: isoFromUserDate(checkinText),
          checkout: isoFromUserDate(checkoutText),
          sc: "tournamentinsights",
          kw: "Tournament weekend stay",
          jobCode: "TI-BOOK-TRAVEL",
          custom1: `src:${sourcePageRef.current}`,
          custom2: trimmedDestination,
        }),
      });

      const payload = (await response.json().catch(() => null)) as BookTravelHotelSearchResponse | null;
      const data = payload ?? {};
      if (!response.ok) {
        setHotelResultsError(data.error ? String(data.error) : "Unable to load hotels right now.");
        setHotelResultsFallback(data.fallback ?? { showHotelFallback: true, showVrboFallback: true, reason: "provider_error" });
        setHotelResolvedCheckIn(data.resolvedCheckIn ?? null);
        setHotelResolvedCheckOut(data.resolvedCheckOut ?? null);
        setHotelResolvedLatitude(typeof data.resolvedLatitude === "number" ? data.resolvedLatitude : null);
        setHotelResolvedLongitude(typeof data.resolvedLongitude === "number" ? data.resolvedLongitude : null);
        return;
      }

      const normalizedHotels = normalizeBookTravelHotels(Array.isArray(data.hotels) ? data.hotels : []);
      setHotelResults(normalizedHotels);
      setHotelResultsFallback(data.fallback ?? null);
      setHotelResolvedCheckIn(data.resolvedCheckIn ?? null);
      setHotelResolvedCheckOut(data.resolvedCheckOut ?? null);
      setHotelResolvedLatitude(typeof data.resolvedLatitude === "number" ? data.resolvedLatitude : null);
      setHotelResolvedLongitude(typeof data.resolvedLongitude === "number" ? data.resolvedLongitude : null);
      if (!normalizedHotels.length) {
        setHotelResultsError("No hotel results returned for this search yet.");
      }
    } catch {
      setHotelResultsError("Unable to load hotels right now.");
      setHotelResultsFallback({ showHotelFallback: true, showVrboFallback: true, reason: "provider_error" });
      setHotelResolvedLatitude(null);
      setHotelResolvedLongitude(null);
    } finally {
      setHotelResultsLoading(false);
    }
  }

  const hotelResultsPreview = hotelResults.slice(0, 8);
  const showViewAllHotelsCta = hotelResults.length > 8 && Boolean(destination.trim());
  const showFallbackHotelSearchCta = hotelResults.length === 0 && hotelResultsFallback?.showHotelFallback;

  function track(event: string, properties: Record<string, unknown> = {}) {
    const pagePath = (() => {
      try {
        return String(window.location.pathname || "").trim() || "/book-travel";
      } catch {
        return "/book-travel";
      }
    })();
    const sourcePage = getPlannerSourcePage(pagePath);
    const referrerPath = (() => {
      try {
        const raw = String(document.referrer || "").trim();
        if (!raw) return null;
        const u = new URL(raw);
        if (u.origin !== window.location.origin) return null;
        const out = `${u.pathname || ""}${u.search || ""}`.trim();
        return out || null;
      } catch {
        return null;
      }
    })();

    void sendTiAnalytics(event, {
      ...properties,
      source: sourcePage,
      source_page: sourcePage,
      page_path: pagePath,
      referrer_path: referrerPath,
      ts: Date.now(),
    });
  }

  async function copyShareUrl() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setShareStatus("copied");
      track("book_travel_shared", { travel_type: "share", cta_location: "share_block", channel: "copy", share_url: shareUrl });
      window.setTimeout(() => setShareStatus("idle"), 1200);
    } catch {
      setShareStatus("error");
      window.setTimeout(() => setShareStatus("idle"), 1500);
    }
  }

  async function nativeShare() {
    if (typeof navigator === "undefined" || typeof navigator.share !== "function") return;
    try {
      await navigator.share({
        title: "Book Travel for Your Tournament or Event",
        text: "Planning tournament travel? Find hotels and vacation rentals near any venue or event location.",
        url: shareUrl,
      });
      track("book_travel_shared", { travel_type: "share", cta_location: "share_block", channel: "native", share_url: shareUrl });
    } catch {
      // User cancelled / unsupported.
    }
  }

  const fanaticsHref = (() => {
    const gear = props.fanaticsGear;
    if (!gear?.partnerLinkId) return null;
    const qp = new URLSearchParams();
    qp.set("page_type", gear.tracking.pageType);
    qp.set("placement", gear.tracking.placement);
    qp.set("campaign", gear.tracking.campaign);
    qp.set("partner", "fanatics");
    return `/go/partner/${gear.partnerLinkId}?${qp.toString()}`;
  })();

  return (
    <>
      {isPlannerBeta ? (
        <section className={styles.travelIntro} aria-label="Optional travel planning">
          <h2 className={styles.travelIntroTitle}>Optional: plan travel around your weekend</h2>
          <p className={styles.travelIntroCopy}>
            Already know your tournament city, venue, or dates? Search hotels or vacation rentals from the same
            starting point.
          </p>
        </section>
      ) : null}
      <div className={styles.mainGrid}>
        <article className={styles.panelCard}>
          <div className={styles.panelHeader}>
            <h2 className={styles.panelTitle}>Hotels</h2>
            <p className={styles.panelSub}>
              Best for short stays, flexible check-in, breakfast, and quick tournament weekends.
            </p>
          </div>
          <div className={styles.cardBody}>
            <form
              method="get"
              action="/go/hotels"
              target="_blank"
              onSubmit={async (e) => {
                e.preventDefault();
                track("book_travel_hotels_clicked", {
                  travel_type: "hotel",
                  cta_location: "hotels_card",
                  destination: destination.trim() || null,
                  has_destination: Boolean(destination.trim()),
                  check_in: isoFromUserDate(checkinText),
                  check_out: isoFromUserDate(checkoutText),
                  has_dates: Boolean(isoFromUserDate(checkinText) && isoFromUserDate(checkoutText)),
                });
                await runBookTravelHotelSearch();
              }}
            >
              <div className={styles.formGrid}>
                <div>
                  <label className={`label ${styles.labelDark}`} htmlFor="wp-destination-hotels">
                    Destination (required)
                  </label>
                  <input
                    id="wp-destination-hotels"
                    name="ss"
                    className={`input ${styles.inputDark}`}
                    placeholder="Spokane, WA or 98101"
                    value={destination}
                    onChange={(e) => handleDestinationChange(e.target.value)}
                    required
                  />
                  <div className={styles.fieldHelper}>Search by city, venue name, field complex, gym, or address.</div>
                </div>
                <div className={styles.datesRow}>
                  <div>
                    <label className={`label ${styles.labelDark}`} htmlFor="wp-checkin-hotels">
                      Check-in
                    </label>
                    <input
                      id="wp-checkin-hotels"
                      name="checkin"
                      className={`input ${styles.inputDark}`}
                      placeholder="MM-DD-YYYY or MMDDYY"
                      value={checkinText}
                      onChange={(e) => setCheckinText(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className={`label ${styles.labelDark}`} htmlFor="wp-checkout-hotels">
                      Check-out
                    </label>
                    <input
                      id="wp-checkout-hotels"
                      name="checkout"
                      className={`input ${styles.inputDark}`}
                      placeholder="MM-DD-YYYY or MMDDYY"
                      value={checkoutText}
                      onChange={(e) => setCheckoutText(e.target.value)}
                    />
                  </div>
                </div>
                <div className={styles.fieldHelper}>Tip: adding dates helps show more accurate availability and pricing.</div>
              </div>
              <input type="hidden" name="source" value="book_travel" />
              <div style={{ paddingTop: "0.95rem" }}>
                <button type="submit" className={styles.ctaFull} disabled={hotelResultsLoading}>
                  {hotelResultsLoading ? "Searching hotels..." : "Search hotels"}
                </button>
              </div>
              {hotelResultsError ? <div className={styles.hotelResultsError}>{hotelResultsError}</div> : null}
              {hotelResolvedCheckIn || hotelResolvedCheckOut ? (
                <div className={styles.hotelResultsMeta}>
                  Searching stay window: {hotelResolvedCheckIn || "—"}{hotelResolvedCheckOut ? ` → ${hotelResolvedCheckOut}` : ""}
                </div>
              ) : null}
              {hotelResults.length ? (
                <>
                  <div className={styles.hotelResultsCount}>
                    {hotelResults.length} hotel{hotelResults.length !== 1 ? "s" : ""} found
                  </div>
                  <div className={styles.hotelResultsList}>
                    {hotelResultsPreview.map((hotel) => (
                      <button
                        key={hotel.propertyId}
                        type="button"
                        className={styles.hotelResultCard}
                        onClick={() => {
                          const propertyUrl = buildHotelPlannerPropertyUrl(hotel);
                          if (!propertyUrl) {
                            setHotelResultsError("Hotel details require valid dates before opening HotelPlanner.");
                            return;
                          }
                          window.open(propertyUrl, "_blank", "noopener,noreferrer");
                        }}
                      >
                        <div className={styles.hotelResultTitle}>{hotel.name}</div>
                        <div className={styles.hotelResultMeta}>
                          <span>{getHotelAddress(hotel) || "Address on file"}</span>
                          {hotel.distanceMiles != null ? <span> • {hotel.distanceMiles.toFixed(1)} mi</span> : null}
                        </div>
                        <div className={styles.hotelResultMeta}>
                          <span>
                            {hotel.rating != null
                              ? `${hotel.rating.toFixed(1)}★${hotel.reviewCount ? ` (${hotel.reviewCount})` : ""}`
                              : "—"}
                          </span>
                          <span> • </span>
                          <span>{formatCurrency(hotel.fromPrice, hotel.currency || "USD") || "Price on request"}</span>
                        </div>
                        <div className={styles.hotelResultOpen}>Open HotelPlanner property page</div>
                      </button>
                    ))}
                  </div>
                  {showViewAllHotelsCta ? (
                    <button
                      type="button"
                      className={`${styles.ctaFull} ${styles.ctaSecondary}`}
                      onClick={() => openGoUrlInNewTab("/go/hotels", buildHotelSearchParams())}
                    >
                      View all {hotelResults.length} hotels on HotelPlanner
                    </button>
                  ) : null}
                </>
              ) : null}
              {showFallbackHotelSearchCta ? (
                <div className={styles.hotelFallbackBox}>
                  <div className={styles.hotelFallbackCopy}>
                    Prefer the full HotelPlanner search page? Open it with your current destination and dates.
                  </div>
                  <button
                    type="button"
                    className={`${styles.ctaFull} ${styles.ctaSecondary}`}
                    onClick={() => openGoUrlInNewTab("/go/hotels", buildHotelSearchParams())}
                  >
                    Open HotelPlanner search
                  </button>
                </div>
              ) : null}
            </form>
          </div>
        </article>

        <article className={styles.panelCard}>
          <div className={styles.panelHeader}>
            <h2 className={styles.panelTitle}>Vacation Rentals</h2>
            <p className={styles.panelSub}>
              Best for families, teams, kitchens, laundry, and longer event weekends.
            </p>
          </div>
          <div className={styles.cardBody}>
            <form
              method="get"
              action="/go/vrbo"
              target="_blank"
              onSubmit={() =>
                track("book_travel_vrbo_clicked", {
                  travel_type: "rental",
                  cta_location: "rentals_card",
                  destination: destination.trim() || null,
                  has_destination: Boolean(destination.trim()),
                  check_in: isoFromUserDate(checkinText),
                  check_out: isoFromUserDate(checkoutText),
                  has_dates: Boolean(isoFromUserDate(checkinText) && isoFromUserDate(checkoutText)),
                })
              }
            >
              <div className={styles.formGrid}>
                <div>
                  <label className={`label ${styles.labelDark}`} htmlFor="wp-destination-vrbo">
                    Destination (required)
                  </label>
                  <input
                    id="wp-destination-vrbo"
                    name="destination"
                    className={`input ${styles.inputDark}`}
                    placeholder="Spokane, WA or 98101"
                    value={destination}
                    onChange={(e) => handleDestinationChange(e.target.value)}
                    required
                  />
                  <div className={styles.fieldHelper}>Search by city, venue name, field complex, gym, or address.</div>
                </div>
                <div className={styles.datesRow}>
                  <div>
                    <label className={`label ${styles.labelDark}`} htmlFor="wp-checkin-vrbo">
                      Check-in
                    </label>
                    <input
                      id="wp-checkin-vrbo"
                      name="checkin"
                      className={`input ${styles.inputDark}`}
                      placeholder="MM-DD-YYYY or MMDDYY"
                      value={checkinText}
                      onChange={(e) => setCheckinText(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className={`label ${styles.labelDark}`} htmlFor="wp-checkout-vrbo">
                      Check-out
                    </label>
                    <input
                      id="wp-checkout-vrbo"
                      name="checkout"
                      className={`input ${styles.inputDark}`}
                      placeholder="MM-DD-YYYY or MMDDYY"
                      value={checkoutText}
                      onChange={(e) => setCheckoutText(e.target.value)}
                    />
                  </div>
                </div>
                <div className={styles.fieldHelper}>Tip: adding dates helps show more accurate availability and pricing.</div>
              </div>
              <input type="hidden" name="source" value="book_travel" />
              <div style={{ paddingTop: "0.95rem" }}>
                <button
                  type="submit"
                  className={styles.ctaFull}
                  onClick={(e) => {
                    e.preventDefault();
                    const qp = new URLSearchParams();
                    qp.set("destination", destination.trim());
                    qp.set("source", sourcePageRef.current);
                    const checkinIso = isoFromUserDate(checkinText);
                    const checkoutIso = isoFromUserDate(checkoutText);
                    if (checkinIso) qp.set("checkin", checkinIso);
                    if (checkoutIso) qp.set("checkout", checkoutIso);
                    openGoUrlInNewTab("/go/vrbo", qp);
                  }}
                >
                  Search Vrbo rentals
                </button>
              </div>
            </form>
          </div>
        </article>

        {isPlannerBeta ? (
          <article className={styles.panelCard}>
            <div className={styles.panelHeader}>
              <h2 className={styles.panelTitle}>Team hotel blocks</h2>
              <p className={styles.panelSub}>
                Coordinating rooms for a team or club? Request hotel options for your tournament weekend, including
                dates, city, team size, and preferred area.
              </p>
            </div>
            <div className={styles.cardBody}>
              <p className={styles.smallHelper}>Best for team managers, coaches, and clubs booking multiple rooms.</p>
              <div style={{ paddingTop: "0.95rem" }}>
                <button
                  type="button"
                  className={styles.ctaFull}
                  onClick={() => {
                    track("team_hotel_cta_clicked", {
                      surface: "team_hotel",
                      source_page_type: "planner",
                      cta_type: "team_hotel",
                      auth_state: props.initialAuthState,
                      entitlement: props.initialEntitlement,
                      context_type: "team_hotel",
                    });
                    setTeamBlockOpen((current) => !current);
                  }}
                >
                  Request team hotel options
                </button>
              </div>
            </div>
          </article>
        ) : null}

        {fanaticsHref && props.fanaticsGear ? (
          <article className={styles.panelCard} data-partner="fanatics" data-placement={props.fanaticsGear.tracking.placement} data-sport="all_sports">
            <div className={styles.panelHeader}>
              <h2 className={styles.panelTitle}>{props.fanaticsGear.title}</h2>
              <p className={styles.panelSub}>{props.fanaticsGear.description}</p>
            </div>
            <div className={styles.cardBody}>
              {props.fanaticsGear.imageSrc ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={props.fanaticsGear.imageSrc}
                  alt={props.fanaticsGear.imageAlt || props.fanaticsGear.title}
                  style={{
                    width: "100%",
                    height: "auto",
                    borderRadius: 12,
                    border: "1px solid rgba(255, 255, 255, 0.14)",
                    marginBottom: 10,
                    display: "block",
                  }}
                />
              ) : null}

              <a
                href={fanaticsHref}
                target="_blank"
                rel="sponsored noopener noreferrer"
                className={styles.ctaFull}
                data-partner="fanatics"
                data-sub-id-1="gear_hub"
                data-sub-id-2="fanatics_module"
                data-sub-id-3="all_sports"
              >
                {props.fanaticsGear.ctaLabel}
              </a>
              <div className={styles.smallHelper} style={{ marginTop: "0.65rem" }}>
                {props.fanaticsGear.disclosureText}
              </div>
            </div>
          </article>
        ) : null}

      </div>

      {isPlannerBeta && teamBlockOpen ? (
        <div className={styles.inlineTeamBlockWrap}>
          <BookTravelTeamBlockForm
            surface="weekend_planner"
            defaultOpen
            showToggle={false}
            entitlement={props.initialEntitlement}
            authState={props.initialAuthState}
          />
        </div>
      ) : null}

      <div className={styles.secondaryStack}>
        <article className={styles.panelCard}>
          <div className={styles.panelHeader}>
            <h2 className={styles.panelTitle}>
              {isPlannerBeta ? "Sharing travel plans with a team or family?" : "Planning with a team or family?"}
            </h2>
            <p className={styles.panelSub}>
              Share this travel page with your group so everyone can search from the same starting point.
            </p>
          </div>
          <div className={styles.cardBody}>
            <div className={styles.shareRow}>
              <input className={`input ${styles.inputDark}`} value={shareUrl} readOnly aria-label="Book travel page URL" />
              <div className={styles.shareActions}>
                <button type="button" className={styles.ctaFull} onClick={copyShareUrl}>
                  {shareStatus === "copied" ? "Copied" : "Copy travel link"}
                </button>
                {canNativeShare ? (
                  <button type="button" className={`${styles.ctaFull} ${styles.ctaSecondary}`} onClick={nativeShare}>
                    Share
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </article>
      </div>
    </>
  );
}
