"use client";

import { useEffect, useRef, useState } from "react";

import OwlsEyeBrandingOverlay from "@/components/admin/OwlsEyeBrandingOverlay";
import { tiVenueMapUrl } from "@/lib/ti/publicUrls";
import { CURRENT_OWL_CATEGORIES, OWL_CATEGORY_LABELS } from "@/owlseye/categories";

type Sport =
  | "soccer"
  | "basketball"
  | "baseball"
  | "softball"
  | "football"
  | "lacrosse"
  | "hockey"
  | "volleyball"
  | "futsal";
type RunStatus = "idle" | "running" | "error" | "success";
const SPORT_OPTIONS: Array<{ value: Sport; label: string }> = [
  { value: "soccer", label: "Soccer" },
  { value: "basketball", label: "Basketball" },
  { value: "baseball", label: "Baseball" },
  { value: "softball", label: "Softball" },
  { value: "football", label: "Football" },
  { value: "lacrosse", label: "Lacrosse" },
  { value: "hockey", label: "Hockey" },
  { value: "volleyball", label: "Volleyball" },
  { value: "futsal", label: "Futsal" },
];
const SPORT_SET = new Set<string>(SPORT_OPTIONS.map((option) => option.value));

type VenueSearchResult = {
  venue_id: string;
  name: string | null;
  street: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  sport: string | null;
  tournament_count?: number;
  tournament_names?: string[];
  tournament_sports?: string[];
  categories_fetched?: string[] | null;
};

type NearbyItem = {
  name: string;
  address?: string;
  distance_meters?: number | null;
  is_sponsor?: boolean;
  sponsor_click_url?: string;
  maps_url?: string;
};

type NearbyDebugItem = {
  name: string;
  address: string;
  distance_meters: number;
  kept: boolean;
  reject_reason?: string;
  reason_tags?: string[];
  strong_match?: boolean;
  fsq_place_id?: string;
  fsq_categories?: Array<{ id: string; name: string }>;
};

type NearbyDebugQuery = {
  category: string;
  provider: "foursquare" | "google_fallback" | "google";
  radius_meters: number;
  category_ids?: string[];
  result_count: number;
  kept_count: number;
  weak?: boolean;
  weak_reason?: string | null;
  items: NearbyDebugItem[];
};

type RunReport = {
  runId?: string;
  status?: string;
  message?: string;
  map?: { imageUrl?: string | null; url?: string | null; north?: number | null };
  airports?: {
    nearest_airport?: AirportSummary | null;
    nearest_major_airport?: AirportSummary | null;
  };
  nearby?: {
    food?: NearbyItem[];
    coffee?: NearbyItem[];
    hotels?: NearbyItem[];
  };
  nearby_meta?: {
    ok?: boolean;
    message?: string;
    foodCount?: number;
    coffeeCount?: number;
    hotelCount?: number;
    rawDebug?: { queries: NearbyDebugQuery[] };
  };
};

type AirportSummary = {
  id: string;
  ident: string;
  iata_code?: string | null;
  name: string;
  municipality?: string | null;
  iso_country: string;
  iso_region?: string | null;
  airport_type: string;
  scheduled_service: boolean;
  is_commercial: boolean;
  is_major: boolean;
  distance_miles: number;
};

type DuplicateCandidate = {
  venue_id: string;
  name: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  score: number;
  has_owl_runs: boolean;
  owl_run_count: number;
};

type BatchDuplicateSuspect = {
  source: VenueSearchResult;
  candidates: DuplicateCandidate[];
};

type OwlsEyePanelProps = {
  embedded?: boolean;
  adminToken?: string;
  initialVenueId?: string;
  readyNotRunVenues?: VenueSearchResult[];
  readyDebug?: Record<string, unknown> | null;
  readyNotRunTotal?: number;
  suspectVenueCount?: number;
};

function getNearbyTotals(report: RunReport | null | undefined) {
  if (!report) return null;
  const meta = report.nearby_meta;
  const fromMeta =
    meta?.foodCount != null || meta?.coffeeCount != null || meta?.hotelCount != null
      ? {
          food: meta?.foodCount ?? 0,
          coffee: meta?.coffeeCount ?? 0,
          hotels: meta?.hotelCount ?? 0,
        }
      : null;

  if (fromMeta) return fromMeta;

  const nearby = report.nearby;
  if (!nearby) return null;
  return {
    food: Array.isArray(nearby.food) ? nearby.food.length : 0,
    coffee: Array.isArray(nearby.coffee) ? nearby.coffee.length : 0,
    hotels: Array.isArray(nearby.hotels) ? nearby.hotels.length : 0,
  };
}

function truncateId(value: string) {
  if (value.length <= 12) return value;
  return `${value.slice(0, 8)}…${value.slice(-4)}`;
}

function renderAirportSummary(label: string, airport: AirportSummary | null | undefined) {
  if (!airport) return null;
  const code = airport.iata_code || airport.ident;
  const locality = [airport.municipality, airport.iso_region].filter(Boolean).join(", ");
  return (
    <div
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: 10,
        padding: 12,
        background: "#fff",
        minWidth: 260,
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 700, color: "#6b7280", textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontWeight: 700, marginTop: 4 }}>{airport.name}</div>
      <div style={{ fontSize: 13, color: "#374151", marginTop: 4 }}>
        {code}
        {locality ? ` · ${locality}` : ""}
      </div>
      <div style={{ fontSize: 13, color: "#374151", marginTop: 4 }}>
        {airport.distance_miles} mi · {airport.airport_type.replace(/_/g, " ")}
      </div>
    </div>
  );
}

function SunPathOverlay({
  north,
  enabled,
}: {
  north: number | null;
  enabled: boolean;
}) {
  if (!enabled) return null;
  const baseAngle = typeof north === "number" ? north : 0; // degrees, 0 = north-up
  const westAngle = baseAngle - 90; // west (E -> W arrow points west)
  const size = 120;
  const center = { x: size / 2, y: size / 2 };
  const length = size * 0.7;
  const angleRad = (westAngle * Math.PI) / 180;
  const dx = (Math.cos(angleRad) * length) / 2;
  const dy = (Math.sin(angleRad) * length) / 2;
  const start = { x: center.x - dx, y: center.y - dy };
  const end = { x: center.x + dx, y: center.y + dy };

  return (
    <div
      style={{
        position: "absolute",
        top: 12,
        right: 12,
        width: size,
        height: size / 2,
        pointerEvents: "none",
        opacity: 0.28,
      }}
    >
      <svg width="100%" height="100%" viewBox={`0 0 ${size} ${size / 2}`} style={{ overflow: "visible" }}>
        <defs>
          <marker
            id="sunpath-arrowhead"
            markerWidth="8"
            markerHeight="8"
            refX="4"
            refY="4"
            orient="auto"
            markerUnits="strokeWidth"
          >
            <path d="M0,0 L8,4 L0,8 z" fill="#111" />
          </marker>
        </defs>
        <line
          x1={start.x}
          y1={start.y}
          x2={end.x}
          y2={end.y}
          stroke="#111"
          strokeWidth={2}
          markerEnd="url(#sunpath-arrowhead)"
        />
        <text
          x={center.x}
          y={start.y - 8}
          textAnchor="middle"
          fontSize={12}
          fill="#111"
          opacity={0.9}
        >
          Sun path (E → W)
        </text>
      </svg>
    </div>
  );
}

