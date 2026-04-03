"use client";

import React from "react";
import Link from "next/link";

type Tournament = { id: string; name: string | null; url: string | null; state: string | null };
type MissingUrlTournament = {
  id: string;
  name: string | null;
  slug?: string | null;
  state: string | null;
  city: string | null;
  sport: string | null;
  level: string | null;
  source_url?: string | null;
  start_date?: string | null;
};
type PriorityOutreachTournament = {
  id: string;
  name: string | null;
  slug: string | null;
  state: string | null;
  city: string | null;
  sport: string | null;
  source_url: string | null;
  official_website_url: string | null;
};
type Job = {
  id: string;
  tournament_id: string;
  status: string;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  pages_fetched_count: number | null;
  last_error: string | null;
  tournament_name?: string | null;
  tournament_url?: string | null;
};
type ContactCandidate = {
  id: string;
  tournament_id: string;
  email: string | null;
  phone: string | null;
  role_normalized: string | null;
  source_url: string | null;
  confidence: number | null;
  created_at: string | null;
};
type DateCandidate = {
  id: string;
  tournament_id: string;
  date_text: string | null;
  start_date: string | null;
  end_date: string | null;
  source_url: string | null;
  confidence: number | null;
  created_at: string | null;
};
type VenueCandidate = {
  id: string;
  tournament_id: string;
  venue_name: string | null;
  address_text: string | null;
  evidence_text: string | null;
  source_url: string | null;
  confidence: number | null;
  created_at: string | null;
};
type AttributeCandidate = {
  id: string;
  tournament_id: string;
  attribute_key: string;
  attribute_value: string;
  source_url: string | null;
  evidence_text: string | null;
  confidence: number | null;
  created_at: string | null;
};
type ExistingValueAttributeCandidate = AttributeCandidate & {
  existing_field: string;
  existing_value: string;
};
type UrlSuggestion = {
  id: string;
  tournament_id: string;
  suggested_url: string;
  suggested_domain: string | null;
  submitter_email: string | null;
  status: string;
  created_at: string;
  tournament_name?: string | null;
  tournament_state?: string | null;
};

type InferredVenueApiTournament = {
  tournament_id: string;
  name: string | null;
  city: string | null;
  state: string | null;
  sport: string | null;
  start_date: string | null;
  inferred_venues: Array<{
    tournament_id: string;
    venue_id: string;
    inference_confidence: number | string | null;
    inference_method: string | null;
    inferred_at: string | null;
    venue: {
      id?: string | null;
      name?: string | null;
      address?: string | null;
      city?: string | null;
      state?: string | null;
      zip?: string | null;
      venue_url?: string | null;
    } | null;
  }>;
};

type UrlSearchResult = {
  tournament_id: string;
  applied_url?: string | null;
  auto_apply_threshold?: number;
  error?: string;
  candidates: Array<{
    url: string;
    score: number;
    title: string | null;
    snippet: string | null;
    final_url: string | null;
    content_type: string | null;
  }>;
};

type CandidateTournament = {
  name: string | null;
  slug: string | null;
  state: string | null;
  city: string | null;
  url: string | null;
};

type ReviewItem = {
  key: string;
  kind: "contact" | "venue" | "date" | "attribute";
  ids: string[];
  label: string;
  detail?: string | null;
  sourceUrl?: string | null;
  confidence?: number | null;
  reason?: string | null;
};
type FeesVenueSummary = { tournament_id: string; name: string | null; found: string[] };

function formatDate(val: string | null) {
  if (!val) return "";
  return new Date(val).toLocaleString();
}

const VENUE_REASON_CODES = new Set([
  "jsonld_location",
  "anchor_full_address",
  "page_text_address",
  "map_link",
  "provider_perfectgame_locations",
  "unknown",
]);

function reasonFromEvidence(evidence: string | null | undefined): string | null {
  const text = String(evidence ?? "").trim();
  if (!text) return null;
  const m = text.match(/^reason=([a-z0-9_]+)\s*;/i);
  if (!m?.[1]) return null;
  const code = m[1].toLowerCase();
  return VENUE_REASON_CODES.has(code) ? code : null;
}

