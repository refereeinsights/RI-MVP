import type { SupabaseClient } from "@supabase/supabase-js";
import { isUuid } from "@/lib/venues/isUuid";
import { resolvePlannerVenueMatches } from "@/lib/planner/venueResolution";
import {
  DEFAULT_MAX_SCHEDULE_EVENTS,
  DEFAULT_SCHEDULE_WINDOW_FUTURE_DAYS,
  DEFAULT_SCHEDULE_WINDOW_PAST_DAYS,
  normalizeIcsSchedule,
  sanitizeScheduleNotes,
  type NormalizedScheduleEvent,
} from "../../../../packages/lib/sports-schedule";
import {
  fetchIcsSchedule,
  validateScheduleUrl,
  type ScheduleFetchError,
} from "../../../../packages/lib/sports-schedule/server";

const MAX_EVENTS_PER_SYNC = DEFAULT_MAX_SCHEDULE_EVENTS;
const EVENT_WINDOW_PAST_DAYS = DEFAULT_SCHEDULE_WINDOW_PAST_DAYS;
const EVENT_WINDOW_FUTURE_DAYS = DEFAULT_SCHEDULE_WINDOW_FUTURE_DAYS;

export type IcsImportInput = {
  userId: string;
  sourceUrl: string;
  sourceName: string | null;
  teamName: string | null;
  childProfileId?: string | null;
  teamProfileId?: string | null;
  mode: "import" | "refresh";
  sourceId?: string;
};

export type IcsImportResult = {
  ok: true;
  sourceId: string;
  sourceName: string | null;
  imported: number;
  updated: number;
  changed: number;
  skipped: number;
  errors: string[];
  parsedTotal: number;
  inWindowTotal: number;
  changedEvents?: { id: string; title: string; changes: ("time" | "location" | "title" | "team" | "timezone")[] }[];
} | { ok: false; status: number; error: string };

function logSupabaseError(context: string, err: unknown) {
  const e = err as any;
  const code = e?.code ?? null;
  const message = e?.message ? String(e.message) : null;
  const details = e?.details ? String(e.details) : null;
  const hint = e?.hint ? String(e.hint) : null;
  // Do not log user-provided URLs or full row payloads here.
  // We only log minimal error metadata so production logs can diagnose RLS/constraints/schema drift.
  console.error(`[planner][ics-import] ${context}`, { code, message, details, hint });
}

function genericImportFailure() {
  return "We couldn’t import that calendar right now. Please try again.";
}

function currentImportWindow(now = new Date()) {
  return {
    windowStart: addDays(now, -EVENT_WINDOW_PAST_DAYS),
    windowEnd: addDays(now, EVENT_WINDOW_FUTURE_DAYS),
  };
}

function clamp(value: string | null, maxLen: number) {
  const v = String(value ?? "").trim();
  if (!v) return null;
  return v.length > maxLen ? v.slice(0, maxLen) : v;
}

export function userSafeError(kind: ScheduleFetchError | "no_events") {
  if (kind === "invalid_url") return "Enter a valid iCal/ICS calendar URL.";
  if (kind === "unsupported_protocol") return "Calendar links must start with http:// or https://.";
  if (kind === "private_url") return "That calendar link cannot point to a private or local address.";
  if (kind === "fetch_failed") return "That calendar link could not be reached.";
  if (kind === "not_ics") return "That link does not appear to be an iCal/ICS calendar.";
  if (kind === "too_large") return "That calendar is too large to import right now.";
  return "No upcoming events were found in that calendar.";
}

function addDays(d: Date, days: number) {
  return new Date(d.getTime() + days * 24 * 60 * 60 * 1000);
}

type NormalizedPlannerEvent = {
  title: string;
  starts_at: string;
  ends_at: string | null;
  timezone: string | null;
  notes: string | null;
  address_text: string | null;
  field_label: string | null;
  team_name: string | null;
  source_event_uid: string;
};

export function sanitizeImportedNotes(rawNotes: string | null | undefined) {
  return sanitizeScheduleNotes(rawNotes) ?? "";
}

