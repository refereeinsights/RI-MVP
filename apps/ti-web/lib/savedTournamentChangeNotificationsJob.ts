import crypto from "crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sendEmail } from "@/lib/email";
import { buildSavedTournamentChangeDigestEmail } from "@/lib/savedTournamentChangeNotificationsEmail";

const USER_COOLDOWN_HOURS = 24;
const TOURNAMENT_COOLDOWN_DAYS = 7;
const MAX_TOURNAMENTS_PER_EMAIL = 10;

type SubscriptionRow = {
  id: string;
  user_id: string;
  tournament_id: string;
  notify_on_changes: boolean;
  last_notified_at: string | null;
  last_notified_hash: string | null;
  last_notified_critical_hash: string | null;
};

type TournamentPublicRow = {
  id: string;
  slug: string | null;
  name: string | null;
  sport: string | null;
  city: string | null;
  state: string | null;
  start_date: string | null;
  end_date: string | null;
  official_website_url: string | null;
};

function nowIso() {
  return new Date().toISOString();
}

function hoursSince(iso: string | null, now: Date) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return (now.getTime() - d.getTime()) / (1000 * 60 * 60);
}

function daysSince(iso: string | null, now: Date) {
  const hours = hoursSince(iso, now);
  return hours == null ? null : hours / 24;
}

function normalizeSlug(value: string | null) {
  const slug = (value ?? "").trim();
  return slug ? slug : null;
}

function stableJsonHash(value: unknown) {
  const raw = JSON.stringify(value);
  return crypto.createHash("sha256").update(raw).digest("hex");
}

function buildSnapshot(t: TournamentPublicRow) {
  // Public-visible core fields only (explicitly excludes venue-linkage / enrichment / analytics).
  return {
    id: t.id,
    slug: normalizeSlug(t.slug),
    name: t.name ?? null,
    sport: t.sport ?? null,
    city: t.city ?? null,
    state: t.state ?? null,
    start_date: t.start_date ?? null,
    end_date: t.end_date ?? null,
    official_website_url: t.official_website_url ?? null,
  };
}

function buildCriticalSnapshot(t: TournamentPublicRow) {
  return {
    slug: normalizeSlug(t.slug),
    name: t.name ?? null,
    city: t.city ?? null,
    state: t.state ?? null,
    start_date: t.start_date ?? null,
    end_date: t.end_date ?? null,
  };
}

async function loadSubscriptions(): Promise<SubscriptionRow[]> {
  const { data, error } = await (supabaseAdmin.from("ti_saved_tournaments" as any) as any)
    .select(
      "id,user_id,tournament_id,notify_on_changes,last_notified_at,last_notified_hash,last_notified_critical_hash"
    )
    .eq("notify_on_changes", true)
    .limit(5000);
  if (error) throw error;
  return (data ?? []) as SubscriptionRow[];
}

async function loadTournamentsPublicById(ids: string[]) {
  const unique = Array.from(new Set(ids)).filter(Boolean);
  if (!unique.length) return new Map<string, TournamentPublicRow>();

  const map = new Map<string, TournamentPublicRow>();
  for (let i = 0; i < unique.length; i += 500) {
    const batch = unique.slice(i, i + 500);
    const { data, error } = await (supabaseAdmin.from("tournaments_public" as any) as any)
      .select("id,slug,name,sport,city,state,start_date,end_date,official_website_url")
      .in("id", batch);
    if (error) throw error;
    for (const row of (data ?? []) as TournamentPublicRow[]) {
      if (!row?.id) continue;
      map.set(String(row.id), row);
    }
  }
  return map;
}

async function loadUserEmails(userIds: string[]) {
  const unique = Array.from(new Set(userIds)).filter(Boolean);
  const byUserId = new Map<string, string>();
  if (!unique.length) return byUserId;

  for (let i = 0; i < unique.length; i += 500) {
    const batch = unique.slice(i, i + 500);
    const { data, error } = await (supabaseAdmin.from("ti_users" as any) as any)
      .select("id,email")
      .in("id", batch);
    if (error) throw error;
    for (const row of (data ?? []) as Array<{ id: string; email: string | null }>) {
      const email = (row.email ?? "").trim();
      if (!row.id || !email) continue;
      byUserId.set(String(row.id), email);
    }
  }
  return byUserId;
}

async function logSend(params: {
  userId: string;
  recipientEmail: string;
  tournamentsCount: number;
  outcome: "sent" | "error";
  errorMessage: string | null;
}) {
  const safeError =
    params.errorMessage && params.errorMessage.length > 900
      ? `${params.errorMessage.slice(0, 900)}…`
      : params.errorMessage;

  try {
    await (supabaseAdmin.from("ti_tournament_alert_send_logs" as any) as any).insert({
      alert_id: null,
      user_id: params.userId,
      cadence: null,
      recipient_email: params.recipientEmail,
      tournaments_count: params.tournamentsCount,
      result_hash: null,
      outcome: params.outcome,
      error_message: safeError ? `saved_changes: ${safeError}` : null,
    });
  } catch {
    // best-effort only
  }
}

