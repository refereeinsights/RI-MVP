import { createHash, createHmac, randomBytes } from "node:crypto";

import { getTier, type TiProfile, type TiTier } from "@/lib/entitlements";
import type { PlannerChildRow, PlannerEventRow, PlannerTeamRow } from "@/lib/planner/types";
import { enrichPlannerEventsWithLinkedVenue } from "@/lib/planner/enrichVenueMetadata";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const PLANNER_CALENDAR_FEED_TYPE_ICAL = "ical" as const;
export const PLANNER_CALENDAR_FEED_SCOPE_FAMILY = "family" as const;
export const PLANNER_CALENDAR_FEED_LOOKBACK_DAYS = 14;
export const PLANNER_CALENDAR_FEED_LOOKAHEAD_DAYS = 180;
export const PLANNER_CALENDAR_FEED_MAX_EVENTS = 500;
export const PLANNER_CALENDAR_FEED_ACCESS_UPDATE_MS = 60 * 60 * 1000;
export const PLANNER_CALENDAR_FEED_NAME = "TournamentInsights Family Sports Schedule";
export const PLANNER_CALENDAR_FEED_DESCRIPTION = "Read-only family sports schedule from TournamentInsights";

export type PlannerCalendarFeedScopeType = "family" | "child" | "team";

