"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { sendTiAnalytics } from "@/lib/analytics";
import {
  applyDuplicateMatchToForm,
  createEmptySponsor,
  createEmptyVenue,
  createEmptyErrors,
  createInitialSubmission,
  MAX_TOURNAMENT_SPONSORS,
  LODGING_OPTIONS,
  RESTROOM_OPTIONS,
  TOURNAMENT_SPONSOR_CATEGORY_OPTIONS,
  type SponsorInput,
  type SubmissionErrors,
  type TournamentDuplicateMatch,
  TI_TOURNAMENT_SPORTS,
  type TournamentDetailsInput,
  type TournamentSubmissionInput,
  type VenueInput,
  validateTournamentSubmission,
  YES_NO_OPTIONS,
  sportLabel,
} from "@/lib/listTournamentForm";
import styles from "./ListYourTournamentForm.module.css";

type SubmitResponse =
  | { ok: true; tournamentId: string; venueCount: number; slug?: string | null }
  | { ok: false; error?: string; fieldErrors?: SubmissionErrors };

type FormMode = "submit" | "verify";

type SuccessState = {
  tournamentId: string;
  listingPath: string | null;
  isMatchFlow: boolean;
};

type Props = {
  mode?: FormMode;
  sportPreset?: string;
  showHero?: boolean;
  formId?: string;
  outreachContext?: {
    campaignId?: string;
    tournamentId?: string;
    variant?: string;
  };
};

function fieldClass(hasError: boolean) {
  return hasError ? `${styles.input} ${styles.inputError}` : styles.input;
}

function ToggleGroup(props: {
  options: readonly string[];
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
}) {
  return (
    <div className={styles.toggleGroup} role="group" aria-label={props.ariaLabel}>
      {props.options.map((option) => {
        const active = props.value === option;
        return (
          <button
            key={option}
            type="button"
            className={active ? styles.toggleButtonActive : styles.toggleButton}
            onClick={() => props.onChange(option)}
          >
            {option.charAt(0).toUpperCase() + option.slice(1)}
          </button>
        );
      })}
    </div>
  );
}

