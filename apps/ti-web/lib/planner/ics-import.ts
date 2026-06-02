import crypto from "node:crypto";
import dns from "node:dns/promises";

import ical from "node-ical";

import type { SupabaseClient } from "@supabase/supabase-js";
import { isUuid } from "@/lib/venues/isUuid";

const MAX_URL_LEN = 2000;
const MAX_ICS_CHARS = 2_000_000; // ~2MB
const MAX_REDIRECTS = 3;
const FETCH_TIMEOUT_MS = 10_000;
const MAX_EVENTS_PER_SYNC = 500;

const EVENT_WINDOW_PAST_DAYS = 30;
const EVENT_WINDOW_FUTURE_DAYS = 548; // ~18 months

const PRIVATE_HOST_SUFFIXES = [".local"];
const BLOCKED_HOSTS = new Set(["localhost"]);

export type IcsImportInput = {
  userId: string;
  sourceUrl: string;
  sourceName: string | null;
  teamName: string | null;
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

function clamp(value: string | null, maxLen: number) {
  const v = String(value ?? "").trim();
  if (!v) return null;
  return v.length > maxLen ? v.slice(0, maxLen) : v;
}

export function userSafeError(kind: "invalid_url" | "private_url" | "fetch_failed" | "not_ics" | "no_events" | "too_large") {
  if (kind === "invalid_url") return "Enter a valid iCal/ICS calendar URL.";
  if (kind === "private_url") return "That calendar link cannot point to a private or local address.";
  if (kind === "fetch_failed") return "That calendar link could not be reached.";
  if (kind === "not_ics") return "That link does not appear to be an iCal/ICS calendar.";
  if (kind === "too_large") return "That calendar is too large to import right now.";
  return "No upcoming events were found in that calendar.";
}

function parseAndValidateUrl(raw: string) {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return { ok: false as const, error: userSafeError("invalid_url") };
  if (trimmed.length > MAX_URL_LEN) return { ok: false as const, error: userSafeError("invalid_url") };

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { ok: false as const, error: userSafeError("invalid_url") };
  }

  const protocol = url.protocol.toLowerCase();
  if (protocol !== "http:" && protocol !== "https:") {
    return { ok: false as const, error: "Calendar links must start with http:// or https://." };
  }

  if (url.username || url.password) {
    return { ok: false as const, error: userSafeError("invalid_url") };
  }

  // Normalize hostnames like "localhost." which may appear from copy/paste or redirect quirks.
  const hostname = url.hostname.toLowerCase().replace(/\.+$/, "");
  if (!hostname) return { ok: false as const, error: userSafeError("invalid_url") };
  if (BLOCKED_HOSTS.has(hostname)) return { ok: false as const, error: userSafeError("private_url") };
  if (hostname.endsWith(".localhost")) return { ok: false as const, error: userSafeError("private_url") };
  if (PRIVATE_HOST_SUFFIXES.some((s) => hostname.endsWith(s))) return { ok: false as const, error: userSafeError("private_url") };

  // Fast-path block for obvious IP literals.
  if (isIpLiteral(hostname) && isPrivateIp(hostname)) return { ok: false as const, error: userSafeError("private_url") };

  return { ok: true as const, url };
}

function isIpLiteral(host: string) {
  // crude but sufficient for our needs
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":");
}

function ipToV4Parts(ip: string): number[] | null {
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) return null;
  const parts = ip.split(".").map((p) => Number(p));
  if (parts.some((n) => !Number.isFinite(n) || n < 0 || n > 255)) return null;
  return parts;
}

function isPrivateIpv4(ip: string) {
  const p = ipToV4Parts(ip);
  if (!p) return false;
  const [a, b] = p;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true; // link-local
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  return false;
}

function normalizeIpv6(ip: string) {
  return ip.toLowerCase();
}

function isPrivateIpv6(ip: string) {
  const v = normalizeIpv6(ip);
  if (v === "::1") return true;
  if (v === "::") return true;
  if (v.startsWith("fe80:")) return true; // link-local
  if (v.startsWith("fc") || v.startsWith("fd")) return true; // ULA fc00::/7
  return false;
}

function isPrivateIp(ip: string) {
  if (ip.includes(":")) return isPrivateIpv6(ip);
  return isPrivateIpv4(ip);
}

async function assertPublicHost(hostname: string) {
  // Resolve all IPs; reject if ANY is private.
  let addrs: { address: string }[] = [];
  try {
    addrs = await dns.lookup(hostname, { all: true });
  } catch {
    // If we can't resolve, treat as unreachable rather than private.
    return { ok: false as const, error: userSafeError("fetch_failed") };
  }
  if (!addrs.length) return { ok: false as const, error: userSafeError("fetch_failed") };
  for (const a of addrs) {
    if (a.address && isPrivateIp(a.address)) {
      return { ok: false as const, error: userSafeError("private_url") };
    }
  }
  return { ok: true as const };
}