export default function OwlsEyePanel({
  embedded = false,
  adminToken,
  initialVenueId,
  readyNotRunVenues = [],
  readyDebug = null,
  readyNotRunTotal,
  suspectVenueCount = 0,
}: OwlsEyePanelProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<VenueSearchResult[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [copiedVenueId, setCopiedVenueId] = useState<string | null>(null);
  const [readyRows, setReadyRows] = useState<VenueSearchResult[]>(readyNotRunVenues);
  const [remainingReadyCount, setRemainingReadyCount] = useState<number>(
    typeof readyNotRunTotal === "number" ? readyNotRunTotal : readyNotRunVenues.length
  );
  const [mergeTargetId, setMergeTargetId] = useState("");
  const [mergeBusySourceId, setMergeBusySourceId] = useState<string | null>(null);
  const [mergeMessage, setMergeMessage] = useState<string | null>(null);
  const [deletingVenueId, setDeletingVenueId] = useState<string | null>(null);
  const [deleteMessage, setDeleteMessage] = useState<string | null>(null);

  const [venueId, setVenueId] = useState(initialVenueId ?? "");
  const [sport, setSport] = useState<Sport>("soccer");
  const [mapUrl, setMapUrl] = useState("");
  const [runStatus, setRunStatus] = useState<RunStatus>("idle");
  const [runMessage, setRunMessage] = useState<string | null>(null);
  const [runReport, setRunReport] = useState<RunReport | null>(null);
  const [duplicateCandidates, setDuplicateCandidates] = useState<DuplicateCandidate[]>([]);
  const [duplicateSourceVenueId, setDuplicateSourceVenueId] = useState<string | null>(null);
  const [mergeAndRunBusy, setMergeAndRunBusy] = useState(false);
  const [batchLimit, setBatchLimit] = useState(10);
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchMessage, setBatchMessage] = useState<string | null>(null);
  const [batchDuplicateSuspects, setBatchDuplicateSuspects] = useState<BatchDuplicateSuspect[]>([]);
  const [nearbyTab, setNearbyTab] = useState<"food" | "coffee" | "hotels">("food");
  const [sunPathEnabled, setSunPathEnabled] = useState(true);
  const [expandedDebugQueries, setExpandedDebugQueries] = useState<Set<number>>(new Set());
  const runReportRef = useRef<HTMLDivElement>(null);
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(
    () => new Set(CURRENT_OWL_CATEGORIES)
  );

  const getMissingCategories = (venue: VenueSearchResult): string[] => {
    const fetched = venue.categories_fetched;
    if (!fetched) return [...CURRENT_OWL_CATEGORIES];
    return CURRENT_OWL_CATEGORIES.filter((cat) => !fetched.includes(cat));
  };

  useEffect(() => {
    if (initialVenueId) {
      setVenueId(initialVenueId);
    }
  }, [initialVenueId]);
  useEffect(() => {
    setReadyRows(readyNotRunVenues);
  }, [readyNotRunVenues]);
  useEffect(() => {
    setRemainingReadyCount(typeof readyNotRunTotal === "number" ? readyNotRunTotal : readyNotRunVenues.length);
  }, [readyNotRunTotal, readyNotRunVenues]);
  const filteredReadyRows = readyRows.filter((venue) => {
    const missing = getMissingCategories(venue);
    return missing.some((cat) => selectedCategories.has(cat));
  });
  const readyDisplayedCount = filteredReadyRows.length;
  const readyTotalCount = remainingReadyCount;

  const sharedHeaders = adminToken ? { "x-owls-eye-admin-token": adminToken } : {};

  const inferSportFromVenue = (venue: VenueSearchResult): Sport => {
    const linkedSport =
      (venue.tournament_sports ?? [])
        .map((value) => String(value || "").trim().toLowerCase())
        .find((value) => SPORT_SET.has(value)) ?? "";
    if (linkedSport) return linkedSport as Sport;

    const normalizedSports = String(venue.sport || "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean);
    const venueSport = normalizedSports.find((value) => SPORT_SET.has(value));
    return (venueSport as Sport) || "soccer";
  };

  const runVenueRequest = async (args: {
    venueId: string;
    sportValue: Sport;
    publishedMapUrl?: string;
    allowDuplicate?: boolean;
    force?: boolean;
    categories?: string[];
  }) => {
    const resp = await fetch("/api/admin/owls-eye/run", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...sharedHeaders,
      },
      body: JSON.stringify({
        venue_id: args.venueId,
        sport: args.sportValue,
        published_map_url: args.publishedMapUrl?.trim() || undefined,
        allow_duplicate: args.allowDuplicate ?? false,
        force: args.force ?? false,
        ...(args.categories ? { categories: args.categories } : {}),
      }),
    });
    const json = await resp.json();
    return { resp, json };
  };

  const searchVenues = async () => {
    const query = searchQuery.trim();
    if (query.length < 2) {
      setSearchError("Enter at least 2 characters to search.");
      setHasSearched(false);
      setSearchResults([]);
      return;
    }

    setSearching(true);
    setHasSearched(true);
    setSearchError(null);
    setSearchResults([]);

    try {
      const resp = await fetch(`/api/admin/venues/search?q=${encodeURIComponent(query)}`, {
        headers: sharedHeaders,
      });
      const json = await resp.json();

      if (!resp.ok) {
        setSearchError(json?.error || json?.message || "Search failed.");
        return;
      }

      setSearchResults(Array.isArray(json?.results) ? json.results : []);
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : "Search failed.");
    } finally {
      setSearching(false);
    }
  };

  const handleCopy = async (id: string) => {
    try {
      await navigator.clipboard.writeText(id);
      setCopiedVenueId(id);
      setTimeout(() => setCopiedVenueId(null), 1500);
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : "Could not copy ID.");
    }
  };

  const handleUseVenue = (venue: VenueSearchResult) => {
    setVenueId(venue.venue_id);
    setSport(inferSportFromVenue(venue));
  };

  const mergeVenue = async (sourceVenue: VenueSearchResult) => {
    const sourceId = sourceVenue.venue_id;
    const targetId = mergeTargetId.trim() || venueId.trim();
    if (!targetId) {
      setMergeMessage("Set a merge target Venue ID first.");
      return;
    }
    if (targetId === sourceId) {
      setMergeMessage("Target venue must be different from source venue.");
      return;
    }
    if (
      !window.confirm(
        `Merge "${sourceVenue.name || sourceId}" into ${targetId}? This will move tournament links and remove the source venue.`
      )
    ) {
      return;
    }
    setMergeBusySourceId(sourceId);
    setMergeMessage(null);
    try {
      const resp = await fetch("/api/admin/venues/merge", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...sharedHeaders,
        },
        body: JSON.stringify({
          source_venue_id: sourceId,
          target_venue_id: targetId,
          remove_source: true,
        }),
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        throw new Error(json?.error || "Merge failed");
      }
      setReadyRows((prev) => prev.filter((row) => row.venue_id !== sourceId));
      setRemainingReadyCount((prev) => Math.max(0, prev - 1));
      setMergeMessage("Venue merged successfully.");
    } catch (err) {
      setMergeMessage(err instanceof Error ? err.message : "Merge failed");
    } finally {
      setMergeBusySourceId(null);
    }
  };

  const deleteVenue = async (venue: VenueSearchResult) => {
    if (
      !window.confirm(
        `Clean delete venue "${venue.name || venue.venue_id}"? This unlinks tournaments and removes the venue.`
      )
    ) {
      return;
    }

    setDeletingVenueId(venue.venue_id);
    setDeleteMessage(null);
    setSearchError(null);

    const runDelete = async (confirmOwlDelete: boolean) => {
      const resp = await fetch(`/api/admin/venues/${encodeURIComponent(venue.venue_id)}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          ...sharedHeaders,
        },
        body: JSON.stringify({ confirm_owl_delete: confirmOwlDelete }),
      });
      const json = await resp.json().catch(() => ({} as Record<string, unknown>));
      return { resp, json };
    };

    try {
      let { resp, json } = await runDelete(false);

      if (!resp.ok && resp.status === 409 && (json as any)?.error === "owl_data_confirm_required") {
        const confirmed = window.confirm(
          "This venue has Owl's Eye data. Delete Owl's Eye runs/artifacts/nearby and continue?"
        );
        if (!confirmed) return;
        ({ resp, json } = await runDelete(true));
      }

      if (!resp.ok) {
        throw new Error((json as any)?.error || (json as any)?.message || "Delete failed");
      }

      setReadyRows((prev) => prev.filter((row) => row.venue_id !== venue.venue_id));
      setRemainingReadyCount((prev) => Math.max(0, prev - 1));
      setSearchResults((prev) => prev.filter((row) => row.venue_id !== venue.venue_id));
      if (venueId === venue.venue_id) {
        setVenueId("");
      }
      setDeleteMessage("Venue deleted.");
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : "Delete failed.");
    } finally {
      setDeletingVenueId(null);
    }
  };

  const startRun = async (allowDuplicate = false, venueOverride?: string) => {
    const trimmedVenueId = (venueOverride ?? venueId).trim();
    if (!trimmedVenueId) {
      setRunStatus("error");
      setRunMessage("Venue ID is required.");
      return;
    }

    setRunStatus("running");
    setRunMessage(null);
    setRunReport(null);
    if (!allowDuplicate) setDuplicateCandidates([]);

    try {
      let { resp, json } = await runVenueRequest({
        venueId: trimmedVenueId,
        sportValue: sport,
        publishedMapUrl: mapUrl,
        allowDuplicate,
      });
      const errorMessage = json?.error || json?.message;

      if (!resp.ok || json?.ok === false) {
        if (resp.status === 409 && json?.code === "VENUE_ALREADY_SCANNED") {
          const confirmed = window.confirm(
            "Owl’s Eye was already run for this venue/sport. Run again with force refresh? (This will create a new run and refresh nearby data.)"
          );
          if (!confirmed) {
            setRunStatus("error");
            setRunMessage(errorMessage || "Already scanned.");
            setRunReport(json?.report ?? json);
            return;
          }
          ({ resp, json } = await runVenueRequest({
            venueId: trimmedVenueId,
            sportValue: sport,
            publishedMapUrl: mapUrl,
            allowDuplicate,
            force: true,
          }));
          if (resp.ok && json?.ok !== false) {
            const nextReport = (json?.report ?? json) as RunReport;
            const totals = getNearbyTotals(nextReport);
            setRunStatus("success");
            setRunMessage(
              totals
                ? `Owl's Eye run completed (forced). food=${totals.food}, coffee=${totals.coffee}, hotels=${totals.hotels}`
                : "Owl's Eye run completed (forced)."
            );
            setDuplicateCandidates([]);
            setDuplicateSourceVenueId(null);
            setRunReport(nextReport);
            return;
          }
        }
        if (resp.status === 409 && json?.code === "DUPLICATE_VENUE_SUSPECT" && Array.isArray(json?.candidates)) {
          const candidates = json.candidates as DuplicateCandidate[];
          setDuplicateCandidates(candidates);
          setDuplicateSourceVenueId(trimmedVenueId);
          if (candidates[0]?.venue_id) {
            setMergeTargetId(candidates[0].venue_id);
          }
          setRunStatus("error");
          setRunMessage(errorMessage || "Possible duplicate venue found.");
          return;
        }
        setRunStatus("error");
        setRunMessage(errorMessage || "Run failed.");
        setRunReport(json?.report ?? json);
        return;
      }

      const nextReport = (json?.report ?? json) as RunReport;
      const totals = getNearbyTotals(nextReport);
      setRunStatus("success");
      setRunMessage(
        totals
          ? `Owl's Eye run completed. food=${totals.food}, coffee=${totals.coffee}, hotels=${totals.hotels}`
          : "Owl's Eye run completed."
      );
      setDuplicateCandidates([]);
      setDuplicateSourceVenueId(null);
      setRunReport(nextReport);
      setTimeout(() => runReportRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    } catch (err) {
      setRunStatus("error");
      setRunMessage(err instanceof Error ? err.message : "Unknown error");
    }
  };

  const runBatch = async () => {
    const limit = Math.max(1, Math.min(100, Number.isFinite(batchLimit) ? Math.floor(batchLimit) : 10));
    const targets = readyRows.slice(0, limit);
    if (targets.length === 0) {
      setBatchMessage("No ready venues pending first run.");
      return;
    }
    if (!window.confirm(`Run Owl's Eye for the next ${targets.length} ready venue${targets.length === 1 ? "" : "s"}?`)) {
      return;
    }

    setBatchDuplicateSuspects([]);
    setBatchRunning(true);
    setBatchMessage(`Starting batch for ${targets.length} venue${targets.length === 1 ? "" : "s"}...`);
    setRunStatus("idle");
    setRunMessage(null);

    let successCount = 0;
    let duplicateCount = 0;
    let failureCount = 0;
    const failedNames: string[] = [];
    const duplicateNames: string[] = [];
    const failureDetails: string[] = [];
    const duplicateSuspects: BatchDuplicateSuspect[] = [];

    for (let index = 0; index < targets.length; index += 1) {
      const venue = targets[index];
      const sportValue = inferSportFromVenue(venue);
      const missingForVenue = getMissingCategories(venue).filter((c) => selectedCategories.has(c));
      setBatchMessage(`Running ${index + 1}/${targets.length}: ${venue.name || venue.venue_id}`);
      try {
        const { resp, json } = await runVenueRequest({
          venueId: venue.venue_id,
          sportValue,
          allowDuplicate: false,
          ...(missingForVenue.length > 0 && missingForVenue.length < CURRENT_OWL_CATEGORIES.length
            ? { categories: missingForVenue }
            : {}),
        });

        if (!resp.ok || json?.ok === false) {
          if (resp.status === 409 && json?.code === "DUPLICATE_VENUE_SUSPECT") {
            duplicateCount += 1;
            duplicateNames.push(venue.name || venue.venue_id);
            if (Array.isArray(json?.candidates) && json.candidates.length > 0) {
              duplicateSuspects.push({
                source: venue,
                candidates: json.candidates as DuplicateCandidate[],
              });
            }
            continue;
          }
          failureCount += 1;
          failedNames.push(venue.name || venue.venue_id);
          failureDetails.push(`${venue.name || venue.venue_id}: ${json?.message || json?.error || `HTTP ${resp.status}`}`);
          continue;
        }

        successCount += 1;
        const nextReport = (json?.report ?? json) as RunReport;
        setRunReport(nextReport);
        setTimeout(() => runReportRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
        setReadyRows((prev) => prev.filter((row) => row.venue_id !== venue.venue_id));
        setRemainingReadyCount((prev) => Math.max(0, prev - 1));
      } catch {
        failureCount += 1;
        failedNames.push(venue.name || venue.venue_id);
        failureDetails.push(`${venue.name || venue.venue_id}: request failed`);
      }
    }

    const messageParts = [
      `Batch complete: ${successCount} succeeded`,
      duplicateCount ? `${duplicateCount} duplicate-suspect` : null,
      failureCount ? `${failureCount} failed` : null,
    ].filter(Boolean);
    const detailParts = [
      duplicateNames.length ? `Duplicate-suspect: ${duplicateNames.slice(0, 5).join("; ")}${duplicateNames.length > 5 ? "..." : ""}` : null,
      failedNames.length ? `Failed: ${failedNames.slice(0, 5).join("; ")}${failedNames.length > 5 ? "..." : ""}` : null,
      failureDetails.length ? `Errors: ${failureDetails.slice(0, 3).join(" | ")}${failureDetails.length > 3 ? "..." : ""}` : null,
    ].filter(Boolean);
    setBatchMessage([messageParts.join(" • "), detailParts.join(" • ")].filter(Boolean).join(" — "));
    setBatchDuplicateSuspects(duplicateSuspects);
    setBatchRunning(false);
  };

  const reviewBatchDuplicateSuspect = (item: BatchDuplicateSuspect) => {
    handleUseVenue(item.source);
    setDuplicateCandidates(item.candidates);
    setDuplicateSourceVenueId(item.source.venue_id);
    if (item.candidates[0]?.venue_id) setMergeTargetId(item.candidates[0].venue_id);
    setRunStatus("error");
    setRunMessage("Possible duplicate venue(s) found.");
    setRunReport(null);
  };

  const mergeSuggestedAndRun = async () => {
    const sourceId = (duplicateSourceVenueId ?? venueId).trim();
    const targetId = (mergeTargetId.trim() || duplicateCandidates[0]?.venue_id || "").trim();
    if (!sourceId || !targetId) {
      setRunStatus("error");
      setRunMessage("Missing source or suggested target venue ID.");
      return;
    }
    if (sourceId === targetId) {
      setRunStatus("error");
      setRunMessage("Suggested target is the same as source venue.");
      return;
    }
    if (
      !window.confirm(
        `Merge current venue ${sourceId} into suggested target ${targetId}, then run Owl's Eye on target?`
      )
    ) {
      return;
    }

    setMergeAndRunBusy(true);
    setRunStatus("running");
    setRunMessage("Merging venue into suggested target...");
    try {
      const resp = await fetch("/api/admin/venues/merge", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...sharedHeaders,
        },
        body: JSON.stringify({
          source_venue_id: sourceId,
          target_venue_id: targetId,
          remove_source: true,
        }),
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        throw new Error(json?.error || "Merge failed");
      }

      setReadyRows((prev) => prev.filter((row) => row.venue_id !== sourceId));
      setSearchResults((prev) => prev.filter((row) => row.venue_id !== sourceId));
      setVenueId(targetId);
      setDuplicateCandidates([]);
      setDuplicateSourceVenueId(null);
      setRunMessage("Merge complete. Running Owl's Eye on target...");
      await startRun(false, targetId);
    } catch (err) {
      setRunStatus("error");
      setRunMessage(err instanceof Error ? err.message : "Merge failed.");
    } finally {
      setMergeAndRunBusy(false);
    }
  };

  const mapImageUrl = (() => {
    const map = (runReport as any)?.map;
    if (!map) return null;
    return map.imageUrl || map.url || null;
  })();

  const mapNorth = (() => {
    const map = (runReport as any)?.map;
    if (!map) return null;
    const northVal = map.north;
    return typeof northVal === "number" && isFinite(northVal) ? northVal : null;
  })();

  const metersToMiles = (meters?: number | null) => {
    if (meters == null) return null;
    const miles = meters / 1609.34;
    return Math.round(miles * 10) / 10;
  };

  const refreshNearby = async () => {
    if (!runReport?.runId) return;
    setRunMessage(null);
    try {
      const resp = await fetch(`/api/admin/owls-eye/run/${runReport.runId}?force=true`, {
        headers: sharedHeaders,
      });
      const json = await resp.json();
      if (!resp.ok) {
        setRunMessage(json?.error || json?.message || "Refresh failed");
        setRunStatus("error");
        return;
      }
      setRunReport((prev) => ({ ...(prev || {}), nearby: json?.nearby || json?.nearbyFood || json?.nearby }));
      setRunMessage("Nearby refreshed");
    } catch (err) {
      setRunStatus("error");
      setRunMessage(err instanceof Error ? err.message : "Refresh failed");
    }
  };

  const renderNearbyList = (items: NearbyItem[] | undefined, label: string) => {
    if (!items || items.length === 0) return <div style={{ color: "#6b7280" }}>No {label} found.</div>;
    return (
      <div style={{ display: "grid", gap: 8 }}>
        {items.map((item, idx) => {
          const distance = metersToMiles(item.distance_meters);
          return (
            <div
              key={`${item.name}-${idx}`}
              style={{
                border: "1px solid #e5e7eb",
                borderRadius: 8,
                padding: 10,
                display: "grid",
                gap: 4,
                background: item.is_sponsor ? "#fff7ed" : "white",
              }}
            >
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "space-between" }}>
                <span style={{ fontWeight: 700 }}>{item.name}</span>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  {distance != null && <span style={{ fontSize: 12, color: "#4b5563" }}>{distance} mi</span>}
                  {item.is_sponsor && (
                    <span style={{ fontSize: 11, background: "#f97316", color: "white", padding: "2px 6px", borderRadius: 6 }}>
                      Sponsor
                    </span>
                  )}
                </div>
              </div>
              {item.address && <div style={{ fontSize: 12, color: "#4b5563" }}>{item.address}</div>}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
                {item.maps_url && (
                  <a
                    href={item.maps_url}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      fontSize: 13,
                      padding: "6px 10px",
                      borderRadius: 8,
                      border: "1px solid #e5e7eb",
                      background: "#f8fafc",
                    }}
                  >
                    Directions
                  </a>
                )}
                {item.is_sponsor && item.sponsor_click_url && (
                  <a
                    href={item.sponsor_click_url}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      fontSize: 13,
                      padding: "6px 10px",
                      borderRadius: 8,
                      border: "1px solid #f97316",
                      background: "#fff7ed",
                      color: "#c2410c",
                    }}
                  >
                    Offer
                  </a>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div style={{ padding: embedded ? 0 : "24px", maxWidth: 860 }}>
      <h1>Owl&apos;s Eye Admin</h1>
      <p>Search venues and trigger a manual Owl&apos;s Eye run.</p>

      <div style={{ display: "grid", gap: 24, marginTop: 12 }}>
        <div style={{ border: "1px solid #ddd", padding: 16, borderRadius: 8, maxWidth: 780 }}>
          <h2 style={{ marginTop: 0 }}>Owl&apos;s Eye Ready (Not Run)</h2>
          <p style={{ color: "#555", marginTop: 0 }}>
            Venues missing one or more Owl&apos;s Eye categories. Use checkboxes to filter by category and target runs.
          </p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 10, alignItems: "center" }}>
            <span style={{ fontSize: 13, fontWeight: 700 }}>Filter by missing:</span>
            {CURRENT_OWL_CATEGORIES.map((cat) => (
              <label key={cat} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={selectedCategories.has(cat)}
                  onChange={(e) => {
                    setSelectedCategories((prev) => {
                      const next = new Set(prev);
                      if (e.target.checked) next.add(cat);
                      else next.delete(cat);
                      return next;
                    });
                  }}
                />
                {OWL_CATEGORY_LABELS[cat] ?? cat}
              </label>
            ))}
          </div>
          {readyDebug ? (
            <div
              style={{
                marginBottom: 10,
                padding: 10,
                borderRadius: 8,
                border: "1px solid #d1d5db",
                background: "#f8fafc",
                fontSize: 12,
                color: "#111827",
                overflowX: "auto",
              }}
            >
              <div style={{ fontWeight: 700, marginBottom: 6 }}>Debug summary</div>
              <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                {JSON.stringify(readyDebug, null, 2)}
              </pre>
            </div>
          ) : null}
          <div style={{ display: "grid", gap: 6, maxWidth: 540, marginBottom: 10 }}>
            <label>
              <div style={{ fontSize: 13, fontWeight: 700 }}>Merge target venue ID (optional)</div>
              <input
                value={mergeTargetId}
                onChange={(e) => setMergeTargetId(e.target.value)}
                placeholder={venueId ? `Using selected venue by default: ${truncateId(venueId)}` : "Paste target venue UUID"}
                style={{ width: "100%" }}
              />
            </label>
            <div style={{ fontSize: 12, color: "#6b7280" }}>
              Merge button will use this target first, otherwise current Generate Owl&apos;s Eye Venue ID.
            </div>
            {mergeMessage ? (
              <div style={{ color: mergeMessage.toLowerCase().includes("failed") || mergeMessage.includes("must") ? "#b91c1c" : "#065f46" }}>
                {mergeMessage}
              </div>
            ) : null}
            {deleteMessage ? <div style={{ color: "#065f46" }}>{deleteMessage}</div> : null}
          </div>
          {suspectVenueCount > 0 ? (
            <div
              style={{
                marginBottom: 10,
                padding: "8px 12px",
                borderRadius: 8,
                background: "#fefce8",
                border: "1px solid #fde047",
                fontSize: 13,
                color: "#713f12",
              }}
            >
              <strong>{suspectVenueCount} venue{suspectVenueCount === 1 ? "" : "s"}</strong> excluded from this queue — flagged as possible duplicates.{" "}
              <a href="/admin/venues?duplicates=1" style={{ color: "#92400e", textDecoration: "underline" }}>
                Review &amp; resolve at Admin → Venues → Duplicates
              </a>
              . Once merged or dismissed there, they will reappear here.
            </div>
          ) : null}
          <div style={{ fontSize: 13, color: "#374151", marginBottom: 8 }}>
            Found: <strong>{readyDisplayedCount}</strong>
            {readyTotalCount !== readyDisplayedCount ? (
              <span style={{ color: "#6b7280" }}> of {readyTotalCount} total</span>
            ) : null}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
              <span>Batch size</span>
              <input
                type="number"
                min={1}
                max={100}
                value={batchLimit}
                onChange={(e) => setBatchLimit(Number(e.target.value || 10))}
                style={{ width: 80 }}
              />
            </label>
            <button onClick={runBatch} disabled={batchRunning || readyRows.length === 0}>
              {batchRunning ? "Running batch..." : `Run next ${Math.max(1, Math.min(100, batchLimit || 10))}`}
            </button>
            {batchMessage ? <div style={{ fontSize: 12, color: "#374151" }}>{batchMessage}</div> : null}
          </div>
          {batchDuplicateSuspects.length > 0 ? (
            <div
              style={{
                border: "1px solid #f59e0b",
                background: "#fffbeb",
                borderRadius: 8,
                padding: 10,
                display: "grid",
                gap: 8,
                maxWidth: 720,
                marginBottom: 10,
              }}
            >
              <div style={{ fontWeight: 700, color: "#92400e" }}>
                Duplicate suspects from last batch ({batchDuplicateSuspects.length})
              </div>
              <div style={{ fontSize: 12, color: "#7c2d12" }}>
                Click <strong>Review</strong> to load the venue + suggested merge targets so you can merge (or run anyway).
              </div>
              <div style={{ display: "grid", gap: 8, maxHeight: 220, overflowY: "auto", paddingRight: 4 }}>
                {batchDuplicateSuspects.map((item) => {
                  const source = item.source;
                  const locationParts = [source.city, source.state, source.zip].filter(Boolean).join(", ");
                  const suggested = item.candidates[0];
                  return (
                    <div
                      key={`batch-dup-${source.venue_id}`}
                      style={{
                        border: "1px solid #fde68a",
                        borderRadius: 8,
                        padding: 10,
                        display: "grid",
                        gap: 6,
                        background: "#fff",
                      }}
                    >
                      <div style={{ fontWeight: 700 }}>{source.name || "Unnamed venue"}</div>
                      <div style={{ fontSize: 12, color: "#374151", overflowWrap: "anywhere" }}>
                        {source.street || "Address missing"}
                        {locationParts ? ` • ${locationParts}` : ""}
                      </div>
                      {suggested ? (
                        <div style={{ fontSize: 12, color: "#6b7280", overflowWrap: "anywhere" }}>
                          Suggested target: <code>{truncateId(suggested.venue_id)}</code> — {suggested.name || "Unnamed venue"}
                        </div>
                      ) : null}
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                        <button type="button" onClick={() => reviewBatchDuplicateSuspect(item)} style={{ padding: "6px 10px", fontWeight: 700 }}>
                          Review
                        </button>
                        <a href={`/admin/venues/${encodeURIComponent(source.venue_id)}`} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>
                          Open source venue
                        </a>
                        {suggested ? (
                          <a href={`/admin/venues/${encodeURIComponent(suggested.venue_id)}`} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>
                            Open suggested target
                          </a>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
          {filteredReadyRows.length === 0 ? (
            <div style={{ color: "#6b7280" }}>
              {readyRows.length === 0
                ? "No ready venues pending first run."
                : "No venues match the selected category filters."}
            </div>
          ) : (
            <div style={{ display: "grid", gap: 8, maxHeight: 320, overflowY: "auto", paddingRight: 4 }}>
              {filteredReadyRows.map((venue) => {
                const locationParts = [venue.city, venue.state, venue.zip].filter(Boolean).join(", ");
                const missingCats = getMissingCategories(venue);
                const targetCats = missingCats.filter((c) => selectedCategories.has(c));
                const isTargeted = targetCats.length > 0 && targetCats.length < CURRENT_OWL_CATEGORIES.length;
                return (
                  <div
                    key={`ready-${venue.venue_id}`}
                    style={{
                      border: "1px solid #e1e4e8",
                      borderRadius: 6,
                      padding: 10,
                      display: "grid",
                      gap: 4,
                    }}
                  >
                    <div style={{ fontWeight: 600 }}>{venue.name || "Unnamed venue"}</div>
                    <div style={{ color: "#444", overflowWrap: "anywhere" }}>
                      {venue.street || "Address missing"}
                      {locationParts ? ` • ${locationParts}` : ""}
                    </div>
                    {missingCats.length > 0 ? (
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
                        <span style={{ fontSize: 11, color: "#6b7280" }}>Missing:</span>
                        {missingCats.map((cat) => (
                          <span
                            key={cat}
                            style={{
                              fontSize: 11,
                              padding: "2px 6px",
                              borderRadius: 4,
                              background: selectedCategories.has(cat) ? "#fef3c7" : "#f3f4f6",
                              color: selectedCategories.has(cat) ? "#92400e" : "#6b7280",
                              fontWeight: 600,
                              border: selectedCategories.has(cat) ? "1px solid #fde68a" : "1px solid #e5e7eb",
                            }}
                          >
                            {OWL_CATEGORY_LABELS[cat] ?? cat}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    {typeof venue.tournament_count === "number" && venue.tournament_count > 0 ? (
                      <div style={{ fontSize: 12, color: "#1f2937", overflowWrap: "anywhere" }}>
                        Linked tournaments: <strong>{venue.tournament_count}</strong>
                        {Array.isArray(venue.tournament_names) && venue.tournament_names.length > 0 ? (
                          <> — {venue.tournament_names.join("; ")}</>
                        ) : null}
                      </div>
                    ) : (
                      <div style={{ fontSize: 12, color: "#6b7280" }}>Linked tournaments: 0</div>
                    )}
                    {Array.isArray(venue.tournament_sports) && venue.tournament_sports.length > 0 ? (
                      <div style={{ fontSize: 12, color: "#1f2937" }}>
                        Linked sports: <strong>{venue.tournament_sports.join(", ")}</strong>
                      </div>
                    ) : null}
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <span style={{ fontFamily: "monospace", fontSize: 12 }}>{truncateId(venue.venue_id)}</span>
                      <button onClick={() => handleCopy(venue.venue_id)} style={{ padding: "4px 8px" }}>
                        {copiedVenueId === venue.venue_id ? "Copied" : "Copy ID"}
                      </button>
                      <button onClick={() => handleUseVenue(venue)} style={{ padding: "4px 8px" }}>
                        Use
                      </button>
                      {isTargeted ? (
                        <button
                          onClick={async () => {
                            const sportValue = inferSportFromVenue(venue);
                            const { resp, json } = await runVenueRequest({
                              venueId: venue.venue_id,
                              sportValue,
                              categories: targetCats,
                            });
                            if (resp.ok && json?.ok !== false) {
                              setReadyRows((prev) => prev.filter((r) => r.venue_id !== venue.venue_id));
                              setRemainingReadyCount((prev) => Math.max(0, prev - 1));
                            }
                          }}
                          style={{ padding: "4px 8px", fontWeight: 700, background: "#fef3c7", border: "1px solid #fde68a" }}
                        >
                          Run missing
                        </button>
                      ) : null}
                      <button
                        onClick={() => mergeVenue(venue)}
                        disabled={mergeBusySourceId === venue.venue_id}
                        style={{ padding: "4px 8px" }}
                      >
                        {mergeBusySourceId === venue.venue_id ? "Merging..." : "Merge"}
                      </button>
                      <a
                        href={`/admin/owls-eye?venueId=${encodeURIComponent(venue.venue_id)}`}
                        style={{ fontSize: 12 }}
                      >
                        Open
                      </a>
                      <a
                        href={`/admin/venues/${encodeURIComponent(venue.venue_id)}`}
                        target="_blank"
                        rel="noreferrer"
                        style={{ fontSize: 12 }}
                      >
                        Edit
                      </a>
                      <button
                        onClick={() => deleteVenue(venue)}
                        disabled={deletingVenueId === venue.venue_id}
                        style={{
                          padding: "4px 8px",
                          borderRadius: 6,
                          border: "1px solid #ef4444",
                          color: "#b91c1c",
                          background: "#fff",
                          fontWeight: 700,
                        }}
                      >
                        {deletingVenueId === venue.venue_id ? "Deleting..." : "Delete"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div style={{ border: "1px solid #ddd", padding: 16, borderRadius: 8, maxWidth: 780 }}>
          <h2 style={{ marginTop: 0 }}>Venue Search</h2>
          <div style={{ display: "grid", gap: 8, maxWidth: 520 }}>
            <label>
              <div>Search (name, address, city, state)</div>
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Start typing a venue..."
                style={{ width: "100%" }}
              />
            </label>
            <button onClick={searchVenues} disabled={searching}>
              {searching ? "Searching…" : "Search"}
            </button>
            {searchError && <div style={{ color: "red" }}>{searchError}</div>}
          </div>

          {hasSearched && !searching && searchResults.length === 0 && !searchError && (
            <div style={{ marginTop: 12, color: "#555" }}>No venues found.</div>
          )}

          {searchResults.length > 0 && (
            <div style={{ marginTop: 16, display: "grid", gap: 8 }}>
              {searchResults.map((venue) => {
                const locationParts = [venue.city, venue.state].filter(Boolean).join(", ");
                const venueLabel = venue.name || "Unnamed venue";
                const idDisplay = truncateId(venue.venue_id);
                return (
                  <div
                    key={venue.venue_id}
                    style={{
                      border: "1px solid #e1e4e8",
                      borderRadius: 6,
                      padding: 10,
                      display: "grid",
                      gap: 4,
                    }}
                  >
                    <div style={{ fontWeight: 600 }}>{venueLabel}</div>
                    <div style={{ color: "#444", overflowWrap: "anywhere" }}>
                      {locationParts || "City/state unknown"}
                      {venue.street ? ` — ${venue.street}` : ""}
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <span style={{ fontFamily: "monospace", fontSize: 12 }}>{idDisplay}</span>
                      <button onClick={() => handleCopy(venue.venue_id)} style={{ padding: "4px 8px" }}>
                        {copiedVenueId === venue.venue_id ? "Copied" : "Copy ID"}
                      </button>
                      <button onClick={() => handleUseVenue(venue)} style={{ padding: "4px 8px" }}>
                        Use
                      </button>
                      <button
                        onClick={() => deleteVenue(venue)}
                        disabled={deletingVenueId === venue.venue_id}
                        style={{
                          padding: "4px 8px",
                          borderRadius: 6,
                          border: "1px solid #ef4444",
                          color: "#b91c1c",
                          background: "#fff",
                          fontWeight: 700,
                        }}
                      >
                        {deletingVenueId === venue.venue_id ? "Deleting..." : "Delete"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div style={{ border: "1px solid #ddd", padding: 16, borderRadius: 8, maxWidth: 560 }}>
          <h2 style={{ marginTop: 0 }}>Generate Owl&apos;s Eye</h2>
          <div style={{ display: "grid", gap: 12 }}>
            <label>
              <div>Venue ID (UUID)</div>
              <input
                value={venueId}
                onChange={(e) => setVenueId(e.target.value)}
                placeholder="uuid"
                style={{ width: "100%" }}
              />
            </label>
            {venueId && (
              <div style={{ display: "grid", gap: 6 }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>Public map URL</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <input
                    value={tiVenueMapUrl(venueId)}
                    readOnly
                    style={{
                      flex: "1 1 220px",
                      minWidth: 220,
                      padding: "8px 10px",
                      borderRadius: 8,
                      border: "1px solid #e5e7eb",
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => navigator.clipboard.writeText(tiVenueMapUrl(venueId))}
                    style={{
                      padding: "8px 12px",
                      borderRadius: 8,
                      border: "1px solid #e5e7eb",
                      background: "#f8fafc",
                      cursor: "pointer",
                    }}
                  >
                    Copy
                  </button>
                  <a
                    href={tiVenueMapUrl(venueId)}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      padding: "8px 12px",
                      borderRadius: 8,
                      border: "1px solid #e5e7eb",
                      background: "#fff",
                      textDecoration: "none",
                    }}
                  >
                    Open
                  </a>
                </div>
              </div>
            )}

            <label>
              <div>Sport</div>
              <select value={sport} onChange={(e) => setSport(e.target.value as Sport)} style={{ width: "100%" }}>
                {SPORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <div>Published Map URL (optional)</div>
              <input
                value={mapUrl}
                onChange={(e) => setMapUrl(e.target.value)}
                placeholder="https://example.com/map.pdf"
                style={{ width: "100%" }}
              />
            </label>

            <button onClick={() => startRun(false)} disabled={runStatus === "running"}>
              {runStatus === "running" ? "Running…" : "Run Owl's Eye"}
            </button>
            {runMessage && (
              <div style={{ color: runStatus === "error" ? "red" : "green" }}>
                {runMessage}
              </div>
            )}
            {duplicateCandidates.length > 0 ? (
              <div
                style={{
                  border: "1px solid #f59e0b",
                  background: "#fffbeb",
                  borderRadius: 8,
                  padding: 10,
                  display: "grid",
                  gap: 8,
                }}
              >
                <div style={{ fontWeight: 700, color: "#92400e" }}>
                  Possible duplicate venue(s) found
                </div>
                <div style={{ fontSize: 12, color: "#7c2d12" }}>
                  Suggested merge target:{" "}
                  <code style={{ fontSize: 12 }}>
                    {mergeTargetId || duplicateCandidates[0]?.venue_id || "none"}
                  </code>
                </div>
                {duplicateCandidates.map((candidate) => (
                  <div
                    key={`dup-${candidate.venue_id}`}
                    style={{
                      border: "1px solid #fde68a",
                      borderRadius: 8,
                      padding: 8,
                      display: "grid",
                      gap: 6,
                      background: "#fff",
                    }}
                  >
                    <div style={{ fontWeight: 700 }}>{candidate.name || candidate.venue_id}</div>
                    <div style={{ fontSize: 12, color: "#444", overflowWrap: "anywhere" }}>
                      {[candidate.address, candidate.city, candidate.state, candidate.zip].filter(Boolean).join(" • ")}
                    </div>
                    <div style={{ fontSize: 12, color: "#374151" }}>
                      Match score {candidate.score}
                      {candidate.has_owl_runs ? ` • Owl's Eye runs: ${candidate.owl_run_count}` : ""}
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button
                        type="button"
                        onClick={() =>
                          handleUseVenue({
                            venue_id: candidate.venue_id,
                            name: candidate.name,
                            street: candidate.address,
                            city: candidate.city,
                            state: candidate.state,
                            zip: candidate.zip,
                            sport: sport,
                          })
                        }
                        style={{ padding: "6px 10px" }}
                      >
                        Use this venue
                      </button>
                      <a
                        href={`/admin/venues/${candidate.venue_id}`}
                        target="_blank"
                        rel="noreferrer"
                        style={{ padding: "6px 10px", border: "1px solid #d1d5db", borderRadius: 6, textDecoration: "none" }}
                      >
                        Open venue
                      </a>
                    </div>
                  </div>
                ))}
                <div>
                  <button
                    type="button"
                    onClick={mergeSuggestedAndRun}
                    disabled={mergeAndRunBusy || runStatus === "running"}
                    style={{ padding: "6px 10px", fontWeight: 700, marginRight: 8 }}
                  >
                    {mergeAndRunBusy ? "Merging + running..." : "Merge into suggested target + run"}
                  </button>
                  <button type="button" onClick={() => startRun(true)} style={{ padding: "6px 10px", fontWeight: 700 }}>
                    Run anyway for current venue
                  </button>
                </div>
              </div>
            ) : null}
          </div>

          {runReport && (
            <div ref={runReportRef} style={{ marginTop: 16 }}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>Run response</div>
              <pre style={{ background: "#f6f8fa", padding: 12, overflowX: "auto" }}>
                {JSON.stringify(
                  {
                    ...runReport,
                    nearby_meta: runReport.nearby_meta
                      ? Object.fromEntries(Object.entries(runReport.nearby_meta).filter(([k]) => k !== "rawDebug"))
                      : runReport.nearby_meta,
                  },
                  null, 2
                )}
              </pre>

              {mapImageUrl && (
                <div style={{ marginTop: 14 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                    <div style={{ fontWeight: 600 }}>Field map</div>
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(mapImageUrl);
                          setRunMessage("Map URL copied");
                        } catch (err) {
                          setRunMessage(err instanceof Error ? err.message : "Copy failed");
                          setRunStatus("error");
                        }
                      }}
                      style={{
                        padding: "6px 10px",
                        borderRadius: 8,
                        border: "1px solid #e5e7eb",
                        background: "#f8fafc",
                        cursor: "pointer",
                      }}
                    >
                      Copy map URL
                    </button>
                    <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13 }}>
                      <input
                        type="checkbox"
                        checked={sunPathEnabled}
                        onChange={(e) => setSunPathEnabled(e.target.checked)}
                      />
                      Sun path overlay
                    </label>
                  </div>
                  <div
                    style={{
                      position: "relative",
                      display: "inline-block",
                      maxWidth: "100%",
                    }}
                  >
                    <img
                      src={mapImageUrl}
                      alt="Field map artifact"
                      style={{ maxWidth: "100%", display: "block", border: "1px solid #ccc" }}
                    />
                    <SunPathOverlay north={mapNorth} enabled={sunPathEnabled} />
                    <OwlsEyeBrandingOverlay />
                  </div>
                </div>
              )}

              <div style={{ marginTop: 16 }}>
                {(runReport?.airports?.nearest_airport || runReport?.airports?.nearest_major_airport) && (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontWeight: 600, marginBottom: 10 }}>Airports</div>
                    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                      {renderAirportSummary("Nearest airport", runReport?.airports?.nearest_airport)}
                      {renderAirportSummary("Nearest major airport", runReport?.airports?.nearest_major_airport)}
                    </div>
                  </div>
                )}
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <div style={{ fontWeight: 600 }}>Nearby</div>
                  {runReport?.nearby_meta?.message && (
                    <span style={{ fontSize: 12, color: "#4b5563" }}>
                      Status: {runReport.nearby_meta.message}
                      {runReport.nearby_meta.foodCount != null ||
                      runReport.nearby_meta.coffeeCount != null ||
                      runReport.nearby_meta.hotelCount != null
                        ? ` (food ${runReport.nearby_meta.foodCount ?? 0}, coffee ${runReport.nearby_meta.coffeeCount ?? 0}, hotels ${runReport.nearby_meta.hotelCount ?? 0})`
                        : ""}
                    </span>
                  )}
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      type="button"
                      onClick={() => setNearbyTab("food")}
                      style={{
                        padding: "8px 12px",
                        borderRadius: 999,
                        border: "1px solid #111",
                        background: nearbyTab === "food" ? "#111" : "#fff",
                        color: nearbyTab === "food" ? "#fff" : "#111",
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      Food
                    </button>
                    <button
                      type="button"
                      onClick={() => setNearbyTab("coffee")}
                      style={{
                        padding: "8px 12px",
                        borderRadius: 999,
                        border: "1px solid #111",
                        background: nearbyTab === "coffee" ? "#111" : "#fff",
                        color: nearbyTab === "coffee" ? "#fff" : "#111",
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      Coffee
                    </button>
                    <button
                      type="button"
                      onClick={() => setNearbyTab("hotels")}
                      style={{
                        padding: "8px 12px",
                        borderRadius: 999,
                        border: "1px solid #111",
                        background: nearbyTab === "hotels" ? "#111" : "#fff",
                        color: nearbyTab === "hotels" ? "#fff" : "#111",
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      Hotels
                    </button>
                  </div>
                  {runReport?.runId && (
                    <button
                      type="button"
                      onClick={refreshNearby}
                      style={{
                        padding: "8px 12px",
                        borderRadius: 8,
                        border: "1px solid #e5e7eb",
                        background: "#f8fafc",
                        cursor: "pointer",
                      }}
                    >
                      Refresh Nearby
                    </button>
                  )}
                </div>
                <div style={{ marginTop: 10 }}>
                  {nearbyTab === "food"
                    ? renderNearbyList(runReport.nearby?.food, "food")
                    : nearbyTab === "coffee"
                    ? renderNearbyList(runReport.nearby?.coffee, "coffee")
                    : renderNearbyList(runReport.nearby?.hotels, "hotels")}
                </div>
                {runReport?.nearby_meta && (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#111" }}>Nearby debug</div>
                    <pre style={{ background: "#f6f8fa", padding: 10, borderRadius: 8, fontSize: 12, overflowX: "auto" }}>
                      {JSON.stringify(
                        Object.fromEntries(
                          Object.entries(runReport.nearby_meta).filter(([k]) => k !== "rawDebug")
                        ),
                        null, 2
                      )}
                    </pre>
                  </div>
                )}

                {runReport?.nearby_meta?.rawDebug?.queries && runReport.nearby_meta.rawDebug.queries.length > 0 && (
                  <div style={{ marginTop: 14 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#111", marginBottom: 8 }}>
                      Raw search results — all places returned from API
                    </div>
                    <div style={{ display: "grid", gap: 8 }}>
                      {runReport.nearby_meta.rawDebug.queries.map((q, qi) => {
                        const isExpanded = expandedDebugQueries.has(qi);
                        const radiusMi = (q.radius_meters / 1609.34).toFixed(1);
                        const providerBadgeColor = q.provider === "foursquare" ? "#f94f6d" : q.provider === "google_fallback" ? "#f59e0b" : "#1a73e8";
                        const providerLabel = q.provider === "foursquare" ? "Foursquare" : q.provider === "google_fallback" ? "Google (fallback)" : "Google";
                        const rejectedCount = q.result_count - q.kept_count;
                        return (
                          <div
                            key={qi}
                            style={{ border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden", background: "#fff" }}
                          >
                            <button
                              type="button"
                              onClick={() => {
                                setExpandedDebugQueries((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(qi)) next.delete(qi);
                                  else next.add(qi);
                                  return next;
                                });
                              }}
                              style={{
                                width: "100%",
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                                padding: "8px 12px",
                                background: "#f8fafc",
                                border: "none",
                                borderBottom: isExpanded ? "1px solid #e5e7eb" : "none",
                                cursor: "pointer",
                                textAlign: "left",
                                flexWrap: "wrap",
                              }}
                            >
                              <span style={{ fontSize: 11, fontWeight: 700, color: "#fff", background: providerBadgeColor, padding: "2px 6px", borderRadius: 4 }}>
                                {providerLabel}
                              </span>
                              <span style={{ fontSize: 13, fontWeight: 700, color: "#111" }}>{q.category}</span>
                              {q.weak && (
                                <span style={{ fontSize: 11, color: "#92400e", background: "#fef3c7", padding: "2px 6px", borderRadius: 4, fontWeight: 700 }}>
                                  weak{q.weak_reason ? `: ${q.weak_reason}` : ""}
                                </span>
                              )}
                              <span style={{ fontSize: 12, color: "#6b7280" }}>{radiusMi} mi radius</span>
                              <span style={{ fontSize: 12, color: "#374151" }}>
                                <span style={{ color: "#16a34a", fontWeight: 700 }}>{q.kept_count} kept</span>
                                {rejectedCount > 0 && (
                                  <span style={{ color: "#dc2626" }}> · {rejectedCount} rejected</span>
                                )}
                                <span style={{ color: "#6b7280" }}> / {q.result_count} total</span>
                              </span>
                              <span style={{ marginLeft: "auto", fontSize: 12, color: "#6b7280" }}>{isExpanded ? "▲" : "▼"}</span>
                            </button>

                            {isExpanded && (
                              <div style={{ padding: "10px 12px" }}>
                                {q.category_ids && q.category_ids.length > 0 && (
                                  <div style={{ marginBottom: 8, display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
                                    <span style={{ fontSize: 11, color: "#6b7280", fontWeight: 700 }}>Category IDs:</span>
                                    {q.category_ids.map((id) => (
                                      <code key={id} style={{ fontSize: 10, background: "#f3f4f6", padding: "1px 5px", borderRadius: 3, color: "#374151" }}>{id}</code>
                                    ))}
                                  </div>
                                )}
                                {q.items.length === 0 ? (
                                  <div style={{ fontSize: 12, color: "#6b7280" }}>No results returned.</div>
                                ) : (
                                  <div style={{ display: "grid", gap: 6 }}>
                                    {q.items.map((item, ii) => (
                                      <div
                                        key={ii}
                                        style={{
                                          borderLeft: `3px solid ${item.kept ? "#16a34a" : "#dc2626"}`,
                                          paddingLeft: 8,
                                          paddingTop: 4,
                                          paddingBottom: 4,
                                          background: item.kept ? "#f0fdf4" : "#fef2f2",
                                          borderRadius: "0 6px 6px 0",
                                        }}
                                      >
                                        <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
                                          <span style={{ fontSize: 13, fontWeight: 700, color: "#111" }}>{item.name}</span>
                                          <span style={{ fontSize: 11, color: "#6b7280" }}>{(item.distance_meters / 1609.34).toFixed(1)} mi</span>
                                          {item.strong_match && (
                                            <span style={{ fontSize: 10, color: "#fff", background: "#7c3aed", padding: "1px 5px", borderRadius: 3, fontWeight: 700 }}>strong match</span>
                                          )}
                                          {!item.kept && item.reject_reason && (
                                            <span style={{ fontSize: 10, color: "#b91c1c", background: "#fee2e2", padding: "1px 5px", borderRadius: 3, fontWeight: 700 }}>{item.reject_reason}</span>
                                          )}
                                        </div>
                                        {item.address && (
                                          <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>{item.address}</div>
                                        )}
                                        {item.fsq_categories && item.fsq_categories.length > 0 && (
                                          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 3 }}>
                                            {item.fsq_categories.map((cat, ci) => (
                                              <span key={ci} style={{ fontSize: 10, color: "#374151", background: "#f3f4f6", padding: "1px 5px", borderRadius: 3 }}>
                                                {cat.name}
                                              </span>
                                            ))}
                                          </div>
                                        )}
                                        {item.reason_tags && item.reason_tags.length > 0 && (
                                          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 3 }}>
                                            {item.reason_tags.map((tag, ti) => (
                                              <span key={ti} style={{ fontSize: 10, color: "#065f46", background: "#d1fae5", padding: "1px 5px", borderRadius: 3 }}>{tag}</span>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                <div style={{ marginTop: 12, fontSize: 12, color: "#4b5563", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <svg width="32" height="10" viewBox="0 0 32 10" style={{ opacity: 0.6 }}>
                    <defs>
                      <marker
                        id="sunpath-legend-arrowhead"
                        markerWidth="6"
                        markerHeight="6"
                        refX="3"
                        refY="3"
                        orient="auto"
                        markerUnits="strokeWidth"
                      >
                        <path d="M0,0 L6,3 L0,6 z" fill="#111" />
                      </marker>
                    </defs>
                    <line
                      x1={2}
                      y1={5}
                      x2={28}
                      y2={5}
                      stroke="#111"
                      strokeWidth={2}
                      markerEnd="url(#sunpath-legend-arrowhead)"
                    />
                  </svg>
                  <div>
                    <div>Sun path (E → W) — general direction only</div>
                    <div>Use North arrow for orientation; sun varies by time of day/season</div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