export function normalizeIcsEvents(params: {
  icsText: string;
  sourceUrl: string;
  teamName: string | null;
}) {
  const normalized = normalizeIcsSchedule({
    icsText: params.icsText,
    sourceUrl: params.sourceUrl,
  });
  const teamName = clamp(params.teamName, 80);
  const events: NormalizedPlannerEvent[] = normalized.events.map((event: NormalizedScheduleEvent) => ({
    title: event.title,
    starts_at: event.startsAt,
    ends_at: event.endsAt,
    timezone: event.timezone,
    notes: event.notes,
    address_text: event.location,
    field_label: event.fieldLabel,
    team_name: teamName,
    source_event_uid: event.sourceEventUid,
  }));
  return {
    events,
    canceledSourceEventUids: normalized.canceledSourceEventUids,
    errors: normalized.errors.map(userSafeError),
    parsedTotal: normalized.parsedTotal,
  };
}

async function loadExistingEventsByUid(params: { supabase: SupabaseClient; userId: string; sourceId: string; uids: string[] }) {
  if (!params.uids.length) return new Map<string, {
    id: string;
    title: string | null;
    starts_at: string | null;
    ends_at: string | null;
    timezone: string | null;
    address_text: string | null;
    field_label: string | null;
    team_name: string | null;
    venue_id: string | null;
  }>();
  const { data, error } = await (params.supabase.from("planner_events" as any) as any)
    .select("id,source_event_uid,title,starts_at,ends_at,timezone,address_text,field_label,team_name,venue_id")
    .eq("user_id", params.userId)
    .eq("source_id", params.sourceId)
    .in("source_event_uid", params.uids.slice(0, MAX_EVENTS_PER_SYNC))
    .limit(params.uids.length);
  if (error) return new Map();
  const byUid = new Map<string, {
    id: string;
    title: string | null;
    starts_at: string | null;
    ends_at: string | null;
    timezone: string | null;
    address_text: string | null;
    field_label: string | null;
    team_name: string | null;
    venue_id: string | null;
  }>();
  (data ?? []).forEach((r: any) => {
    const v = String(r?.source_event_uid ?? "").trim();
    if (!v) return;
    byUid.set(v, {
      id: String(r?.id ?? ""),
      title: r?.title ?? null,
      starts_at: r?.starts_at ?? null,
      ends_at: r?.ends_at ?? null,
      timezone: r?.timezone ?? null,
      address_text: r?.address_text ?? null,
      field_label: r?.field_label ?? null,
      team_name: r?.team_name ?? null,
      venue_id: r?.venue_id ?? null,
    });
  });
  return byUid;
}

export function findStaleSourceEventIds(
  rows: Array<{ id?: unknown; source_event_uid?: unknown }>,
  keepUids: string[],
) {
  const keepSet = new Set(keepUids);
  return rows
    .filter((row) => {
      const uid = String(row?.source_event_uid ?? "").trim();
      return uid && !keepSet.has(uid);
    })
    .map((row) => String(row?.id ?? "").trim())
    .filter(Boolean);
}

async function pruneMissingSourceEvents(params: {
  supabase: SupabaseClient;
  userId: string;
  sourceId: string;
  keepUids: string[];
}) {
  const { windowStart, windowEnd } = currentImportWindow();
  const { data, error } = await (params.supabase.from("planner_events" as any) as any)
    .select("id,source_event_uid")
    .eq("user_id", params.userId)
    .eq("source_id", params.sourceId)
    .eq("source_type", "ics")
    .gte("starts_at", windowStart.toISOString())
    .lte("starts_at", windowEnd.toISOString())
    .limit(MAX_EVENTS_PER_SYNC);
  if (error) {
    logSupabaseError("select stale planner_events during refresh failed", error);
    return { ok: false as const };
  }

  const staleIds = findStaleSourceEventIds((data ?? []) as any[], params.keepUids);

  if (!staleIds.length) return { ok: true as const };

  const { error: deleteError } = await (params.supabase.from("planner_events" as any) as any)
    .delete()
    .in("id", staleIds)
    .eq("user_id", params.userId);
  if (deleteError) {
    logSupabaseError("delete stale planner_events during refresh failed", deleteError);
    return { ok: false as const };
  }
  return { ok: true as const };
}