export type PlannerCalendarFeedRow = {
  id: string;
  owner_user_id: string;
  feed_type: "ical";
  scope_type: PlannerCalendarFeedScopeType;
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

export type PlannerCalendarFeedPanelState = {
  hasFeed: boolean;
  feedActive: boolean;
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

type PlannerCalendarFeedOwnerSnapshot = {
  user: {
    id: string;
    email_confirmed_at?: string | null;
  } | null;
  profile: TiProfile;
  tier: TiTier;
  unverified: boolean;
};

type PlannerCalendarFeedEvent = {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string | null;
  location: string | null;
  venueUrl: string | null;
  updatedAt: string | null;
};

export type PlannerCalendarFeedDto = {
  name: string;
  description: string;
  events: PlannerCalendarFeedEvent[];
};

function collapseWhitespace(value: string | null | undefined) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function siteOrigin() {
  return String(process.env.NEXT_PUBLIC_SITE_URL || "https://www.tournamentinsights.com").replace(/\/+$/, "");
}

function requirePlannerCalendarFeedSecret() {
  const secret = String(
    process.env.TI_CALENDAR_FEED_SECRET ??
      process.env.TI_GUEST_SHARE_SECRET ??
      process.env.SUPABASE_SERVICE_ROLE_KEY ??
      ""
  ).trim();
  if (!secret) throw new Error("Missing planner calendar feed secret.");
  return secret;
}

function generatePlannerCalendarFeedTokenVersionNonce() {
  return randomBytes(16).toString("base64url");
}

function tokenVersionForRow(row: Pick<PlannerCalendarFeedRow, "token_version_nonce">) {
  return collapseWhitespace(row.token_version_nonce);
}

export function generatePlannerCalendarFeedTokenNonce() {
  return randomBytes(32).toString("base64url");
}

export function buildPlannerCalendarFeedToken(params: {
  ownerUserId: string;
  scopeType: PlannerCalendarFeedScopeType;
  scopeTargetId: string | null;
  tokenNonce: string;
  tokenVersion: string;
}) {
  const nonce = collapseWhitespace(params.tokenNonce);
  const payload = [
    PLANNER_CALENDAR_FEED_TYPE_ICAL,
    nonce,
    collapseWhitespace(params.ownerUserId),
    collapseWhitespace(params.scopeType),
    collapseWhitespace(params.scopeTargetId),
    collapseWhitespace(params.tokenVersion),
  ].join(":");
  const signature = createHmac("sha256", requirePlannerCalendarFeedSecret()).update(payload).digest("base64url");
  return `${nonce}.${signature}`;
}

export function hashPlannerCalendarFeedToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function buildPlannerCalendarFeedUrl(origin: string, token: string) {
  return `${String(origin ?? "").replace(/\/+$/, "")}/weekend-planner/calendar/${encodeURIComponent(token)}`;
}

export function isPlausiblePlannerCalendarFeedToken(token: string) {
  return /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(collapseWhitespace(token));
}

function createPlannerCalendarFeedPanelState(params: {
  row: PlannerCalendarFeedRow | null;
  tier: TiTier;
  unverified: boolean;
}): PlannerCalendarFeedPanelState {
  const isWeekendPro = params.tier === "weekend_pro";
  const hasFeed = Boolean(params.row);
  const feedActive = Boolean(params.row?.active);
  const paused = Boolean(params.row?.active && !isWeekendPro);

  let helperText = "Calendar subscriptions are included with Weekend Pro.";
  if (params.unverified) {
    helperText = "Confirm your email, then upgrade to Weekend Pro to create a private calendar subscription.";
  } else if (paused) {
    helperText = "Calendar subscription is paused while Weekend Pro is inactive.";
  } else if (isWeekendPro && feedActive) {
    helperText =
      "Anyone with this private URL can subscribe to your family sports schedule in Apple Calendar, Google Calendar, or Outlook. Edits still happen in Weekend Planner.";
  } else if (isWeekendPro) {
    helperText =
      "Create a private read-only calendar subscription for your family sports schedule. Notes, source metadata, and editing controls stay private.";
  }

  return {
    hasFeed,
    feedActive,
    isWeekendPro,
    isUnverified: params.unverified,
    canCreate: isWeekendPro,
    canReveal: isWeekendPro && feedActive,
    canRegenerate: isWeekendPro && feedActive,
    canCopy: isWeekendPro && feedActive,
    canRevoke: Boolean(params.row?.active),
    paused,
    helperText,
    createdAt: params.row?.created_at ?? null,
    updatedAt: params.row?.updated_at ?? null,
    lastAccessedAt: params.row?.last_accessed_at ?? null,
  };
}

async function loadOwnerSnapshot(ownerUserId: string): Promise<PlannerCalendarFeedOwnerSnapshot> {
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
  const sourceIds = Array.from(new Set(events.map((event) => collapseWhitespace(event.source_id)).filter(Boolean)));
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

function filterSuppressedEvents(events: PlannerEventRow[], suppressedKeys: Set<string>) {
  if (!suppressedKeys.size) return events;
  return events.filter((event) => {
    const sourceId = collapseWhitespace(event.source_id);
    const sourceEventUid = collapseWhitespace(event.source_event_uid);
    if (!sourceId || !sourceEventUid) return true;
    return !suppressedKeys.has(`${sourceId}:${sourceEventUid}`);
  });
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
  childrenById: Map<string, Pick<PlannerChildRow, "display_name">>,
  teamsById: Map<string, Pick<PlannerTeamRow, "display_name">>,
) {
  const childId = collapseWhitespace(event.child_profile_id);
  const teamId = collapseWhitespace(event.team_profile_id);
  const child = childId ? childrenById.get(childId) ?? null : null;
  const team = teamId ? teamsById.get(teamId) ?? null : null;
  if (child && team) return `${child.display_name} · ${team.display_name}`;
  if (child) return child.display_name;
  return null;
}

function sourceLocationLabelForEvent(event: PlannerEventRow) {
  const value = [event.address_text, event.city, event.state]
    .map((part) => collapseWhitespace(part))
    .filter(Boolean)
    .join(", ");
  return value || null;
}

function venueUrlForEvent(event: PlannerEventRow) {
  const slug = collapseWhitespace(event.linkedVenue?.seo_slug);
  if (!slug) return null;
  return `${siteOrigin()}/venues/${slug}`;
}

function locationForEvent(event: PlannerEventRow) {
  const linkedVenueName = collapseWhitespace(event.linkedVenue?.name);
  const sourceLocation = sourceLocationLabelForEvent(event);
  if (linkedVenueName && sourceLocation) return `${linkedVenueName} — ${sourceLocation}`;
  return linkedVenueName || sourceLocation || null;
}

function calendarFeedWindowRange(now = new Date()) {
  const start = new Date(now);
  start.setUTCDate(start.getUTCDate() - PLANNER_CALENDAR_FEED_LOOKBACK_DAYS);
  const end = new Date(now);
  end.setUTCDate(end.getUTCDate() + PLANNER_CALENDAR_FEED_LOOKAHEAD_DAYS);
  return { fromIso: start.toISOString(), toIso: end.toISOString() };
}

function stableUidForEvent(eventId: string) {
  const digest = createHmac("sha256", requirePlannerCalendarFeedSecret())
    .update(`planner-calendar-event:${collapseWhitespace(eventId)}`)
    .digest("hex");
  return `${digest}@tournamentinsights.com`;
}

export function escapeIcsText(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

export function foldIcsLine(line: string) {
  const chunks: string[] = [];
  let prefix = "";
  let current = "";

  for (const char of Array.from(line)) {
    const next = `${prefix}${current}${char}`;
    if (current && Buffer.byteLength(next, "utf8") > 75) {
      chunks.push(`${prefix}${current}`);
      prefix = " ";
      current = char;
      continue;
    }
    current += char;
  }

  chunks.push(`${prefix}${current}`);
  return chunks.join("\r\n");
}

function formatIcsUtc(value: string | null | undefined) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return null;
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

export function serializePlannerCalendarFeed(view: PlannerCalendarFeedDto) {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//TournamentInsights//Weekend Planner//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `NAME:${escapeIcsText(view.name)}`,
    `X-WR-CALNAME:${escapeIcsText(view.name)}`,
    `X-WR-CALDESC:${escapeIcsText(view.description)}`,
  ];

  for (const event of view.events) {
    const dtStart = formatIcsUtc(event.startsAt);
    if (!dtStart) continue;
    const dtEnd = formatIcsUtc(event.endsAt);
    const dtStamp = formatIcsUtc(event.updatedAt ?? event.startsAt) ?? dtStart;
    const lastModified = formatIcsUtc(event.updatedAt);

    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${stableUidForEvent(event.id)}`);
    lines.push(`DTSTAMP:${dtStamp}`);
    if (lastModified) lines.push(`LAST-MODIFIED:${lastModified}`);
    lines.push(`DTSTART:${dtStart}`);
    if (dtEnd) lines.push(`DTEND:${dtEnd}`);
    lines.push(`SUMMARY:${escapeIcsText(event.title)}`);
    if (event.location) lines.push(`LOCATION:${escapeIcsText(event.location)}`);
    lines.push(`DESCRIPTION:${escapeIcsText(PLANNER_CALENDAR_FEED_DESCRIPTION)}`);
    if (event.venueUrl) lines.push(`URL:${event.venueUrl}`);
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return `${lines.map(foldIcsLine).join("\r\n")}\r\n`;
}

function emptyPlannerCalendarFeed(): PlannerCalendarFeedDto {
  return {
    name: PLANNER_CALENDAR_FEED_NAME,
    description: PLANNER_CALENDAR_FEED_DESCRIPTION,
    events: [],
  };
}

export async function getPlannerCalendarFeedPanelStateForOwner(params: {
  supabase: any;
  userId: string;
  tier: TiTier;
  unverified: boolean;
}) {
  const { data } = await (params.supabase.from("planner_calendar_feeds" as any) as any)
    .select("id,owner_user_id,feed_type,scope_type,scope_target_id,token_nonce,token_version_nonce,token_hash,active,revoked_at,rotated_at,last_accessed_at,created_at,updated_at")
    .eq("owner_user_id", params.userId)
    .eq("feed_type", PLANNER_CALENDAR_FEED_TYPE_ICAL)
    .eq("scope_type", PLANNER_CALENDAR_FEED_SCOPE_FAMILY)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return createPlannerCalendarFeedPanelState({
    row: (data as PlannerCalendarFeedRow | null) ?? null,
    tier: params.tier,
    unverified: params.unverified,
  });
}

export async function upsertOwnerPlannerCalendarFeed(params: {
  supabase: any;
  ownerUserId: string;
  action: "create" | "regenerate";
}) {
  const existingRes = await (params.supabase.from("planner_calendar_feeds" as any) as any)
    .select("id,owner_user_id,feed_type,scope_type,scope_target_id,token_nonce,token_version_nonce,token_hash,active,revoked_at,rotated_at,last_accessed_at,created_at,updated_at")
    .eq("owner_user_id", params.ownerUserId)
    .eq("feed_type", PLANNER_CALENDAR_FEED_TYPE_ICAL)
    .eq("scope_type", PLANNER_CALENDAR_FEED_SCOPE_FAMILY)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nowIso = new Date().toISOString();
  const tokenNonce = generatePlannerCalendarFeedTokenNonce();
  const tokenVersionNonce = generatePlannerCalendarFeedTokenVersionNonce();
  const rawToken = buildPlannerCalendarFeedToken({
    ownerUserId: params.ownerUserId,
    scopeType: PLANNER_CALENDAR_FEED_SCOPE_FAMILY,
    scopeTargetId: null,
    tokenNonce,
    tokenVersion: tokenVersionNonce,
  });
  const tokenHash = hashPlannerCalendarFeedToken(rawToken);

  if ((existingRes.data as any)?.id) {
    const { data, error } = await (params.supabase.from("planner_calendar_feeds" as any) as any)
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
      .select("id,owner_user_id,feed_type,scope_type,scope_target_id,token_nonce,token_version_nonce,token_hash,active,revoked_at,rotated_at,last_accessed_at,created_at,updated_at")
      .single();

    if (error) throw error;
    return { row: data as PlannerCalendarFeedRow, rawToken };
  }

  const { data, error } = await (params.supabase.from("planner_calendar_feeds" as any) as any)
    .insert({
      owner_user_id: params.ownerUserId,
      feed_type: PLANNER_CALENDAR_FEED_TYPE_ICAL,
      scope_type: PLANNER_CALENDAR_FEED_SCOPE_FAMILY,
      scope_target_id: null,
      token_nonce: tokenNonce,
      token_version_nonce: tokenVersionNonce,
      token_hash: tokenHash,
      active: true,
      rotated_at: nowIso,
    })
    .select("id,owner_user_id,feed_type,scope_type,scope_target_id,token_nonce,token_version_nonce,token_hash,active,revoked_at,rotated_at,last_accessed_at,created_at,updated_at")
    .single();

  if (error) throw error;
  return { row: data as PlannerCalendarFeedRow, rawToken };
}

export async function revokeOwnerPlannerCalendarFeed(params: {
  supabase: any;
  ownerUserId: string;
}) {
  const { data, error } = await (params.supabase.from("planner_calendar_feeds" as any) as any)
    .update({
      active: false,
      revoked_at: new Date().toISOString(),
    })
    .eq("owner_user_id", params.ownerUserId)
    .eq("feed_type", PLANNER_CALENDAR_FEED_TYPE_ICAL)
    .eq("scope_type", PLANNER_CALENDAR_FEED_SCOPE_FAMILY)
    .eq("active", true)
    .select("id,owner_user_id,feed_type,scope_type,scope_target_id,token_nonce,token_version_nonce,token_hash,active,revoked_at,rotated_at,last_accessed_at,created_at,updated_at")
    .maybeSingle();

  if (error) throw error;
  return (data as PlannerCalendarFeedRow | null) ?? null;
}

export async function revealOwnerPlannerCalendarFeed(params: {
  supabase: any;
  ownerUserId: string;
}) {
  const { data, error } = await (params.supabase.from("planner_calendar_feeds" as any) as any)
    .select("id,owner_user_id,feed_type,scope_type,scope_target_id,token_nonce,token_version_nonce,token_hash,active,revoked_at,rotated_at,last_accessed_at,created_at,updated_at")
    .eq("owner_user_id", params.ownerUserId)
    .eq("feed_type", PLANNER_CALENDAR_FEED_TYPE_ICAL)
    .eq("scope_type", PLANNER_CALENDAR_FEED_SCOPE_FAMILY)
    .eq("active", true)
    .maybeSingle();

  if (error) throw error;
  const row = (data as PlannerCalendarFeedRow | null) ?? null;
  if (!row) return null;

  const rawToken = buildPlannerCalendarFeedToken({
    ownerUserId: row.owner_user_id,
    scopeType: row.scope_type,
    scopeTargetId: row.scope_target_id,
    tokenNonce: row.token_nonce,
    tokenVersion: tokenVersionForRow(row),
  });
  if (hashPlannerCalendarFeedToken(rawToken) === row.token_hash) {
    return { row, rawToken };
  }

  const nowIso = new Date().toISOString();
  const repairedTokenNonce = generatePlannerCalendarFeedTokenNonce();
  const repairedTokenVersionNonce = generatePlannerCalendarFeedTokenVersionNonce();
  const repairedRawToken = buildPlannerCalendarFeedToken({
    ownerUserId: row.owner_user_id,
    scopeType: row.scope_type,
    scopeTargetId: row.scope_target_id,
    tokenNonce: repairedTokenNonce,
    tokenVersion: repairedTokenVersionNonce,
  });
  const repairedTokenHash = hashPlannerCalendarFeedToken(repairedRawToken);
  const { data: repairedRow, error: repairedError } = await (params.supabase.from("planner_calendar_feeds" as any) as any)
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
    .select("id,owner_user_id,feed_type,scope_type,scope_target_id,token_nonce,token_version_nonce,token_hash,active,revoked_at,rotated_at,last_accessed_at,created_at,updated_at")
    .single();

  if (repairedError) throw repairedError;
  return { row: repairedRow as PlannerCalendarFeedRow, rawToken: repairedRawToken };
}

export async function resolvePlannerCalendarFeedByToken(rawToken: string) {
  const token = collapseWhitespace(rawToken);
  if (!token) return null;
  const tokenHash = hashPlannerCalendarFeedToken(token);
  const rpc = await (supabaseAdmin.rpc("resolve_planner_calendar_feed_by_token_hash" as any, {
    p_token_hash: tokenHash,
  }) as any);

  if (!rpc.error) {
    const row = Array.isArray(rpc.data) ? (rpc.data[0] ?? null) : (rpc.data ?? null);
    return (row as PlannerCalendarFeedRow | null) ?? null;
  }

  const fallback = await (supabaseAdmin.from("planner_calendar_feeds" as any) as any)
    .select("id,owner_user_id,feed_type,scope_type,scope_target_id,token_nonce,token_version_nonce,token_hash,active,revoked_at,rotated_at,last_accessed_at,created_at,updated_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (fallback.error || !fallback.data) return null;
  return fallback.data as PlannerCalendarFeedRow;
}

export async function markPlannerCalendarFeedAccessed(row: PlannerCalendarFeedRow) {
  const now = Date.now();
  const lastTouched = row.last_accessed_at ? new Date(row.last_accessed_at).getTime() : 0;
  if (lastTouched && Number.isFinite(lastTouched) && now - lastTouched < PLANNER_CALENDAR_FEED_ACCESS_UPDATE_MS) {
    return false;
  }

  try {
    await (supabaseAdmin.from("planner_calendar_feeds" as any) as any)
      .update({ last_accessed_at: new Date(now).toISOString() })
      .eq("id", row.id)
      .eq("token_hash", row.token_hash);
    return true;
  } catch {
    return false;
  }
}

export async function loadPlannerCalendarFeedByToken(token: string): Promise<PlannerCalendarFeedDto> {
  const row = await resolvePlannerCalendarFeedByToken(token);
  if (
    !row ||
    !row.active ||
    row.feed_type !== PLANNER_CALENDAR_FEED_TYPE_ICAL ||
    row.scope_type !== PLANNER_CALENDAR_FEED_SCOPE_FAMILY
  ) {
    return emptyPlannerCalendarFeed();
  }

  const owner = await loadOwnerSnapshot(row.owner_user_id);
  if (owner.tier !== "weekend_pro") {
    return emptyPlannerCalendarFeed();
  }

  const { fromIso, toIso } = calendarFeedWindowRange();
  const { data, error } = await (supabaseAdmin.from("planner_events" as any) as any)
    .select(
      "id,user_id,weekend_id,title,event_type,team_name,opponent_name,tournament_id,venue_id,field_label,address_text,city,state,starts_at,ends_at,timezone,notes,child_profile_id,team_profile_id,source_type,source_id,source_event_uid,created_at,updated_at"
    )
    .eq("user_id", row.owner_user_id)
    .gte("starts_at", fromIso)
    .lt("starts_at", toIso)
    .order("starts_at", { ascending: true })
    .limit(PLANNER_CALENDAR_FEED_MAX_EVENTS);

  if (error) throw error;

  const rawEvents = ((data ?? []) as PlannerEventRow[]).map((event) => ({
    ...event,
    source_type:
      collapseWhitespace(event.source_type) !== "ics" &&
      collapseWhitespace(event.source_id) &&
      collapseWhitespace(event.source_event_uid)
        ? "ics"
        : event.source_type,
  }));

  const suppressedKeys = await loadMergedDuplicateSuppressionSet(row.owner_user_id, rawEvents);
  const visibleEvents = filterSuppressedEvents(rawEvents, suppressedKeys);
  const enrichedEvents = await enrichPlannerEventsWithLinkedVenue(supabaseAdmin, visibleEvents);
  const childIds = Array.from(new Set(enrichedEvents.map((event) => collapseWhitespace(event.child_profile_id)).filter(Boolean)));
  const teamIds = Array.from(new Set(enrichedEvents.map((event) => collapseWhitespace(event.team_profile_id)).filter(Boolean)));
  const { childrenById, teamsById } = await loadFamilyProfiles(row.owner_user_id, childIds, teamIds);

  void markPlannerCalendarFeedAccessed(row);

  return {
    name: PLANNER_CALENDAR_FEED_NAME,
    description: PLANNER_CALENDAR_FEED_DESCRIPTION,
    events: enrichedEvents.map((event) => {
      const assignmentLabel = assignmentLabelForEvent(event, childrenById, teamsById);
      const title = collapseWhitespace(event.title) || "Untitled event";
      return {
        id: event.id,
        title: assignmentLabel ? `${title} — ${assignmentLabel}` : title,
        startsAt: event.starts_at,
        endsAt: event.ends_at ?? null,
        location: locationForEvent(event),
        venueUrl: venueUrlForEvent(event),
        updatedAt: event.updated_at ?? null,
      } satisfies PlannerCalendarFeedEvent;
    }),
  };
}