export default function ListYourTournamentForm({
  mode = "submit",
  sportPreset = "",
  showHero = true,
  formId,
  outreachContext,
}: Props) {
  const [form, setForm] = useState<TournamentSubmissionInput>(() => {
    const initial = createInitialSubmission();
    if (sportPreset) {
      initial.tournament.sport = sportPreset;
    }
    return initial;
  });
  const [errors, setErrors] = useState<SubmissionErrors>(() => createEmptyErrors(1));
  const [status, setStatus] = useState<"idle" | "saving" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const [duplicateMatch, setDuplicateMatch] = useState<TournamentDuplicateMatch | null>(null);
  const [matchStatus, setMatchStatus] = useState<"idle" | "loading" | "ready">("idle");
  const [successState, setSuccessState] = useState<SuccessState | null>(null);
  const [shareStatus, setShareStatus] = useState<"idle" | "copied" | "error">("idle");
  const [expandedSponsors, setExpandedSponsors] = useState(false);
  const [expandedVenues, setExpandedVenues] = useState<number[]>([0]);
  const lastAppliedMatchIdRef = useRef<string | null>(null);
  const formStartedRef = useRef(false);
  const startedAtRef = useRef<number | null>(null);
  const pageViewTrackedRef = useRef(false);
  const preloadedTournamentIdRef = useRef<string | null>(null);

  const isVerifyMode = mode === "verify";
  const sportDisplay = sportLabel(sportPreset || form.tournament.sport || "soccer");

  useEffect(() => {
    if (!sportPreset) return;
    setForm((current) => {
      if (current.tournament.sport) return current;
      return {
        ...current,
        tournament: {
          ...current.tournament,
          sport: sportPreset,
        },
      };
    });
  }, [sportPreset]);

  useEffect(() => {
    const tournamentId = outreachContext?.tournamentId?.trim() || "";
    if (!isVerifyMode || !tournamentId || preloadedTournamentIdRef.current === tournamentId) return;

    const controller = new AbortController();
    preloadedTournamentIdRef.current = tournamentId;
    setMatchStatus("loading");

    void (async () => {
      try {
        const params = new URLSearchParams({ tournamentId });
        const response = await fetch(`/api/list-your-tournament?${params.toString()}`, {
          signal: controller.signal,
        });
        const payload = (await response.json().catch(() => null)) as
          | { ok: true; match: TournamentDuplicateMatch | null }
          | { ok: false; error?: string }
          | null;

        if (!response.ok || !payload || !("ok" in payload) || !payload.ok) {
          setMatchStatus("idle");
          return;
        }

        if (!payload.match) {
          setDuplicateMatch(null);
          setMatchStatus("idle");
          return;
        }

        const nextForm = applyDuplicateMatchToForm(createInitialSubmission(), payload.match);
        if (sportPreset && !nextForm.tournament.sport) {
          nextForm.tournament.sport = sportPreset;
        }
        setForm(nextForm);
        setErrors(createEmptyErrors(nextForm.venues.length));
        setDuplicateMatch(payload.match);
        setMatchStatus("ready");
        lastAppliedMatchIdRef.current = payload.match.id;
        setExpandedVenues([0]);
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          setMatchStatus("idle");
        }
      }
    })();

    return () => {
      controller.abort();
    };
  }, [isVerifyMode, outreachContext?.tournamentId, sportPreset]);

  useEffect(() => {
    if (!isVerifyMode || pageViewTrackedRef.current) return;
    pageViewTrackedRef.current = true;
    void sendTiAnalytics("verify_page_view", {
      sport: sportPreset || form.tournament.sport || "soccer",
      page: "/verify-your-tournament",
      campaign_id: outreachContext?.campaignId || "",
      variant: outreachContext?.variant || "",
      tournament_id: outreachContext?.tournamentId || form.verifyTargetTournamentId || "",
      ts: Date.now(),
    });
  }, [form.tournament.sport, form.verifyTargetTournamentId, isVerifyMode, outreachContext?.campaignId, outreachContext?.tournamentId, outreachContext?.variant, sportPreset]);

  function markVerifyFormStarted() {
    if (!isVerifyMode || formStartedRef.current) return;
    formStartedRef.current = true;
    startedAtRef.current = Date.now();
    void sendTiAnalytics("verify_form_started", {
      sport: sportPreset || form.tournament.sport || "soccer",
      campaign_id: outreachContext?.campaignId || "",
      variant: outreachContext?.variant || "",
      tournament_id: outreachContext?.tournamentId || form.verifyTargetTournamentId || duplicateMatch?.id || "",
      ts: Date.now(),
    });
  }

  function setTournamentField<K extends keyof TournamentDetailsInput>(field: K, value: TournamentDetailsInput[K]) {
    markVerifyFormStarted();
    setForm((current) => ({
      ...current,
      tournament: {
        ...current.tournament,
        [field]: value,
      },
    }));
  }

  function setVenueField<K extends keyof VenueInput>(index: number, field: K, value: VenueInput[K]) {
    markVerifyFormStarted();
    setForm((current) => ({
      ...current,
      venues: current.venues.map((venue, venueIndex) =>
        venueIndex === index
          ? {
              ...venue,
              [field]: value,
            }
          : venue
      ),
    }));
  }

  function setSponsorField<K extends keyof SponsorInput>(index: number, field: K, value: SponsorInput[K]) {
    markVerifyFormStarted();
    setForm((current) => ({
      ...current,
      sponsors: (current.sponsors ?? []).map((sponsor, sponsorIndex) =>
        sponsorIndex === index
          ? {
              ...sponsor,
              [field]: value,
            }
          : sponsor
      ),
    }));
  }

  function addSponsor() {
    markVerifyFormStarted();
    setForm((current) => ({
      ...current,
      sponsors: [...(current.sponsors ?? []), createEmptySponsor()].slice(0, MAX_TOURNAMENT_SPONSORS),
    }));
    setErrors((current) => ({
      ...current,
      sponsors: [...(current.sponsors ?? []), {}].slice(0, MAX_TOURNAMENT_SPONSORS),
    }));
    setExpandedSponsors(true);
  }

  function removeSponsor(index: number) {
    markVerifyFormStarted();
    setForm((current) => ({
      ...current,
      sponsors: (current.sponsors ?? []).filter((_, sponsorIndex) => sponsorIndex !== index),
    }));
    setErrors((current) => ({
      ...current,
      sponsors: (current.sponsors ?? []).filter((_, sponsorIndex) => sponsorIndex !== index),
    }));
  }

  function addVenue() {
    markVerifyFormStarted();
    setForm((current) => ({
      ...current,
      venues: [...current.venues, createEmptyVenue()],
    }));
    setErrors((current) => ({
      ...current,
      venues: [...current.venues, {}],
    }));
  }

  function removeVenue(index: number) {
    if (index === 0) return;
    markVerifyFormStarted();
    setForm((current) => ({
      ...current,
      venues: current.venues.filter((_, venueIndex) => venueIndex !== index),
    }));
    setErrors((current) => ({
      ...current,
      venues: current.venues.filter((_, venueIndex) => venueIndex !== index),
    }));
    setExpandedVenues((current) =>
      current
        .filter((value) => value !== index)
        .map((value) => (value > index ? value - 1 : value))
    );
  }

  function applyMatch(match: TournamentDuplicateMatch) {
    markVerifyFormStarted();
    const nextForm = applyDuplicateMatchToForm(form, match);
    setForm(nextForm);
    setErrors(createEmptyErrors(nextForm.venues.length));
    setDuplicateMatch(match);
    lastAppliedMatchIdRef.current = match.id;
    setExpandedVenues([0]);
  }

  function toggleVenue(index: number) {
    setExpandedVenues((current) =>
      current.includes(index) ? current.filter((value) => value !== index) : [...current, index]
    );
  }

  function venueSummary(venue: VenueInput) {
    const bits = [
      venue.address1.trim(),
      [venue.city.trim(), venue.state.trim()].filter(Boolean).join(", "),
      venue.zip.trim(),
    ].filter(Boolean);
    return bits.join(" • ") || "No venue details yet";
  }

  function sponsorSummary(sponsor: SponsorInput) {
    const typeLabel =
      sponsor.category === "other"
        ? sponsor.otherCategory.trim()
        : sponsor.category
            .trim()
            .replace(/-/g, " ")
            .replace(/\b\w/g, (char) => char.toUpperCase());
    return [typeLabel, sponsor.address.trim()].filter(Boolean).join(" • ") || "No sponsor details yet";
  }

  async function onShareListing() {
    if (!successState?.listingPath) return;
    try {
      const url = `${window.location.origin}${successState.listingPath}`;
      await navigator.clipboard.writeText(url);
      setShareStatus("copied");
    } catch {
      setShareStatus("error");
    }
  }

  useEffect(() => {
    const name = form.tournament.name.trim();
    const city = form.venues[0]?.city.trim() ?? "";
    const state = form.venues[0]?.state.trim() ?? "";

    if (name.length < 3) {
      setDuplicateMatch(null);
      setMatchStatus("idle");
      lastAppliedMatchIdRef.current = null;
      setForm((current) =>
        current.verifyTargetTournamentId
          ? {
              ...current,
              verifyTargetTournamentId: null,
            }
          : current
      );
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setMatchStatus("loading");
      try {
        const params = new URLSearchParams({ name });
        if (city) params.set("city", city);
        if (state) params.set("state", state);

        const response = await fetch(`/api/list-your-tournament?${params.toString()}`, {
          signal: controller.signal,
        });
        const payload = (await response.json().catch(() => null)) as
          | { ok: true; match: TournamentDuplicateMatch | null }
          | { ok: false; error?: string }
          | null;

        if (!response.ok || !payload || !("ok" in payload) || !payload.ok) {
          setMatchStatus("idle");
          return;
        }

        setDuplicateMatch(payload.match);
        setMatchStatus(payload.match ? "ready" : "idle");

        if (payload.match && lastAppliedMatchIdRef.current !== payload.match.id) {
          const nextForm = applyDuplicateMatchToForm(form, payload.match as TournamentDuplicateMatch);
          setForm(nextForm);
          setErrors(createEmptyErrors(nextForm.venues.length));
          lastAppliedMatchIdRef.current = payload.match.id;
          setExpandedVenues([0]);
        } else if (!payload.match) {
          lastAppliedMatchIdRef.current = null;
          setForm((current) =>
            current.verifyTargetTournamentId
              ? {
                  ...current,
                  verifyTargetTournamentId: null,
                }
              : current
          );
        }
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          setMatchStatus("idle");
        }
      }
    }, 350);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [form, form.tournament.name, form.venues, form.venues[0]?.city, form.venues[0]?.state]);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("idle");
    setMessage("");
    setShareStatus("idle");

    const validation = validateTournamentSubmission(form);
    if (!validation.ok) {
      setErrors(validation.errors);
      setStatus("error");
      setMessage(validation.errors.form ?? "Please fix the highlighted fields.");
      return;
    }

    setErrors(createEmptyErrors(form.venues.length));
    setStatus("saving");

    const response = await fetch("/api/list-your-tournament", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        verifyTargetTournamentId: isVerifyMode ? form.verifyTargetTournamentId ?? duplicateMatch?.id ?? null : null,
      }),
    });
    const payload = (await response.json().catch(() => null)) as SubmitResponse | null;

    if (!response.ok || !payload?.ok) {
      if (payload && "fieldErrors" in payload && payload.fieldErrors) {
        setErrors(payload.fieldErrors);
      }
      const errorMessage =
        payload && "error" in payload && typeof payload.error === "string"
          ? payload.error
          : "Unable to submit tournament right now.";
      setStatus("error");
      setMessage(errorMessage);
      return;
    }

    setStatus("success");
    const listingPath =
      duplicateMatch?.slug && isVerifyMode
        ? `/tournaments/${duplicateMatch.slug}`
        : payload.slug
          ? `/tournaments/${payload.slug}`
          : null;

    if (isVerifyMode) {
      const timestamp = Date.now();
      const sport = sportPreset || validation.value.tournament.sport;
      const isMatchFlow = Boolean(duplicateMatch);
      void sendTiAnalytics("verify_submission_success", {
        sport,
        campaign_id: outreachContext?.campaignId || "",
        variant: outreachContext?.variant || "",
        ts: timestamp,
        tournament_id: payload.tournamentId || outreachContext?.tournamentId || duplicateMatch?.id || "",
        is_match_flow: isMatchFlow,
      });

      if (startedAtRef.current) {
        const durationMs = timestamp - startedAtRef.current;
        void sendTiAnalytics("verify_time_to_completion", {
          sport,
          campaign_id: outreachContext?.campaignId || "",
          variant: outreachContext?.variant || "",
          tournament_id: payload.tournamentId || outreachContext?.tournamentId || duplicateMatch?.id || "",
          duration_ms: durationMs,
          duration_seconds_rounded: Math.round(durationMs / 1000),
          ts: timestamp,
        });
      }

      setSuccessState({
        tournamentId: payload.tournamentId,
        listingPath,
        isMatchFlow,
      });
      setMessage("");
    } else {
      setMessage("Thanks. Your tournament submission was received and saved.");
    }
    setForm(createInitialSubmission());
    setErrors(createEmptyErrors(1));
    setExpandedSponsors(false);
    setExpandedVenues([0]);
  }

  return (
    <main className={styles.page}>
      {showHero ? (
        <section className={styles.hero}>
          <p className={styles.eyebrow}>Tournament Directory</p>
          <h1 className={styles.title}>List Your Tournament</h1>
          <p className={styles.subtitle}>
            Share the essential tournament and venue details directors want families, teams, and officials to find in one
            clean place. Start with one venue and add more if the event uses multiple sites.
          </p>
          {status === "success" ? <p className={styles.statusSuccess}>{message}</p> : null}
          {status === "error" && message ? <p className={styles.statusError}>{message}</p> : null}
        </section>
      ) : null}

      {duplicateMatch ? (
        <div className={styles.matchPanel}>
          <strong>{isVerifyMode ? "⚠ Tournament Found — Currently Unverified" : "We found a similar tournament in the TI database."}</strong>
          <p className={styles.matchMeta}>
            {duplicateMatch.name}
            {duplicateMatch.city || duplicateMatch.state
              ? ` • ${[duplicateMatch.city, duplicateMatch.state].filter(Boolean).join(", ")}`
              : ""}
            {duplicateMatch.startDate ? ` • Starts ${duplicateMatch.startDate}` : ""}
          </p>
          <p className={styles.matchMeta}>
            {isVerifyMode
              ? "We found an existing listing that matches your tournament. Confirm details below to mark it as Staff Verified."
              : "Known details were filled into any blank fields below. You can still edit everything before submitting."}
          </p>
          <div className={styles.matchActions}>
            <button type="button" className={styles.matchButton} onClick={() => applyMatch(duplicateMatch)}>
              {isVerifyMode ? "Apply Known Details" : "Re-apply known details"}
            </button>
            {duplicateMatch.slug ? (
              <Link className={styles.secondaryLink} href={`/tournaments/${duplicateMatch.slug}`}>
                {isVerifyMode ? "View Current Listing" : "View existing listing"}
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}
      {matchStatus === "loading" ? <p className={styles.matchMeta}>Checking for an existing tournament match…</p> : null}
      {status === "error" && message && !showHero ? <p className={styles.statusError}>{message}</p> : null}

      {isVerifyMode && status === "success" && successState ? (
        <section className={styles.sectionCard}>
          <div className={styles.verifySuccess}>
            <p className={styles.eyebrow}>Tournament Verification</p>
            <h2 className={styles.sectionTitle}>🎉 Your Tournament Is Now Staff Verified</h2>
            <ul className={styles.benefitList}>
              <li>Verified badge displayed on your event page</li>
              <li>Improved visibility in {sportDisplay.toLowerCase()} searches</li>
              <li>Referee panel enabled for pay, lodging, and mentors</li>
              <li>Sponsor links highlighted for planning and conversion</li>
            </ul>
            <div className={styles.footer}>
              {successState.listingPath ? (
                <Link href={successState.listingPath} className={styles.submitButton}>
                  View Your Verified Listing
                </Link>
              ) : (
                <Link href="/tournaments" className={styles.submitButton}>
                  View directory
                </Link>
              )}
              <button type="button" className={styles.secondaryLink} onClick={onShareListing}>
                Share This Page
              </button>
            </div>
            {shareStatus === "copied" ? <p className={styles.matchMeta}>Listing URL copied to clipboard.</p> : null}
            {shareStatus === "error" ? <p className={styles.statusError}>Unable to copy the listing URL right now.</p> : null}
          </div>
        </section>
      ) : (
      <form id={formId} onSubmit={onSubmit} className={styles.sectionCard}>
        <section className={styles.sectionCard}>
          <div className={styles.sectionHeader}>
            <div>
              <h2 className={styles.sectionTitle}>
                {isVerifyMode ? "Confirm Tournament Details" : "Tournament Details"}
              </h2>
              <p className={styles.sectionHelp}>
                {isVerifyMode
                  ? "Keep it minimal. You can update or add more information later."
                  : "Keep it minimal. You can add the rest later if needed."}
              </p>
            </div>
          </div>

          <div className={styles.grid}>
            <label className={styles.field}>
              <span className={styles.label}>Tournament Name</span>
              <input
                className={fieldClass(Boolean(errors.tournament.name))}
                value={form.tournament.name}
                onChange={(event) => setTournamentField("name", event.target.value)}
              />
              {errors.tournament.name ? <p className={styles.error}>{errors.tournament.name}</p> : null}
            </label>

            <label className={styles.field}>
              <span className={styles.label}>Sport</span>
              <select
                className={fieldClass(Boolean(errors.tournament.sport))}
                value={form.tournament.sport}
                onChange={(event) => setTournamentField("sport", event.target.value)}
              >
                <option value="">Choose sport</option>
                {TI_TOURNAMENT_SPORTS.map((sport) => (
                  <option key={sport} value={sport}>
                    {sportLabel(sport)}
                  </option>
                ))}
              </select>
              {errors.tournament.sport ? <p className={styles.error}>{errors.tournament.sport}</p> : null}
            </label>

            <label className={styles.field}>
              <span className={styles.label}>Start Date</span>
              <input
                type="date"
                className={fieldClass(Boolean(errors.tournament.startDate))}
                value={form.tournament.startDate}
                onChange={(event) => setTournamentField("startDate", event.target.value)}
              />
              {errors.tournament.startDate ? <p className={styles.error}>{errors.tournament.startDate}</p> : null}
            </label>

            <label className={styles.field}>
              <span className={styles.label}>End Date</span>
              <input
                type="date"
                className={fieldClass(Boolean(errors.tournament.endDate))}
                value={form.tournament.endDate}
                onChange={(event) => setTournamentField("endDate", event.target.value)}
              />
              {errors.tournament.endDate ? <p className={styles.error}>{errors.tournament.endDate}</p> : null}
            </label>

            <label className={styles.fieldWide}>
              <span className={styles.label}>Official Website URL</span>
              <input
                type="url"
                className={fieldClass(Boolean(errors.tournament.officialWebsiteUrl))}
                placeholder="https://example.com/tournament"
                value={form.tournament.officialWebsiteUrl}
                onChange={(event) => setTournamentField("officialWebsiteUrl", event.target.value)}
              />
              {errors.tournament.officialWebsiteUrl ? (
                <p className={styles.error}>{errors.tournament.officialWebsiteUrl}</p>
              ) : null}
            </label>

            <label className={styles.field}>
              <span className={styles.label}>Team Fee</span>
              <input
                className={styles.input}
                placeholder="$650 + ref fee"
                value={form.tournament.teamFee}
                onChange={(event) => setTournamentField("teamFee", event.target.value)}
              />
            </label>

            <label className={styles.field}>
              <span className={styles.label}>Age Groups Offered</span>
              <input
                className={styles.input}
                placeholder="U9, U10, U11"
                value={form.tournament.ageGroup}
                onChange={(event) => setTournamentField("ageGroup", event.target.value)}
              />
            </label>

            <label className={styles.field}>
              <span className={styles.label}>Tournament Director Contact</span>
              <input
                className={fieldClass(Boolean(errors.tournament.tournamentDirector))}
                value={form.tournament.tournamentDirector}
                onChange={(event) => setTournamentField("tournamentDirector", event.target.value)}
              />
              {errors.tournament.tournamentDirector ? (
                <p className={styles.error}>{errors.tournament.tournamentDirector}</p>
              ) : null}
            </label>

            <label className={styles.field}>
              <span className={styles.label}>Tournament Director Email</span>
              <input
                type="email"
                className={fieldClass(Boolean(errors.tournament.tournamentDirectorEmail))}
                value={form.tournament.tournamentDirectorEmail}
                onChange={(event) => setTournamentField("tournamentDirectorEmail", event.target.value)}
              />
              {errors.tournament.tournamentDirectorEmail ? (
                <p className={styles.error}>{errors.tournament.tournamentDirectorEmail}</p>
              ) : null}
            </label>

            <label className={styles.field}>
              <span className={styles.label}>Referee Contact</span>
              <input
                className={styles.input}
                value={form.tournament.refereeContact}
                onChange={(event) => setTournamentField("refereeContact", event.target.value)}
              />
            </label>

            <label className={styles.field}>
              <span className={styles.label}>Referee Contact Email</span>
              <input
                type="email"
                className={fieldClass(Boolean(errors.tournament.refereeEmail))}
                value={form.tournament.refereeEmail}
                onChange={(event) => setTournamentField("refereeEmail", event.target.value)}
              />
              {errors.tournament.refereeEmail ? <p className={styles.error}>{errors.tournament.refereeEmail}</p> : null}
            </label>

            <label className={styles.field}>
              <span className={styles.label}>Referee Pay</span>
              <input
                className={styles.input}
                placeholder="$55 center / $35 AR"
                value={form.tournament.refereePay}
                onChange={(event) => setTournamentField("refereePay", event.target.value)}
              />
            </label>

            <div className={styles.field}>
              <span className={styles.label}>Cash Tournament</span>
              <ToggleGroup
                options={YES_NO_OPTIONS}
                value={form.tournament.refCashTournament}
                onChange={(value) => setTournamentField("refCashTournament", value as TournamentDetailsInput["refCashTournament"])}
                ariaLabel="Cash tournament"
              />
              {errors.tournament.refCashTournament ? (
                <p className={styles.error}>{errors.tournament.refCashTournament}</p>
              ) : null}
            </div>

            <div className={styles.field}>
              <span className={styles.label}>Referee Mentors</span>
              <ToggleGroup
                options={YES_NO_OPTIONS}
                value={form.tournament.refMentors}
                onChange={(value) => setTournamentField("refMentors", value as TournamentDetailsInput["refMentors"])}
                ariaLabel="Referee mentors"
              />
            </div>

            <div className={styles.field}>
              <span className={styles.label}>Referee Lodging</span>
              <ToggleGroup
                options={LODGING_OPTIONS}
                value={form.tournament.travelLodging}
                onChange={(value) => setTournamentField("travelLodging", value as TournamentDetailsInput["travelLodging"])}
                ariaLabel="Referee lodging"
              />
              {errors.tournament.travelLodging ? <p className={styles.error}>{errors.tournament.travelLodging}</p> : null}
            </div>
          </div>
        </section>

        {isVerifyMode ? (
          <section className={styles.sectionCard}>
            <details
              className={styles.venueCard}
              open={expandedSponsors || errors.sponsors.some((entry) => Object.keys(entry).length > 0)}
              onToggle={(event) => setExpandedSponsors((event.currentTarget as HTMLDetailsElement).open)}
            >
              <summary className={styles.venueSummary}>
                <div className={styles.venueSummaryText}>
                  <h2 className={styles.sectionTitle} style={{ margin: 0 }}>Tournament Sponsors</h2>
                  <p className={styles.venueMeta}>
                    {(form.sponsors ?? []).length
                      ? `${(form.sponsors ?? []).length} sponsor${(form.sponsors ?? []).length === 1 ? "" : "s"} on file`
                      : "Add up to 4 sponsors. Leave blank if not needed."}
                  </p>
                </div>
                <span className={styles.venueSummaryChevron} aria-hidden="true">
                  {expandedSponsors || errors.sponsors.some((entry) => Object.keys(entry).length > 0) ? "▾" : "▸"}
                </span>
              </summary>

              <div className={styles.venueHeader}>
                <button type="button" className={styles.matchButton} onClick={() => setExpandedSponsors((current) => !current)}>
                  {expandedSponsors ? "Hide sponsor details" : "Open sponsor details"}
                </button>
                {(form.sponsors ?? []).length < MAX_TOURNAMENT_SPONSORS ? (
                  <button type="button" className={styles.addButton} onClick={addSponsor}>
                    Add sponsor
                  </button>
                ) : null}
              </div>

              {(form.sponsors ?? []).length > 0 ? (
                <div style={{ display: "grid", gap: 12 }}>
                  {(form.sponsors ?? []).map((sponsor, index) => {
                    const sponsorErrors = errors.sponsors[index] ?? {};
                    const categoryValue = sponsor.category || "";
                    return (
                      <div key={`sponsor-${index}`} className={styles.venueCard} style={{ padding: 14 }}>
                        <div className={styles.venueHeader}>
                          <div className={styles.venueSummaryText}>
                            <h3 className={styles.venueTitle}>Sponsor #{index + 1}: {sponsor.name.trim() || "Unnamed sponsor"}</h3>
                            <p className={styles.venueMeta}>{sponsorSummary(sponsor)}</p>
                          </div>
                          <button type="button" className={styles.removeButton} onClick={() => removeSponsor(index)}>
                            Remove sponsor
                          </button>
                        </div>

                        <div className={styles.grid}>
                          <label className={styles.field}>
                            <span className={styles.label}>Sponsor Name</span>
                            <input
                              className={fieldClass(Boolean(sponsorErrors.name))}
                              value={sponsor.name}
                              onChange={(event) => setSponsorField(index, "name", event.target.value)}
                            />
                            {sponsorErrors.name ? <p className={styles.error}>{sponsorErrors.name}</p> : null}
                          </label>

                          <label className={styles.field}>
                            <span className={styles.label}>Category</span>
                            <select
                              className={fieldClass(Boolean(sponsorErrors.category))}
                              value={categoryValue}
                              onChange={(event) => {
                                const value = event.target.value as SponsorInput["category"];
                                setSponsorField(index, "category", value);
                                if (value !== "other") {
                                  setSponsorField(index, "otherCategory", "");
                                }
                              }}
                            >
                              <option value="">Choose category</option>
                              {TOURNAMENT_SPONSOR_CATEGORY_OPTIONS.map((option) => (
                                <option key={option} value={option}>
                                  {option === "other"
                                    ? "Other"
                                    : option.charAt(0).toUpperCase() + option.slice(1)}
                                </option>
                              ))}
                            </select>
                            {sponsorErrors.category ? <p className={styles.error}>{sponsorErrors.category}</p> : null}
                          </label>

                          {categoryValue === "other" ? (
                            <label className={styles.field}>
                              <span className={styles.label}>Other Sponsor Type</span>
                              <input
                                className={fieldClass(Boolean(sponsorErrors.otherCategory))}
                                value={sponsor.otherCategory}
                                onChange={(event) => setSponsorField(index, "otherCategory", event.target.value)}
                              />
                              {sponsorErrors.otherCategory ? <p className={styles.error}>{sponsorErrors.otherCategory}</p> : null}
                            </label>
                          ) : null}

                          <label className={styles.fieldWide}>
                            <span className={styles.label}>Address</span>
                            <input
                              className={fieldClass(Boolean(sponsorErrors.address))}
                              value={sponsor.address}
                              onChange={(event) => setSponsorField(index, "address", event.target.value)}
                            />
                            {sponsorErrors.address ? <p className={styles.error}>{sponsorErrors.address}</p> : null}
                          </label>

                          <label className={styles.fieldWide}>
                            <span className={styles.label}>Website URL</span>
                            <input
                              type="url"
                              className={fieldClass(Boolean(sponsorErrors.websiteUrl))}
                              placeholder="https://sponsor.example.com"
                              value={sponsor.websiteUrl}
                              onChange={(event) => setSponsorField(index, "websiteUrl", event.target.value)}
                            />
                            {sponsorErrors.websiteUrl ? <p className={styles.error}>{sponsorErrors.websiteUrl}</p> : null}
                          </label>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className={styles.sectionHelp}>Add official hotel, food, coffee, apparel, or other tournament sponsors here.</p>
              )}
            </details>
          </section>
        ) : null}

        <section className={styles.sectionCard}>
          <div className={styles.sectionHeader}>
            <div>
              <h2 className={styles.sectionTitle}>Venues</h2>
              <p className={styles.sectionHelp}>Venue #1 is required. Add more if this tournament uses multiple sites.</p>
            </div>
            <button type="button" className={styles.addButton} onClick={addVenue}>
              Add another venue
            </button>
          </div>

          {form.venues.map((venue, index) => {
            const venueErrors = errors.venues[index] ?? {};
            const isExpanded = expandedVenues.includes(index);
            const hasVenueErrors = Object.keys(venueErrors).length > 0;
            return (
              <details
                key={`venue-${index}`}
                className={styles.venueCard}
                open={isExpanded || hasVenueErrors}
                onToggle={(event) => {
                  const nextOpen = (event.currentTarget as HTMLDetailsElement).open;
                  setExpandedVenues((current) =>
                    nextOpen ? Array.from(new Set([...current, index])) : current.filter((value) => value !== index)
                  );
                }}
              >
                <summary className={styles.venueSummary}>
                  <div className={styles.venueSummaryText}>
                    <h3 className={styles.venueTitle}>Venue #{index + 1}: {venue.name.trim() || "Unnamed venue"}</h3>
                    <p className={styles.venueMeta}>{venueSummary(venue)}</p>
                  </div>
                  <span className={styles.venueSummaryChevron} aria-hidden="true">
                    {isExpanded || hasVenueErrors ? "▾" : "▸"}
                  </span>
                </summary>

                <div className={styles.venueHeader}>
                  <button type="button" className={styles.matchButton} onClick={() => toggleVenue(index)}>
                    {isExpanded || hasVenueErrors ? "Hide details" : "Open details"}
                  </button>
                  {index > 0 ? (
                    <button type="button" className={styles.removeButton} onClick={() => removeVenue(index)}>
                      Remove venue
                    </button>
                  ) : null}
                </div>

                <div className={styles.grid}>
                  <label className={styles.field}>
                    <span className={styles.label}>Venue Name</span>
                    <input
                      className={fieldClass(Boolean(venueErrors.name))}
                      value={venue.name}
                      onChange={(event) => setVenueField(index, "name", event.target.value)}
                    />
                    {venueErrors.name ? <p className={styles.error}>{venueErrors.name}</p> : null}
                  </label>

                  <label className={styles.fieldWide}>
                    <span className={styles.label}>Street Address</span>
                    <input
                      className={fieldClass(Boolean(venueErrors.address1))}
                      value={venue.address1}
                      onChange={(event) => setVenueField(index, "address1", event.target.value)}
                    />
                    {venueErrors.address1 ? <p className={styles.error}>{venueErrors.address1}</p> : null}
                  </label>

                  <label className={styles.field}>
                    <span className={styles.label}>City</span>
                    <input
                      className={fieldClass(Boolean(venueErrors.city))}
                      value={venue.city}
                      onChange={(event) => setVenueField(index, "city", event.target.value)}
                    />
                    {venueErrors.city ? <p className={styles.error}>{venueErrors.city}</p> : null}
                  </label>

                  <label className={styles.field}>
                    <span className={styles.label}>State</span>
                    <input
                      className={fieldClass(Boolean(venueErrors.state))}
                      value={venue.state}
                      maxLength={2}
                      onChange={(event) => setVenueField(index, "state", event.target.value.toUpperCase())}
                    />
                    {venueErrors.state ? <p className={styles.error}>{venueErrors.state}</p> : null}
                  </label>

                  <label className={styles.field}>
                    <span className={styles.label}>ZIP Code</span>
                    <input
                      className={fieldClass(Boolean(venueErrors.zip))}
                      value={venue.zip}
                      inputMode="numeric"
                      maxLength={5}
                      onChange={(event) =>
                        setVenueField(index, "zip", event.target.value.replace(/\D/g, "").slice(0, 5))
                      }
                    />
                    {venueErrors.zip ? <p className={styles.error}>{venueErrors.zip}</p> : null}
                  </label>

                  <label className={styles.fieldWide}>
                    <span className={styles.label}>Venue Website URL</span>
                    <input
                      type="url"
                      className={fieldClass(Boolean(venueErrors.venueUrl))}
                      placeholder="https://venue.example.com"
                      value={venue.venueUrl}
                      onChange={(event) => setVenueField(index, "venueUrl", event.target.value)}
                    />
                    {venueErrors.venueUrl ? <p className={styles.error}>{venueErrors.venueUrl}</p> : null}
                  </label>

                  <div className={styles.field}>
                    <span className={styles.label}>Restroom Type</span>
                    <ToggleGroup
                      options={RESTROOM_OPTIONS}
                      value={venue.restrooms}
                      onChange={(value) => setVenueField(index, "restrooms", value as VenueInput["restrooms"])}
                      ariaLabel={`Venue ${index + 1} restroom type`}
                    />
                    {venueErrors.restrooms ? <p className={styles.error}>{venueErrors.restrooms}</p> : null}
                  </div>

                  <div className={styles.field}>
                    <span className={styles.label}>Spectators Should Bring Field Chair</span>
                    <ToggleGroup
                      options={YES_NO_OPTIONS}
                      value={venue.bringFieldChairs}
                      onChange={(value) =>
                        setVenueField(index, "bringFieldChairs", value as VenueInput["bringFieldChairs"])
                      }
                      ariaLabel={`Venue ${index + 1} bring field chair`}
                    />
                    {venueErrors.bringFieldChairs ? <p className={styles.error}>{venueErrors.bringFieldChairs}</p> : null}
                  </div>
                </div>
              </details>
            );
          })}
        </section>

        <div className={styles.footer}>
          <Link href="/tournaments" className={styles.secondaryLink}>
            View directory
          </Link>
          <button type="submit" disabled={status === "saving"} className={styles.submitButton}>
            {status === "saving"
              ? isVerifyMode
                ? "Saving verification..."
                : "Submitting..."
              : isVerifyMode
                ? "Mark as Staff Verified"
                : "Submit tournament"}
          </button>
        </div>
      </form>
      )}
    </main>
  );
}
