"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./VenueReviews.module.css";

const { WhistleScale } = require("../../../../../referee/components/RefereeReviewList") as {
  WhistleScale: (props: { score: number; size?: "small" | "large" }) => JSX.Element;
};

type TournamentOption = {
  id: string;
  slug: string;
  name: string;
  start_date: string | null;
};

type VenueOption = {
  id: string;
  name: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
};

type ReviewFormState = {
  restrooms: "Portable" | "Building" | "Both" | "";
  restroom_cleanliness: number | null;
  player_parking_fee: string;
  parking_convenience_score: "Close" | "Medium" | "Far" | "";
  parking_notes: string;
  bring_field_chairs: "Yes" | "No" | "";
  seating_notes: string;
  shade_score: number | null;
  food_vendors: "Yes" | "No" | "";
  coffee_vendors: "Yes" | "No" | "";
  vendor_score: number | null;
  venue_notes: string;
};

const INITIAL_FORM: ReviewFormState = {
  restrooms: "",
  restroom_cleanliness: null,
  player_parking_fee: "",
  parking_convenience_score: "",
  parking_notes: "",
  bring_field_chairs: "",
  seating_notes: "",
  shade_score: null,
  food_vendors: "",
  coffee_vendors: "",
  vendor_score: null,
  venue_notes: "",
};

function formatDate(value: string | null) {
  if (!value) return "Date TBA";
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return "Date TBA";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function parseUsdToNumber(raw: string) {
  const cleaned = raw.replace(/[$,\s]/g, "").trim();
  if (!cleaned) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) return null;
  return Math.round(parsed * 100) / 100;
}

function yesNoToBoolean(value: "Yes" | "No" | "") {
  if (value === "Yes") return true;
  if (value === "No") return false;
  return null;
}

function GaugeInput({
  label,
  value,
  onChange,
  id,
}: {
  label: string;
  value: number | null;
  onChange: (next: number) => void;
  id: string;
}) {
  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={id}>
        {label}
      </label>
      <div id={id} className={styles.gaugeControl}>
        <WhistleScale score={value ?? 1} size="large" />
        <div className={styles.gaugeOverlay}>
          {[1, 2, 3, 4, 5].map((score) => (
            <button
              key={score}
              type="button"
              className={styles.gaugeSegment}
              aria-label={`Set ${label} to ${score}`}
              onClick={() => onChange(score)}
            />
          ))}
        </div>
      </div>
      <div className={styles.gaugeHint}>Selected: {value ?? "None"}</div>
    </div>
  );
}