export async function importIcsToPlanner(params: {
  supabase: SupabaseClient;
  input: IcsImportInput;
}): Promise<IcsImportResult> {
  const { supabase, input } = params;
  if (!isUuid(input.userId)) return { ok: false, status: 400, error: userSafeError("invalid_url") };

  const validated = validateScheduleUrl(input.sourceUrl);
  if (!validated.ok) return { ok: false, status: 400, error: userSafeError(validated.error) };

  const fetched = await fetchIcsSchedule(validated.url);
  if (!fetched.ok) return { ok: false, status: 400, error: userSafeError(fetched.error) };
  if (!String(fetched.finalUrl ?? "").trim()) {
    console.error("[planner][ics-import] unexpected empty finalUrl after fetch");
    return { ok: false, status: 500, error: genericImportFailure() };
  }

  const normalized = normalizeIcsEvents({
    icsText: fetched.text,
    sourceUrl: fetched.finalUrl,
    teamName: input.teamName,
  });

  const usableEvents = normalized.events;
  const canceledSourceEventUids = normalized.canceledSourceEventUids ?? [];
  const parsedTotal = normalized.parsedTotal;
  const inWindowTotal = usableEvents.length;

  if (parsedTotal === 0 && usableEvents.length === 0 && normalized.errors.length) {
    // Parsing failed (or yielded no usable VEVENTs). Treat as non-ICS content for user messaging.
    return { ok: false, status: 400, error: userSafeError("not_ics") };
  }

  if (input.mode === "import" && usableEvents.length === 0) {
    return { ok: false, status: 400, error: userSafeError("no_events") };
  }

  // Find-or-create source (atomic via unique index).
  const requestedSourceName = clamp(input.sourceName, 100);
  const requestedTeamName = clamp(input.teamName, 80);
  let finalSourceName = requestedSourceName;
  let finalTeamName = requestedTeamName;
  let finalChildProfileId = input.childProfileId ?? null;
  let finalTeamProfileId = input.teamProfileId ?? null;

  const sourceId = input.sourceId ? String(input.sourceId).trim() : "";
  if (input.sourceId && !isUuid(sourceId)) return { ok: false, status: 400, error: "invalid_source_id" };

  // Imports create/upsert the source row; refresh uses an existing source row and is updated by refreshIcsSource.
  let finalSourceId = sourceId;
  if (!finalSourceId) {
    const existing = await (supabase.from("planner_event_sources" as any) as any)
      .select("id,source_name,team_name,child_profile_id,team_profile_id")
      .eq("user_id", input.userId)
      .eq("source_type", "ics")
      .eq("source_url", fetched.finalUrl)
      .maybeSingle();

    if (existing.error) {
      logSupabaseError("select planner_event_sources before import failed", existing.error);
      return { ok: false, status: 500, error: genericImportFailure() };
    }

    const existingSourceName = existing.data?.source_name ? String(existing.data.source_name).trim() : "";
    const existingTeamName = existing.data?.team_name ? String(existing.data.team_name).trim() : "";
    const existingChildProfileId = existing.data?.child_profile_id ? String(existing.data.child_profile_id).trim() : null;
    const existingTeamProfileId = existing.data?.team_profile_id ? String(existing.data.team_profile_id).trim() : null;

    finalSourceName = requestedSourceName || (existingSourceName ? existingSourceName.slice(0, 100) : null);
    finalTeamName = requestedTeamName || (existingTeamName ? existingTeamName.slice(0, 80) : null);
    finalChildProfileId = input.childProfileId === undefined ? existingChildProfileId : input.childProfileId ?? null;
    finalTeamProfileId = input.teamProfileId === undefined ? existingTeamProfileId : input.teamProfileId ?? null;

    const upsertSource = await (supabase.from("planner_event_sources" as any) as any)
      .upsert(
        {
          user_id: input.userId,
          source_type: "ics",
          source_name: finalSourceName,
          source_url: fetched.finalUrl,
          team_name: finalTeamName,
          child_profile_id: finalChildProfileId,
          team_profile_id: finalTeamProfileId,
          sync_status: "success",
          sync_error: null,
          last_synced_at: new Date().toISOString(),
        },
        { onConflict: "user_id,source_type,source_url" }
      )
      .select("id,source_name")
      .single();

    if (upsertSource.error || !upsertSource.data?.id) {
      if (upsertSource.error) logSupabaseError("upsert planner_event_sources failed", upsertSource.error);
      return { ok: false, status: 500, error: genericImportFailure() };
    }
    finalSourceId = String(upsertSource.data.id);
  }

  const usableSourceUids = usableEvents
    .map((event) => String(event.source_event_uid ?? "").trim())
    .filter(Boolean)
    .slice(0, MAX_EVENTS_PER_SYNC);

  if (input.mode === "refresh") {
    const pruneResult = await pruneMissingSourceEvents({
      supabase,
      userId: input.userId,
      sourceId: finalSourceId,
      keepUids: usableSourceUids,
    });
    if (!pruneResult.ok) {
      return { ok: false, status: 500, error: genericImportFailure() };
    }
  }

  const existingEventsByUid = await loadExistingEventsByUid({
    supabase,
    userId: input.userId,
    sourceId: finalSourceId,
    uids: usableSourceUids,
  });

  const venueMatchesByUid = await resolvePlannerVenueMatches(
    supabase,
    usableEvents.map((event) => ({
      id: String(event.source_event_uid ?? "").trim(),
      address_text: event.address_text,
      city: null,
      state: null,
    })),
  );

  const newEvents: NormalizedPlannerEvent[] = [];
  const existingEvents: NormalizedPlannerEvent[] = [];
  for (const e of usableEvents) {
    if (!e.source_event_uid) continue; // should never happen
    if (existingEventsByUid.has(e.source_event_uid)) existingEvents.push(e);
    else newEvents.push(e);
  }

  let imported = 0;
  let updated = 0;
  let skipped = Math.max(0, parsedTotal - inWindowTotal);
  let changed = 0;
  const changedEvents: { id: string; title: string; changes: ("time" | "location" | "title" | "team" | "timezone")[] }[] = [];

  // Inserts include notes (if provided)
  if (newEvents.length) {
    const inserts = newEvents.slice(0, MAX_EVENTS_PER_SYNC).map((e) => ({
      user_id: input.userId,
      title: e.title,
      event_type: "game",
      starts_at: e.starts_at,
      ends_at: e.ends_at,
      timezone: e.timezone,
      notes: e.notes,
      address_text: e.address_text,
      field_label: e.field_label,
      team_name: e.team_name,
      venue_id: venueMatchesByUid.get(e.source_event_uid) ?? null,
      source_type: "ics",
      source_id: finalSourceId,
      source_event_uid: e.source_event_uid,
    }));
    const res = await (supabase.from("planner_events" as any) as any).insert(inserts);
    if (res.error) {
      // Handle rare race where the same UID is inserted concurrently (unique index enforced).
      const code = String((res.error as any).code ?? "");
      if (code === "23505") {
        for (const e of inserts) {
          const matchedVenueId = e.venue_id ? String(e.venue_id).trim() : "";
          const patch = {
            title: e.title,
            starts_at: e.starts_at,
            ends_at: e.ends_at,
            timezone: e.timezone,
            address_text: e.address_text,
            field_label: e.field_label,
            team_name: e.team_name,
            ...(matchedVenueId ? { venue_id: matchedVenueId } : {}),
            source_type: "ics",
          };
          const u = await (supabase.from("planner_events" as any) as any)
            .update(patch)
            .eq("user_id", input.userId)
            .eq("source_id", finalSourceId)
            .eq("source_event_uid", e.source_event_uid);
          if (u.error) {
            logSupabaseError("update planner_events after insert unique violation failed", u.error);
            return { ok: false, status: 500, error: genericImportFailure() };
          }
          updated += 1;
        }
      } else {
        logSupabaseError("insert planner_events failed", res.error);
        return { ok: false, status: 500, error: genericImportFailure() };
      }
    } else {
      imported += inserts.length;
    }
  }

  // Updates exclude notes and protected fields
  if (existingEvents.length) {
    for (const e of existingEvents.slice(0, MAX_EVENTS_PER_SYNC)) {
      const uid = String(e.source_event_uid || "").trim();
      const prev = uid ? existingEventsByUid.get(uid) : null;
      if (input.mode === "refresh") {
        if (prev) {
          const changeLabels: ("time" | "location" | "title" | "team" | "timezone")[] = [];
          if ((prev.title ?? null) !== (e.title ?? null)) changeLabels.push("title");
          if ((prev.starts_at ?? null) !== (e.starts_at ?? null) || (prev.ends_at ?? null) !== (e.ends_at ?? null)) changeLabels.push("time");
          if ((prev.address_text ?? null) !== (e.address_text ?? null) || (prev.field_label ?? null) !== (e.field_label ?? null)) {
            changeLabels.push("location");
          }
          if ((prev.team_name ?? null) !== (e.team_name ?? null)) changeLabels.push("team");
          if ((prev.timezone ?? null) !== (e.timezone ?? null)) changeLabels.push("timezone");

          if (changeLabels.length) {
            changed += 1;
            if (changedEvents.length < 5) {
              changedEvents.push({
                id: prev.id,
                title: String(e.title || prev.title || "Event"),
                changes: Array.from(new Set(changeLabels)),
              });
            }
          }
        }
      }

      const patch = {
        title: e.title,
        starts_at: e.starts_at,
        ends_at: e.ends_at,
        timezone: e.timezone,
        address_text: e.address_text,
        field_label: e.field_label,
        team_name: e.team_name,
        ...(prev && !String(prev.venue_id ?? "").trim() && venueMatchesByUid.get(uid)
          ? { venue_id: venueMatchesByUid.get(uid) ?? null }
          : {}),
        source_type: "ics",
      };
      const res = await (supabase.from("planner_events" as any) as any)
        .update(patch)
        .eq("user_id", input.userId)
        .eq("source_id", finalSourceId)
        .eq("source_event_uid", e.source_event_uid);
      if (res.error) {
        logSupabaseError("update planner_events failed", res.error);
        return { ok: false, status: 500, error: genericImportFailure() };
      }
      updated += 1;
    }
  }

  if (input.mode === "refresh" && canceledSourceEventUids.length) {
    skipped += canceledSourceEventUids.length;
  }

  // If refresh and no usable events, treat as success (calendar may have no upcoming items)
  if (input.mode === "refresh" && usableEvents.length === 0) {
    imported = 0;
    updated = 0;
    changed = 0;
    changedEvents.length = 0;
    skipped = parsedTotal;
  }

  return {
    ok: true,
    sourceId: finalSourceId,
    sourceName: finalSourceName,
    imported,
    updated,
    changed,
    skipped,
    errors: [],
    parsedTotal,
    inWindowTotal,
    ...(input.mode === "refresh" ? { changedEvents } : null),
  };
}