export default function EnrichmentClient({
  tournaments,
  missingUrls,
  jobs,
  contacts,
  dates,
  venues,
  attributes,
  existingValueAttributes,
  priorityOutreachTargets,
  urlSuggestions,
  tournamentUrlLookup,
  candidateTournaments,
  feesVenueSummary,
}: {
  tournaments: Tournament[];
  missingUrls: MissingUrlTournament[];
  jobs: Job[];
  contacts: ContactCandidate[];
  dates: DateCandidate[];
  venues: VenueCandidate[];
  attributes: AttributeCandidate[];
  existingValueAttributes: ExistingValueAttributeCandidate[];
  priorityOutreachTargets: PriorityOutreachTournament[];
  urlSuggestions: UrlSuggestion[];
  tournamentUrlLookup: Record<string, string | null>;
  candidateTournaments: Record<string, CandidateTournament>;
  feesVenueSummary: FeesVenueSummary[];
}) {
  const mountedRef = React.useRef(true);
  const applyCleanupTimersRef = React.useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  React.useEffect(() => {
    return () => {
      mountedRef.current = false;
      for (const timer of Object.values(applyCleanupTimersRef.current)) {
        clearTimeout(timer);
      }
      applyCleanupTimersRef.current = {};
    };
  }, []);

  const [selected, setSelected] = React.useState<string[]>([]);
  const [status, setStatus] = React.useState<string>("");
  const [query, setQuery] = React.useState<string>("");
  const [zipQuery, setZipQuery] = React.useState<string>("");
  const [results, setResults] = React.useState<Tournament[]>(tournaments);
  const [searching, setSearching] = React.useState<boolean>(false);
  const [pendingContacts, setPendingContacts] = React.useState<ContactCandidate[]>(contacts);
  const [pendingDates, setPendingDates] = React.useState<DateCandidate[]>(dates);
  const [pendingVenues, setPendingVenues] = React.useState<VenueCandidate[]>(venues);
  const [pendingAttributes, setPendingAttributes] = React.useState<AttributeCandidate[]>(attributes);
  const [pendingExistingValueAttributes] = React.useState<ExistingValueAttributeCandidate[]>(existingValueAttributes);
  const [pendingUrlSuggestions, setPendingUrlSuggestions] = React.useState<UrlSuggestion[]>(urlSuggestions);
  const [missingSelected, setMissingSelected] = React.useState<string[]>([]);
  const [priorityTargets, setPriorityTargets] = React.useState<PriorityOutreachTournament[]>(priorityOutreachTargets);
  const [prioritySelected, setPrioritySelected] = React.useState<string[]>([]);
  const [priorityStatus, setPriorityStatus] = React.useState<string>("");
  const [urlSearchStatus, setUrlSearchStatus] = React.useState<string>("");
  const [urlResults, setUrlResults] = React.useState<Record<string, UrlSearchResult>>({});
  const [manualUrls, setManualUrls] = React.useState<Record<string, string>>({});
  const [applyStatus, setApplyStatus] = React.useState<Record<string, string>>({});
  const [selectedItems, setSelectedItems] = React.useState<Record<string, Set<string>>>({});
  const [batchLimit, setBatchLimit] = React.useState<number>(50);
  const [batchMissingDatesOnly, setBatchMissingDatesOnly] = React.useState<boolean>(false);
  const [batchStatus, setBatchStatus] = React.useState<string>("");
  const [feesStatus, setFeesStatus] = React.useState<string>("");
  const [feesVenueReasonSummary, setFeesVenueReasonSummary] = React.useState<string>("");
  const [feesSummaryState, setFeesSummaryState] = React.useState<FeesVenueSummary[]>(feesVenueSummary);
  const [usssaStatus, setUsssaStatus] = React.useState<string>("");
  const [usssaSummaryState, setUsssaSummaryState] = React.useState<FeesVenueSummary[]>([]);
  const [feesBatchTotal, setFeesBatchTotal] = React.useState<number>(300);
  const [feesBatchChunk, setFeesBatchChunk] = React.useState<number>(50);
  const [feesBatchRunning, setFeesBatchRunning] = React.useState<boolean>(false);
  const [feesBatchMissingVenuesOnly, setFeesBatchMissingVenuesOnly] = React.useState<boolean>(true);
  const [feesSkipPending, setFeesSkipPending] = React.useState<boolean>(true);

  const [inferredOnly, setInferredOnly] = React.useState<boolean>(true);
  const [inferredLoading, setInferredLoading] = React.useState<boolean>(false);
  const [inferredError, setInferredError] = React.useState<string | null>(null);
  const [inferredTournaments, setInferredTournaments] = React.useState<InferredVenueApiTournament[] | null>(null);

  const tournamentUrlFor = React.useCallback(
    (tournamentId: string) => tournamentUrlLookup[tournamentId] ?? null,
    [tournamentUrlLookup]
  );

  const loadInferredVenues = React.useCallback(async () => {
    setInferredLoading(true);
    setInferredError(null);
    try {
      const q = new URLSearchParams();
      q.set("only", inferredOnly ? "1" : "0");
      q.set("limit", "50");
      q.set("offset", "0");
      const res = await fetch(`/api/admin/tournaments/enrichment/inferred-links?${q.toString()}`);
      const raw = await res.text();
      let json: any = null;
      try {
        json = raw ? JSON.parse(raw) : null;
      } catch {
        json = null;
      }
      if (!res.ok || json?.error) {
        setInferredError(String(json?.error || res.statusText));
        setInferredTournaments([]);
        return;
      }
      setInferredTournaments((json?.tournaments ?? []) as InferredVenueApiTournament[]);
    } catch (err: any) {
      setInferredError(err?.message ? String(err.message) : "Unable to load inferred venues");
      setInferredTournaments([]);
    } finally {
      setInferredLoading(false);
    }
  }, [inferredOnly]);

  const promoteInferredVenue = React.useCallback(async (tournamentId: string, venueId: string) => {
    const res = await fetch("/api/admin/tournaments/enrichment/inferred/promote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tournament_id: tournamentId, venue_id: venueId }),
    });
    const raw = await res.text();
    let json: any = null;
    try {
      json = raw ? JSON.parse(raw) : null;
    } catch {
      json = null;
    }
    if (!res.ok || json?.error) throw new Error(String(json?.error || res.statusText));
  }, []);

  const rejectInferredVenue = React.useCallback(async (tournamentId: string, venueId: string, method: string) => {
    const res = await fetch("/api/admin/tournaments/enrichment/inferred/reject", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tournament_id: tournamentId, venue_id: venueId, method, remove_link: true }),
    });
    const raw = await res.text();
    let json: any = null;
    try {
      json = raw ? JSON.parse(raw) : null;
    } catch {
      json = null;
    }
    if (!res.ok || json?.error) throw new Error(String(json?.error || res.statusText));
  }, []);

  const removeInferredRowFromUI = React.useCallback((tournamentId: string, venueId: string) => {
    setInferredTournaments((prev) => {
      if (!prev) return prev;
      const next = prev
        .map((t) => {
          if (t.tournament_id !== tournamentId) return t;
          return { ...t, inferred_venues: (t.inferred_venues ?? []).filter((v) => v.venue_id !== venueId) };
        })
        .filter((t) => (t.inferred_venues ?? []).length > 0);
      return next;
    });
  }, []);

  const reviewGroups = React.useMemo(() => {
    const groups = new Map<string, Map<string, ReviewItem>>();
    const signatureFor = (kind: ReviewItem["kind"], label: string, detail?: string | null) =>
      [kind, label.toLowerCase(), (detail ?? "").toLowerCase().trim()].join("|");
    const upsert = (tournamentId: string, item: Omit<ReviewItem, "key" | "ids"> & { id: string }) => {
      const sig = signatureFor(item.kind, item.label, item.detail);
      const key = `${item.kind}:${sig}`;
      const existingMap = groups.get(tournamentId) ?? new Map<string, ReviewItem>();
      const existing = existingMap.get(sig);
      if (existing) {
        existing.ids.push(item.id);
        if ((item.confidence ?? 0) > (existing.confidence ?? 0)) {
          existing.confidence = item.confidence ?? existing.confidence;
          existing.sourceUrl = item.sourceUrl ?? existing.sourceUrl;
          existing.reason = item.reason ?? existing.reason;
        }
        if (!existing.reason && item.reason) existing.reason = item.reason;
        existingMap.set(sig, existing);
      } else {
        existingMap.set(sig, {
          key,
          kind: item.kind,
          ids: [item.id],
          label: item.label,
          detail: item.detail,
          sourceUrl: item.sourceUrl,
          confidence: item.confidence,
          reason: item.reason ?? null,
        });
      }
      groups.set(tournamentId, existingMap);
    };
    pendingContacts.forEach((c) => {
      const role = c.role_normalized === "TD" ? "Tournament director" : c.role_normalized === "ASSIGNOR" ? "Referee contact" : "General contact";
      const detail = [c.email].filter(Boolean).join(" • ");
      upsert(c.tournament_id, {
        kind: "contact",
        id: c.id,
        label: role,
        detail: detail || c.email || "—",
        sourceUrl: c.source_url,
        confidence: c.confidence,
      });
    });
    pendingDates.forEach((d) => {
      const detail =
        d.start_date || d.end_date
          ? `${d.start_date ?? "?"} → ${d.end_date ?? d.start_date ?? "?"}`
          : d.date_text ?? "—";
      upsert(d.tournament_id, {
        kind: "date",
        id: d.id,
        label: "Dates",
        detail,
        sourceUrl: d.source_url,
        confidence: d.confidence,
      });
    });
    pendingVenues.forEach((v) => {
      const detail = [v.venue_name, v.address_text].filter(Boolean).join(" • ");
      upsert(v.tournament_id, {
        kind: "venue",
        id: v.id,
        label: "Venue",
        detail: detail || "—",
        sourceUrl: v.source_url,
        confidence: v.confidence,
        reason: reasonFromEvidence(v.evidence_text) ?? (v.evidence_text ? "unknown" : null),
      });
    });
    const attributeLabels: Record<string, string> = {
      team_fee: "Team fee",
      games_guaranteed: "Games guaranteed",
      level: "Level",
      player_parking: "Player parking",
      address: "Address",
      venue_url: "Venue URL",
    };
    pendingAttributes.forEach((a) => {
      upsert(a.tournament_id, {
        kind: "attribute",
        id: a.id,
        label: attributeLabels[a.attribute_key] ?? a.attribute_key,
        detail: a.attribute_value,
        sourceUrl: a.source_url,
        confidence: a.confidence,
      });
    });
    const deduped = new Map<string, ReviewItem[]>();
    groups.forEach((items, tid) => {
      deduped.set(tid, Array.from(items.values()));
    });
    return deduped;
  }, [pendingContacts, pendingDates, pendingVenues, pendingAttributes]);

  const existingValueGroups = React.useMemo(() => {
    const byTournament = new Map<string, ExistingValueAttributeCandidate[]>();
    pendingExistingValueAttributes.forEach((row) => {
      const list = byTournament.get(row.tournament_id) ?? [];
      list.push(row);
      byTournament.set(row.tournament_id, list);
    });
    return byTournament;
  }, [pendingExistingValueAttributes]);

  const runFeesEnrichment = React.useCallback(
    async (opts?: { limit?: number; refreshOnInsert?: boolean; mode?: "default" | "missing_venues"; skipPending?: boolean }) => {
    const mode = opts?.mode ?? "default";
    setFeesStatus(mode === "missing_venues" ? "Running missing-venues fees/venue scrape..." : "Running fees/venue scrape...");
    setFeesVenueReasonSummary("");
    try {
      const limit = Number(opts?.limit ?? 0);
      const params = new URLSearchParams();
      if (Number.isFinite(limit) && limit > 0) params.set("limit", String(Math.floor(limit)));
      if (mode === "missing_venues") params.set("mode", "missing_venues");
      if (typeof opts?.skipPending === "boolean") params.set("skip_pending", opts.skipPending ? "1" : "0");
      const query = params.toString() ? `?${params.toString()}` : "";
      const resp = await fetch(`/api/admin/tournaments/enrichment/fees-venue${query}`, { method: "POST" });
      const json = await resp.json();
      if (!resp.ok) {
        setFeesStatus(`Failed: ${json?.error || resp.status} ${json?.detail ? `(${json.detail})` : ""}`);
        return { ok: false as const, json };
      }
      if (json?.summary) {
        setFeesSummaryState(json.summary);
      }
      if (json?.venue_reason_counts && typeof json.venue_reason_counts === "object") {
        const entries = Object.entries(json.venue_reason_counts as Record<string, number>)
          .filter((row) => typeof row[0] === "string")
          .slice(0, 6)
          .map(([k, v]) => `${k}=${v}`);
        if (entries.length) setFeesVenueReasonSummary(`Venue reasons: ${entries.join(", ")}`);
      }
      const pendingMode = json?.skip_pending === false ? " (pending-skip off)" : "";
      setFeesStatus(
        `${mode === "missing_venues" ? "Missing-venues mode: " : ""}Inserted ${json?.inserted ?? 0} candidates from ${json?.attempted ?? "?"} tournaments` +
          ` (venue candidates parsed: ${json?.venue_candidates_parsed ?? 0}, inserted: ${json?.venue_candidates_inserted ?? json?.venue_inserted ?? 0})` +
          `${Number(json?.venue_candidates_dropped_low_score ?? 0) > 0 ? ` (dropped low-score venues: ${json.venue_candidates_dropped_low_score})` : ""}` +
          `${Number(json?.auto_linked_existing ?? 0) > 0 ? ` (auto-linked existing venues: ${json.auto_linked_existing})` : ""}` +
          `${Number(json?.auto_linked_venue_url_updated ?? 0) > 0 ? ` (venue URL backfills: ${json.auto_linked_venue_url_updated})` : ""}` +
          pendingMode +
          `${(json?.skipped_recent ?? 0) > 0 ? ` (${json.skipped_recent} skipped: scraped in last 10 days)` : ""}` +
          `${(json?.skipped_pending ?? 0) > 0 ? ` (${json.skipped_pending} skipped: pending review)` : ""}` +
          `${(json?.skipped_linked ?? 0) > 0 ? ` (${json.skipped_linked} skipped: already linked)` : ""}` +
          `${(json?.skipped_no_url ?? 0) > 0 ? ` (${json.skipped_no_url} skipped: no URL)` : ""}`
      );
      // Keep results visible on screen; operator can refresh manually.
      // This avoids clearing scrape status/summary immediately after each run.
      return { ok: true as const, json };
    } catch (err: any) {
      setFeesStatus(`Error: ${err?.message || err}`);
      return { ok: false as const, json: null };
    }
    },
    []
  );

  const runFeesBatch = React.useCallback(async () => {
    if (feesBatchRunning) return;
    const total = Math.max(1, Math.min(2000, Math.floor(feesBatchTotal || 0)));
    const chunk = Math.max(1, Math.min(200, Math.floor(feesBatchChunk || 0)));
    const rounds = Math.ceil(total / chunk);
    setFeesBatchRunning(true);

    let insertedTotal = 0;
    let attemptedTotal = 0;
    let skippedRecentTotal = 0;
    let skippedPendingTotal = 0;
    let skippedDuplicatesTotal = 0;
    let venueParsedTotal = 0;
    let venueInsertedTotal = 0;
    let autoLinkedExistingTotal = 0;
    let autoLinkedUrlBackfillTotal = 0;

    try {
      for (let i = 0; i < rounds; i += 1) {
        const currentLimit = Math.min(chunk, total - i * chunk);
        setFeesStatus(`Batch fees/venue scrape ${i + 1}/${rounds} (limit ${currentLimit})...`);
        const result = await runFeesEnrichment({
          limit: currentLimit,
          refreshOnInsert: false,
          mode: feesBatchMissingVenuesOnly ? "missing_venues" : "default",
          skipPending: feesSkipPending,
        });
        if (!result?.ok) break;
        const json = result.json ?? {};
        insertedTotal += Number(json?.inserted ?? 0);
        attemptedTotal += Number(json?.attempted ?? 0);
        skippedRecentTotal += Number(json?.skipped_recent ?? 0);
        skippedPendingTotal += Number(json?.skipped_pending ?? 0);
        skippedDuplicatesTotal += Number(json?.skipped_duplicates ?? 0);
        venueParsedTotal += Number(json?.venue_candidates_parsed ?? 0);
        venueInsertedTotal += Number(json?.venue_candidates_inserted ?? json?.venue_inserted ?? 0);
        autoLinkedExistingTotal += Number(json?.auto_linked_existing ?? 0);
        autoLinkedUrlBackfillTotal += Number(json?.auto_linked_venue_url_updated ?? 0);

        // Nothing left to process in current window.
        if (Number(json?.attempted ?? 0) === 0) break;
      }

      setFeesStatus(
        `${feesBatchMissingVenuesOnly ? "Missing-venues batch complete" : "Batch complete"}: inserted ${insertedTotal} from ${attemptedTotal} attempted` +
          ` (venue candidates parsed: ${venueParsedTotal}, inserted: ${venueInsertedTotal})` +
          `${autoLinkedExistingTotal > 0 ? ` (auto-linked existing venues: ${autoLinkedExistingTotal})` : ""}` +
          `${autoLinkedUrlBackfillTotal > 0 ? ` (venue URL backfills: ${autoLinkedUrlBackfillTotal})` : ""}` +
          `${skippedRecentTotal > 0 ? ` (${skippedRecentTotal} skipped: recent)` : ""}` +
          `${skippedPendingTotal > 0 ? ` (${skippedPendingTotal} skipped: pending)` : ""}` +
          `${skippedDuplicatesTotal > 0 ? ` (${skippedDuplicatesTotal} duplicates)` : ""}`
      );
      // Keep batch summary visible; manual refresh remains available.
    } finally {
      setFeesBatchRunning(false);
    }
  }, [feesBatchChunk, feesBatchMissingVenuesOnly, feesBatchRunning, feesBatchTotal, feesSkipPending, runFeesEnrichment]);

  const runUsssaEnrichment = React.useCallback(async (opts?: { limit?: number }) => {
    setUsssaStatus("Running USSSA scrape...");
    try {
      const limit = Number(opts?.limit ?? 0);
      const query = Number.isFinite(limit) && limit > 0 ? `?limit=${Math.floor(limit)}` : "";
      const resp = await fetch(`/api/admin/tournaments/enrichment/usssa${query}`, { method: "POST" });
      const json = await resp.json();
      if (!resp.ok) {
        setUsssaStatus(`Failed: ${json?.error || resp.status} ${json?.detail ? `(${json.detail})` : ""}`);
        return;
      }
      const insertedTotal =
        Number(json?.inserted_attributes ?? 0) +
        Number(json?.inserted_dates ?? 0) +
        Number(json?.inserted_venues ?? 0);
      if (json?.summary) setUsssaSummaryState(json.summary);
      setUsssaStatus(
        `Inserted ${insertedTotal} candidates from ${json?.attempted ?? "?"} tournaments` +
          ` (dates: ${json?.inserted_dates ?? 0}, age/fees: ${json?.inserted_attributes ?? 0}, venues: ${json?.inserted_venues ?? 0})`
      );
      if (insertedTotal > 0) setTimeout(() => refreshPage(), 400);
    } catch (err: any) {
      setUsssaStatus(`Error: ${err?.message || err}`);
    }
  }, []);

  React.useEffect(() => {
    setSelectedItems((prev) => {
      const next: Record<string, Set<string>> = { ...prev };
      reviewGroups.forEach((items, tid) => {
        const existing = next[tid];
        if (!existing) {
          next[tid] = new Set(items.map((i) => i.key));
          return;
        }
        items.forEach((i) => existing.add(i.key));
      });
      Object.keys(next).forEach((tid) => {
        if (!reviewGroups.has(tid)) delete next[tid];
      });
      return { ...next };
    });
  }, [reviewGroups]);

  const toggle = (id: string) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };
  const toggleMissing = (id: string) => {
    setMissingSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };
  const togglePriority = (id: string) => {
    setPrioritySelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const queue = async (ids?: string[]) => {
    const toQueue = ids ?? selected;
    if (!toQueue.length) return;
    setStatus("Queuing...");
    const res = await fetch("/api/admin/tournaments/enrichment/queue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tournament_ids: toQueue }),
    });
    const json = await res.json();
    setStatus(json.error ? `Queue failed: ${json.error}` : "Queued");
  };

  const skipTournament = async (tournamentId: string) => {
    setStatus("Skipping...");
    const res = await fetch("/api/admin/tournaments/enrichment/skip", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tournament_id: tournamentId }),
    });
    const json = await res.json();
    setStatus(json.error ? `Skip failed: ${json.error}` : "Skipped");
  };

  const runNow = async () => {
    setStatus("Running...");
    const res = await fetch("/api/admin/tournaments/enrichment/run", { method: "POST" });
    const json = await res.json();
    setStatus(json.error ? `Run failed: ${json.error}` : "Run triggered");
  };

  const refreshPage = () => {
    window.location.reload();
  };

  const searchUrls = async () => {
    if (!missingSelected.length) return;
    setUrlSearchStatus("Searching...");
    const res = await fetch("/api/admin/tournaments/enrichment/url-search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tournament_ids: missingSelected }),
    });
    const json = await res.json();
    if (!res.ok || json.error) {
      setUrlSearchStatus(`Search failed: ${json.error || res.statusText}`);
      return;
    }
    const next: Record<string, UrlSearchResult> = { ...urlResults };
    (json.results ?? []).forEach((row: UrlSearchResult) => {
      next[row.tournament_id] = row;
    });
    setUrlResults(next);
    setUrlSearchStatus("Search complete");
  };

  const applyCandidate = async (tournamentId: string, candidateUrl: string, opts?: { refresh?: boolean }) => {
    setUrlSearchStatus("Applying URL...");
    const res = await fetch("/api/admin/tournaments/enrichment/url-apply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tournament_id: tournamentId, candidate_url: candidateUrl }),
    });
    const json = await res.json();
    if (!res.ok || json.error) {
      setUrlSearchStatus(`Apply failed: ${json.error || res.statusText}`);
      return;
    }
    setUrlSearchStatus("Applied");
    if (opts?.refresh !== false) refreshPage();
  };

  const reviewUrlSuggestion = async (suggestionId: string, action: "approve" | "reject") => {
    setUrlSearchStatus(`${action}ing...`);
    const res = await fetch(`/api/admin/tournaments/enrichment/url-suggestions/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ suggestion_id: suggestionId }),
    });
    const json = await res.json();
    if (!res.ok || json.error) {
      setUrlSearchStatus(`Update failed: ${json.error || res.statusText}`);
      return;
    }
    setPendingUrlSuggestions((prev) => prev.filter((row) => row.id !== suggestionId));
    setUrlSearchStatus(action === "approve" ? "Approved" : "Rejected");
  };

  const skip = async (tournamentId: string) => {
    setStatus("Skipping...");
    const res = await fetch("/api/admin/tournaments/enrichment/skip", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tournament_id: tournamentId }),
    });
    const json = await res.json();
    setStatus(json.error ? `Skip failed: ${json.error}` : "Skipped");
  };

  const search = async () => {
    const zip = zipQuery.trim().replace(/\D+/g, "").slice(0, 5);
    if (query.trim().length < 2 && !zip) {
      setResults(tournaments);
      setSelected([]);
      return;
    }
    setSearching(true);
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    if (zip) params.set("zip", zip);
    const res = await fetch(`/api/admin/tournaments/enrichment/search?${params.toString()}`);
    const json = await res.json();
    if (json?.results) {
      setResults(json.results as Tournament[]);
      setSelected([]);
    }
    setSearching(false);
  };

  const applySourceUrlsForSelected = async () => {
    const selected = missingUrls.filter((t) => missingSelected.includes(t.id) && t.source_url);
    if (!selected.length) {
      setUrlSearchStatus("No selected tournaments with source URLs.");
      return;
    }
    setUrlSearchStatus(`Applying source URLs for ${selected.length} tournament(s)...`);
    const res = await fetch("/api/admin/tournaments/enrichment/url-apply-batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rows: selected.map((t) => ({ tournament_id: t.id, candidate_url: t.source_url })),
      }),
    });
    const json = await res.json();
    if (!res.ok || json.error) {
      setUrlSearchStatus(`Apply failed: ${json.error || res.statusText}`);
      return;
    }
    setUrlSearchStatus(`Applied ${json.applied ?? 0}/${json.total ?? selected.length}. Refreshing...`);
    refreshPage();
  };

  const runBatch = async () => {
    setBatchStatus("Running...");
    const res = await fetch("/api/admin/tournaments/enrichment/queue-all", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        limit: batchLimit,
        missing_dates_only: batchMissingDatesOnly,
        deep_date_search: batchMissingDatesOnly,
      }),
    });
    const raw = await res.text();
    let json: any = null;
    try {
      json = raw ? JSON.parse(raw) : null;
    } catch {
      json = null;
    }
    if (!res.ok || json?.error) {
      setBatchStatus(`Run failed: ${json?.error || res.statusText}`);
      return;
    }
    if (json?.mode === "deep_date_search") {
      const errorCount = Array.isArray(json?.errors) ? json.errors.length : 0;
      setBatchStatus(
        `Deep date search ran for ${json.ran ?? 0} tournament(s): ${json.done ?? 0} done, ${errorCount} errors.`
      );
    } else {
      setBatchStatus(
        `Queued ${json.queued ?? 0} tournament(s). Ran enrichment for ${json.ran ?? 0}.`
      );
    }
    refreshPage();
  };

  const queuePriorityForOutreach = async () => {
    if (!prioritySelected.length) {
      setPriorityStatus("Select at least one tournament.");
      return;
    }
    setPriorityStatus("Adding to outreach draft...");
    const res = await fetch("/api/admin/outreach/queue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tournament_ids: prioritySelected }),
    });
    const json = await res.json();
    if (!res.ok || json?.error) {
      setPriorityStatus(`Queue failed: ${json?.error || res.statusText}`);
      return;
    }
    const createdIds = new Set<string>(Array.isArray(json?.created_ids) ? json.created_ids : []);
    if (createdIds.size) {
      setPriorityTargets((prev) => prev.filter((row) => !createdIds.has(row.id)));
    }
    setPrioritySelected([]);
    setPriorityStatus(
      `Added ${json?.created ?? 0} to outreach draft${(json?.already_exists ?? 0) > 0 ? `, skipped ${json.already_exists} existing` : ""}.`
    );
  };

  const dismissPriorityNoContact = async () => {
    if (!prioritySelected.length) {
      setPriorityStatus("Select at least one tournament.");
      return;
    }
    setPriorityStatus("Hiding selected targets...");
    const res = await fetch("/api/admin/outreach/priority-dismiss", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tournament_ids: prioritySelected }),
    });
    const json = await res.json();
    if (!res.ok || json?.error) {
      setPriorityStatus(`Hide failed: ${json?.error || res.statusText}`);
      return;
    }
    const updatedIds = new Set<string>(Array.isArray(json?.updated_ids) ? json.updated_ids : []);
    if (updatedIds.size) {
      setPriorityTargets((prev) => prev.filter((row) => !updatedIds.has(row.id)));
    }
    setPrioritySelected([]);
    setPriorityStatus(
      `Hidden ${json?.updated ?? 0} target(s) as no-contact${(json?.already_dnc ?? 0) > 0 ? `, skipped ${json.already_dnc} already hidden` : ""}.`
    );
  };

  const toggleReviewItem = (tournamentId: string, key: string) => {
    setSelectedItems((prev) => {
      const next = new Set(prev[tournamentId] ?? []);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return { ...prev, [tournamentId]: next };
    });
  };

  const toggleAllReviewItems = (tournamentId: string, items: ReviewItem[]) => {
    setSelectedItems((prev) => {
      const current = prev[tournamentId] ?? new Set<string>();
      const allSelected = items.every((item) => current.has(item.key));
      const nextSet = new Set<string>();
      if (!allSelected) {
        items.forEach((item) => nextSet.add(item.key));
      }
      return { ...prev, [tournamentId]: nextSet };
    });
  };

  const scheduleReviewCleanup = React.useCallback(
    (
      tournamentId: string,
      {
        contactIds,
        venueIds,
        dateIds,
        attrIds,
      }: {
        contactIds: Set<string>;
        venueIds: Set<string>;
        dateIds: Set<string>;
        attrIds: Set<string>;
      }
    ) => {
      const existing = applyCleanupTimersRef.current[tournamentId];
      if (existing) clearTimeout(existing);
      applyCleanupTimersRef.current[tournamentId] = setTimeout(() => {
        if (!mountedRef.current) return;
        delete applyCleanupTimersRef.current[tournamentId];

        if (contactIds.size) setPendingContacts((prev) => prev.filter((c) => !contactIds.has(c.id)));
        if (venueIds.size) setPendingVenues((prev) => prev.filter((v) => !venueIds.has(v.id)));
        if (dateIds.size) setPendingDates((prev) => prev.filter((d) => !dateIds.has(d.id)));
        if (attrIds.size) setPendingAttributes((prev) => prev.filter((c) => !attrIds.has(c.id)));
      }, 5000);
    },
    []
  );

  const applyReviewItems = async (tournamentId: string) => {
    const items = reviewGroups.get(tournamentId) ?? [];
    const selected = selectedItems[tournamentId] ?? new Set<string>();
    const payload = items
      .filter((item) => selected.has(item.key))
      .flatMap((item) => item.ids.map((id) => ({ kind: item.kind, id })));
    if (!payload.length) {
      setApplyStatus((prev) => ({ ...prev, [tournamentId]: "Select at least one item." }));
      return;
    }
    setApplyStatus((prev) => ({ ...prev, [tournamentId]: "Applying..." }));
    const res = await fetch("/api/admin/tournaments/enrichment/apply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tournament_id: tournamentId, items: payload }),
    });
    const raw = await res.text();
    let json: any = null;
    try {
      json = raw ? JSON.parse(raw) : null;
    } catch {
      json = null;
    }
    if (!res.ok || json?.error) {
      setApplyStatus((prev) => ({ ...prev, [tournamentId]: `Apply failed: ${json?.error || res.statusText}` }));
      return;
    }
    const linkedVenue = Boolean(json?.did_link_venue);
    const linkedBefore = typeof json?.linked_venues_before === "number" ? json.linked_venues_before : null;
    const linkedAfter = typeof json?.linked_venues_after === "number" ? json.linked_venues_after : null;
    const countsTowardDashboard =
      typeof json?.counts_toward_missing_venues_dashboard === "boolean" ? json.counts_toward_missing_venues_dashboard : null;
    setApplyStatus((prev) => ({
      ...prev,
      [tournamentId]: linkedVenue
        ? `Applied successfully (venue linked). Linked venues: ${linkedBefore ?? "?"} → ${linkedAfter ?? "?"}.${
            countsTowardDashboard === false
              ? " (This tournament doesn’t count toward the /admin missing venues tile.)"
              : linkedBefore && linkedBefore > 0
              ? " (It already had linked venues, so the /admin missing venues tile won’t change.)"
              : " Refresh /admin to see the missing venues tile update."
          }`
        : "Applied successfully. No venue link created (the /admin missing venues tile changes only when a published canonical tournament gets its first tournament_venues link).",
    }));

    const contactIds = new Set(payload.filter((p: any) => p.kind === "contact").map((p: any) => p.id));
    const venueIds = new Set(payload.filter((p: any) => p.kind === "venue").map((p: any) => p.id));
    const dateIds = new Set(payload.filter((p: any) => p.kind === "date").map((p: any) => p.id));
    const attrIds = new Set(payload.filter((p: any) => p.kind === "attribute").map((p: any) => p.id));

    setSelectedItems((prev) => ({ ...prev, [tournamentId]: new Set<string>() }));
    setApplyStatus((prev) => ({
      ...prev,
      [tournamentId]: `${prev[tournamentId] ?? "Applied successfully."} (Updating row in ~5s.)`,
    }));
    scheduleReviewCleanup(tournamentId, { contactIds, venueIds, dateIds, attrIds });
  };

  const deleteReviewItems = async (tournamentId: string) => {
    const items = reviewGroups.get(tournamentId) ?? [];
    const selected = selectedItems[tournamentId] ?? new Set<string>();
    const payload = items
      .filter((item) => selected.has(item.key))
      .flatMap((item) => item.ids.map((id) => ({ kind: item.kind, id })));
    if (!payload.length) {
      setApplyStatus((prev) => ({ ...prev, [tournamentId]: "Select at least one item." }));
      return;
    }
    setApplyStatus((prev) => ({ ...prev, [tournamentId]: "Deleting..." }));
    const res = await fetch("/api/admin/tournaments/enrichment/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: payload }),
    });
    const raw = await res.text();
    let json: any = null;
    try {
      json = raw ? JSON.parse(raw) : null;
    } catch {
      json = null;
    }
    if (!res.ok || json?.error) {
      setApplyStatus((prev) => ({ ...prev, [tournamentId]: `Delete failed: ${json?.error || res.statusText}` }));
      return;
    }
    setApplyStatus((prev) => ({ ...prev, [tournamentId]: "Deleted selected items." }));
    const contactIds = new Set(payload.filter((p: any) => p.kind === "contact").map((p: any) => p.id));
    const venueIds = new Set(payload.filter((p: any) => p.kind === "venue").map((p: any) => p.id));
    const dateIds = new Set(payload.filter((p: any) => p.kind === "date").map((p: any) => p.id));
    const attrIds = new Set(payload.filter((p: any) => p.kind === "attribute").map((p: any) => p.id));
    setSelectedItems((prev) => ({ ...prev, [tournamentId]: new Set<string>() }));
    setApplyStatus((prev) => ({
      ...prev,
      [tournamentId]: `${prev[tournamentId] ?? "Deleted selected items."} (Updating row in ~5s.)`,
    }));
    scheduleReviewCleanup(tournamentId, { contactIds, venueIds, dateIds, attrIds });
  };

  return (
    <main style={{ padding: "1rem", maxWidth: 1200, margin: "0 auto" }}>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: 12 }}>Tournament Enrichment</h1>
      <p style={{ color: "#4b5563", marginBottom: 16 }}>
        Queue enrichment jobs for tournaments with URLs. Jobs fetch up to 8 pages per tournament and extract contacts, dates, and referee operations details.
      </p>

      <section style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, marginBottom: 16 }}>
        <div
          style={{
            display: "flex",
            gap: 10,
            alignItems: "center",
            flexWrap: "wrap",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <strong>Inferred venues</strong>
            <label style={{ fontSize: 12, color: "#4b5563", display: "flex", alignItems: "center", gap: 6 }}>
              <input type="checkbox" checked={inferredOnly} onChange={(e) => setInferredOnly(e.target.checked)} />
              only tournaments with no confirmed venues
            </label>
            <button
              onClick={loadInferredVenues}
              disabled={inferredLoading}
              style={{
                padding: "6px 10px",
                borderRadius: 8,
                border: "1px solid #111827",
                background: "#111827",
                color: "#fff",
                opacity: inferredLoading ? 0.6 : 1,
              }}
            >
              {inferredLoading ? "Loading..." : inferredTournaments ? "Refresh" : "Load"}
            </button>
          </div>
          <div style={{ fontSize: 12, color: "#6b7280" }}>
            Promote = confirmed link. Reject = stored feedback + removes inferred link.
          </div>
        </div>

        {inferredError ? <div style={{ marginTop: 10, color: "#b00020" }}>{inferredError}</div> : null}

        {inferredTournaments && inferredTournaments.length === 0 ? (
          <div style={{ marginTop: 10, color: "#6b7280" }}>No inferred venue links found.</div>
        ) : null}

        {inferredTournaments && inferredTournaments.length > 0 ? (
          <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
            {inferredTournaments.map((t) => (
              <div key={t.tournament_id} style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontWeight: 700 }}>
                      {t.name ?? t.tournament_id}{" "}
                      <span style={{ fontWeight: 400, color: "#6b7280", fontSize: 12 }}>
                        {[
                          t.sport ? t.sport : null,
                          t.city ? t.city : null,
                          t.state ? t.state : null,
                          t.start_date ? t.start_date : null,
                        ]
                          .filter(Boolean)
                          .join(" • ")}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, marginTop: 4 }}>
                      <Link
                        href={`/admin/tournaments/enrichment?focus=${encodeURIComponent(t.tournament_id)}`}
                        style={{ color: "#1d4ed8", textDecoration: "none" }}
                      >
                        Focus
                      </Link>
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: "#6b7280" }}>{t.inferred_venues.length} inferred</div>
                </div>

                <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                  {t.inferred_venues.map((v) => (
                    <div
                      key={`${v.venue_id}`}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 10,
                        padding: 8,
                        border: "1px solid #f3f4f6",
                        borderRadius: 8,
                        background: "#fafafa",
                        flexWrap: "wrap",
                      }}
                    >
                      <div style={{ minWidth: 260 }}>
                        <div style={{ fontWeight: 700 }}>
                          {v.venue?.name ?? v.venue_id}{" "}
                          <span style={{ fontWeight: 400, color: "#6b7280", fontSize: 12 }}>
                            {v.inference_confidence != null ? `confidence ${String(v.inference_confidence)}` : ""}
                          </span>
                        </div>
                        <div style={{ fontSize: 12, color: "#374151" }}>
                          {[
                            v.venue?.address ?? null,
                            v.venue?.city ?? null,
                            v.venue?.state ?? null,
                            v.venue?.zip ?? null,
                          ]
                            .filter(Boolean)
                            .join(", ")}
                        </div>
                        <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>
                          {v.inference_method ?? "unknown method"}
                        </div>
                      </div>

                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <button
                          onClick={async () => {
                            setInferredError(null);
                            try {
                              await promoteInferredVenue(t.tournament_id, v.venue_id);
                              removeInferredRowFromUI(t.tournament_id, v.venue_id);
                            } catch (e: any) {
                              setInferredError(e?.message ? String(e.message) : "Promote failed");
                            }
                          }}
                          style={{
                            padding: "6px 10px",
                            borderRadius: 8,
                            border: "1px solid #0f3d2e",
                            background: "#0f3d2e",
                            color: "#fff",
                          }}
                        >
                          Promote
                        </button>
                        <button
                          onClick={async () => {
                            setInferredError(null);
                            try {
                              await rejectInferredVenue(
                                t.tournament_id,
                                v.venue_id,
                                v.inference_method ?? "city_state_sport_cluster_v2"
                              );
                              removeInferredRowFromUI(t.tournament_id, v.venue_id);
                            } catch (e: any) {
                              setInferredError(e?.message ? String(e.message) : "Reject failed");
                            }
                          }}
                          style={{
                            padding: "6px 10px",
                            borderRadius: 8,
                            border: "1px solid #b91c1c",
                            background: "#fff",
                            color: "#b91c1c",
                          }}
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      <div style={{ marginBottom: 12, display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button
            onClick={() => runFeesEnrichment()}
            disabled={feesBatchRunning}
            style={{
              padding: "8px 12px",
              borderRadius: 8,
              border: "1px solid #0f3d2e",
              background: "#0f3d2e",
              color: "#fff",
              opacity: feesBatchRunning ? 0.6 : 1,
            }}
            title="Default mode: pulls fees + venue candidates from tournaments with URLs"
          >
            Run fees/venue scrape (default)
          </button>
          <button
            onClick={() => runFeesEnrichment({ mode: "missing_venues", limit: 50, skipPending: feesSkipPending })}
            disabled={feesBatchRunning}
            style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #0f3d2e", background: "#fff", color: "#0f3d2e", opacity: feesBatchRunning ? 0.6 : 1 }}
            title="Missing-venues mode: prioritizes tournaments missing venue/address (requires URL). Uses a small limit so it’s fast."
          >
            Run fees/venue scrape (missing venues)
          </button>
          <button
            onClick={() => runUsssaEnrichment()}
            disabled={feesBatchRunning}
            style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #0f3d2e", background: "#fff", color: "#0f3d2e", opacity: feesBatchRunning ? 0.6 : 1 }}
          >
            Run USSSA scrape
          </button>
          <button
            onClick={() => runUsssaEnrichment({ limit: 2000 })}
            disabled={feesBatchRunning}
            style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #111827", background: "#fff", color: "#111827", opacity: feesBatchRunning ? 0.6 : 1 }}
          >
            Run all USSSA
          </button>
          <input
            type="number"
            min={1}
            max={2000}
            value={feesBatchTotal}
            onChange={(e) => setFeesBatchTotal(Number(e.target.value || 0))}
            style={{ width: 86, padding: "6px 8px", borderRadius: 8, border: "1px solid #e5e7eb" }}
            title="Total tournaments to process"
          />
          <span style={{ fontSize: 12, color: "#4b5563" }}>total</span>
          <input
            type="number"
            min={1}
            max={200}
            value={feesBatchChunk}
            onChange={(e) => setFeesBatchChunk(Number(e.target.value || 0))}
            style={{ width: 76, padding: "6px 8px", borderRadius: 8, border: "1px solid #e5e7eb" }}
            title="Chunk size per run"
          />
          <span style={{ fontSize: 12, color: "#4b5563" }}>chunk</span>
          <label style={{ fontSize: 12, color: "#4b5563", display: "flex", alignItems: "center", gap: 4 }}>
            <input
              type="checkbox"
              checked={feesBatchMissingVenuesOnly}
              onChange={(e) => setFeesBatchMissingVenuesOnly(e.target.checked)}
            />
            missing venues only
          </label>
          <label style={{ fontSize: 12, color: "#4b5563", display: "flex", alignItems: "center", gap: 4 }}>
            <input
              type="checkbox"
              checked={feesSkipPending}
              onChange={(e) => setFeesSkipPending(e.target.checked)}
            />
            skip pending review
          </label>
          <button
            onClick={runFeesBatch}
            disabled={feesBatchRunning}
            style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #111827", background: "#fff", color: "#111827", opacity: feesBatchRunning ? 0.6 : 1 }}
          >
            {feesBatchRunning ? "Running batch..." : "Run fees batch"}
          </button>
          {feesStatus ? <span style={{ color: "#4b5563", fontSize: 12 }}>{feesStatus}</span> : null}
          {feesVenueReasonSummary ? <span style={{ color: "#4b5563", fontSize: 12 }}>{feesVenueReasonSummary}</span> : null}
          {usssaStatus ? <span style={{ color: "#4b5563", fontSize: 12 }}>{usssaStatus}</span> : null}
        </div>
        {feesSummaryState?.length ? (
          <div style={{ fontSize: 12, color: "#111827" }}>
            Recent fees/venue findings:{" "}
            {feesSummaryState.map((s) => `${s.name ?? s.tournament_id} [${s.found.join(", ")}]`).join("; ")}
          </div>
        ) : null}
        {usssaSummaryState?.length ? (
          <div style={{ fontSize: 12, color: "#111827" }}>
            Recent USSSA findings:{" "}
            {usssaSummaryState.map((s) => `${s.name ?? s.tournament_id} [${s.found.join(", ")}]`).join("; ")}
          </div>
        ) : null}
      </div>
      <div style={{ marginBottom: 12 }}>
        <a
          href="/admin"
          style={{
            padding: "8px 12px",
            borderRadius: 8,
            border: "1px solid #111",
            background: "#fff",
            color: "#111",
            fontWeight: 700,
            textDecoration: "none",
          }}
        >
          Back to Admin
        </a>
      </div>

      <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 12 }}>
        <button onClick={() => queue()} style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #0f3d2e", background: "#0f3d2e", color: "#fff" }}>
          Queue Enrichment
        </button>
        <button onClick={runNow} style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #0f3d2e", background: "#fff", color: "#0f3d2e" }}>
          Run Now (limit 10)
        </button>
        <button onClick={refreshPage} style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #9ca3af", background: "#f9fafb", color: "#111827" }}>
          Refresh
        </button>
        <span style={{ color: "#555" }}>{status}</span>
      </div>

      <section style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, marginBottom: 16 }}>
        <h2 style={{ margin: "0 0 8px", fontSize: "1rem" }}>Priority outreach targets (missing both emails + dates)</h2>
        <p style={{ color: "#4b5563", marginTop: 0 }}>
          Add these directly to outreach draft so you can manually find an email and send outreach without losing them in the larger enrichment queue. If a site has no usable contact, hide it as no-contact (no delete required).
        </p>
        <div style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button
            onClick={queuePriorityForOutreach}
            style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid #0f172a", background: "#0f172a", color: "#fff" }}
          >
            Add selected to outreach draft
          </button>
          <button
            onClick={dismissPriorityNoContact}
            style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid #991b1b", background: "#fff", color: "#991b1b", fontWeight: 700 }}
          >
            Hide selected (no contact)
          </button>
          <a
            href="/admin/outreach?tab=draft"
            style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid #111", background: "#fff", color: "#111", textDecoration: "none", fontWeight: 700, fontSize: 12 }}
          >
            Open outreach draft
          </a>
          <span style={{ color: "#555" }}>{priorityStatus}</span>
        </div>
        <div style={{ maxHeight: 240, overflow: "auto", border: "1px solid #f1f1f1", borderRadius: 8 }}>
          {priorityTargets.length === 0 ? (
            <div style={{ padding: 10, color: "#6b7280" }}>No priority targets at the moment.</div>
          ) : (
            priorityTargets.map((t) => (
              <label key={t.id} style={{ display: "flex", gap: 8, padding: "6px 8px", alignItems: "center", borderBottom: "1px solid #f1f1f1" }}>
                <input type="checkbox" checked={prioritySelected.includes(t.id)} onChange={() => togglePriority(t.id)} />
                <div>
                  <div style={{ fontWeight: 600 }}>{t.name ?? "Untitled"}</div>
                  <div style={{ color: "#4b5563", fontSize: 12 }}>
                    {t.city ?? "—"}, {t.state ?? "—"} {t.sport ? `• ${t.sport}` : ""}
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
                    {t.official_website_url || t.source_url ? (
                      <a
                        href={t.official_website_url ?? t.source_url ?? "#"}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: "#0f172a", textDecoration: "underline", fontSize: 12, fontWeight: 700 }}
                      >
                        Open tournament URL
                      </a>
                    ) : null}
                    {t.slug ? (
                      <a
                        href={`/tournaments/${t.slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: "#4b5563", textDecoration: "underline", fontSize: 12 }}
                      >
                        View public page
                      </a>
                    ) : null}
                    <a
                      href={`/admin?tab=tournament-listings&q=${encodeURIComponent(t.slug ?? t.name ?? t.id)}#tournament-listings`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: "#0f172a", textDecoration: "underline", fontSize: 12 }}
                    >
                      Open admin listing
                    </a>
                  </div>
                </div>
              </label>
            ))
          )}
        </div>
      </section>

      <section style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, marginBottom: 16 }}>
        <h2 style={{ margin: "0 0 8px", fontSize: "1rem" }}>Find official websites (missing official URL)</h2>
        <p style={{ color: "#4b5563", marginTop: 0 }}>
          Search for official tournament or club URLs using Brave/Atlas. URLs with confidence ≥ 0.85 will be auto-applied to official website.
        </p>
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <button
            onClick={searchUrls}
            style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid #0f3d2e", background: "#0f3d2e", color: "#fff" }}
          >
            Search URLs
          </button>
          <button
            onClick={applySourceUrlsForSelected}
            style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid #111", background: "#fff", color: "#111" }}
          >
            Use source URL as official (selected)
          </button>
          <span style={{ color: "#555" }}>{urlSearchStatus}</span>
        </div>
        <div style={{ maxHeight: 260, overflow: "auto", border: "1px solid #f1f1f1", borderRadius: 8 }}>
          {missingUrls.length === 0 ? (
            <div style={{ padding: 10, color: "#6b7280" }}>No tournaments missing URLs.</div>
          ) : (
            missingUrls.map((t) => (
              <label key={t.id} style={{ display: "flex", gap: 8, padding: "6px 8px", alignItems: "center", borderBottom: "1px solid #f1f1f1" }}>
                <input type="checkbox" checked={missingSelected.includes(t.id)} onChange={() => toggleMissing(t.id)} />
                <div>
                  <div style={{ fontWeight: 600 }}>{t.name ?? "Untitled"}</div>
                  <div style={{ color: "#4b5563", fontSize: 12 }}>
                    {t.city ?? "—"}, {t.state ?? "—"} {t.sport ? `• ${t.sport}` : ""} {t.level ? `• ${t.level}` : ""}
                    {t.start_date ? ` • ${new Date(t.start_date).toLocaleDateString()}` : ""}
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
                    {t.slug ? (
                      <a
                        href={`/admin?tab=tournament-listings&q=${encodeURIComponent(t.slug)}#tournament-listings`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: "#0f172a", textDecoration: "underline", fontSize: 12 }}
                      >
                        Open listing
                      </a>
                    ) : (
                      <a
                        href={`/admin?tab=tournament-listings&q=${encodeURIComponent(t.name ?? "")}#tournament-listings`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: "#0f172a", textDecoration: "underline", fontSize: 12 }}
                      >
                        Open listing
                      </a>
                    )}
                    {t.slug ? (
                      <a
                        href={`/tournaments/${t.slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: "#4b5563", textDecoration: "underline", fontSize: 12 }}
                      >
                        View public page
                      </a>
                    ) : null}
                  </div>
                  {t.source_url ? (
                    <div style={{ color: "#6b7280", fontSize: 12, display: "grid", gap: 6 }}>
                      <div style={{ wordBreak: "break-all" }}>{t.source_url}</div>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        <a href={t.source_url} target="_blank" rel="noopener noreferrer" style={{ color: "#0f172a", textDecoration: "underline" }}>
                          Open source URL
                        </a>
                        <span style={{ color: "#9ca3af" }}>|</span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            applyCandidate(t.id, t.source_url!);
                          }}
                          style={{ padding: "2px 8px", borderRadius: 6, border: "1px solid #111", background: "#fff", color: "#111", fontSize: 12 }}
                        >
                          Use as official
                        </button>
                      </div>
                    </div>
                  ) : null}
                  <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
                    <input
                      type="url"
                      placeholder="Paste official website"
                      value={manualUrls[t.id] ?? ""}
                      onChange={(e) => setManualUrls((prev) => ({ ...prev, [t.id]: e.target.value }))}
                      style={{ padding: "4px 6px", borderRadius: 6, border: "1px solid #ccc", minWidth: 240 }}
                    />
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        const val = (manualUrls[t.id] || "").trim();
                        if (!val) return;
                        applyCandidate(t.id, val);
                      }}
                      style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid #0f172a", background: "#0f172a", color: "#fff", fontSize: 12 }}
                    >
                      Save official URL
                    </button>
                  </div>
                </div>
              </label>
            ))
          )}
        </div>
        <div style={{ marginTop: 8 }}>
          {Object.values(urlResults).map((row) => {
            const candidates = row.candidates ?? [];
            if (!candidates.length && !row.applied_url && !row.error) return null;
            const tournament = missingUrls.find((t) => t.id === row.tournament_id);
            return (
              <div key={row.tournament_id} style={{ marginTop: 10, borderTop: "1px solid #eee", paddingTop: 8 }}>
                <div style={{ fontWeight: 700 }}>{tournament?.name ?? row.tournament_id}</div>
                {row.error && <div style={{ color: "#b00020" }}>Search failed: {row.error}</div>}
                {row.applied_url && (
                  <div style={{ color: "#0f3d2e", fontWeight: 600 }}>Auto-applied (official): {row.applied_url}</div>
                )}
                {candidates.map((c) => (
                  <div key={c.url} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0" }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600 }}>
                        <a href={c.final_url ?? c.url} target="_blank" rel="noopener noreferrer" style={{ color: "#0f172a", textDecoration: "underline" }}>
                          {c.title ?? c.url}
                        </a>
                      </div>
                      <div style={{ color: "#4b5563", fontSize: 12 }}>
                        <a href={c.final_url ?? c.url} target="_blank" rel="noopener noreferrer" style={{ color: "#4b5563", textDecoration: "underline" }}>
                          {c.url}
                        </a>
                      </div>
                      {c.snippet && <div style={{ color: "#6b7280", fontSize: 12 }}>{c.snippet}</div>}
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 700 }}>{Math.round(c.score * 100)}%</div>
                    <button
                      onClick={() => applyCandidate(row.tournament_id, c.final_url ?? c.url)}
                      style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid #0f3d2e", background: "#fff", color: "#0f3d2e", fontSize: 12 }}
                    >
                      Apply
                    </button>
                  </div>
                ))}
                {tournament?.source_url ? (
                  <div style={{ marginTop: 6 }}>
                    <button
                      onClick={() => applyCandidate(row.tournament_id, tournament.source_url!)}
                      style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid #111", background: "#fff", color: "#111", fontSize: 12 }}
                    >
                      Use source URL as official
                    </button>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </section>

      <section style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, marginBottom: 16 }}>
        <h2 style={{ margin: "0 0 8px", fontSize: "1rem" }}>URL Suggestions (pending review)</h2>
        {pendingUrlSuggestions.length === 0 ? (
          <div style={{ color: "#6b7280" }}>No pending suggestions.</div>
        ) : (
          pendingUrlSuggestions.map((s) => (
            <div key={s.id} style={{ borderTop: "1px solid #f1f1f1", padding: "8px 0" }}>
              <div style={{ fontWeight: 700 }}>
                {s.tournament_name ?? s.tournament_id} {s.tournament_state ? `(${s.tournament_state})` : ""}
              </div>
              <div style={{ color: "#4b5563", fontSize: 12 }}>{s.suggested_url}</div>
              {s.submitter_email && <div style={{ color: "#6b7280", fontSize: 12 }}>Submitted by {s.submitter_email}</div>}
              <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                <button
                  onClick={() => reviewUrlSuggestion(s.id, "approve")}
                  style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid #0f3d2e", background: "#0f3d2e", color: "#fff", fontSize: 12 }}
                >
                  Approve
                </button>
                <button
                  onClick={() => reviewUrlSuggestion(s.id, "reject")}
                  style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid #b00020", background: "#fff", color: "#b00020", fontSize: 12 }}
                >
                  Reject
                </button>
              </div>
            </div>
          ))
        )}
      </section>

      <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 16 }}>
        <section style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12 }}>
          <h2 style={{ margin: "0 0 8px", fontSize: "1rem" }}>Tournaments (select to queue)</h2>
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search tournaments by name/state"
              style={{ flex: 1, padding: "6px 8px", borderRadius: 8, border: "1px solid #e5e7eb" }}
            />
            <input
              type="text"
              value={zipQuery}
              onChange={(e) => setZipQuery(e.target.value)}
              placeholder="ZIP (optional)"
              inputMode="numeric"
              pattern="\\d{5}"
              maxLength={5}
              style={{ width: 140, padding: "6px 8px", borderRadius: 8, border: "1px solid #e5e7eb" }}
            />
            <button onClick={search} disabled={searching} style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid #0f3d2e", background: "#0f3d2e", color: "#fff" }}>
              {searching ? "Searching..." : "Search"}
            </button>
          </div>
          <div style={{ maxHeight: 360, overflow: "auto" }}>
            {results.map((t) => (
              <label key={t.id} style={{ display: "flex", gap: 8, padding: "6px 4px", alignItems: "center", borderBottom: "1px solid #f1f1f1" }}>
                <input type="checkbox" checked={selected.includes(t.id)} onChange={() => toggle(t.id)} />
                <div>
                  <div style={{ fontWeight: 600 }}>{t.name ?? "Untitled"}</div>
                  <div style={{ color: "#4b5563", fontSize: 12 }}>{t.url ?? "No URL"}</div>
                </div>
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    queue([t.id]);
                  }}
                  style={{ marginLeft: "auto", padding: "4px 8px", borderRadius: 6, border: "1px solid #0f3d2e", background: "#fff", color: "#0f3d2e", fontSize: 12 }}
                >
                  Queue
                </button>
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    skipTournament(t.id);
                  }}
                  style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid #b00020", background: "#fff", color: "#b00020", fontSize: 12 }}
                >
                  Skip
                </button>
              </label>
            ))}
          </div>
        </section>

        <section style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12 }}>
          <h2 style={{ margin: "0 0 8px", fontSize: "1rem" }}>Recent Jobs</h2>
          <div style={{ maxHeight: 360, overflow: "auto" }}>
            {jobs.filter((job) => job.status !== "done").map((job) => (
              <div key={job.id} style={{ padding: "6px 4px", borderBottom: "1px solid #f1f1f1" }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontWeight: 600 }}>{job.status}</span>
                  <span style={{ color: "#6b7280", fontSize: 12 }}>{formatDate(job.created_at)}</span>
                </div>
                <div style={{ fontSize: 12, color: "#4b5563" }}>
                  Pages: {job.pages_fetched_count ?? 0} • Finished: {formatDate(job.finished_at) || "—"}
                </div>
                {job.last_error ? <div style={{ color: "#b91c1c", fontSize: 12 }}>Error: {job.last_error}</div> : null}
                <div style={{ fontSize: 12 }}>
                  Tournament:{" "}
                  <Link href={`/tournaments/${job.tournament_id}`}>
                    {job.tournament_name ?? job.tournament_id}
                  </Link>
                  {job.tournament_url ? (
                    <>
                      {" "}
                      •{" "}
                      <a href={job.tournament_url} target="_blank" rel="noreferrer" style={{ color: "#0f3d2e" }}>
                        source
                      </a>
                    </>
                  ) : null}
                  <div style={{ color: "#6b7280", fontSize: 11 }}>ID: {job.tournament_id}</div>
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      skip(job.tournament_id);
                    }}
                    style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid #b00020", background: "#fff", color: "#b00020", fontSize: 12 }}
                  >
                    Skip enrichment
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section style={{ marginTop: 20, border: "1px solid #e5e7eb", borderRadius: 12, padding: 12 }}>
        <h2 style={{ margin: "0 0 8px", fontSize: "1rem" }}>Run enrichment for tournaments with URLs</h2>
        <div style={{ display: "grid", gap: 8, maxWidth: 420 }}>
          <label style={{ fontSize: 12, color: "#4b5563" }}>Max tournaments to queue</label>
          <input
            type="number"
            min={1}
            max={200}
            value={batchLimit}
            onChange={(e) => setBatchLimit(Number(e.target.value || 0))}
            style={{ padding: "6px 8px", borderRadius: 8, border: "1px solid #e5e7eb" }}
          />
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#374151" }}>
            <input
              type="checkbox"
              checked={batchMissingDatesOnly}
              onChange={(e) => setBatchMissingDatesOnly(e.target.checked)}
            />
            Deep date search only for tournaments missing both start/end dates
          </label>
          <button
            onClick={runBatch}
            style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #0f3d2e", background: "#0f3d2e", color: "#fff", fontWeight: 700 }}
          >
            {batchMissingDatesOnly ? "Run deep date search" : "Run enrichment batch"}
          </button>
          {batchStatus ? <div style={{ fontSize: 12, color: "#4b5563" }}>{batchStatus}</div> : null}
        </div>
      </section>

      <section style={{ marginTop: 20, border: "1px solid #e5e7eb", borderRadius: 12, padding: 12 }}>
        <h2 style={{ margin: "0 0 8px", fontSize: "1rem" }}>Approve enrichment by tournament</h2>
        {reviewGroups.size === 0 ? (
          <div style={{ color: "#6b7280" }}>No pending enrichment items.</div>
        ) : (
          Array.from(reviewGroups.entries()).map(([tournamentId, items]) => {
            const info = candidateTournaments[tournamentId];
            const selected = selectedItems[tournamentId] ?? new Set<string>();
            const allSelected = items.every((item) => selected.has(item.key));
            return (
              <div key={tournamentId} style={{ borderTop: "1px solid #f1f1f1", paddingTop: 12, marginTop: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
                  <div style={{ minWidth: 240 }}>
                    <div style={{ fontWeight: 800 }}>{info?.name ?? tournamentId}</div>
                    <div style={{ color: "#4b5563", fontSize: 12 }}>
                      {info?.city ?? "—"}, {info?.state ?? "—"}
                    </div>
                    <div style={{ color: "#6b7280", fontSize: 12 }}>ID: {tournamentId}</div>
                    {info?.url ? (
                      <a href={info.url} target="_blank" rel="noreferrer" style={{ color: "#0f3d2e", fontSize: 12 }}>
                        {info.url}
                      </a>
                    ) : null}
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <button
                      onClick={() => toggleAllReviewItems(tournamentId, items)}
                      style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #111", background: "#fff", color: "#111", fontSize: 12 }}
                    >
                      {allSelected ? "Clear all" : "Select all"}
                    </button>
                    <Link
                      href={`/admin?tab=tournament-listings&q=${encodeURIComponent(tournamentId)}#tournament-listings`}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        padding: "6px 12px",
                        borderRadius: 8,
                        border: "1px solid #111",
                        background: "#fff",
                        color: "#111",
                        fontSize: 12,
                        textDecoration: "none",
                      }}
                    >
                      Edit
                    </Link>
                    <button
                      onClick={() => applyReviewItems(tournamentId)}
                      style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid #0f3d2e", background: "#0f3d2e", color: "#fff", fontSize: 12 }}
                    >
                      Apply
                    </button>
                    <button
                      onClick={() => deleteReviewItems(tournamentId)}
                      style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid #b00020", background: "#fff", color: "#b00020", fontSize: 12 }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
                {applyStatus[tournamentId] ? (
                  <div style={{ marginTop: 6, color: applyStatus[tournamentId]?.includes("failed") ? "#b00020" : "#0f5132", fontSize: 12 }}>
                    {applyStatus[tournamentId]}
                  </div>
                ) : null}
                <div style={{ marginTop: 8, display: "grid", gap: 8 }}>
                  {items.map((item) => (
                    <label key={item.key} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                      <input type="checkbox" checked={selected.has(item.key)} onChange={() => toggleReviewItem(tournamentId, item.key)} />
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                          <div style={{ fontWeight: 700 }}>{item.label}</div>
                          {item.kind === "venue" ? (
                            <span
                              style={{
                                fontSize: 11,
                                padding: "2px 6px",
                                borderRadius: 999,
                                border: "1px solid #e5e7eb",
                                background: "#f8fafc",
                                color: "#334155",
                                fontWeight: 700,
                              }}
                              title={item.reason ?? "unknown"}
                            >
                              {(item.reason ?? "unknown").replaceAll("_", " ")}
                            </span>
                          ) : null}
                        </div>
                        {item.detail ? <div style={{ color: "#4b5563", fontSize: 12 }}>{item.detail}</div> : null}
                        {item.ids.length > 1 ? (
                          <div style={{ color: "#6b7280", fontSize: 11 }}>
                            {item.ids.length} duplicates merged
                          </div>
                        ) : null}
                        <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, color: "#6b7280" }}>
                          {item.confidence != null ? <span>conf: {item.confidence}</span> : null}
                          {item.sourceUrl ? (
                            <a href={item.sourceUrl} target="_blank" rel="noreferrer" style={{ color: "#0f3d2e" }}>
                              source
                            </a>
                          ) : null}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </section>

      <section style={{ marginTop: 20, border: "1px solid #e5e7eb", borderRadius: 12, padding: 12 }}>
        <h2 style={{ margin: "0 0 8px", fontSize: "1rem" }}>Found but already has DB value</h2>
        <p style={{ marginTop: 0, color: "#4b5563", fontSize: 12 }}>
          These findings are hidden from the main approval queue because the target field already has data.
        </p>
        {existingValueGroups.size === 0 ? (
          <div style={{ color: "#6b7280" }}>No hidden fee/venue findings.</div>
        ) : (
          Array.from(existingValueGroups.entries()).map(([tournamentId, rows]) => {
            const info = candidateTournaments[tournamentId];
            const labelFor: Record<string, string> = {
              team_fee: "Team fee",
              games_guaranteed: "Games guaranteed",
              player_parking: "Player parking",
              address: "Address",
              venue_url: "Venue URL",
            };
            return (
              <div key={tournamentId} style={{ borderTop: "1px solid #f1f1f1", paddingTop: 12, marginTop: 12 }}>
                <div style={{ fontWeight: 800 }}>{info?.name ?? tournamentId}</div>
                <div style={{ color: "#6b7280", fontSize: 12 }}>ID: {tournamentId}</div>
                <div style={{ marginTop: 8, display: "grid", gap: 8 }}>
                  {rows.map((row) => (
                    <div key={row.id} style={{ border: "1px solid #f1f1f1", borderRadius: 8, padding: 8 }}>
                      <div style={{ fontWeight: 700 }}>{labelFor[row.attribute_key] ?? row.attribute_key}</div>
                      <div style={{ fontSize: 12, color: "#4b5563" }}>Found: {row.attribute_value}</div>
                      <div style={{ fontSize: 12, color: "#6b7280" }}>Existing: {row.existing_value}</div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </section>
    </main>
  );
}