export default function VenueReviewsClient() {
  const router = useRouter();
  const [selectedTournament, setSelectedTournament] = useState<TournamentOption | null>(null);
  const [selectedVenueId, setSelectedVenueId] = useState<string>("");
  const [venues, setVenues] = useState<VenueOption[]>([]);
  const [venuesLoading, setVenuesLoading] = useState(false);
  const [venuesError, setVenuesError] = useState("");

  const [codeInput, setCodeInput] = useState("");
  const [codeStatus, setCodeStatus] = useState<"idle" | "loading" | "error">("idle");
  const [codeMessage, setCodeMessage] = useState("");

  const [searchInput, setSearchInput] = useState("");
  const [searchResults, setSearchResults] = useState<TournamentOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [venueSearchInput, setVenueSearchInput] = useState("");
  const [venueSearchResults, setVenueSearchResults] = useState<VenueOption[]>([]);
  const [venueSearching, setVenueSearching] = useState(false);
  const [venueSearchError, setVenueSearchError] = useState("");

  const [form, setForm] = useState<ReviewFormState>(INITIAL_FORM);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const allVenueOptions = useMemo(() => {
    const map = new Map<string, VenueOption>();
    for (const venue of venues) map.set(venue.id, venue);
    for (const venue of venueSearchResults) map.set(venue.id, venue);
    return Array.from(map.values());
  }, [venues, venueSearchResults]);

  const selectedVenue = useMemo(
    () => allVenueOptions.find((venue) => venue.id === selectedVenueId) ?? null,
    [allVenueOptions, selectedVenueId]
  );

  async function loadVenues(tournamentId: string) {
    setVenuesLoading(true);
    setVenuesError("");
    setSelectedVenueId("");
    setForm(INITIAL_FORM);
    try {
      const response = await fetch(
        `/api/venue-reviews?mode=venues&tournamentId=${encodeURIComponent(tournamentId)}`,
        { method: "GET", cache: "no-store" }
      );
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || "Unable to load venues.");
      }
      setVenues((payload?.venues ?? []) as VenueOption[]);
    } catch (err: any) {
      setVenues([]);
      setVenuesError(err?.message || "Unable to load venues.");
    } finally {
      setVenuesLoading(false);
    }
  }

  function applyTournament(tournament: TournamentOption) {
    setSelectedTournament(tournament);
    setSearchResults([]);
    setSearchInput("");
    setCodeMessage("");
    setCodeStatus("idle");
    void loadVenues(tournament.id);
  }

  function clearTournament() {
    setSelectedTournament(null);
    setSelectedVenueId("");
    setVenues([]);
    setVenuesError("");
    setForm(INITIAL_FORM);
    setSubmitted(false);
    setFormError("");
  }

  async function onLookupCode() {
    const code = codeInput.trim();
    if (!code) {
      setCodeStatus("error");
      setCodeMessage("Enter a tournament code.");
      return;
    }

    setCodeStatus("loading");
    setCodeMessage("");
    try {
      const response = await fetch(
        `/api/venue-reviews?mode=code&code=${encodeURIComponent(code)}`,
        { method: "GET", cache: "no-store" }
      );
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || "Code not found.");
      }
      if (!payload?.tournament) {
        setCodeStatus("error");
        setCodeMessage("Code not found.");
        return;
      }
      setCodeStatus("idle");
      setCodeMessage("");
      applyTournament(payload.tournament as TournamentOption);
    } catch (err: any) {
      setCodeStatus("error");
      setCodeMessage(err?.message || "Code not found.");
    }
  }

  useEffect(() => {
    if (selectedTournament) return;
    const q = searchInput.trim();
    if (q.length < 2) {
      setSearchResults([]);
      setSearchError("");
      return;
    }

    const timeout = window.setTimeout(async () => {
      setSearching(true);
      setSearchError("");
      try {
        const response = await fetch(`/api/venue-reviews?mode=search&q=${encodeURIComponent(q)}`, {
          method: "GET",
          cache: "no-store",
        });
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload?.error || "Search failed.");
        }
        setSearchResults((payload?.results ?? []) as TournamentOption[]);
      } catch (err: any) {
        setSearchResults([]);
        setSearchError(err?.message || "Search failed.");
      } finally {
        setSearching(false);
      }
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [searchInput, selectedTournament]);

  useEffect(() => {
    const q = venueSearchInput.trim();
    if (q.length < 2) {
      setVenueSearchResults([]);
      setVenueSearchError("");
      return;
    }

    const timeout = window.setTimeout(async () => {
      setVenueSearching(true);
      setVenueSearchError("");
      try {
        const response = await fetch(`/api/venue-reviews?mode=venue-search&q=${encodeURIComponent(q)}`, {
          method: "GET",
          cache: "no-store",
        });
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload?.error || "Venue search failed.");
        }
        setVenueSearchResults((payload?.venues ?? []) as VenueOption[]);
      } catch (err: any) {
        setVenueSearchResults([]);
        setVenueSearchError(err?.message || "Venue search failed.");
      } finally {
        setVenueSearching(false);
      }
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [venueSearchInput]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedVenue) {
      setFormError("Select a venue first.");
      return;
    }

    const parkingFee = parseUsdToNumber(form.player_parking_fee);
    const validationErrors: string[] = [];

    if (!form.restrooms) validationErrors.push("Restrooms");
    if (!form.restroom_cleanliness) validationErrors.push("Restroom cleanliness");
    if (parkingFee === null) validationErrors.push("Player parking fee");
    if (!form.parking_convenience_score) validationErrors.push("Parking convenience");
    if (!form.bring_field_chairs) validationErrors.push("Bring field chairs");
    if (!form.shade_score) validationErrors.push("Shade score");
    if (!form.food_vendors) validationErrors.push("Food vendors");
    if (!form.coffee_vendors) validationErrors.push("Coffee vendors");
    if (!form.vendor_score) validationErrors.push("Vendor score");

    if (validationErrors.length > 0) {
      setFormError(`Please complete: ${validationErrors.join(", ")}.`);
      return;
    }

    setSaving(true);
    setFormError("");
    try {
      const response = await fetch("/api/venue-reviews", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          venue_id: selectedVenue.id,
          tournament_id: selectedTournament?.id ?? null,
          restrooms: form.restrooms,
          restroom_cleanliness: form.restroom_cleanliness,
          player_parking_fee: parkingFee,
          parking_convenience_score: form.parking_convenience_score,
          parking_notes: form.parking_notes.trim() || null,
          bring_field_chairs: yesNoToBoolean(form.bring_field_chairs),
          seating_notes: form.seating_notes.trim() || null,
          shade_score: form.shade_score,
          food_vendors: yesNoToBoolean(form.food_vendors),
          coffee_vendors: yesNoToBoolean(form.coffee_vendors),
          vendor_score: form.vendor_score,
          venue_notes: form.venue_notes.trim() || null,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to submit review.");
      }
      setSubmitted(true);
      window.setTimeout(() => {
        if (selectedTournament?.slug) {
          router.push(`/tournaments/${selectedTournament.slug}`);
          return;
        }
        router.push(`/venues/${selectedVenue.id}`);
      }, 1000);
    } catch (err: any) {
      setFormError(err?.message || "Failed to submit review.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <h1 className={styles.title}>Venue Reviews</h1>
        <p className={styles.subtitle}>Insider review flow for tournament venues.</p>

        <div className={styles.stepBlock}>
          <h2 className={styles.stepTitle}>Step 1: Identify tournament</h2>

          {selectedTournament ? (
            <div className={styles.selectedTournament}>
              <div>
                <strong>{selectedTournament.name}</strong>
                <div className={styles.meta}>Starts {formatDate(selectedTournament.start_date)}</div>
              </div>
              <button type="button" className={styles.secondaryBtn} onClick={clearTournament}>
                Change tournament
              </button>
            </div>
          ) : (
            <>
              <div className={styles.inlineRow}>
                <input
                  className={styles.input}
                  type="text"
                  value={codeInput}
                  onChange={(e) => setCodeInput(e.target.value)}
                  placeholder="Tournament Code"
                />
                <button type="button" className={styles.primaryBtn} onClick={onLookupCode} disabled={codeStatus === "loading"}>
                  {codeStatus === "loading" ? "Looking up..." : "Find by code"}
                </button>
              </div>
              {codeMessage ? <div className={styles.errorText}>{codeMessage}</div> : null}

              <div className={styles.searchLabel}>Or search tournament name</div>
              <input
                className={styles.input}
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search tournament name"
              />
              {searching ? <div className={styles.meta}>Searching...</div> : null}
              {searchError ? <div className={styles.errorText}>{searchError}</div> : null}
              {searchResults.length > 0 ? (
                <div className={styles.resultList}>
                  {searchResults.map((result) => (
                    <button
                      key={result.id}
                      type="button"
                      className={styles.resultItem}
                      onClick={() => applyTournament(result)}
                    >
                      <span>{result.name}</span>
                      <span className={styles.meta}>{formatDate(result.start_date)}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </>
          )}
        </div>

        <div className={styles.stepBlock}>
          <h2 className={styles.stepTitle}>Step 2: Select venue</h2>
          {!selectedTournament ? <div className={styles.meta}>Tournament is optional. Search by venue if you’re not sure.</div> : null}
          {selectedTournament && venuesLoading ? <div className={styles.meta}>Loading venues...</div> : null}
          {venuesError ? <div className={styles.errorText}>{venuesError}</div> : null}
          {selectedTournament && !venuesLoading && venues.length === 0 ? (
            <div className={styles.meta}>No venues found for this tournament. Try another tournament.</div>
          ) : null}
          {venues.length > 0 ? (
            <div className={styles.venueGrid}>
              {venues.map((venue) => {
                const isSelected = venue.id === selectedVenueId;
                const location = [venue.address, [venue.city, venue.state].filter(Boolean).join(", ")]
                  .filter(Boolean)
                  .join(" • ");
                return (
                  <button
                    key={venue.id}
                    type="button"
                    className={`${styles.venueCard} ${isSelected ? styles.venueCardSelected : ""}`}
                    onClick={() => {
                      setSelectedVenueId(venue.id);
                      setVenueSearchInput("");
                      setVenueSearchResults([]);
                      setVenueSearchError("");
                      setForm(INITIAL_FORM);
                      setSubmitted(false);
                      setFormError("");
                    }}
                  >
                    <strong>{venue.name || "Unnamed venue"}</strong>
                    <span className={styles.meta}>{location || "Location not provided"}</span>
                  </button>
                );
              })}
            </div>
          ) : null}

          <div className={styles.searchLabel}>Or search venue directly</div>
          <input
            className={styles.input}
            type="text"
            value={venueSearchInput}
            onChange={(e) => setVenueSearchInput(e.target.value)}
            placeholder="Search venue name or city"
          />
          {venueSearching ? <div className={styles.meta}>Searching venues...</div> : null}
          {venueSearchError ? <div className={styles.errorText}>{venueSearchError}</div> : null}
          {venueSearchResults.length > 0 ? (
            <div className={styles.resultList}>
              {venueSearchResults.map((venue) => {
                const location = [venue.address, [venue.city, venue.state].filter(Boolean).join(", ")]
                  .filter(Boolean)
                  .join(" • ");
                return (
                  <button
                    key={venue.id}
                    type="button"
                    className={styles.resultItem}
                    onClick={() => {
                      setSelectedVenueId(venue.id);
                      setForm(INITIAL_FORM);
                      setSubmitted(false);
                      setFormError("");
                    }}
                  >
                    <span>{venue.name || "Unnamed venue"}</span>
                    <span className={styles.meta}>{location || "Location not provided"}</span>
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>

        {selectedVenue ? (
          <form className={styles.form} onSubmit={onSubmit}>
            <h2 className={styles.stepTitle}>
              Review: {selectedTournament ? `${selectedTournament.name} - ` : ""}{selectedVenue.name || "Venue"}
            </h2>

            <div className={styles.field}>
              <label className={styles.label}>Restrooms</label>
              <div className={styles.radioRow}>
                {(["Portable", "Building", "Both"] as const).map((value) => (
                  <label key={value} className={styles.radioLabel}>
                    <input
                      type="radio"
                      name="restrooms"
                      value={value}
                      checked={form.restrooms === value}
                      onChange={() => setForm((prev) => ({ ...prev, restrooms: value }))}
                    />
                    {value}
                  </label>
                ))}
              </div>
            </div>

            <GaugeInput
              id="restroom_cleanliness"
              label="Restroom cleanliness (1-5)"
              value={form.restroom_cleanliness}
              onChange={(next) => setForm((prev) => ({ ...prev, restroom_cleanliness: next }))}
            />

            <div className={styles.field}>
              <label className={styles.label} htmlFor="player_parking_fee">
                Player parking fee (USD)
              </label>
              <input
                id="player_parking_fee"
                className={styles.input}
                type="text"
                placeholder="$10.00"
                value={form.player_parking_fee}
                onChange={(e) => setForm((prev) => ({ ...prev, player_parking_fee: e.target.value }))}
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Parking convenience</label>
              <div className={styles.radioRow}>
                {(["Close", "Medium", "Far"] as const).map((value) => (
                  <label key={value} className={styles.radioLabel}>
                    <input
                      type="radio"
                      name="parking_convenience_score"
                      value={value}
                      checked={form.parking_convenience_score === value}
                      onChange={() =>
                        setForm((prev) => ({
                          ...prev,
                          parking_convenience_score: value,
                        }))
                      }
                    />
                    {value}
                  </label>
                ))}
              </div>
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="parking_notes">
                Parking notes (optional)
              </label>
              <input
                id="parking_notes"
                className={styles.input}
                type="text"
                maxLength={60}
                placeholder="e.g. Overflow lot fills first"
                value={form.parking_notes}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    parking_notes: e.target.value.slice(0, 60),
                  }))
                }
              />
              <div className={styles.meta}>{form.parking_notes.length}/60</div>
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Bring field chairs</label>
              <div className={styles.radioRow}>
                {(["Yes", "No"] as const).map((value) => (
                  <label key={value} className={styles.radioLabel}>
                    <input
                      type="radio"
                      name="bring_field_chairs"
                      value={value}
                      checked={form.bring_field_chairs === value}
                      onChange={() => setForm((prev) => ({ ...prev, bring_field_chairs: value }))}
                    />
                    {value}
                  </label>
                ))}
              </div>
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="seating_notes">
                Seating notes (optional)
              </label>
              <input
                id="seating_notes"
                className={styles.input}
                type="text"
                maxLength={60}
                placeholder="e.g. Bleachers on field 1 only"
                value={form.seating_notes}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    seating_notes: e.target.value.slice(0, 60),
                  }))
                }
              />
              <div className={styles.meta}>{form.seating_notes.length}/60</div>
            </div>

            <GaugeInput
              id="shade_score"
              label="Shade score (1-5)"
              value={form.shade_score}
              onChange={(next) => setForm((prev) => ({ ...prev, shade_score: next }))}
            />

            <div className={styles.field}>
              <label className={styles.label}>Food vendors</label>
              <div className={styles.radioRow}>
                {(["Yes", "No"] as const).map((value) => (
                  <label key={value} className={styles.radioLabel}>
                    <input
                      type="radio"
                      name="food_vendors"
                      value={value}
                      checked={form.food_vendors === value}
                      onChange={() => setForm((prev) => ({ ...prev, food_vendors: value }))}
                    />
                    {value}
                  </label>
                ))}
              </div>
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Coffee vendors</label>
              <div className={styles.radioRow}>
                {(["Yes", "No"] as const).map((value) => (
                  <label key={value} className={styles.radioLabel}>
                    <input
                      type="radio"
                      name="coffee_vendors"
                      value={value}
                      checked={form.coffee_vendors === value}
                      onChange={() => setForm((prev) => ({ ...prev, coffee_vendors: value }))}
                    />
                    {value}
                  </label>
                ))}
              </div>
            </div>

            <GaugeInput
              id="vendor_score"
              label="Vendor score (1-5)"
              value={form.vendor_score}
              onChange={(next) => setForm((prev) => ({ ...prev, vendor_score: next }))}
            />

            <div className={styles.field}>
              <label className={styles.label} htmlFor="venue_notes">
                Venue notes (optional)
              </label>
              <textarea
                id="venue_notes"
                className={styles.textarea}
                value={form.venue_notes}
                maxLength={255}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    venue_notes: e.target.value.slice(0, 255),
                  }))
                }
              />
              <div className={styles.meta}>{form.venue_notes.length}/255</div>
            </div>

            {formError ? <div className={styles.errorText}>{formError}</div> : null}

            {submitted ? (
              <div className={styles.successText}>
                Thank you for your review. Your feedback helps families and teams.
                <div>
                  <button
                    type="button"
                    className={styles.primaryBtn}
                    onClick={() =>
                      selectedTournament?.slug
                        ? router.push(`/tournaments/${selectedTournament.slug}`)
                        : router.push(`/venues/${selectedVenue.id}`)
                    }
                  >
                    {selectedTournament?.slug ? "Continue to tournament" : "Continue to venue"}
                  </button>
                </div>
              </div>
            ) : (
              <button type="submit" className={styles.primaryBtn} disabled={saving}>
                {saving ? "Submitting..." : "Submit venue review"}
              </button>
            )}
          </form>
        ) : null}
      </section>
    </main>
  );
}
