import "server-only";

import { buildActivePlanningEventSourceFilter } from "./activePlanning";
import {
  acquireVendorCallSlot,
  CORRALIO_DAILY_EXTERNAL_CALL_CAP_PER_HOUSEHOLD,
  EVENT_GEOCODE_CAP_PER_MOUNT,
  type ExternalApiName,
  type ExternalErrorCode,
  type ExternalOperation,
  geocodeWithGeocodio,
  groupByNormalizedLocation,
  isRouteFresh,
  MAX_ROUTES_PER_MOUNT,
  normalizeLocationText,
  providerAuditRow,
  routeWithOpenRouteService,
  sanitizeOriginAddress,
  skippedAuditRow,
} from "./leaveBy";
import { matchPersistedCorralioEventIds } from "./venueMatching.server";
import { createCorralioSupabaseAdminClient } from "./supabase/server";
import { getWeekendCandidateWindow } from "./weekend";

type AdminClient = ReturnType<typeof createCorralioSupabaseAdminClient>;

type EventLocationRow = {
  id: string;
  source_location_text: string | null;
  display_location_text: string | null;
  location_lat: number | null;
  location_lng: number | null;
  location_normalized: string | null;
  location_geocoded_at: string | null;
  location_geocode_failed_at: string | null;
  estimated_drive_minutes: number | null;
  route_distance_meters: number | null;
  route_provider: string | null;
  route_failed_at: string | null;
  leave_by_computed_at: string | null;
};

type NormalizedEventRow = EventLocationRow & { locationNormalized: string | null };

type AuditRow = ReturnType<typeof providerAuditRow>;

const EVENT_SELECT = "id,source_location_text,display_location_text,location_lat,location_lng,location_normalized,location_geocoded_at,location_geocode_failed_at,estimated_drive_minutes,route_distance_meters,route_provider,route_failed_at,leave_by_computed_at" as const;

