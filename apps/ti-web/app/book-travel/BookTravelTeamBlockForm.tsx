"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { sendTiAnalytics } from "@/lib/analytics";
import { formatDateToMmDdYyyy } from "@/lib/lodging/lodging-dates";
import styles from "./BookTravelTeamBlockForm.module.css";

type VenueSuggestion = {
  id: string;
  name?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
};

type VenueSearchResponse = {
  ok: boolean;
  venues?: VenueSuggestion[];
  error?: string;
};

type GroupRequestResponse = {
  sessionId: string;
  provider: string;
  propertyId?: string | null;
  success: boolean;
  requestId?: string | null;
  error?: string;
  code?: string;
};

type TeamBlockFormState = {
  destination: string;
  checkin: string;
  checkout: string;
  rooms: string;
  adultsPerRoom: string;
  childrenPerRoom: string;
  groupName: string;
  contactFirstName: string;
  contactLastName: string;
  email: string;
  phone: string;
  notes: string;
};

const DEFAULT_FORM: TeamBlockFormState = {
  destination: "",
  checkin: "",
  checkout: "",
  rooms: "10",
  adultsPerRoom: "2",
  childrenPerRoom: "0",
  groupName: "",
  contactFirstName: "",
  contactLastName: "",
  email: "",
  phone: "",
  notes: "",
};

