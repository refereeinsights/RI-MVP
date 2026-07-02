import { createHash, createHmac, randomBytes } from "node:crypto";

import { getTier, type TiProfile, type TiTier } from "@/lib/entitlements";
import type { PlannerChildRow, PlannerEventRow, PlannerTeamRow } from "@/lib/planner/types";
import { enrichPlannerEventsWithLinkedVenue } from "@/lib/planner/enrichVenueMetadata";
import { mapsSearchUrl, plannerEventLocationForMaps } from "@/lib/planner/venueResolution";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const PLANNER_GUEST_SHARE_SCOPE_FAMILY = "family" as const;
export const PLANNER_GUEST_SHARE_LOOKBACK_DAYS = 14;
export const PLANNER_GUEST_SHARE_LOOKAHEAD_DAYS = 90;
export const PLANNER_GUEST_SHARE_MAX_EVENTS = 250;
export const PLANNER_GUEST_SHARE_ACCESS_UPDATE_MS = 15 * 60 * 1000;

export type PlannerGuestShareScopeType = "family" | "child" | "team";

export type PlannerGuestShareRow = {
  id: string;
  owner_user_id: string;
  scope_type: PlannerGuestShareScopeType;
  scope_target_id: string | null;
  token_nonce: string;
  token_version_nonce: string;
  token_hash: string;
  active: boolean;
  revoked_at: string | null;
  rotated_at: string | null;
  last_accessed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type PlannerGuestSharePanelState = {
  hasShare: boolean;
  shareActive: boolean;
  isWeekendPro: boolean;
  isUnverified: boolean;
  canCreate: boolean;
  canReveal: boolean;
  canRegenerate: boolean;
  canCopy: boolean;
  canRevoke: boolean;
  paused: boolean;
  helperText: string;
  createdAt: string | null;
  updatedAt: string | null;
  lastAccessedAt: string | null;
};

export type PlannerGuestSharedEventDto = {
  displayTitle: string;
  eventType: string;
  startsAt: string;
  endsAt: string | null;
  timeZone: string | null;
  assignmentLabel: string | null;
  assignmentColorToken: string | null;
  sourceLabel: string | null;
  fieldLabel: string | null;
  linkedVenueName: string | null;
  linkedVenueHref: string | null;
  sourceLocationLabel: string | null;
  directionsHref: string | null;
};

export type PlannerGuestSharedViewDto = {
  ownerTier: TiTier;
  scopeLabel: string;
  windowLabel: string;
  events: PlannerGuestSharedEventDto[];
};

type PlannerGuestShareOwnerSnapshot = {
  user: {
    id: string;
    email_confirmed_at?: string | null;
  } | null;
  profile: TiProfile;
  tier: TiTier;
  unverified: boolean;
};

function requireGuestShareSecret() {
  const secret = String(
    process.env.TI_GUEST_SHARE_SECRET ??
      process.env.SUPABASE_SERVICE_ROLE_KEY ??
      ""
  ).trim();
  if (!secret) throw new Error("Missing guest share secret.");
  return secret;
}

function collapseWhitespace(value: string | null | undefined) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function safeSourceLabel(value: string | null | undefined) {
  const trimmed = collapseWhitespace(value);
  return trimmed || null;
}

function familyColorStyle(colorToken: string | null | undefined) {
  const token = collapseWhitespace(colorToken ?? "");
  switch (token) {
    case "teal":
      return { soft: "rgba(14, 165, 233, 0.16)", border: "rgba(14, 165, 233, 0.34)", text: "#075985" };
    case "violet":
      return { soft: "rgba(139, 92, 246, 0.14)", border: "rgba(139, 92, 246, 0.34)", text: "#5b21b6" };
    case "rose":
      return { soft: "rgba(244, 63, 94, 0.14)", border: "rgba(244, 63, 94, 0.34)", text: "#9f1239" };
    case "amber":
      return { soft: "rgba(245, 158, 11, 0.16)", border: "rgba(245, 158, 11, 0.34)", text: "#92400e" };
    case "emerald":
      return { soft: "rgba(16, 185, 129, 0.14)", border: "rgba(16, 185, 129, 0.34)", text: "#065f46" };
    case "indigo":
      return { soft: "rgba(99, 102, 241, 0.14)", border: "rgba(99, 102, 241, 0.34)", text: "#3730a3" };
    default:
      return { soft: "rgba(255, 255, 255, 0.08)", border: "rgba(255, 255, 255, 0.18)", text: "#ffffff" };
  }
}

function generatePlannerGuestShareTokenVersionNonce() {
  return randomBytes(16).toString("base64url");
}

function tokenVersionForRow(row: Pick<PlannerGuestShareRow, "token_version_nonce">) {
  return collapseWhitespace(row.token_version_nonce);
}

export function generatePlannerGuestShareTokenNonce() {
  return randomBytes(32).toString("base64url");
}

export function buildPlannerGuestShareToken(params: {
  ownerUserId: string;
  scopeType: PlannerGuestShareScopeType;
  scopeTargetId: string | null;
  tokenNonce: string;
  tokenVersion: string;
}) {
  const nonce = collapseWhitespace(params.tokenNonce);
  const payload = [
    nonce,
    collapseWhitespace(params.ownerUserId),
    collapseWhitespace(params.scopeType),
    collapseWhitespace(params.scopeTargetId),
    collapseWhitespace(params.tokenVersion),
  ].join(":");
  const signature = createHmac("sha256", requireGuestShareSecret()).update(payload).digest("base64url");
  return `${nonce}.${signature}`;
}

export function hashPlannerGuestShareToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function buildPlannerGuestShareUrl(origin: string, token: string) {
  return `${String(origin ?? "").replace(/\/+$/, "")}/weekend-planner/shared/${encodeURIComponent(token)}`;
}

function guestShareWindowRange(now = new Date()) {
  const start = new Date(now);
  start.setUTCDate(start.getUTCDate() - PLANNER_GUEST_SHARE_LOOKBACK_DAYS);
  const end = new Date(now);
  end.setUTCDate(end.getUTCDate() + PLANNER_GUEST_SHARE_LOOKAHEAD_DAYS);
  return { fromIso: start.toISOString(), toIso: end.toISOString() };
}

function windowLabel() {
  return `${PLANNER_GUEST_SHARE_LOOKBACK_DAYS} days back · ${PLANNER_GUEST_SHARE_LOOKAHEAD_DAYS} days ahead`;
}

async function loadOwnerSnapshot(ownerUserId: string): Promise<PlannerGuestShareOwnerSnapshot> {
  const [profileRes, authRes] = await Promise.all([
    (supabaseAdmin.from("ti_users" as any) as any)
      .select("plan,subscription_status,current_period_end,trial_ends_at")
      .eq("id", ownerUserId)
      .maybeSingle(),
    supabaseAdmin.auth.admin.getUserById(ownerUserId),
  ]);

  const user = authRes.data?.user ?? null;
  const profile = (profileRes.data as TiProfile | null) ?? null;
  const tier = getTier(user as any, profile);
  const unverified = Boolean(user && !user.email_confirmed_at);

  return { user: user as any, profile, tier, unverified };
}

async function loadMergedDuplicateSuppressionSet(ownerUserId: string, events: PlannerEventRow[]) {
  const sourceIds = Array.from(
    new Set(events.map((event) => collapseWhitespace(event.source_id)).filter(Boolean))
  );
  const sourceUids = Array.from(
    new Set(events.map((event) => collapseWhitespace(event.source_event_uid)).filter(Boolean))
  );
  if (!sourceIds.length || !sourceUids.length) return new Set<string>();

  const { data, error } = await (supabaseAdmin.from("planner_event_suppressions" as any) as any)
    .select("source_id,source_event_uid")
    .eq("user_id", ownerUserId)
    .eq("reason", "merged_duplicate")
    .in("source_id", sourceIds)
    .in("source_event_uid", sourceUids)
    .limit(1000);

  if (error) return new Set<string>();
  return new Set(
    ((data ?? []) as any[])
      .map((row) => `${collapseWhitespace(row?.source_id)}:${collapseWhitespace(row?.source_event_uid)}`)
      .filter((value) => value !== ":")
  );
}

function filterSuppressedGuestEvents(events: PlannerEventRow[], suppressedKeys: Set<string>) {
  if (!suppressedKeys.size) return events;
  return events.filter((event) => {
    const sourceId = collapseWhitespace(event.source_id);
    const sourceEventUid = collapseWhitespace(event.source_event_uid);
    if (!sourceId || !sourceEventUid) return true;
    return !suppressedKeys.has(`${sourceId}:${sourceEventUid}`);
  });
}

async function loadSourceLabels(ownerUserId: string, sourceIds: string[]) {
  if (!sourceIds.length) return new Map<string, string>();
  const { data } = await (supabaseAdmin.from("planner_event_sources" as any) as any)
    .select("id,source_name,team_name")
    .eq("user_id", ownerUserId)
    .in("id", sourceIds)
    .limit(200);

  return new Map(
    ((data ?? []) as any[]).map((row) => [
      collapseWhitespace(row?.id),
      safeSourceLabel(row?.source_name) ?? safeSourceLabel(row?.team_name) ?? "Connected calendar",
    ])
  );
}

async function loadFamilyProfiles(ownerUserId: string, childIds: string[], teamIds: string[]) {
  const [childrenRes, teamsRes] = await Promise.all([
    childIds.length
      ? (supabaseAdmin.from("planner_children" as any) as any)
          .select("id,display_name,color_token")
          .eq("user_id", ownerUserId)
          .in("id", childIds)
      : Promise.resolve({ data: [] as any[] }),
    teamIds.length
      ? (supabaseAdmin.from("planner_teams" as any) as any)
          .select("id,child_id,display_name")
          .eq("user_id", ownerUserId)
          .in("id", teamIds)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const childrenById = new Map(
    (((childrenRes as any).data ?? []) as PlannerChildRow[]).map((row) => [collapseWhitespace(row.id), row])
  );
  const teamsById = new Map(
    (((teamsRes as any).data ?? []) as PlannerTeamRow[]).map((row) => [collapseWhitespace(row.id), row])
  );

  return { childrenById, teamsById };
}

function assignmentLabelForEvent(
  event: PlannerEventRow,
  childrenById: Map<string, Pick<PlannerChildRow, "display_name" | "color_token">>,
  teamsById: Map<string, Pick<PlannerTeamRow, "display_name">>,
) {
  const childId = collapseWhitespace(event.child_profile_id);
  const teamId = collapseWhitespace(event.team_profile_id);
  const child = childId ? childrenById.get(childId) ?? null : null;
  const team = teamId ? teamsById.get(teamId) ?? null : null;

  if (child && team) {
    return {
      label: `${child.display_name} · ${team.display_name}`,
      colorToken: child.color_token ?? null,
    };
  }
  if (child) {
    return {
      label: child.display_name,
      colorToken: child.color_token ?? null,
    };
  }
  return { label: null, colorToken: null };
}

function sourceLocationLabelForEvent(event: PlannerEventRow) {
  const out = [event.address_text, event.city, event.state]
    .map((value) => collapseWhitespace(value))
    .filter(Boolean)
    .join(", ");
  return out || null;
}

function linkedVenueHrefForEvent(event: PlannerEventRow) {
  const slug = collapseWhitespace(event.linkedVenue?.seo_slug);
  if (slug) return `/venues/${slug}`;
  return null;
}

function createGuestSharePanelState(params: {
  row: PlannerGuestShareRow | null;
  tier: TiTier;
  unverified: boolean;
}): PlannerGuestSharePanelState {
  const isWeekendPro = params.tier === "weekend_pro";
  const hasShare = Boolean(params.row);
  const shareActive = Boolean(params.row?.active);
  const paused = Boolean(params.row?.active && !isWeekendPro);

  let helperText = "Family schedule sharing is included with Weekend Pro.";
  if (params.unverified) {
    helperText = "Confirm your email, then upgrade to Weekend Pro to share your family schedule.";
  } else if (paused) {
    helperText = "Family schedule sharing is paused while Weekend Pro is inactive.";
  } else if (isWeekendPro && shareActive) {
    helperText =
      "Anyone with this link can view your shared family sports schedule. Private notes, account details, calendar source details, and editing controls are hidden.";
  } else if (isWeekendPro) {
    helperText =
      "Create a private read-only family schedule link so grandparents, carpools, or co-parents can follow the weekend without logging in. Private notes, account details, calendar source details, and editing controls stay hidden.";
  }

  return {
    hasShare,
    shareActive,
    isWeekendPro,
    isUnverified: params.unverified,
    canCreate: isWeekendPro,
    canReveal: isWeekendPro && shareActive,
    canRegenerate: isWeekendPro && shareActive,
    canCopy: isWeekendPro && shareActive,
    canRevoke: Boolean(params.row?.active),
    paused,
    helperText,
    createdAt: params.row?.created_at ?? null,
    updatedAt: params.row?.updated_at ?? null,
    lastAccessedAt: params.row?.last_accessed_at ?? null,
  };
}

export async function getPlannerGuestSharePanelStateForOwner(params: {
  supabase: any;
  userId: string;
  tier: TiTier;
  unverified: boolean;
}) {
  const { data } = await (params.supabase.from("planner_guest_shares" as any) as any)
    .select("id,owner_user_id,scope_type,scope_target_id,token_nonce,token_version_nonce,token_hash,active,revoked_at,rotated_at,last_accessed_at,created_at,updated_at")
    .eq("owner_user_id", params.userId)
    .eq("scope_type", PLANNER_GUEST_SHARE_SCOPE_FAMILY)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return createGuestSharePanelState({
    row: (data as PlannerGuestShareRow | null) ?? null,
    tier: params.tier,
    unverified: params.unverified,
  });
}

export async function upsertOwnerPlannerGuestShare(params: {
  supabase: any;
  ownerUserId: string;
  action: "create" | "regenerate";
}) {
  const existingRes = await (params.supabase.from("planner_guest_shares" as any) as any)
    .select("id,owner_user_id,scope_type,scope_target_id,token_nonce,token_version_nonce,token_hash,active,revoked_at,rotated_at,last_accessed_at,created_at,updated_at")
    .eq("owner_user_id", params.ownerUserId)
    .eq("scope_type", PLANNER_GUEST_SHARE_SCOPE_FAMILY)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nowIso = new Date().toISOString();
  const tokenNonce = generatePlannerGuestShareTokenNonce();
  const tokenVersionNonce = generatePlannerGuestShareTokenVersionNonce();

  const rawToken = buildPlannerGuestShareToken({
    ownerUserId: params.ownerUserId,
    scopeType: PLANNER_GUEST_SHARE_SCOPE_FAMILY,
    scopeTargetId: null,
    tokenNonce,
    tokenVersion: tokenVersionNonce,
  });
  const tokenHash = hashPlannerGuestShareToken(rawToken);

  if ((existingRes.data as any)?.id) {
    const { data, error } = await (params.supabase.from("planner_guest_shares" as any) as any)
      .update({
        token_nonce: tokenNonce,
        token_version_nonce: tokenVersionNonce,
        token_hash: tokenHash,
        active: true,
        revoked_at: null,
        rotated_at: nowIso,
      })
      .eq("id", (existingRes.data as any).id)
      .eq("owner_user_id", params.ownerUserId)
      .select("id,owner_user_id,scope_type,scope_target_id,token_nonce,token_version_nonce,token_hash,active,revoked_at,rotated_at,last_accessed_at,created_at,updated_at")
      .single();

    if (error) throw error;
    return { row: data as PlannerGuestShareRow, rawToken };
  }

  const { data, error } = await (params.supabase.from("planner_guest_shares" as any) as any)
    .insert({
      owner_user_id: params.ownerUserId,
      scope_type: PLANNER_GUEST_SHARE_SCOPE_FAMILY,
      scope_target_id: null,
      token_nonce: tokenNonce,
      token_version_nonce: tokenVersionNonce,
      token_hash: tokenHash,
      active: true,
      rotated_at: nowIso,
    })
    .select("id,owner_user_id,scope_type,scope_target_id,token_nonce,token_version_nonce,token_hash,active,revoked_at,rotated_at,last_accessed_at,created_at,updated_at")
    .single();

  if (error) throw error;
  return { row: data as PlannerGuestShareRow, rawToken };
}

export async function revokeOwnerPlannerGuestShare(params: {
  supabase: any;
  ownerUserId: string;
}) {
  const { data, error } = await (params.supabase.from("planner_guest_shares" as any) as any)
    .update({
      active: false,
      revoked_at: new Date().toISOString(),
    })
    .eq("owner_user_id", params.ownerUserId)
    .eq("scope_type", PLANNER_GUEST_SHARE_SCOPE_FAMILY)
    .eq("active", true)
    .select("id,owner_user_id,scope_type,scope_target_id,token_nonce,token_version_nonce,token_hash,active,revoked_at,rotated_at,last_accessed_at,created_at,updated_at")
    .maybeSingle();

  if (error) throw error;
  return (data as PlannerGuestShareRow | null) ?? null;
}

export async function revealOwnerPlannerGuestShare(params: {
  supabase: any;
  ownerUserId: string;
}) {
  const { data, error } = await (params.supabase.from("planner_guest_shares" as any) as any)
    .select("id,owner_user_id,scope_type,scope_target_id,token_nonce,token_version_nonce,token_hash,active,revoked_at,rotated_at,last_accessed_at,created_at,updated_at")
    .eq("owner_user_id", params.ownerUserId)
    .eq("scope_type", PLANNER_GUEST_SHARE_SCOPE_FAMILY)
    .eq("active", true)
    .maybeSingle();

  if (error) throw error;
  const row = (data as PlannerGuestShareRow | null) ?? null;
  if (!row) return null;

  const rawToken = buildPlannerGuestShareToken({
    ownerUserId: row.owner_user_id,
    scopeType: row.scope_type,
    scopeTargetId: row.scope_target_id,
    tokenNonce: row.token_nonce,
    tokenVersion: tokenVersionForRow(row),
  });
  if (hashPlannerGuestShareToken(rawToken) === row.token_hash) {
    return { row, rawToken };
  }

  const nowIso = new Date().toISOString();
  const repairedTokenNonce = generatePlannerGuestShareTokenNonce();
  const repairedTokenVersionNonce = generatePlannerGuestShareTokenVersionNonce();
  const repairedRawToken = buildPlannerGuestShareToken({
    ownerUserId: row.owner_user_id,
    scopeType: row.scope_type,
    scopeTargetId: row.scope_target_id,
    tokenNonce: repairedTokenNonce,
    tokenVersion: repairedTokenVersionNonce,
  });
  const repairedTokenHash = hashPlannerGuestShareToken(repairedRawToken);
  const { data: repairedRow, error: repairedError } = await (params.supabase.from("planner_guest_shares" as any) as any)
    .update({
      token_nonce: repairedTokenNonce,
      token_version_nonce: repairedTokenVersionNonce,
      token_hash: repairedTokenHash,
      active: true,
      revoked_at: null,
      rotated_at: nowIso,
    })
    .eq("id", row.id)
    .eq("owner_user_id", params.ownerUserId)
    .select("id,owner_user_id,scope_type,scope_target_id,token_nonce,token_version_nonce,token_hash,active,revoked_at,rotated_at,last_accessed_at,created_at,updated_at")
    .single();

  if (repairedError) throw repairedError;
  return { row: repairedRow as PlannerGuestShareRow, rawToken: repairedRawToken };
}

export async function resolvePlannerGuestShareByToken(rawToken: string) {
  const token = collapseWhitespace(rawToken);
  if (!token) return null;
  const tokenHash = hashPlannerGuestShareToken(token);
  const { data, error } = await (supabaseAdmin.from("planner_guest_shares" as any) as any)
    .select("id,owner_user_id,scope_type,scope_target_id,token_nonce,token_version_nonce,token_hash,active,revoked_at,rotated_at,last_accessed_at,created_at,updated_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (error || !data) return null;
  return data as PlannerGuestShareRow;
}

export async function markPlannerGuestShareAccessed(row: PlannerGuestShareRow) {
  const now = Date.now();
  const lastTouched = row.last_accessed_at ? new Date(row.last_accessed_at).getTime() : 0;
  if (lastTouched && Number.isFinite(lastTouched) && now - lastTouched < PLANNER_GUEST_SHARE_ACCESS_UPDATE_MS) {
    return false;
  }

  try {
    await (supabaseAdmin.from("planner_guest_shares" as any) as any)
      .update({ last_accessed_at: new Date(now).toISOString() })
      .eq("id", row.id)
      .eq("token_hash", row.token_hash);
    return true;
  } catch {
    return false;
  }
}

export async function loadPlannerGuestSharedView(token: string): Promise<PlannerGuestSharedViewDto | null> {
  const shareRow = await resolvePlannerGuestShareByToken(token);
  if (!shareRow?.active || shareRow.scope_type !== PLANNER_GUEST_SHARE_SCOPE_FAMILY) return null;

  const owner = await loadOwnerSnapshot(shareRow.owner_user_id);
  if (owner.tier !== "weekend_pro") return null;

  const { fromIso, toIso } = guestShareWindowRange();
  const { data, error } = await (supabaseAdmin.from("planner_events" as any) as any)
    .select(
      "id,user_id,weekend_id,title,event_type,team_name,opponent_name,tournament_id,venue_id,field_label,address_text,city,state,starts_at,ends_at,timezone,notes,child_profile_id,team_profile_id,source_type,source_id,source_event_uid,created_at,updated_at"
    )
    .eq("user_id", shareRow.owner_user_id)
    .gte("starts_at", fromIso)
    .lt("starts_at", toIso)
    .order("starts_at", { ascending: true })
    .limit(PLANNER_GUEST_SHARE_MAX_EVENTS);

  if (error) return null;

  const rawEvents = ((data ?? []) as PlannerEventRow[]).map((event) => ({
    ...event,
    source_type:
      (collapseWhitespace(event.source_type) !== "ics" &&
      collapseWhitespace(event.source_id) &&
      collapseWhitespace(event.source_event_uid))
        ? "ics"
        : event.source_type,
  }));

  const suppressedKeys = await loadMergedDuplicateSuppressionSet(shareRow.owner_user_id, rawEvents);
  const visibleEvents = filterSuppressedGuestEvents(rawEvents, suppressedKeys);
  const enrichedEvents = await enrichPlannerEventsWithLinkedVenue(supabaseAdmin, visibleEvents);

  const sourceLabelById = await loadSourceLabels(
    shareRow.owner_user_id,
    Array.from(new Set(enrichedEvents.map((event) => collapseWhitespace(event.source_id)).filter(Boolean)))
  );

  const childIds = Array.from(new Set(enrichedEvents.map((event) => collapseWhitespace(event.child_profile_id)).filter(Boolean)));
  const teamIds = Array.from(new Set(enrichedEvents.map((event) => collapseWhitespace(event.team_profile_id)).filter(Boolean)));
  const { childrenById, teamsById } = await loadFamilyProfiles(shareRow.owner_user_id, childIds, teamIds);

  const events = enrichedEvents.map((event) => {
    const assignment = assignmentLabelForEvent(event, childrenById, teamsById);
    const locationForMaps = plannerEventLocationForMaps(event);
    const sourceLabel = collapseWhitespace(sourceLabelById.get(collapseWhitespace(event.source_id)) ?? "");
    return {
      displayTitle: collapseWhitespace(event.title) || "Untitled event",
      eventType: collapseWhitespace(event.event_type) || "other",
      startsAt: event.starts_at,
      endsAt: event.ends_at ?? null,
      timeZone: event.timezone ?? null,
      assignmentLabel: assignment.label,
      assignmentColorToken: assignment.colorToken,
      sourceLabel: sourceLabel || null,
      fieldLabel: collapseWhitespace(event.field_label) || null,
      linkedVenueName: collapseWhitespace(event.linkedVenue?.name) || null,
      linkedVenueHref: linkedVenueHrefForEvent(event),
      sourceLocationLabel: sourceLocationLabelForEvent(event),
      directionsHref: locationForMaps ? mapsSearchUrl(locationForMaps) : null,
    } satisfies PlannerGuestSharedEventDto;
  });

  void markPlannerGuestShareAccessed(shareRow);

  return {
    ownerTier: owner.tier,
    scopeLabel: "Family schedule",
    windowLabel: windowLabel(),
    events,
  };
}

export function plannerGuestShareBadgeStyle(colorToken: string | null | undefined) {
  return familyColorStyle(colorToken);
}
