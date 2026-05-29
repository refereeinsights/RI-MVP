"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { sendTiAnalytics } from "@/lib/analytics";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";
import { getTier } from "@/lib/entitlements";
import { WEEKEND_PRO_FOUNDING_DEADLINE_COPY } from "@/lib/weekendProPricing";
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

export default function WeekendPlannerClient(props: { fanaticsGear?: FanaticsGearCard }) {
  const viewedFiredRef = useRef(false);
  const sourcePageRef = useRef<"book_travel" | "weekend_planner">("book_travel");
  const [tier, setTier] = useState<"explorer" | "insider" | "weekend_pro" | "unknown">("unknown");
  const [destination, setDestination] = useState("");
  const [shareStatus, setShareStatus] = useState<"idle" | "copied" | "error">("idle");
  const [shareUrl, setShareUrl] = useState(CANONICAL_BOOK_TRAVEL_URL);
  const [canNativeShare, setCanNativeShare] = useState(false);
  const [checkinText, setCheckinText] = useState<string>("");
  const [checkoutText, setCheckoutText] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const supabase = getSupabaseBrowserClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          if (!cancelled) setTier("explorer");
          return;
        }
        const { data: profile } = await supabase
          .from("ti_users" as any)
          .select("plan,subscription_status,current_period_end,trial_ends_at")
          .eq("id", user.id)
          .maybeSingle();
        const resolved = getTier(user, (profile as any) ?? null);
        if (!cancelled) setTier(resolved);
      } catch {
        if (!cancelled) setTier("unknown");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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

      void sendTiAnalytics("book_travel_viewed", {
        page_path: pagePath,
        source_page: sourcePage,
        referrer_path: referrerPath,
        has_destination: Boolean(initialDestination.trim()),
        has_dates: Boolean(checkin && checkout),
      });
    }
  }, []);

  function isoFromUserDate(value: string) {
    const raw = String(value ?? "").trim();
    if (!raw) return null;

    // Accept ISO if user pasted it.
    if (isValidIsoDate(raw)) return raw;

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

  function focusDestination() {
    const el = document.getElementById("wp-destination-hotels");
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.focus();
    }
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
              onSubmit={() =>
                track("book_travel_hotels_clicked", {
                  travel_type: "hotel",
                  cta_location: "hotels_card",
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
                      placeholder="MM-DD-YYYY"
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
                      placeholder="MM-DD-YYYY"
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
                    qp.set("ss", destination.trim());
                    qp.set("source", sourcePageRef.current);
                    const checkinIso = isoFromUserDate(checkinText);
                    const checkoutIso = isoFromUserDate(checkoutText);
                    if (checkinIso) qp.set("checkin", checkinIso);
                    if (checkoutIso) qp.set("checkout", checkoutIso);
                    openGoUrlInNewTab("/go/hotels", qp);
                  }}
                >
                  Search hotels on Booking.com
                </button>
              </div>
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
                      placeholder="MM-DD-YYYY"
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
                      placeholder="MM-DD-YYYY"
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

      <div className={styles.secondaryStack}>
        <article className={styles.panelCard}>
          <div className={styles.panelHeader}>
            <h2 className={styles.panelTitle}>Planning with a team or family?</h2>
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