function stripContentTypeParams(contentType: string | null) {
  if (!contentType) return null;
  return contentType.split(";")[0]?.trim().toLowerCase() || null;
}

async function fetchIcsTextWithManualRedirects(inputUrl: URL) {
  let current = inputUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const hostCheck = await assertPublicHost(current.hostname);
    if (!hostCheck.ok) return hostCheck;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(current.toString(), { redirect: "manual", signal: controller.signal });
    } catch {
      clearTimeout(timeout);
      return { ok: false as const, error: userSafeError("fetch_failed") };
    } finally {
      clearTimeout(timeout);
    }

    // Manual redirect handling
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) return { ok: false as const, error: userSafeError("fetch_failed") };
      let next: URL;
      try {
        next = new URL(loc, current);
      } catch {
        return { ok: false as const, error: userSafeError("fetch_failed") };
      }
      const validated = parseAndValidateUrl(next.toString());
      if (!validated.ok) return validated;
      current = validated.url;
      continue;
    }

    const contentTypeBase = stripContentTypeParams(res.headers.get("content-type"));
    const text = await res.text().catch(() => "");
    if (!text) return { ok: false as const, error: userSafeError("fetch_failed") };
    if (text.length > MAX_ICS_CHARS) return { ok: false as const, error: userSafeError("too_large") };

    const hasCalendar = text.includes("BEGIN:VCALENDAR");
    const contentOk =
      contentTypeBase === "text/calendar" ||
      (contentTypeBase === "text/plain" && hasCalendar) ||
      (!contentTypeBase && hasCalendar);

    if (!hasCalendar) return { ok: false as const, error: userSafeError("not_ics") };
    if (!contentOk) return { ok: false as const, error: userSafeError("not_ics") };
    return { ok: true as const, text, finalUrl: current.toString() };
  }
  return { ok: false as const, error: userSafeError("fetch_failed") };
}

function safeTimeZone(tz: string | null) {
  const v = String(tz ?? "").trim();
  if (!v || v.length > 64) return null;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: v }).format(new Date());
    return v;
  } catch {
    return null;
  }
}

function collapseWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function stripHtml(value: string) {
  return value.replace(/<[^>]*>/g, "");
}

function hashStable(parts: string[]) {
  return crypto.createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 32);
}

function startOfDayUtc(dateIso: string) {
  return new Date(`${dateIso}T00:00:00Z`);
}

function addDays(d: Date, days: number) {
  return new Date(d.getTime() + days * 24 * 60 * 60 * 1000);
}

function inImportWindow(dt: Date, now: Date) {
  const start = addDays(now, -EVENT_WINDOW_PAST_DAYS);
  const end = addDays(now, EVENT_WINDOW_FUTURE_DAYS);
  return dt >= start && dt <= end;
}

type NormalizedPlannerEvent = {
  title: string;
  starts_at: string;
  ends_at: string | null;
  timezone: string | null;
  notes: string | null;
  address_text: string | null;
  team_name: string | null;
  source_event_uid: string;
};

function dateToIsoUtc(d: Date) {
  return new Date(d.getTime()).toISOString();
}

function parseDateOnlyToUtcMidnight(params: { dateOnly: string; tzid: string | null }) {
  // dateOnly: YYYYMMDD
  const m = params.dateOnly.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;

  const tz = safeTimeZone(params.tzid);
  if (!tz) {
    return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
  }

  // Convert local midnight in tz to a UTC instant by using Intl parts on an initial guess.
  const guessUtc = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(guessUtc);

  // If guessUtc formats to previous day evening (common), we still want local midnight.
  // We'll compute the UTC instant for local midnight by constructing the local date and asking for its offset.
  const y = Number(parts.find((p) => p.type === "year")?.value ?? NaN);
  const mo = Number(parts.find((p) => p.type === "month")?.value ?? NaN);
  const da = Number(parts.find((p) => p.type === "day")?.value ?? NaN);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(da)) return guessUtc;

  const localMidnightGuessUtc = new Date(Date.UTC(y, mo - 1, da, 0, 0, 0, 0));
  const offsetParts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    timeZoneName: "shortOffset",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(localMidnightGuessUtc);
  const tzName = offsetParts.find((p) => p.type === "timeZoneName")?.value ?? "";
  const mm = tzName.match(/GMT([+-]\d{2}):(\d{2})/);
  if (!mm) return localMidnightGuessUtc;
  const sign = mm[1].startsWith("-") ? -1 : 1;
  const hh = Math.abs(Number(mm[1]));
  const mins = Number(mm[2]);
  const offsetMinutes = sign * (hh * 60 + mins);
  return new Date(localMidnightGuessUtc.getTime() - offsetMinutes * 60 * 1000);
}

