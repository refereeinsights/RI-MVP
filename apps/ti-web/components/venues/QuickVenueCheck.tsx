"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { sendTiAnalytics } from "@/lib/analytics";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";
import styles from "./QuickVenueCheck.module.css";

type VenueOption = { id: string; name: string | null };

type Props = {
  venueId?: string;
  venueOptions?: VenueOption[];
  pageType: "venue" | "tournament";
  sourceTournamentId?: string | null;
  signedIn?: boolean;
};

type ScoreOption = { label: string; value: number };
type EnumOption = { label: string; value: string };

const CLEANLINESS_OPTIONS: ScoreOption[] = [
  { label: "Poor", value: 1 },
  { label: "Fair", value: 2 },
  { label: "Good", value: 3 },
  { label: "Great", value: 4 },
  { label: "Spotless", value: 5 },
];

const PARKING_OPTIONS: EnumOption[] = [
  { label: "Close", value: "Close" },
  { label: "Medium", value: "Medium" },
  { label: "Far", value: "Far" },
];

const SHADE_OPTIONS: ScoreOption[] = [
  { label: "None", value: 1 },
  { label: "Poor", value: 2 },
  { label: "Fair", value: 3 },
  { label: "Good", value: 4 },
  { label: "Great", value: 5 },
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

export function QuickVenueCheck({ venueId, venueOptions, pageType, sourceTournamentId, signedIn }: Props) {
  const browserHash = useBrowserHash();
  const multiVenue = (venueOptions?.length ?? 0) > 1;
  const singleVenueId = !multiVenue ? venueOptions?.[0]?.id || venueId || null : null;

  const [restroomCleanliness, setRestroomCleanliness] = useState<number | null>(null);
  const [parkingDistance, setParkingDistance] = useState<string | null>(null);
  const [shadeScore, setShadeScore] = useState<number | null>(null);
  const [bringChairs, setBringChairs] = useState<boolean | null>(null);
  const [restroomType, setRestroomType] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(true);
  const openedOnce = useMemo(() => ({ sent: false }), []);
  const [gate, setGate] = useState<"gate" | "form" | "dismissed">("gate");
  const [selectedVenueId, setSelectedVenueId] = useState<string | null>(singleVenueId);
  const [promptDismissed, setPromptDismissed] = useState(false);
  const [isSignedIn, setIsSignedIn] = useState<boolean | null>(typeof signedIn === "boolean" ? signedIn : null);
  const promptSeenOnce = useMemo(() => ({ sent: false }), []);

  const promptDismissKey = "ti_qvc_insider_prompt_dismissed_v1";

  useEffect(() => {
    if (!openedOnce.sent) {
      openedOnce.sent = true;
      sendTiAnalytics("Venue Quick Check Opened", {
        venueUuid: selectedVenueId ?? venueId ?? null,
        pageType,
        sourceTournamentUuid: sourceTournamentId ?? null,
      });
    }
  }, [venueId, selectedVenueId, pageType, sourceTournamentId, openedOnce]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const dismissed = window.sessionStorage.getItem(promptDismissKey) === "1";
    if (dismissed) setPromptDismissed(true);
  }, []);

  const selectedCount = [restroomCleanliness, parkingDistance, shadeScore, bringChairs, restroomType].filter(
    (v) => v !== null
  ).length;
  const resolvedVenueId = selectedVenueId || venueId || null;

  const fieldsAnswered = useMemo(() => {
    const out: string[] = [];
    if (restroomType !== null) out.push("restroom_type");
    if (restroomCleanliness !== null) out.push("restroom_cleanliness");
    if (parkingDistance !== null) out.push("parking_distance");
    if (shadeScore !== null) out.push("shade_score");
    if (bringChairs !== null) out.push("bring_field_chairs");
    return out;
  }, [restroomType, restroomCleanliness, parkingDistance, shadeScore, bringChairs]);

  const disabled = submitting || selectedCount < 1 || !resolvedVenueId;

  function handleGate(choice: "yes" | "no") {
    if (choice === "yes") {
      setGate("form");
      sendTiAnalytics("Venue Quick Check Started", {
        venueUuid: resolvedVenueId,
        pageType,
        sourceTournamentUuid: sourceTournamentId ?? null,
      });
    } else {
      setGate("dismissed");
      sendTiAnalytics("Venue Quick Check Dismissed", {
        venueUuid: resolvedVenueId,
        pageType,
        sourceTournamentUuid: sourceTournamentId ?? null,
      });
    }
  }

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
          venue_id: resolvedVenueId,
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
        venueUuid: resolvedVenueId,
        pageType,
        sourceTournamentUuid: sourceTournamentId ?? null,
        fieldsCompleted: selectedCount,
        fieldsAnswered,
      });
      setDone(true);
    } catch (err: any) {
      setError(err?.message ?? "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  useEffect(() => {
    if (!done) return;
    if (typeof signedIn === "boolean") return;
    // Resolve signed-in status for the post-submit prompt (server pages can also pass this in).
    let alive = true;
    const resolve = async () => {
      try {
        const supabase = getSupabaseBrowserClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!alive) return;
        setIsSignedIn(Boolean(user));
      } catch {
        if (!alive) return;
        setIsSignedIn(false);
      }
    };
    resolve();
    return () => {
      alive = false;
    };
  }, [done, signedIn]);

  const shouldShowSignupPrompt = done && isSignedIn === false && !promptDismissed;

  useEffect(() => {
    if (!shouldShowSignupPrompt) return;
    if (promptSeenOnce.sent) return;
    promptSeenOnce.sent = true;
    sendTiAnalytics("Venue Quick Check Signup Prompt Shown", {
      venueUuid: resolvedVenueId,
      pageType,
      sourceTournamentUuid: sourceTournamentId ?? null,
    });
  }, [shouldShowSignupPrompt, resolvedVenueId, pageType, sourceTournamentId, promptSeenOnce]);

  if (!isOpen) {
    return (
      <button className={styles.reopen} type="button" onClick={() => setIsOpen(true)}>
        Quick venue check
      </button>
    );
  }

  if (done) {
    const signupHref = `/signup?returnTo=${encodeURIComponent("/account")}`;

    function dismissPrompt() {
      setPromptDismissed(true);
      if (typeof window !== "undefined") {
        window.sessionStorage.setItem(promptDismissKey, "1");
      }
      sendTiAnalytics("Venue Quick Check Signup Dismissed", {
        venueUuid: resolvedVenueId,
        pageType,
        sourceTournamentUuid: sourceTournamentId ?? null,
      });
    }

    return (
      <div className={styles.card}>
        <button className={styles.close} type="button" onClick={() => setIsOpen(false)} aria-label="Close quick check">
          ×
        </button>
        <div className={styles.title}>Thanks for the quick check</div>
        <p className={styles.note}>Your input helps improve venue information for other families and teams.</p>

        {isSignedIn === true ? (
          <div className={styles.actions}>
            <Link href="/account" className={styles.primaryAction}>
              Go to account
            </Link>
            <Link href="/account/alerts" className={styles.secondaryAction}>
              View alerts
            </Link>
          </div>
        ) : shouldShowSignupPrompt ? (
          <>
            <div className={styles.prompt}>
              <div className={styles.promptTitle}>Join Insider free</div>
              <div className={styles.promptBody}>
                Save tournaments, get alerts for events near you, and track tournament updates.
              </div>
            </div>
            <div className={styles.actions}>
              <Link
                href={signupHref}
                className={styles.primaryAction}
                onClick={() =>
                  sendTiAnalytics("Venue Quick Check Signup Clicked", {
                    venueUuid: resolvedVenueId,
                    pageType,
                    sourceTournamentUuid: sourceTournamentId ?? null,
                  })
                }
              >
                Join Insider Free
              </Link>
              <button type="button" className={styles.secondaryAction} onClick={dismissPrompt}>
                Not now
              </button>
            </div>
          </>
        ) : null}

        <div className={styles.actions}>
          <button type="button" className={styles.reopen} onClick={() => setIsOpen(false)}>
            View venue insights
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.card}>
      <button className={styles.close} type="button" onClick={() => setIsOpen(false)} aria-label="Close quick check">
        ×
      </button>
      <div className={styles.title}>Quick venue check</div>
      {gate === "gate" ? (
        <>
          <p className={styles.note}>Have you played here before?</p>
          <p className={styles.trust}>Takes 5 seconds • No login required</p>
          <div className={styles.gateRow}>
            <button type="button" className={`${styles.chip} ${styles.ctaChip}`} onClick={() => handleGate("yes")}>
              Yes
            </button>
            <button type="button" className={styles.chip} onClick={() => handleGate("no")}>
              No
            </button>
          </div>
        </>
      ) : gate === "dismissed" ? (
        <p className={styles.note}>Thanks for checking.</p>
      ) : (
        <>
          {multiVenue ? (
            <div className={styles.field}>
              <div className={styles.label}>Which venue?</div>
              <div className={styles.chips}>
                {venueOptions?.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    className={`${styles.chip} ${selectedVenueId === opt.id ? styles.chipSelected : ""}`}
                    onClick={() => setSelectedVenueId((prev) => (prev === opt.id ? null : opt.id))}
                  >
                    {opt.name || "Venue"}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          <p className={styles.note}>Tap anything you remember.</p>
          <p className={styles.trust}>Takes 5 seconds • No login required</p>
      <form onSubmit={handleSubmit} className={styles.form}>
        <div className={styles.field}>
          <div className={styles.label}>Restroom type</div>
          <div className={styles.chips}>
            {RESTROOM_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={`${styles.chip} ${restroomType === opt.value ? styles.chipSelected : ""}`}
                onClick={() => setRestroomType((prev) => (prev === opt.value ? null : opt.value))}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.field}>
          <div className={styles.label}>Restroom cleanliness</div>
          <div className={styles.chips}>
            {CLEANLINESS_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={`${styles.chip} ${restroomCleanliness === opt.value ? styles.chipSelected : ""}`}
                onClick={() => setRestroomCleanliness((prev) => (prev === opt.value ? null : opt.value))}
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
                onClick={() => setParkingDistance((prev) => (prev === opt.value ? null : opt.value))}
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
              onClick={() => setBringChairs((prev) => (prev === true ? null : true))}
            >
              Yes
            </button>
            <button
              type="button"
              className={`${styles.chip} ${bringChairs === false ? styles.chipSelected : ""}`}
              onClick={() => setBringChairs((prev) => (prev === false ? null : false))}
            >
              No
            </button>
          </div>
        </div>

        <div className={styles.field}>
          <div className={styles.label}>Shade</div>
          <div className={styles.chips}>
            {SHADE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={`${styles.chip} ${shadeScore === opt.value ? styles.chipSelected : ""}`}
                onClick={() => setShadeScore((prev) => (prev === opt.value ? null : opt.value))}
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
        </>
      )}
    </div>
  );
}

export default QuickVenueCheck;
