"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { sendTiAnalytics } from "@/lib/analytics";

const DESTINATION_STORAGE_KEY = "ti_weekend_planner_destination";

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

function canonicalPlannerUrl() {
  if (typeof window === "undefined") return "https://www.tournamentinsights.com/weekend-planner";
  return `${window.location.origin}/weekend-planner`;
}

export default function WeekendPlannerClient() {
  const [destination, setDestination] = useState("");
  const [shareStatus, setShareStatus] = useState<"idle" | "copied" | "error">("idle");

  const shareUrl = useMemo(() => canonicalPlannerUrl(), []);

  useEffect(() => {
    const stored = safeGetStoredDestination();
    if (stored) setDestination(stored);
  }, []);

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
      <div className="cards" style={{ marginTop: 18 }}>
        <article className="card card-grass">
          <div className="cardHeader">
            <div>
              <div className="cardTitle" style={{ fontSize: 18 }}>
                Search Hotels
              </div>
              <div className="cardMeta">Find hotels near your tournament or destination.</div>
            </div>
          </div>
          <div style={{ padding: "0 1.15rem 1.15rem" }}>
            <form
              method="get"
              action="/go/hotels"
              onSubmit={() => track("weekend_planner_hotels_clicked", { destination_present: Boolean(destination.trim()) })}
            >
              <div className="filters" style={{ gridTemplateColumns: "1fr 180px 180px", margin: 0 }}>
                <div>
                  <label className="label" htmlFor="wp-destination-hotels">
                    Destination (required)
                  </label>
                  <input
                    id="wp-destination-hotels"
                    name="ss"
                    className="input"
                    placeholder='Spokane, WA or 98101'
                    value={destination}
                    onChange={(e) => handleDestinationChange(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="label" htmlFor="wp-checkin-hotels">
                    Check-in
                  </label>
                  <input id="wp-checkin-hotels" name="checkin" className="input" placeholder="YYYY-MM-DD" />
                </div>
                <div>
                  <label className="label" htmlFor="wp-checkout-hotels">
                    Check-out
                  </label>
                  <input id="wp-checkout-hotels" name="checkout" className="input" placeholder="YYYY-MM-DD" />
                </div>
              </div>
              <input type="hidden" name="source" value="weekend_planner" />
              <div className="cardFooter" style={{ padding: "0.95rem 0 0" }}>
                <button type="submit" className="primaryLink">
                  Search Booking.com
                </button>
                <div className="secondaryLink" aria-hidden="true" style={{ cursor: "default" }}>
                  &nbsp;
                </div>
              </div>
            </form>
          </div>
        </article>

        <article className="card card-grass">
          <div className="cardHeader">
            <div>
              <div className="cardTitle" style={{ fontSize: 18 }}>
                Search Vacation Rentals
              </div>
              <div className="cardMeta">Find Vrbo rentals for families and team travel.</div>
            </div>
          </div>
          <div style={{ padding: "0 1.15rem 1.15rem" }}>
            <form
              method="get"
              action="/go/vrbo"
              onSubmit={() => track("weekend_planner_vrbo_clicked", { destination_present: Boolean(destination.trim()) })}
            >
              <div className="filters" style={{ gridTemplateColumns: "1fr 180px 180px", margin: 0 }}>
                <div>
                  <label className="label" htmlFor="wp-destination-vrbo">
                    Destination (required)
                  </label>
                  <input
                    id="wp-destination-vrbo"
                    name="destination"
                    className="input"
                    placeholder='Spokane, WA or 98101'
                    value={destination}
                    onChange={(e) => handleDestinationChange(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="label" htmlFor="wp-checkin-vrbo">
                    Check-in
                  </label>
                  <input id="wp-checkin-vrbo" name="checkin" className="input" placeholder="YYYY-MM-DD" />
                </div>
                <div>
                  <label className="label" htmlFor="wp-checkout-vrbo">
                    Check-out
                  </label>
                  <input id="wp-checkout-vrbo" name="checkout" className="input" placeholder="YYYY-MM-DD" />
                </div>
              </div>
              <input type="hidden" name="source" value="weekend_planner" />
              <div className="cardFooter" style={{ padding: "0.95rem 0 0" }}>
                <button type="submit" className="primaryLink">
                  Search Vrbo
                </button>
                <div className="secondaryLink" aria-hidden="true" style={{ cursor: "default" }}>
                  &nbsp;
                </div>
              </div>
            </form>
          </div>
        </article>

        <article className="card card-grass">
          <div className="cardHeader">
            <div>
              <div className="cardTitle" style={{ fontSize: 18 }}>
                Find Your Tournament
              </div>
              <div className="cardMeta">Browse tournaments, venues, and planning tools.</div>
            </div>
          </div>
          <div className="cardFooter" style={{ padding: "0 1.15rem 1.15rem" }}>
            <Link href="/tournaments" className="primaryLink">
              Browse Tournaments
            </Link>
            <div className="secondaryLink" aria-hidden="true" style={{ cursor: "default" }}>
              &nbsp;
            </div>
          </div>
        </article>
      </div>

      <div className="cards" style={{ marginTop: 18 }}>
        <article className="card card-grass">
          <div className="cardHeader">
            <div>
              <div className="cardTitle" style={{ fontSize: 18 }}>
                Don’t see your tournament?
              </div>
              <div className="cardMeta">Tell us where you’re playing and we’ll add it.</div>
            </div>
          </div>
          <div className="cardFooter" style={{ padding: "0 1.15rem 1.15rem" }}>
            <Link
              href="/list-your-tournament?source=weekend_planner"
              className="primaryLink"
              onClick={() => track("weekend_planner_add_tournament_clicked")}
            >
              Add Tournament
            </Link>
            <div className="secondaryLink" aria-hidden="true" style={{ cursor: "default" }}>
              &nbsp;
            </div>
          </div>
        </article>
      </div>

      <div className="cards" style={{ marginTop: 18 }}>
        <article className="card card-grass">
          <div className="cardHeader">
            <div>
              <div className="cardTitle" style={{ fontSize: 18 }}>
                Share this planner
              </div>
              <div className="cardMeta">Send one link with hotel and rental search tools for tournament weekends.</div>
            </div>
          </div>
          <div style={{ padding: "0 1.15rem 1.15rem" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 10 }}>
              <input className="input" value={shareUrl} readOnly aria-label="Weekend planner URL" />
              <button type="button" className="primaryLink" onClick={copyShareUrl}>
                {shareStatus === "copied" ? "Copied" : "Copy link"}
              </button>
              {typeof navigator !== "undefined" && typeof navigator.share === "function" ? (
                <button type="button" className="secondaryLink" onClick={nativeShare}>
                  Share
                </button>
              ) : (
                <span className="secondaryLink" aria-hidden="true" style={{ cursor: "default" }}>
                  &nbsp;
                </span>
              )}
            </div>
          </div>
        </article>
      </div>
    </>
  );
}