export function normalizeIcsEvents(params: {
  icsText: string;
  sourceUrl: string;
  teamName: string | null;
}) {
  let parsed: any;
  try {
    parsed = ical.parseICS(params.icsText);
  } catch {
    return { events: [] as NormalizedPlannerEvent[], errors: [userSafeError("not_ics")], parsedTotal: 0 };
  }
  const now = new Date();
  const out: NormalizedPlannerEvent[] = [];
  const errors: string[] = [];
  let parsedTotal = 0;

  const pushEvent = (ev: any, instanceStart?: Date) => {
    parsedTotal += 1;

    const uidRaw = String(ev.uid ?? "").trim();
    const summaryRaw = String(ev.summary ?? "").trim();
    const descRaw = String(ev.description ?? "").trim();
    const locationRaw = String(ev.location ?? "").trim();
    const tzid = safeTimeZone(String(ev.tzid ?? ev.timezone ?? "") || null);

    const title = clamp(collapseWhitespace(stripHtml(summaryRaw)), 140) || "Imported calendar event";
    const notes = clamp(collapseWhitespace(stripHtml(descRaw)), 2000);
    const addressText = clamp(collapseWhitespace(stripHtml(locationRaw)), 200);

    const startDate: Date | null = (() => {
      const dt = instanceStart ?? ev.start;
      if (!dt) return null;
      if (typeof dt === "string") {
        // DATE-only
        return parseDateOnlyToUtcMidnight({ dateOnly: dt, tzid });
      }
      if (dt instanceof Date && Number.isFinite(dt.getTime())) return dt;
      return null;
    })();

    if (!startDate || !Number.isFinite(startDate.getTime())) return;
    if (!inImportWindow(startDate, now)) return;

    let endDate: Date | null = null;
    const end = ev.end ?? null;
    if (end) {
      if (typeof end === "string") {
        endDate = parseDateOnlyToUtcMidnight({ dateOnly: end, tzid });
      } else if (end instanceof Date && Number.isFinite(end.getTime())) {
        endDate = end;
      }
    }
    if (endDate && endDate.getTime() < startDate.getTime()) endDate = null;

    const startsIso = dateToIsoUtc(startDate);
    const endsIso = endDate ? dateToIsoUtc(endDate) : null;

    // source_event_uid: must never be null
    const sourceEventUid = (() => {
      if (uidRaw) {
        if (instanceStart) return `${uidRaw}|${startsIso}`;
        return uidRaw;
      }
      const h = hashStable([params.sourceUrl, title, startsIso, addressText ?? ""]);
      return `hash_${h}`;
    })();

    out.push({
      title,
      starts_at: startsIso,
      ends_at: endsIso,
      timezone: tzid,
      notes,
      address_text: addressText,
      team_name: clamp(params.teamName, 80),
      source_event_uid: sourceEventUid,
    });
  };

  for (const k of Object.keys(parsed)) {
    const ev: any = (parsed as any)[k];
    if (!ev || ev.type !== "VEVENT") continue;

    // Expand recurrence if rrule exists.
    if (ev.rrule && typeof ev.rrule.between === "function") {
      const now = new Date();
      const windowStart = addDays(now, -EVENT_WINDOW_PAST_DAYS);
      const windowEnd = addDays(now, EVENT_WINDOW_FUTURE_DAYS);
      let occurrences: Date[] = [];
      try {
        occurrences = ev.rrule.between(windowStart, windowEnd, true);
      } catch {
        occurrences = [];
      }
      for (const occStart of occurrences) {
        pushEvent(ev, occStart);
        if (out.length >= MAX_EVENTS_PER_SYNC) break;
      }
      continue;
    }

    pushEvent(ev);
    if (out.length >= MAX_EVENTS_PER_SYNC) break;
  }

  return { events: out, errors, parsedTotal };
}

async function loadExistingUids(params: { supabase: SupabaseClient; userId: string; sourceId: string }) {
  const { data, error } = await (params.supabase.from("planner_events" as any) as any)
    .select("source_event_uid")
    .eq("user_id", params.userId)
    .eq("source_id", params.sourceId)
    .not("source_event_uid", "is", null)
    .limit(2000);
  if (error) return new Set<string>();
  const set = new Set<string>();
  (data ?? []).forEach((r: any) => {
    const v = String(r?.source_event_uid ?? "").trim();
    if (v) set.add(v);
  });
  return set;
}