function parseIsoDateInput(value: string): Date | null {
  const raw = String(value ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const [year, month, day] = raw.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (!Number.isFinite(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10) === raw ? parsed : null;
}

function formatVenueSearchText(venue: VenueSuggestion) {
  return [venue.name, venue.city, venue.state].filter(Boolean).join(", ");
}

function formatVenueDisplayLine(venue: VenueSuggestion) {
  return [venue.address, [venue.city, venue.state].filter(Boolean).join(", ")].filter(Boolean).join(" · ");
}

function buildProviderDestination(typedDestination: string, matchedVenue: VenueSuggestion | null) {
  if (!matchedVenue) return typedDestination.trim();
  return [matchedVenue.address, matchedVenue.city, matchedVenue.state].filter(Boolean).join(", ") || formatVenueSearchText(matchedVenue);
}

function buildReadableDestinationContext(typedDestination: string, matchedVenue: VenueSuggestion | null) {
  if (!matchedVenue) return typedDestination.trim();
  return [matchedVenue.name, [matchedVenue.city, matchedVenue.state].filter(Boolean).join(", ")].filter(Boolean).join(" — ");
}

type BookTravelTeamBlockFormProps = {
  surface?: "book_travel_page" | "weekend_planner";
  defaultOpen?: boolean;
  showToggle?: boolean;
  entitlement?: "explorer" | "insider" | "weekend_pro" | "unknown";
  authState?: "signed_out" | "unverified" | "verified";
};

export default function BookTravelTeamBlockForm({
  surface = "book_travel_page",
  defaultOpen = false,
  showToggle = true,
  entitlement = "unknown",
  authState = "signed_out",
}: BookTravelTeamBlockFormProps = {}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [form, setForm] = useState<TeamBlockFormState>(DEFAULT_FORM);
  const [matchedVenue, setMatchedVenue] = useState<VenueSuggestion | null>(null);
  const [venueResults, setVenueResults] = useState<VenueSuggestion[]>([]);
  const [venueSearching, setVenueSearching] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ requestId?: string | null } | null>(null);
  const startedRef = useRef(false);
  const ctaViewedRef = useRef(false);

  const providerDestination = useMemo(
    () => buildProviderDestination(form.destination, matchedVenue),
    [form.destination, matchedVenue]
  );
  const readableDestinationContext = useMemo(
    () => buildReadableDestinationContext(form.destination, matchedVenue),
    [form.destination, matchedVenue]
  );

  useEffect(() => {
    if (!showToggle || ctaViewedRef.current) return;
    ctaViewedRef.current = true;
    void sendTiAnalytics("team_hotel_cta_viewed", {
      surface: surface === "weekend_planner" ? "team_hotel" : "travel",
      source_page_type: surface === "weekend_planner" ? "planner" : "book_travel",
      cta_type: "team_hotel",
      auth_state: authState,
      entitlement,
      context_type: "team_hotel",
    });
  }, [authState, entitlement, showToggle, surface]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.hash !== "#team-hotel-blocks") return;
    setIsOpen(true);
  }, []);

  function trackStart() {
    if (startedRef.current) return;
    startedRef.current = true;
    void sendTiAnalytics("team_hotel_request_started", {
      surface: "team_hotel",
      source_page_type: surface === "weekend_planner" ? "planner" : "book_travel",
      action_surface: "team_hotel",
      auth_state: authState,
      entitlement,
      context_type: "team_hotel",
    });
  }

  useEffect(() => {
    if (matchedVenue) return;
    const query = form.destination.trim();
    if (query.length < 2) {
      setVenueResults([]);
      setVenueSearching(false);
      return;
    }

    setVenueSearching(true);
    const timeout = window.setTimeout(() => {
      void fetch(`/api/book-travel/venues?q=${encodeURIComponent(query)}`, { method: "GET" })
        .then(async (response) => {
          const payload = (await response.json().catch(() => null)) as VenueSearchResponse | null;
          if (!response.ok || !payload?.ok) {
            setVenueResults([]);
            return null;
          }
          setVenueResults(payload.venues ?? []);
          return null;
        })
        .catch(() => {
          setVenueResults([]);
        })
        .finally(() => setVenueSearching(false));
    }, 300);

    return () => window.clearTimeout(timeout);
  }, [form.destination, matchedVenue]);

  function updateForm<K extends keyof TeamBlockFormState>(key: K, value: TeamBlockFormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function handleDestinationChange(value: string) {
    if (matchedVenue && value.trim() !== formatVenueSearchText(matchedVenue).trim()) {
      setMatchedVenue(null);
    }
    setSuccess(null);
    setError(null);
    updateForm("destination", value);
  }

  function handleVenueSelect(venue: VenueSuggestion) {
    setMatchedVenue(venue);
    setVenueResults([]);
    setError(null);
    setSuccess(null);
    updateForm("destination", formatVenueSearchText(venue));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    trackStart();
    setError(null);
    setSuccess(null);

    const checkInDate = parseIsoDateInput(form.checkin);
    const checkOutDate = parseIsoDateInput(form.checkout);
    if (!providerDestination) {
      setError("Destination is required.");
      return;
    }
    if (!checkInDate || !checkOutDate) {
      setError("Check-in and check-out are required.");
      return;
    }
    if (checkOutDate <= checkInDate) {
      setError("Check-out must be after check-in.");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/lodging/group-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          destination: providerDestination,
          checkin: formatDateToMmDdYyyy(checkInDate),
          checkout: formatDateToMmDdYyyy(checkOutDate),
          rooms: Number(form.rooms),
          adultsPerRoom: Number(form.adultsPerRoom),
          childrenPerRoom: Number(form.childrenPerRoom),
          firstName: form.contactFirstName.trim(),
          lastName: form.contactLastName.trim(),
          email: form.email.trim(),
          phone: form.phone.trim(),
          groupName: form.groupName.trim(),
          comments: form.notes.trim() || undefined,
          split: 1,
          rating: "5",
          roomTypeCode: "8",
          groupTypeCode: "143",
          source: surface,
          sc: "tournamentinsights",
          kw: "Team hotel block",
          jobCode: "TI-TEAM-BLOCK",
          custom1: readableDestinationContext || providerDestination,
          custom2: surface,
        }),
      });

      const payload = (await response.json().catch(() => null)) as GroupRequestResponse | null;
      if (!response.ok || !payload) {
        const message = payload?.error || "Unable to submit the team hotel block request right now.";
        throw new Error(message);
      }
      if (!payload.success) {
        throw new Error(payload.error || "Unable to submit the team hotel block request right now.");
      }

      setSuccess({ requestId: payload.requestId ?? null });
      void sendTiAnalytics("team_hotel_request_submitted", {
        surface: "team_hotel",
        source_page_type: surface === "weekend_planner" ? "planner" : "book_travel",
        action_surface: "team_hotel",
        auth_state: authState,
        entitlement,
        context_type: "team_hotel",
      });
    } catch (submitError: any) {
      const message = submitError?.message || "Unable to submit the team hotel block request right now.";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section id="team-hotel-blocks" className={styles.card} aria-label="Team hotel block request">
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>Need 5+ rooms for your team?</h2>
          <p className={styles.subtitle}>
            Tell us your dates and headcount. We’ll help your team find group hotel options near the venue.
          </p>
        </div>
        {showToggle ? (
          <button
            type="button"
            className={styles.toggleButton}
            aria-expanded={isOpen}
            onClick={() => {
              void sendTiAnalytics("team_hotel_cta_clicked", {
                surface: surface === "weekend_planner" ? "team_hotel" : "travel",
                source_page_type: surface === "weekend_planner" ? "planner" : "book_travel",
                cta_type: "team_hotel",
                auth_state: authState,
                entitlement,
                context_type: "team_hotel",
              });
              setIsOpen((current) => !current);
              if (!isOpen) trackStart();
            }}
          >
            {isOpen ? "Hide team hotel request" : "Start team hotel request"}
          </button>
        ) : null}
      </div>

      {isOpen ? (
        <>
      {success ? (
        <div className={styles.success}>
          <div className={styles.successTitle}>Request submitted</div>
          <div>
            HotelPlanner will follow up with group options for <strong>{readableDestinationContext || providerDestination}</strong>.
            {success.requestId ? ` Ref ${success.requestId}.` : ""}
          </div>
        </div>
      ) : null}

      <form className={styles.form} onSubmit={handleSubmit}>
        <div className={styles.grid}>
          <label className={`${styles.field} ${styles.fieldFull}`}>
            <span className={styles.label}>Destination</span>
            <input
              className={styles.input}
              type="text"
              required
              placeholder="City, venue, or address"
              value={form.destination}
              onFocus={trackStart}
              onChange={(event) => handleDestinationChange(event.target.value)}
              autoComplete="off"
            />
            {venueSearching ? <span className={styles.helper}>Searching TI venues…</span> : null}
            {!venueSearching && venueResults.length > 0 ? (
              <div className={styles.results}>
                {venueResults.map((venue) => (
                  <button
                    key={venue.id}
                    type="button"
                    className={styles.resultButton}
                    onClick={() => handleVenueSelect(venue)}
                  >
                    <span className={styles.resultTitle}>{venue.name || "Venue"}</span>
                    <span className={styles.resultMeta}>{formatVenueDisplayLine(venue)}</span>
                  </button>
                ))}
              </div>
            ) : null}
            {matchedVenue ? (
              <span className={styles.matchPill}>
                Matched TI venue: <strong>{matchedVenue.name}</strong>
                {formatVenueDisplayLine(matchedVenue) ? ` · ${formatVenueDisplayLine(matchedVenue)}` : ""}
              </span>
            ) : (
              <span className={styles.helper}>Start typing to match a TI venue, or continue with any destination.</span>
            )}
          </label>

          <label className={styles.field}>
            <span className={styles.label}>Check-in</span>
            <input
              className={styles.input}
              type="date"
              required
              value={form.checkin}
              onFocus={trackStart}
              onChange={(event) => updateForm("checkin", event.target.value)}
            />
          </label>

          <label className={styles.field}>
            <span className={styles.label}>Check-out</span>
            <input
              className={styles.input}
              type="date"
              required
              value={form.checkout}
              onFocus={trackStart}
              onChange={(event) => updateForm("checkout", event.target.value)}
            />
          </label>

          <label className={styles.field}>
            <span className={styles.label}>Rooms</span>
            <input
              className={styles.input}
              type="number"
              min={5}
              max={12}
              required
              value={form.rooms}
              onFocus={trackStart}
              onChange={(event) => updateForm("rooms", event.target.value)}
            />
          </label>

          <label className={styles.field}>
            <span className={styles.label}>Adults / room</span>
            <input
              className={styles.input}
              type="number"
              min={1}
              max={12}
              required
              value={form.adultsPerRoom}
              onFocus={trackStart}
              onChange={(event) => updateForm("adultsPerRoom", event.target.value)}
            />
          </label>

          <label className={styles.field}>
            <span className={styles.label}>Children / room</span>
            <input
              className={styles.input}
              type="number"
              min={0}
              value={form.childrenPerRoom}
              onFocus={trackStart}
              onChange={(event) => updateForm("childrenPerRoom", event.target.value)}
            />
          </label>

          <label className={styles.field}>
            <span className={styles.label}>Team / Group name</span>
            <input
              className={styles.input}
              type="text"
              required
              value={form.groupName}
              onFocus={trackStart}
              onChange={(event) => updateForm("groupName", event.target.value)}
            />
          </label>

          <label className={styles.field}>
            <span className={styles.label}>Contact first name</span>
            <input
              className={styles.input}
              type="text"
              required
              value={form.contactFirstName}
              onFocus={trackStart}
              onChange={(event) => updateForm("contactFirstName", event.target.value)}
            />
          </label>

          <label className={styles.field}>
            <span className={styles.label}>Contact last name</span>
            <input
              className={styles.input}
              type="text"
              required
              value={form.contactLastName}
              onFocus={trackStart}
              onChange={(event) => updateForm("contactLastName", event.target.value)}
            />
          </label>

          <label className={styles.field}>
            <span className={styles.label}>Email</span>
            <input
              className={styles.input}
              type="email"
              required
              value={form.email}
              onFocus={trackStart}
              onChange={(event) => updateForm("email", event.target.value)}
            />
          </label>

          <label className={styles.field}>
            <span className={styles.label}>Phone</span>
            <input
              className={styles.input}
              type="tel"
              required
              value={form.phone}
              onFocus={trackStart}
              onChange={(event) => updateForm("phone", event.target.value)}
            />
          </label>

          <label className={`${styles.field} ${styles.fieldFull}`}>
            <span className={styles.label}>Notes</span>
            <textarea
              className={styles.textarea}
              rows={4}
              value={form.notes}
              onFocus={trackStart}
              onChange={(event) => updateForm("notes", event.target.value)}
            />
          </label>
        </div>

        {error ? <div className={styles.error}>{error}</div> : null}

        <div className={styles.actions}>
          <button type="submit" className={styles.submitButton} disabled={submitting}>
            {submitting ? "Submitting…" : "Submit team block request"}
          </button>
        </div>
      </form>
        </>
      ) : null}
    </section>
  );
}