export async function runSavedTournamentChangeNotificationsJob() {
  const now = new Date();
  const triggeredAt = nowIso();

  const result = {
    ok: true,
    triggered_at: triggeredAt,
    subscriptions_scanned: 0,
    tournaments_loaded: 0,
    users_scanned: 0,
    users_in_cooldown: 0,
    users_emailed: 0,
    tournaments_notified: 0,
    tournaments_unchanged: 0,
    tournaments_in_cooldown: 0,
    skipped_missing_slug: 0,
    skipped_missing_user_email: 0,
    send_failures: 0,
    update_failures: 0,
  };

  const subscriptions = await loadSubscriptions();
  result.subscriptions_scanned = subscriptions.length;
  if (!subscriptions.length) return result;

  const tournamentsById = await loadTournamentsPublicById(subscriptions.map((s) => s.tournament_id));
  result.tournaments_loaded = tournamentsById.size;

  const emailsByUserId = await loadUserEmails(subscriptions.map((s) => s.user_id));

  const byUser = new Map<string, SubscriptionRow[]>();
  for (const sub of subscriptions) {
    if (!sub?.user_id || !sub.tournament_id) continue;
    const list = byUser.get(sub.user_id) ?? [];
    list.push(sub);
    byUser.set(sub.user_id, list);
  }

  result.users_scanned = byUser.size;

  // Track per-user last notify for cooldown (max across that user's subscriptions).
  const userLastNotifiedAt = new Map<string, string | null>();
  for (const [userId, subs] of byUser.entries()) {
    let latest: string | null = null;
    for (const s of subs) {
      if (!s.last_notified_at) continue;
      if (!latest || s.last_notified_at > latest) latest = s.last_notified_at;
    }
    userLastNotifiedAt.set(userId, latest);
  }

  for (const [userId, subs] of byUser.entries()) {
    const lastUserNotify = userLastNotifiedAt.get(userId) ?? null;
    const userAgeHours = hoursSince(lastUserNotify, now);
    if (userAgeHours != null && userAgeHours < USER_COOLDOWN_HOURS) {
      result.users_in_cooldown += 1;
      continue;
    }

    const recipientEmail = emailsByUserId.get(userId) ?? null;
    if (!recipientEmail) {
      result.skipped_missing_user_email += 1;
      continue;
    }

    const changed: Array<{
      sub: SubscriptionRow;
      tournament: TournamentPublicRow;
      snapshotHash: string;
      criticalHash: string;
      isCriticalChange: boolean;
    }> = [];

    for (const sub of subs) {
      const tournament = tournamentsById.get(sub.tournament_id);
      if (!tournament) continue;
      const slug = normalizeSlug(tournament.slug);
      if (!slug) {
        result.skipped_missing_slug += 1;
        continue;
      }

      const snapshot = buildSnapshot(tournament);
      if (!snapshot.slug) {
        result.skipped_missing_slug += 1;
        continue;
      }
      const snapshotHash = stableJsonHash(snapshot);

      if (sub.last_notified_hash && sub.last_notified_hash === snapshotHash) {
        result.tournaments_unchanged += 1;
        continue;
      }

      const criticalHash = stableJsonHash(buildCriticalSnapshot(tournament));
      const isCriticalChange =
        Boolean(sub.last_notified_critical_hash) && sub.last_notified_critical_hash !== criticalHash;

      const ageDays = daysSince(sub.last_notified_at, now);
      if (!isCriticalChange && ageDays != null && ageDays < TOURNAMENT_COOLDOWN_DAYS) {
        result.tournaments_in_cooldown += 1;
        continue;
      }

      changed.push({ sub, tournament, snapshotHash, criticalHash, isCriticalChange });
    }

    if (changed.length === 0) continue;

    changed.sort((a, b) => {
      const aDate = a.tournament.start_date ?? "9999-12-31";
      const bDate = b.tournament.start_date ?? "9999-12-31";
      if (aDate !== bDate) return aDate.localeCompare(bDate);
      return (a.tournament.name ?? "").localeCompare(b.tournament.name ?? "");
    });

    const toSend = changed.slice(0, MAX_TOURNAMENTS_PER_EMAIL);
    const email = buildSavedTournamentChangeDigestEmail({
      tournaments: toSend.map(({ tournament }) => ({
        id: tournament.id,
        slug: normalizeSlug(tournament.slug)!,
        name: tournament.name,
        sport: tournament.sport,
        city: tournament.city,
        state: tournament.state,
        start_date: tournament.start_date,
        end_date: tournament.end_date,
      })),
    });

    let sendError: string | null = null;
    try {
      await sendEmail({
        to: recipientEmail,
        subject: email.subject,
        html: email.html,
        text: email.text,
      });
    } catch (error) {
      sendError = error instanceof Error ? error.message : "Failed to send email.";
      result.send_failures += 1;
    }

    await logSend({
      userId,
      recipientEmail,
      tournamentsCount: toSend.length,
      outcome: sendError ? "error" : "sent",
      errorMessage: sendError,
    });

    if (sendError) continue;

    result.users_emailed += 1;
    result.tournaments_notified += toSend.length;

    // Update only the rows included in this email so overflow changes can be delivered next run/day.
    for (const item of toSend) {
      const { error } = await (supabaseAdmin.from("ti_saved_tournaments" as any) as any)
        .update({
          last_notified_at: triggeredAt,
          last_notified_hash: item.snapshotHash,
          last_notified_critical_hash: item.criticalHash,
        })
        .eq("id", item.sub.id)
        .eq("user_id", userId);
      if (error) result.update_failures += 1;
    }
  }

  return result;
}