export async function importIcsToPlanner(params: {
  supabase: SupabaseClient;
  input: IcsImportInput;
}): Promise<IcsImportResult> {
  const { supabase, input } = params;
  if (!isUuid(input.userId)) return { ok: false, status: 400, error: userSafeError("invalid_url") };

  const validated = parseAndValidateUrl(input.sourceUrl);
  if (!validated.ok) return { ok: false, status: 400, error: validated.error };

  const fetched = await fetchIcsTextWithManualRedirects(validated.url);
  if (!fetched.ok) return { ok: false, status: 400, error: fetched.error };
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

  const sourceId = input.sourceId ? String(input.sourceId).trim() : "";
  if (input.sourceId && !isUuid(sourceId)) return { ok: false, status: 400, error: "invalid_source_id" };

  // Imports create/upsert the source row; refresh uses an existing source row and is updated by refreshIcsSource.
  let finalSourceId = sourceId;
  if (!finalSourceId) {
    const existing = await (supabase.from("planner_event_sources" as any) as any)
      .select("id,source_name,team_name")
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

    finalSourceName = requestedSourceName || (existingSourceName ? existingSourceName.slice(0, 100) : null);
    finalTeamName = requestedTeamName || (existingTeamName ? existingTeamName.slice(0, 80) : null);

    const upsertSource = await (supabase.from("planner_event_sources" as any) as any)
      .upsert(
        {
          user_id: input.userId,
          source_type: "ics",
          source_name: finalSourceName,
          source_url: fetched.finalUrl,
          team_name: finalTeamName,
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

  const existingUidSet = await loadExistingUids({ supabase, userId: input.userId, sourceId: finalSourceId });

  const newEvents: NormalizedPlannerEvent[] = [];
  const existingEvents: NormalizedPlannerEvent[] = [];
  for (const e of usableEvents) {
    if (!e.source_event_uid) continue; // should never happen
    if (existingUidSet.has(e.source_event_uid)) existingEvents.push(e);
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
      team_name: e.team_name,
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
          const patch = {
            title: e.title,
            starts_at: e.starts_at,
            ends_at: e.ends_at,
            timezone: e.timezone,
            address_text: e.address_text,
            team_name: e.team_name,
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
    const existingByUid = new Map<
      string,
      {
        id: string;
        title: string | null;
        starts_at: string | null;
        ends_at: string | null;
        timezone: string | null;
        address_text: string | null;
        team_name: string | null;
      }
    >();

    if (input.mode === "refresh") {
      const uids = existingEvents
        .map((e) => String(e.source_event_uid || "").trim())
        .filter(Boolean)
        .slice(0, MAX_EVENTS_PER_SYNC);

      if (uids.length) {
        const { data, error } = await (supabase.from("planner_events" as any) as any)
          .select("id,source_event_uid,title,starts_at,ends_at,timezone,address_text,team_name")
          .eq("user_id", input.userId)
          .eq("source_id", finalSourceId)
          .in("source_event_uid", uids)
          .limit(uids.length);
        if (error) {
          logSupabaseError("select planner_events for change detection failed", error);
          return { ok: false, status: 500, error: genericImportFailure() };
        }

        for (const row of (data ?? []) as any[]) {
          const uid = String(row?.source_event_uid || "").trim();
          if (!uid) continue;
          existingByUid.set(uid, {
            id: String(row?.id || ""),
            title: row?.title ?? null,
            starts_at: row?.starts_at ?? null,
            ends_at: row?.ends_at ?? null,
            timezone: row?.timezone ?? null,
            address_text: row?.address_text ?? null,
            team_name: row?.team_name ?? null,
          });
        }
      }
    }

    for (const e of existingEvents.slice(0, MAX_EVENTS_PER_SYNC)) {
      if (input.mode === "refresh") {
        const uid = String(e.source_event_uid || "").trim();
        const prev = uid ? existingByUid.get(uid) : null;
        if (prev) {
          const changeLabels: ("time" | "location" | "title" | "team" | "timezone")[] = [];
          if ((prev.title ?? null) !== (e.title ?? null)) changeLabels.push("title");
          if ((prev.starts_at ?? null) !== (e.starts_at ?? null) || (prev.ends_at ?? null) !== (e.ends_at ?? null)) changeLabels.push("time");
          if ((prev.address_text ?? null) !== (e.address_text ?? null)) changeLabels.push("location");
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
        team_name: e.team_name,
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