export function requiredServerEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required server configuration: ${name}`);
  return value;
}

function currentTimestamp() {
  return new Date().toISOString();
}

function staleClaimTimestamp() {
  return new Date(Date.now() - 120_000).toISOString();
}

function asNormalizedRow(row: EventLocationRow): NormalizedEventRow {
  const rawLocation = row.source_location_text ?? row.display_location_text;
  return { ...row, locationNormalized: normalizeLocationText(rawLocation) };
}

export async function logCorralioExternalRows(admin: AdminClient, rows: AuditRow[]) {
  if (!rows.length) return;
  try {
    await admin.from("corralio_external_api_calls").insert(rows);
  } catch {
    // Cost logging is best effort and must never expose provider payloads.
  }
}

async function logSkip(
  admin: AdminClient,
  householdId: string,
  api: ExternalApiName,
  operation: ExternalOperation,
  errorCode: Extract<ExternalErrorCode,
    "household_result_reused" | "batch_duplicate_skipped" | "concurrent_claim_skipped" | "daily_cap_reached">,
  count = 1,
) {
  await logCorralioExternalRows(admin, Array.from({ length: count }, () => skippedAuditRow({
    householdId,
    api,
    operation,
    errorCode,
  })));
}

export async function reserveVendorCall(admin: AdminClient, householdId: string) {
  const { data, error } = await admin.rpc("corralio_reserve_external_call_v1", {
    p_household_id: householdId,
    p_cap: CORRALIO_DAILY_EXTERNAL_CALL_CAP_PER_HOUSEHOLD,
  });
  return !error && data === true;
}

export async function logCorralioProviderResult(
  admin: AdminClient,
  input: {
    householdId: string;
    api: ExternalApiName;
    operation: ExternalOperation;
    result: { kind: string; errorCode?: ExternalErrorCode; latencyMs: number };
  },
) {
  await logCorralioExternalRows(admin, [providerAuditRow(input)]);
}

async function clearOriginClaim(admin: AdminClient, householdId: string, claimTimestamp: string) {
  await admin
    .from("corralio_households")
    .update({ origin_geocode_claimed_at: null })
    .eq("id", householdId)
    .eq("origin_geocode_claimed_at", claimTimestamp);
}

async function claimOrigin(admin: AdminClient, householdId: string, address: string) {
  const claimTimestamp = currentTimestamp();
  const attempt = async (availability: "unclaimed" | "stale") => {
    let query = admin
      .from("corralio_households")
      .update({ origin_geocode_claimed_at: claimTimestamp })
      .eq("id", householdId)
      .eq("origin_address", address)
      .is("origin_geocoded_at", null)
      .is("origin_geocode_failed_at", null);
    query = availability === "unclaimed"
      ? query.is("origin_geocode_claimed_at", null)
      : query.lt("origin_geocode_claimed_at", staleClaimTimestamp());
    const { data, error } = await query.select("id").maybeSingle();
    return !error && data?.id === householdId;
  };
  return (await attempt("unclaimed") || await attempt("stale"))
    ? claimTimestamp
    : null;
}

export async function saveHouseholdOrigin(input: {
  authenticatedClient: { rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }> };
  submittedAddress: string;
}): Promise<{ ok: boolean; message: string }> {
  const trimmed = input.submittedAddress.trim();
  if (trimmed.length > 100) {
    return { ok: false, message: "Enter a home address no longer than 100 characters." };
  }
  const address = trimmed ? sanitizeOriginAddress(trimmed) : null;
  if (trimmed && !address) {
    return { ok: false, message: "Enter a valid home address." };
  }

  const geocodioApiKey = address
    ? requiredServerEnvironment("GEOCODIO_API_KEY")
    : null;

  const { data: householdId, error } = await input.authenticatedClient.rpc(
    "corralio_prepare_household_origin_v1",
    { p_origin_address: address },
  );
  if (error || typeof householdId !== "string") {
    return { ok: false, message: "We couldn’t update your home address right now." };
  }
  if (!address) {
    return { ok: true, message: "Home address cleared. Leave-by estimates are off." };
  }

  const admin = createCorralioSupabaseAdminClient();
  const { data: preparedOrigin } = await admin.from("corralio_households")
    .select("origin_address,origin_geocoded_at,origin_geocode_failed_at")
    .eq("id", householdId)
    .maybeSingle();
  if (preparedOrigin?.origin_address !== address) {
    return { ok: false, message: "A newer home-address update replaced this request." };
  }
  if (preparedOrigin.origin_geocoded_at) {
    return { ok: true, message: "Home address saved. Leave-by estimates will appear for located events." };
  }
  if (preparedOrigin.origin_geocode_failed_at) {
    return { ok: false, message: "We couldn’t locate that address. Check it and try again." };
  }
  const claimTimestamp = await claimOrigin(admin, householdId, address);
  if (!claimTimestamp) {
    await logSkip(admin, householdId, "geocodio", "geocode_origin", "concurrent_claim_skipped");
    return { ok: true, message: "Home address saved. Its leave-by setup is already in progress." };
  }
  if (!await reserveVendorCall(admin, householdId)) {
    await clearOriginClaim(admin, householdId, claimTimestamp);
    await logSkip(admin, householdId, "geocodio", "geocode_origin", "daily_cap_reached");
    return { ok: false, message: "We couldn’t locate that address right now. Please try again tomorrow." };
  }

  const result = await geocodeWithGeocodio({
    fetchImpl: fetch,
    apiKey: geocodioApiKey as string,
    address,
  });
  const now = currentTimestamp();
  if (result.kind === "success") {
    await admin.from("corralio_households").update({
      origin_lat: result.value.lat,
      origin_lng: result.value.lng,
      origin_geocoded_at: now,
      origin_geocode_failed_at: null,
      origin_geocode_claimed_at: null,
    }).eq("id", householdId)
      .eq("origin_address", address)
      .eq("origin_geocode_claimed_at", claimTimestamp);
  } else if (result.kind === "definitive-failure") {
    await admin.from("corralio_households").update({
      origin_lat: null,
      origin_lng: null,
      origin_geocoded_at: null,
      origin_geocode_failed_at: now,
      origin_geocode_claimed_at: null,
    }).eq("id", householdId)
      .eq("origin_address", address)
      .eq("origin_geocode_claimed_at", claimTimestamp);
  } else {
    await clearOriginClaim(admin, householdId, claimTimestamp);
  }
  await logCorralioProviderResult(admin, {
    householdId,
    api: "geocodio",
    operation: "geocode_origin",
    result,
  });
  return result.kind === "success"
    ? { ok: true, message: "Home address saved. Leave-by estimates will appear for located events." }
    : { ok: false, message: "We couldn’t locate that address. Check it and try again." };
}

async function claimEvent(
  admin: AdminClient,
  input: { householdId: string; eventId: string; claimColumn: "location_geocode_claimed_at" | "route_claimed_at" },
) {
  const claimTimestamp = currentTimestamp();
  const attempt = async (availability: "unclaimed" | "stale") => {
    let query = admin
      .from("corralio_events")
      .update({ [input.claimColumn]: claimTimestamp })
      .eq("household_id", input.householdId)
      .eq("id", input.eventId);
    query = availability === "unclaimed"
      ? query.is(input.claimColumn, null)
      : query.lt(input.claimColumn, staleClaimTimestamp());
    query = input.claimColumn === "location_geocode_claimed_at"
      ? query.is("location_geocoded_at", null).is("location_geocode_failed_at", null)
      : query.is("estimated_drive_minutes", null).is("route_failed_at", null);
    const { data, error } = await query.select("id").maybeSingle();
    return !error && data?.id === input.eventId;
  };
  return await attempt("unclaimed") || await attempt("stale");
}

async function clearEventClaim(
  admin: AdminClient,
  householdId: string,
  eventId: string,
  claimColumn: "location_geocode_claimed_at" | "route_claimed_at",
) {
  await admin.from("corralio_events").update({ [claimColumn]: null })
    .eq("household_id", householdId)
    .eq("id", eventId);
}

async function loadReusableLocation(
  admin: AdminClient,
  householdId: string,
  normalized: string,
) {
  const { data } = await admin.from("corralio_events")
    .select(EVENT_SELECT)
    .eq("household_id", householdId)
    .eq("location_normalized", normalized)
    .or("location_geocoded_at.not.is.null,location_geocode_failed_at.not.is.null")
    .order("location_geocoded_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  return data as EventLocationRow | null;
}

async function loadGeocodeClaimSet(
  admin: AdminClient,
  householdId: string,
  normalized: string,
) {
  const { data } = await admin.from("corralio_events")
    .select("id")
    .eq("household_id", householdId)
    .eq("location_normalized", normalized)
    .is("location_geocoded_at", null)
    .is("location_geocode_failed_at", null)
    .order("id", { ascending: true });
  return (data ?? []).flatMap((row) => typeof row.id === "string" ? [row.id] : []);
}

async function geocodeEventGroups(
  admin: AdminClient,
  householdId: string,
  rows: NormalizedEventRow[],
) {
  let changed = false;
  let vendorCalls = 0;
  const groups = groupByNormalizedLocation(
    rows.filter((row) => !row.location_geocoded_at && !row.location_geocode_failed_at),
  );

  for (const group of groups) {
    const ids = group.rows.map((row) => row.id);
    await admin.from("corralio_events").update({ location_normalized: group.normalized })
      .eq("household_id", householdId)
      .in("id", ids);

    const reusable = await loadReusableLocation(admin, householdId, group.normalized);
    if (reusable && !ids.includes(reusable.id)) {
      if (reusable.location_geocoded_at && reusable.location_lat !== null && reusable.location_lng !== null) {
        await admin.from("corralio_events").update({
          location_lat: reusable.location_lat,
          location_lng: reusable.location_lng,
          location_geocoded_at: reusable.location_geocoded_at,
          location_geocode_failed_at: null,
          location_geocode_claimed_at: null,
        }).eq("household_id", householdId).in("id", ids);
        changed = true;
      } else if (reusable.location_geocode_failed_at) {
        await admin.from("corralio_events").update({
          location_lat: null,
          location_lng: null,
          location_geocoded_at: null,
          location_geocode_failed_at: reusable.location_geocode_failed_at,
          location_geocode_claimed_at: null,
        }).eq("household_id", householdId).in("id", ids);
      }
      await logSkip(admin, householdId, "geocodio", "geocode_event", "household_result_reused", ids.length);
      continue;
    }
    if (vendorCalls >= EVENT_GEOCODE_CAP_PER_MOUNT) continue;
    const claimSetIds = await loadGeocodeClaimSet(admin, householdId, group.normalized);
    const representativeId = claimSetIds[0];
    if (!representativeId) continue;
    if (claimSetIds.length > 1) {
      await logSkip(
        admin,
        householdId,
        "geocodio",
        "geocode_event",
        "batch_duplicate_skipped",
        claimSetIds.length - 1,
      );
    }
    const slot = await acquireVendorCallSlot({
      claim: () => claimEvent(admin, {
        householdId,
        eventId: representativeId,
        claimColumn: "location_geocode_claimed_at",
      }),
      reserve: () => reserveVendorCall(admin, householdId),
      releaseClaim: () => clearEventClaim(
        admin,
        householdId,
        representativeId,
        "location_geocode_claimed_at",
      ),
    });
    if (slot === "claim-skipped") {
      await logSkip(admin, householdId, "geocodio", "geocode_event", "concurrent_claim_skipped");
      continue;
    }
    if (slot === "daily-cap-reached") {
      await logSkip(admin, householdId, "geocodio", "geocode_event", "daily_cap_reached");
      continue;
    }

    vendorCalls += 1;
    const rawLocation = group.representative.source_location_text
      ?? group.representative.display_location_text
      ?? "";
    const result = await geocodeWithGeocodio({
      fetchImpl: fetch,
      apiKey: requiredServerEnvironment("GEOCODIO_API_KEY"),
      address: rawLocation,
    });
    const now = currentTimestamp();
    if (result.kind === "success") {
      await admin.from("corralio_events").update({
        location_lat: result.value.lat,
        location_lng: result.value.lng,
        location_geocoded_at: now,
        location_geocode_failed_at: null,
        location_geocode_claimed_at: null,
      }).eq("household_id", householdId)
        .eq("location_normalized", group.normalized)
        .in("id", claimSetIds);
      changed = true;
    } else if (result.kind === "definitive-failure") {
      await admin.from("corralio_events").update({
        location_lat: null,
        location_lng: null,
        location_geocoded_at: null,
        location_geocode_failed_at: now,
        location_geocode_claimed_at: null,
      }).eq("household_id", householdId)
        .eq("location_normalized", group.normalized)
        .in("id", claimSetIds);
    } else {
      await clearEventClaim(admin, householdId, representativeId, "location_geocode_claimed_at");
    }
    await logCorralioProviderResult(admin, {
      householdId,
      api: "geocodio",
      operation: "geocode_event",
      result,
    });
  }
  return changed;
}

async function loadRouteClaimRows(
  admin: AdminClient,
  input: { householdId: string; normalized: string; originGeocodedAt: string },
) {
  const { data } = await admin.from("corralio_events")
    .select(EVENT_SELECT)
    .eq("household_id", input.householdId)
    .eq("location_normalized", input.normalized)
    .not("location_geocoded_at", "is", null)
    .order("id", { ascending: true });
  return ((data ?? []) as EventLocationRow[]).filter((row) =>
    row.location_lat !== null
    && row.location_lng !== null
    && row.location_geocoded_at
    && !isRouteFresh({
      leaveByComputedAt: row.leave_by_computed_at ?? row.route_failed_at,
      originGeocodedAt: input.originGeocodedAt,
      locationGeocodedAt: row.location_geocoded_at,
    }));
}

async function loadReusableRoute(
  admin: AdminClient,
  input: { householdId: string; normalized: string; originGeocodedAt: string; locationGeocodedAt: string },
) {
  const { data } = await admin.from("corralio_events")
    .select(EVENT_SELECT)
    .eq("household_id", input.householdId)
    .eq("location_normalized", input.normalized)
    .or("leave_by_computed_at.not.is.null,route_failed_at.not.is.null")
    .order("leave_by_computed_at", { ascending: false, nullsFirst: false });
  return ((data ?? []) as EventLocationRow[]).find((row) =>
    isRouteFresh({
      leaveByComputedAt: row.leave_by_computed_at ?? row.route_failed_at,
      originGeocodedAt: input.originGeocodedAt,
      locationGeocodedAt: input.locationGeocodedAt,
    }));
}

async function routeEventGroups(
  admin: AdminClient,
  input: {
    householdId: string;
    originLat: number;
    originLng: number;
    originGeocodedAt: string;
    rows: NormalizedEventRow[];
  },
) {
  let changed = false;
  let vendorCalls = 0;
  const groups = groupByNormalizedLocation(input.rows.filter((row) =>
    row.location_lat !== null
    && row.location_lng !== null
    && row.location_geocoded_at
    && !isRouteFresh({
      leaveByComputedAt: row.leave_by_computed_at ?? row.route_failed_at,
      originGeocodedAt: input.originGeocodedAt,
      locationGeocodedAt: row.location_geocoded_at,
    })));

  for (const group of groups) {
    const representative = group.representative;
    if (
      representative.location_lat === null
      || representative.location_lng === null
      || !representative.location_geocoded_at
    ) continue;
    const ids = group.rows.map((row) => row.id);
    const reusable = await loadReusableRoute(admin, {
      householdId: input.householdId,
      normalized: group.normalized,
      originGeocodedAt: input.originGeocodedAt,
      locationGeocodedAt: representative.location_geocoded_at,
    });
    if (reusable && !ids.includes(reusable.id)) {
      if (
        reusable.leave_by_computed_at
        && reusable.estimated_drive_minutes !== null
        && reusable.route_distance_meters !== null
        && reusable.route_provider === "openrouteservice"
      ) {
        await admin.from("corralio_events").update({
          estimated_drive_minutes: reusable.estimated_drive_minutes,
          route_distance_meters: reusable.route_distance_meters,
          route_provider: reusable.route_provider,
          route_failed_at: null,
          route_claimed_at: null,
          leave_by_computed_at: reusable.leave_by_computed_at,
        }).eq("household_id", input.householdId).in("id", ids);
        changed = true;
      } else if (reusable.route_failed_at) {
        await admin.from("corralio_events").update({
          estimated_drive_minutes: null,
          route_distance_meters: null,
          route_provider: null,
          route_failed_at: reusable.route_failed_at,
          route_claimed_at: null,
          leave_by_computed_at: null,
        }).eq("household_id", input.householdId).in("id", ids);
      }
      await logSkip(
        admin,
        input.householdId,
        "openrouteservice",
        "route_event",
        "household_result_reused",
        ids.length,
      );
      continue;
    }
    if (vendorCalls >= MAX_ROUTES_PER_MOUNT) continue;
    const claimRows = await loadRouteClaimRows(admin, {
      householdId: input.householdId,
      normalized: group.normalized,
      originGeocodedAt: input.originGeocodedAt,
    });
    const claimRepresentative = claimRows[0];
    if (!claimRepresentative) continue;
    const routeTargetIds = claimRows.map((row) => row.id);
    await admin.from("corralio_events").update({
      estimated_drive_minutes: null,
      route_distance_meters: null,
      route_provider: null,
      route_failed_at: null,
      route_claimed_at: null,
      leave_by_computed_at: null,
    }).eq("household_id", input.householdId)
      .eq("location_normalized", group.normalized)
      .in("id", routeTargetIds);
    if (claimRows.length > 1) {
      await logSkip(
        admin,
        input.householdId,
        "openrouteservice",
        "route_event",
        "batch_duplicate_skipped",
        claimRows.length - 1,
      );
    }
    const slot = await acquireVendorCallSlot({
      claim: () => claimEvent(admin, {
        householdId: input.householdId,
        eventId: claimRepresentative.id,
        claimColumn: "route_claimed_at",
      }),
      reserve: () => reserveVendorCall(admin, input.householdId),
      releaseClaim: () => clearEventClaim(
        admin,
        input.householdId,
        claimRepresentative.id,
        "route_claimed_at",
      ),
    });
    if (slot === "claim-skipped") {
      await logSkip(
        admin,
        input.householdId,
        "openrouteservice",
        "route_event",
        "concurrent_claim_skipped",
      );
      continue;
    }
    if (slot === "daily-cap-reached") {
      await logSkip(admin, input.householdId, "openrouteservice", "route_event", "daily_cap_reached");
      continue;
    }

    vendorCalls += 1;
    const routeCalculatedAt = currentTimestamp();
    const result = await routeWithOpenRouteService({
      fetchImpl: fetch,
      apiKey: requiredServerEnvironment("OPENROUTESERVICE_API_KEY"),
      origin: { lat: input.originLat, lng: input.originLng },
      destination: { lat: claimRepresentative.location_lat as number, lng: claimRepresentative.location_lng as number },
    });
    if (result.kind === "success") {
      await admin.from("corralio_events").update({
        estimated_drive_minutes: result.value.durationMinutes,
        route_distance_meters: result.value.distanceMeters,
        route_provider: "openrouteservice",
        route_failed_at: null,
        route_claimed_at: null,
        leave_by_computed_at: routeCalculatedAt,
      }).eq("household_id", input.householdId)
        .eq("location_normalized", group.normalized)
        .in("id", routeTargetIds);
      changed = true;
    } else if (result.kind === "definitive-failure") {
      await admin.from("corralio_events").update({
        estimated_drive_minutes: null,
        route_distance_meters: null,
        route_provider: null,
        route_failed_at: routeCalculatedAt,
        route_claimed_at: null,
        leave_by_computed_at: null,
      }).eq("household_id", input.householdId)
        .eq("location_normalized", group.normalized)
        .in("id", routeTargetIds);
    } else {
      await clearEventClaim(admin, input.householdId, claimRepresentative.id, "route_claimed_at");
    }
    await logCorralioProviderResult(admin, {
      householdId: input.householdId,
      api: "openrouteservice",
      operation: "route_event",
      result,
    });
  }
  return changed;
}

export async function computeWeekendLeaveBy(input: {
  householdId: string;
  eventIds: string[];
}): Promise<{ changed: boolean }> {
  if (!input.eventIds.length) return { changed: false };
  requiredServerEnvironment("GEOCODIO_API_KEY");
  const admin = createCorralioSupabaseAdminClient();
  const [{ data: household }, { data: sources }] = await Promise.all([
    admin.from("corralio_households")
      .select("origin_lat,origin_lng,origin_geocoded_at")
      .eq("id", input.householdId)
      .maybeSingle(),
    admin.from("corralio_schedule_sources")
      .select("id")
      .eq("household_id", input.householdId)
      .neq("sync_status", "disconnected"),
  ]);
  const window = getWeekendCandidateWindow(new Date());
  const sourceFilter = buildActivePlanningEventSourceFilter(
    (sources ?? []).flatMap((source) => typeof source.id === "string" ? [source.id] : []),
  );
  let query = admin.from("corralio_events")
    .select(EVENT_SELECT)
    .eq("household_id", input.householdId)
    .in("id", input.eventIds.slice(0, 200))
    .gte("starts_at", window.from)
    .lt("starts_at", window.to);
  query = sourceFilter ? query.or(sourceFilter) : query.is("schedule_source_id", null);
  const { data, error } = await query.order("id", { ascending: true });
  if (error) return { changed: false };

  let rows = ((data ?? []) as EventLocationRow[]).map(asNormalizedRow)
    .filter((row) => row.locationNormalized);
  const geocodeChanged = await geocodeEventGroups(admin, input.householdId, rows);
  if (geocodeChanged) {
    const { data: refreshed } = await admin.from("corralio_events")
      .select(EVENT_SELECT)
      .eq("household_id", input.householdId)
      .in("id", rows.map((row) => row.id))
      .order("id", { ascending: true });
    rows = ((refreshed ?? []) as EventLocationRow[]).map(asNormalizedRow);
  }
  try {
    await matchPersistedCorralioEventIds(admin, {
      householdId: input.householdId,
      eventIds: rows.map((row) => row.id),
    });
  } catch {
    // Event geocoding/routing already succeeded. Keep provisional enrichment
    // best-effort and emit no location, candidate, household, or provider data.
    console.warn("[corralio][provisional-venues] post-geocode evaluation failed");
  }
  if (
    typeof household?.origin_lat !== "number"
    || typeof household.origin_lng !== "number"
    || typeof household.origin_geocoded_at !== "string"
  ) return { changed: geocodeChanged };

  requiredServerEnvironment("OPENROUTESERVICE_API_KEY");
  const routeChanged = await routeEventGroups(admin, {
    householdId: input.householdId,
    originLat: household.origin_lat,
    originLng: household.origin_lng,
    originGeocodedAt: household.origin_geocoded_at,
    rows,
  });
  return { changed: geocodeChanged || routeChanged };
}