export async function refreshIcsSource(params: {
  supabase: SupabaseClient;
  userId: string;
  sourceId: string;
}): Promise<IcsImportResult> {
  if (!isUuid(params.userId) || !isUuid(params.sourceId)) {
    return { ok: false, status: 400, error: "invalid_source_id" };
  }

  const { data, error } = await (params.supabase.from("planner_event_sources" as any) as any)
    .select("id,source_url,source_name,team_name,source_type")
    .eq("id", params.sourceId)
    .eq("user_id", params.userId)
    .maybeSingle();

  if (error) {
    logSupabaseError("select planner_event_sources for refresh failed", error);
    return { ok: false, status: 500, error: genericImportFailure() };
  }
  if (!data || String((data as any).source_type ?? "") !== "ics") {
    return { ok: false, status: 404, error: "not_found" };
  }

  const sourceUrl = String((data as any).source_url ?? "").trim();
  const sourceName = clamp(String((data as any).source_name ?? ""), 100);
  const teamName = clamp(String((data as any).team_name ?? ""), 80);

  const result = await importIcsToPlanner({
    supabase: params.supabase,
    input: {
      userId: params.userId,
      sourceUrl,
      sourceName,
      teamName,
      mode: "refresh",
      sourceId: params.sourceId,
    },
  });

  // Update source sync status regardless of event counts (success path) and on error.
  // Only update last_synced_at on success so stale detection remains meaningful.
  if (result.ok) {
    await (params.supabase.from("planner_event_sources" as any) as any)
      .update({ sync_status: "success", sync_error: null, last_synced_at: new Date().toISOString() })
      .eq("id", params.sourceId)
      .eq("user_id", params.userId);
  } else {
    // Avoid writing unexpected internal messages to DB; keep this user-safe for UI display.
    const safeMsg = String(result.error || userSafeError("fetch_failed"));
    await (params.supabase.from("planner_event_sources" as any) as any)
      .update({ sync_status: "error", sync_error: safeMsg.slice(0, 200) })
      .eq("id", params.sourceId)
      .eq("user_id", params.userId);
  }

  return result.ok
    ? result
    : result.status === 404
      ? { ok: false, status: 404, error: "Source not found." }
      : { ok: false, status: result.status, error: result.error };
}
