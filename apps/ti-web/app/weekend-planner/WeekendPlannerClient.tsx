"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { sendTiAnalytics } from "@/lib/analytics";
import UpgradeWeekendProButton from "@/components/UpgradeWeekendProButton";
import styles from "./WeekendPlanner.module.css";

const DESTINATION_STORAGE_KEY = "ti_weekend_planner_destination";
const CANONICAL_WEEKEND_PLANNER_URL = "https://www.tournamentinsights.com/weekend-planner";

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

export default function WeekendPlannerClient() {
  const [destination, setDestination] = useState("");
  const [shareStatus, setShareStatus] = useState<"idle" | "copied" | "error">("idle");
  const [shareUrl, setShareUrl] = useState(CANONICAL_WEEKEND_PLANNER_URL);
  const [canNativeShare, setCanNativeShare] = useState(false);
  const [checkinText, setCheckinText] = useState<string>("");
  const [checkoutText, setCheckoutText] = useState<string>("");

  useEffect(() => {
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
      setShareUrl(`${window.location.origin}/weekend-planner`);
    } catch {
      // Ignore.
    }
    setCanNativeShare(typeof navigator !== "undefined" && typeof navigator.share === "function");
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
    void sendTiAnalytics(event, { ...properties, source: "weekend_planner", ts: Date.now() });
  }

  async function copyShareUrl() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setShareStatus("copied");
      track("weekend_planner_share_clicked", { channel: "copy" });
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
        title: "Tournament Weekend Planner",
        text: "Planning tournament travel? This page has hotels and rentals for sports weekends.",
        url: shareUrl,
      });
      track("weekend_planner_share_clicked", { channel: "native" });
    } catch {
      // User cancelled / unsupported.
    }
  }

  return (
    <>
      <div className={styles.mainGrid}>
        <article className={styles.panelCard}>
          <div className={styles.panelHeader}>
            <h2 className={styles.panelTitle}>Search Hotels</h2>
            <p className={styles.panelSub}>Find hotels near your tournament or destination.</p>
          </div>
          <div className={styles.cardBody}>
            <form
              method="get"
              action="/go/hotels"
              target="_blank"
              onSubmit={() =>
                track("weekend_planner_hotels_clicked", { destination_present: Boolean(destination.trim()) })
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
              </div>
              <input type="hidden" name="source" value="weekend_planner" />
              <div style={{ paddingTop: "0.95rem" }}>
                <button
                  type="submit"
                  className={styles.ctaFull}
                  onClick={(e) => {
                    // Convert dates to ISO for /go/hotels, open in new tab.
                    // Do not block if invalid; omit invalid params and let /go/* fall back.
                    e.preventDefault();
                    const qp = new URLSearchParams();
                    qp.set("ss", destination.trim());
                    qp.set("source", "weekend_planner");
                    const checkinIso = isoFromUserDate(checkinText);
                    const checkoutIso = isoFromUserDate(checkoutText);
                    if (checkinIso) qp.set("checkin", checkinIso);
                    if (checkoutIso) qp.set("checkout", checkoutIso);
                    openGoUrlInNewTab("/go/hotels", qp);
                  }}
                >
                  Search Booking.com
                </button>
              </div>
            </form>
          </div>
        </article>

        <article className={styles.panelCard}>
          <div className={styles.panelHeader}>
            <h2 className={styles.panelTitle}>Search Vacation Rentals</h2>
            <p className={styles.panelSub}>Find Vrbo rentals for families and team travel.</p>
          </div>
          <div className={styles.cardBody}>
            <form
              method="get"
              action="/go/vrbo"
              target="_blank"
              onSubmit={() =>
                track("weekend_planner_vrbo_clicked", { destination_present: Boolean(destination.trim()) })
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
              </div>
              <input type="hidden" name="source" value="weekend_planner" />
              <div style={{ paddingTop: "0.95rem" }}>
                <button
                  type="submit"
                  className={styles.ctaFull}
                  onClick={(e) => {
                    e.preventDefault();
                    const qp = new URLSearchParams();
                    qp.set("destination", destination.trim());
                    qp.set("source", "weekend_planner");
                    const checkinIso = isoFromUserDate(checkinText);
                    const checkoutIso = isoFromUserDate(checkoutText);
                    if (checkinIso) qp.set("checkin", checkinIso);
                    if (checkoutIso) qp.set("checkout", checkoutIso);
                    openGoUrlInNewTab("/go/vrbo", qp);
                  }}
                >
                  Search Vrbo
                </button>
              </div>
            </form>
          </div>
        </article>

        <article className={styles.panelCard}>
          <div className={styles.panelHeader}>
            <h2 className={styles.panelTitle}>Find Your Tournament</h2>
            <p className={styles.panelSub}>Browse tournaments, venues, and planning tools.</p>
          </div>
          <div className={styles.cardBody}>
            <div className={styles.smallHelper}>Already know your event? Search the tournament directory.</div>
            <div style={{ paddingTop: "0.95rem" }}>
              <Link href="/tournaments" className={styles.ctaFull}>
                Browse Tournaments
              </Link>
            </div>
          </div>
        </article>
      </div>

      <div className={styles.secondaryStack}>
        <article className={styles.panelCard}>
          <div className={styles.panelHeader}>
            <h2 className={styles.panelTitle}>Don’t see your tournament?</h2>
            <p className={styles.panelSub}>Tell us where you’re playing and we’ll add it.</p>
          </div>
          <div className={styles.cardBody}>
            <div style={{ paddingTop: "0.95rem" }}>
              <Link
                href="/list-your-tournament?source=weekend_planner"
                className={styles.ctaFull}
                onClick={() => track("weekend_planner_add_tournament_clicked")}
              >
                Add Tournament
              </Link>
            </div>
          </div>
        </article>

        <article className={styles.panelCard}>
          <div className={styles.panelHeader}>
            <h2 className={styles.panelTitle}>Get venue-level planning for every tournament</h2>
            <p className={styles.panelSub}>
              Weekend Pro adds Owl&apos;s Eye™ nearby hotels, rentals, coffee, food, and directions around tournament venues across TI.
            </p>
          </div>
          <div className={styles.cardBody}>
            <UpgradeWeekendProButton
              className={styles.ctaFull}
              source_page="weekend_planner"
              source_context="weekend_planner_upsell"
              entry_point="weekend_planner"
              cta_label="Upgrade to Weekend Pro"
              label="Upgrade to Weekend Pro"
              has_affiliate_visible={false}
            />
          </div>
        </article>

        <article className={styles.panelCard}>
          <div className={styles.panelHeader}>
            <h2 className={styles.panelTitle}>Share this planner</h2>
            <p className={styles.panelSub}>Send one link with hotel and rental search tools for tournament weekends.</p>
          </div>
          <div className={styles.cardBody}>
            <div className={styles.shareRow}>
              <input className={`input ${styles.inputDark}`} value={shareUrl} readOnly aria-label="Weekend planner URL" />
              <div className={styles.shareActions}>
                <button type="button" className={styles.ctaFull} onClick={copyShareUrl}>
                  {shareStatus === "copied" ? "Copied" : "Copy link"}
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
