"use client";

import { useEffect, useMemo, useState } from "react";
import { sendTiAnalytics } from "@/lib/analytics";
import styles from "./QuickVenueCheck.module.css";

type Props = {
  venueId: string;
  pageType: "venue" | "tournament";
  sourceTournamentId?: string | null;
};

type ScoreOption = { label: string; value: number };
type EnumOption = { label: string; value: string };

const SCORE_OPTIONS: ScoreOption[] = [
  { label: "1", value: 1 },
  { label: "2", value: 2 },
  { label: "3", value: 3 },
  { label: "4", value: 4 },
  { label: "5", value: 5 },
];

const PARKING_OPTIONS: EnumOption[] = [
  { label: "Close", value: "Close" },
  { label: "Medium", value: "Medium" },
  { label: "Far", value: "Far" },
];

const RESTROOM_OPTIONS: EnumOption[] = [
  { label: "Portable", value: "Portable" },
  { label: "Building", value: "Building" },
  { label: "Both", value: "Both" },
];

function useBrowserHash() {
  return useMemo(() => {
    if (typeof window === "undefined") return "";
    const key = "ti_browser_hash_v1";
    const existing = window.localStorage.getItem(key);
    if (existing) return existing;
    const hash = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
    window.localStorage.setItem(key, hash);
    return hash;
  }, []);
}

export function QuickVenueCheck({ venueId, pageType, sourceTournamentId }: Props) {
  const browserHash = useBrowserHash();
  const [restroomCleanliness, setRestroomCleanliness] = useState<number | null>(null);
  const [parkingDistance, setParkingDistance] = useState<string | null>(null);
  const [shadeScore, setShadeScore] = useState<number | null>(null);
  const [bringChairs, setBringChairs] = useState<boolean | null>(null);
  const [restroomType, setRestroomType] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    sendTiAnalytics("Venue Quick Check Opened", {
      venueUuid: venueId,
      pageType,
      sourceTournamentUuid: sourceTournamentId ?? null,
    });
  }, [venueId, pageType, sourceTournamentId]);

  const selectedCount = [restroomCleanliness, parkingDistance, shadeScore, bringChairs, restroomType].filter(
    (v) => v !== null
  ).length;

  const disabled = submitting || selectedCount < 2;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (disabled) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/venue-quick-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          venue_id: venueId,
          browser_hash: browserHash,
          source_page_type: pageType,
          source_tournament_id: sourceTournamentId,
          restroom_cleanliness: restroomCleanliness,
          parking_distance: parkingDistance,
          shade_score: shadeScore,
          bring_field_chairs: bringChairs,
          restroom_type: restroomType,
          website: "", // honeypot
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Unable to submit");
      }
      sendTiAnalytics("Venue Quick Check Submitted", {
        venueUuid: venueId,
        pageType,
        sourceTournamentUuid: sourceTournamentId ?? null,
        fieldsCompleted: selectedCount,
      });
      setDone(true);
    } catch (err: any) {
      setError(err?.message ?? "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className={styles.card}>
        <div className={styles.title}>Thanks for the quick check!</div>
        <p className={styles.note}>Your taps help keep venue info fresh for everyone.</p>
      </div>
    );
  }

  return (
    <div className={styles.card}>
      <div className={styles.title}>Quick venue check</div>
      <p className={styles.note}>Been here before? Tap what you remember.</p>
      <form onSubmit={handleSubmit} className={styles.form}>
        <div className={styles.field}>
          <div className={styles.label}>Restroom cleanliness</div>
          <div className={styles.chips}>
            {SCORE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={`${styles.chip} ${restroomCleanliness === opt.value ? styles.chipSelected : ""}`}
                onClick={() => setRestroomCleanliness(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.field}>
          <div className={styles.label}>Parking distance</div>
          <div className={styles.chips}>
            {PARKING_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={`${styles.chip} ${parkingDistance === opt.value ? styles.chipSelected : ""}`}
                onClick={() => setParkingDistance(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.field}>
          <div className={styles.label}>Shade</div>
          <div className={styles.chips}>
            {SCORE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={`${styles.chip} ${shadeScore === opt.value ? styles.chipSelected : ""}`}
                onClick={() => setShadeScore(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.field}>
          <div className={styles.label}>Bring field chairs?</div>
          <div className={styles.chips}>
            <button
              type="button"
              className={`${styles.chip} ${bringChairs === true ? styles.chipSelected : ""}`}
              onClick={() => setBringChairs(true)}
            >
              Yes
            </button>
            <button
              type="button"
              className={`${styles.chip} ${bringChairs === false ? styles.chipSelected : ""}`}
              onClick={() => setBringChairs(false)}
            >
              No
            </button>
          </div>
        </div>

        <div className={styles.field}>
          <div className={styles.label}>Restroom type</div>
          <div className={styles.chips}>
            {RESTROOM_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={`${styles.chip} ${restroomType === opt.value ? styles.chipSelected : ""}`}
                onClick={() => setRestroomType(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {error ? <div className={styles.error}>{error}</div> : null}

        <button type="submit" className={styles.submit} disabled={disabled}>
          {submitting ? "Saving..." : "Submit quick check"}
        </button>
        <input type="text" name="website" className={styles.honeypot} tabIndex={-1} autoComplete="off" />
      </form>
    </div>
  );
}

export default QuickVenueCheck;
