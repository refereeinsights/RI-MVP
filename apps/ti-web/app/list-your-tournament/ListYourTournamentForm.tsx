"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  applyDuplicateMatchToForm,
  createEmptyVenue,
  createEmptyErrors,
  createInitialSubmission,
  LODGING_OPTIONS,
  RESTROOM_OPTIONS,
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
  | { ok: true; tournamentId: string; venueCount: number }
  | { ok: false; error?: string; fieldErrors?: SubmissionErrors };

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

export default function ListYourTournamentForm() {
  const [form, setForm] = useState<TournamentSubmissionInput>(createInitialSubmission);
  const [errors, setErrors] = useState<SubmissionErrors>(() => createEmptyErrors(1));
  const [status, setStatus] = useState<"idle" | "saving" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const [duplicateMatch, setDuplicateMatch] = useState<TournamentDuplicateMatch | null>(null);
  const [matchStatus, setMatchStatus] = useState<"idle" | "loading" | "ready">("idle");
  const lastAppliedMatchIdRef = useRef<string | null>(null);

  function setTournamentField<K extends keyof TournamentDetailsInput>(field: K, value: TournamentDetailsInput[K]) {
    setForm((current) => ({
      ...current,
      tournament: {
        ...current.tournament,
        [field]: value,
      },
    }));
  }

  function setVenueField<K extends keyof VenueInput>(index: number, field: K, value: VenueInput[K]) {
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

  function addVenue() {
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
    setForm((current) => ({
      ...current,
      venues: current.venues.filter((_, venueIndex) => venueIndex !== index),
    }));
    setErrors((current) => ({
      ...current,
      venues: current.venues.filter((_, venueIndex) => venueIndex !== index),
    }));
  }

  function applyMatch(match: TournamentDuplicateMatch) {
    setForm((current) => applyDuplicateMatchToForm(current, match));
    setDuplicateMatch(match);
    lastAppliedMatchIdRef.current = match.id;
  }

  useEffect(() => {
    const name = form.tournament.name.trim();
    const city = form.venues[0]?.city.trim() ?? "";
    const state = form.venues[0]?.state.trim() ?? "";

    if (name.length < 3) {
      setDuplicateMatch(null);
      setMatchStatus("idle");
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
          setForm((current) => applyDuplicateMatchToForm(current, payload.match as TournamentDuplicateMatch));
          lastAppliedMatchIdRef.current = payload.match.id;
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
  }, [form.tournament.name, form.venues[0]?.city, form.venues[0]?.state]);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("idle");
    setMessage("");

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
      body: JSON.stringify(form),
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
    setMessage("Thanks. Your tournament submission was received and saved.");
    setForm(createInitialSubmission());
    setErrors(createEmptyErrors(1));
  }

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <p className={styles.eyebrow}>Tournament Directory</p>
        <h1 className={styles.title}>List Your Tournament</h1>
        <p className={styles.subtitle}>
          Share the essential tournament and venue details directors want families, teams, and officials to find in one
          clean place. Start with one venue and add more if the event uses multiple sites.
        </p>
        {status === "success" ? <p className={styles.statusSuccess}>{message}</p> : null}
        {status === "error" && message ? <p className={styles.statusError}>{message}</p> : null}
        {duplicateMatch ? (
          <div className={styles.matchPanel}>
            <strong>We found a similar tournament in the TI database.</strong>
            <p className={styles.matchMeta}>
              {duplicateMatch.name}
              {duplicateMatch.city || duplicateMatch.state
                ? ` • ${[duplicateMatch.city, duplicateMatch.state].filter(Boolean).join(", ")}`
                : ""}
              {duplicateMatch.startDate ? ` • Starts ${duplicateMatch.startDate}` : ""}
            </p>
            <p className={styles.matchMeta}>
              Known details were filled into any blank fields below. You can still edit everything before submitting.
            </p>
            <div className={styles.matchActions}>
              <button type="button" className={styles.matchButton} onClick={() => applyMatch(duplicateMatch)}>
                Re-apply known details
              </button>
              {duplicateMatch.slug ? (
                <Link className={styles.secondaryLink} href={`/tournaments/${duplicateMatch.slug}`}>
                  View existing listing
                </Link>
              ) : null}
            </div>
          </div>
        ) : null}
        {matchStatus === "loading" ? <p className={styles.matchMeta}>Checking for an existing tournament match…</p> : null}
      </section>

      <form onSubmit={onSubmit} className={styles.sectionCard}>
        <section className={styles.sectionCard}>
          <div className={styles.sectionHeader}>
            <div>
              <h2 className={styles.sectionTitle}>Tournament Details</h2>
              <p className={styles.sectionHelp}>Keep it minimal. You can add the rest later if needed.</p>
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
            return (
              <div key={`venue-${index}`} className={styles.venueCard}>
                <div className={styles.venueHeader}>
                  <h3 className={styles.venueTitle}>Venue #{index + 1}</h3>
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
              </div>
            );
          })}
        </section>

        <div className={styles.footer}>
          <Link href="/tournaments" className={styles.secondaryLink}>
            View directory
          </Link>
          <button type="submit" disabled={status === "saving"} className={styles.submitButton}>
            {status === "saving" ? "Submitting..." : "Submit tournament"}
          </button>
        </div>
      </form>
    </main>
  );
}
