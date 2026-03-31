import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sendEmailVerified } from "@/lib/email";
import {
  buildResultHash,
  computeAlertWindowUtc,
  haversineMiles,
  type AlertCadence,
} from "@/lib/tournamentAlerts";
import { buildTournamentAlertEmail } from "@/lib/tournamentAlertsEmail";
import { getTier, type TiProfile, type TiTier } from "@/lib/entitlements";
import { TI_SPORTS, type TiSport } from "@/lib/tiSports";

type AlertRow = {
  id: string;
  user_id: string;
  name: string | null;
  zip_code: string;
  radius_miles: number;
  days_ahead: number;
  sport: string | null;
  cadence: AlertCadence;
  is_active: boolean;
  last_sent_at: string | null;
  last_result_hash: string | null;
};

type ZipCentroidRow = {
  zip: string;
  latitude: number | null;
  longitude: number | null;
};

type TournamentPublicRow = {
  id: string;
  slug: string | null;
  name: string | null;
  sport: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  start_date: string | null;
  end_date: string | null;
};

type TournamentVenueLinkRow = {
  tournament_id: string;
  venue_id: string;
};

type OwlsEyeRunRow = {
  id: string;
  run_id: string | null;
  venue_id: string | null;
  updated_at?: string | null;
  created_at?: string | null;
};

function chunk<T>(items: T[], size: number) {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }
  return result;
}

function isDue(cadence: AlertCadence, lastSentAt: string | null, now: Date) {
  if (!lastSentAt) return true;
  const last = new Date(lastSentAt);
  if (Number.isNaN(last.getTime())) return true;
  const ageMs = now.getTime() - last.getTime();
  const hours = ageMs / (1000 * 60 * 60);
  if (cadence === "daily") return hours >= 24;
  return hours >= 24 * 7;
}

function normalizeTiSport(value: string | null): TiSport | null {
  if (!value) return null;
  const raw = value.trim().toLowerCase();
  const allowed = new Set<string>(TI_SPORTS.map((s) => s.toLowerCase()));
  return allowed.has(raw) ? (raw as TiSport) : null;
}

function normalizeSlug(value: string | null) {
  const slug = (value ?? "").trim();
  return slug ? slug : null;
}

function normalizeZip5(value: string | null) {
  const digits = (value ?? "").replace(/\D+/g, "");
  if (digits.length < 5) return null;
  return digits.slice(0, 5);
}

async function loadZipCentroid(zip5: string) {
  const { data, error } = await (supabaseAdmin.from("zip_centroids" as any) as any)
    .select("zip, latitude, longitude")
    .eq("zip", zip5)
    .maybeSingle();
  if (error) throw error;
  const row = (data ?? null) as ZipCentroidRow | null;
  if (!row?.zip || row.latitude == null || row.longitude == null) return null;
  return { zip: row.zip, latitude: row.latitude, longitude: row.longitude };
}

async function loadZipCentroidMap(zip5s: string[]) {
  const map = new Map<string, { latitude: number; longitude: number }>();
  const unique = Array.from(new Set(zip5s)).filter(Boolean);
  if (!unique.length) return map;

  for (const group of chunk(unique, 500)) {
    const { data, error } = await (supabaseAdmin.from("zip_centroids" as any) as any)
      .select("zip, latitude, longitude")
      .in("zip", group);
    if (error) throw error;
    for (const row of (data ?? []) as ZipCentroidRow[]) {
      if (!row.zip || row.latitude == null || row.longitude == null) continue;
      map.set(row.zip, { latitude: row.latitude, longitude: row.longitude });
    }
  }

  return map;
}

async function loadCandidateTournaments(params: {
  start: string;
  end: string;
  sport: string | null;
}) {
  let query = (supabaseAdmin.from("tournaments_public" as any) as any)
    .select("id, slug, name, sport, city, state, zip, start_date, end_date")
    .gte("start_date", params.start)
    .lte("start_date", params.end)
    .order("start_date", { ascending: true })
    .limit(5000);

  if (params.sport) {
    query = query.eq("sport", params.sport);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as TournamentPublicRow[];
}

async function getUserTierAndRecipient(userId: string): Promise<{ tier: TiTier; email: string | null }> {
  const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId);
  if (error) throw error;
  const email = data.user?.email?.trim() ?? "";

  const { data: profile } = await (supabaseAdmin.from("ti_users" as any) as any)
    .select("plan,subscription_status,current_period_end,trial_ends_at")
    .eq("id", userId)
    .maybeSingle();

  const tier = getTier((data.user ?? null) as any, (profile ?? null) as TiProfile);
  return { tier, email: email || null };
}

async function fetchLatestOwlsEyeRuns(venueIds: string[]) {
  if (!venueIds.length) return [] as OwlsEyeRunRow[];

  const primary = await (supabaseAdmin.from("owls_eye_runs" as any) as any)
    .select("id,run_id,venue_id,status,updated_at,created_at")
    .in("venue_id", venueIds)
    .order("updated_at", { ascending: false })
    .order("created_at", { ascending: false });

  const primaryErrCode = (primary as any)?.error?.code;
  if (!primary.error) {
    return (primary.data as OwlsEyeRunRow[] | null) ?? [];
  }

  // Backward compatibility for environments where updated_at is missing.
  if (primaryErrCode === "42703" || primaryErrCode === "PGRST204") {
    const fallback = await (supabaseAdmin.from("owls_eye_runs" as any) as any)
      .select("id,run_id,venue_id,status,created_at")
      .in("venue_id", venueIds)
      .order("created_at", { ascending: false });
    return (fallback.data as OwlsEyeRunRow[] | null) ?? [];
  }

  return [];
}

async function loadOwlsEyeCountsByTournamentId(tournamentIds: string[]) {
  const result = new Map<string, { coffee: number; food: number; hotels: number; gear: number }>();
  const uniqueTournamentIds = Array.from(new Set(tournamentIds)).filter(Boolean);
  if (!uniqueTournamentIds.length) return result;

  const { data: linksRaw } = await (supabaseAdmin.from("tournament_venues" as any) as any)
    .select("tournament_id,venue_id")
    .in("tournament_id", uniqueTournamentIds);

  const links = ((linksRaw as TournamentVenueLinkRow[] | null) ?? []).filter(
    (row) => Boolean(row?.tournament_id && row?.venue_id)
  );

  const venueIds = Array.from(new Set(links.map((row) => row.venue_id))).filter(Boolean);
  if (!venueIds.length) return result;

  const runRows = await fetchLatestOwlsEyeRuns(venueIds);
  const latestRunIdByVenueId = new Map<string, string>();
  for (const row of runRows) {
    const venueId = row.venue_id ?? null;
    if (!venueId) continue;
    if (latestRunIdByVenueId.has(venueId)) continue;
    const runId = (row.run_id ?? row.id ?? "").trim();
    if (!runId) continue;
    latestRunIdByVenueId.set(venueId, runId);
  }

  const runIds = Array.from(new Set(Array.from(latestRunIdByVenueId.values()))).filter(Boolean);
  if (!runIds.length) return result;

  const countsByRunId = new Map<string, { coffee: number; food: number; hotels: number; gear: number }>();
  for (const group of chunk(runIds, 1000)) {
    const { data: nearbyRowsRaw } = await (supabaseAdmin.from("owls_eye_nearby_food" as any) as any)
      .select("run_id,category")
      .in("run_id", group);

    for (const row of ((nearbyRowsRaw as Array<{ run_id: string; category: string | null }> | null) ?? [])) {
      const runId = (row.run_id ?? "").trim();
      if (!runId) continue;
      const normalizedCategory = (row.category ?? "food").toLowerCase();
      const current = countsByRunId.get(runId) ?? { coffee: 0, food: 0, hotels: 0, gear: 0 };
      if (normalizedCategory === "coffee") current.coffee += 1;
      else if (normalizedCategory === "hotel" || normalizedCategory === "hotels") current.hotels += 1;
      else if (normalizedCategory === "sporting_goods" || normalizedCategory === "big_box_fallback") current.gear += 1;
      else current.food += 1;
      countsByRunId.set(runId, current);
    }
  }

  const countsByVenueId = new Map<string, { coffee: number; food: number; hotels: number; gear: number }>();
  for (const [venueId, runId] of latestRunIdByVenueId.entries()) {
    const counts = countsByRunId.get(runId) ?? { coffee: 0, food: 0, hotels: 0, gear: 0 };
    countsByVenueId.set(venueId, counts);
  }

  for (const link of links) {
    const counts = countsByVenueId.get(link.venue_id) ?? null;
    if (!counts) continue;
    const existing = result.get(link.tournament_id) ?? { coffee: 0, food: 0, hotels: 0, gear: 0 };
    existing.coffee += counts.coffee;
    existing.food += counts.food;
    existing.hotels += counts.hotels;
    existing.gear += counts.gear;
    result.set(link.tournament_id, existing);
  }

  return result;
}

export async function runTournamentAlertsCronJob() {
  const now = new Date();
  const nowIso = now.toISOString();

  const result = {
    ok: true,
    triggered_at: nowIso,
    scanned: 0,
    due: 0,
    sent: 0,
    skipped_not_due: 0,
    skipped_no_matches: 0,
    skipped_unchanged: 0,
    skipped_missing_user_zip: 0,
    skipped_missing_tournament_zip: 0,
    skipped_missing_auth_email: 0,
    send_failures: 0,
    update_failures: 0,
  };

  const { data: alertsRaw, error: alertsError } = await (supabaseAdmin
    .from("user_tournament_alerts" as any) as any)
    .select("id,user_id,name,zip_code,radius_miles,days_ahead,sport,cadence,is_active,last_sent_at,last_result_hash")
    .eq("is_active", true)
    .in("cadence", ["daily", "weekly"])
    .limit(500);

  if (alertsError) throw alertsError;

  const alerts = (alertsRaw ?? []) as AlertRow[];
  result.scanned = alerts.length;

  for (const alert of alerts) {
    if (!alert?.id || !alert.user_id) continue;

    if (!isDue(alert.cadence, alert.last_sent_at ?? null, now)) {
      result.skipped_not_due += 1;
      continue;
    }
    result.due += 1;

    const alertZip5 = normalizeZip5(alert.zip_code);
    if (!alertZip5) {
      result.skipped_missing_user_zip += 1;
      continue;
    }

    const centroid = await loadZipCentroid(alertZip5);
    if (!centroid) {
      result.skipped_missing_user_zip += 1;
      continue;
    }

    const window = computeAlertWindowUtc(alert.days_ahead);
    const candidates = await loadCandidateTournaments({
      start: window.start,
      end: window.end,
      sport: alert.sport,
    });

    const normalizedCandidates = candidates
      .map((t) => {
        const slug = normalizeSlug(t.slug);
        const zip = normalizeZip5(t.zip);
        if (!slug) return null;
        return { ...t, slug, zip };
      })
      .filter((t): t is (TournamentPublicRow & { slug: string; zip: string | null }) => Boolean(t));

    const tournamentZips = normalizedCandidates.map((t) => t.zip).filter((z): z is string => Boolean(z));
    const zipMap = await loadZipCentroidMap(tournamentZips);

    let skippedMissingTournamentZip = 0;
    const withinRadius: (TournamentPublicRow & { slug: string; zip: string })[] = [];

    for (const t of normalizedCandidates) {
      if (!t.zip) {
        skippedMissingTournamentZip += 1;
        continue;
      }
      const tz = zipMap.get(t.zip);
      if (!tz) {
        skippedMissingTournamentZip += 1;
        continue;
      }
      const distance = haversineMiles(centroid.latitude, centroid.longitude, tz.latitude, tz.longitude);
      if (distance <= alert.radius_miles) {
        withinRadius.push({ ...(t as any), slug: t.slug, zip: t.zip });
      }
    }

    result.skipped_missing_tournament_zip += skippedMissingTournamentZip;

    withinRadius.sort((a, b) => {
      const aDate = a.start_date ?? "9999-12-31";
      const bDate = b.start_date ?? "9999-12-31";
      if (aDate !== bDate) return aDate.localeCompare(bDate);
      return (a.name ?? "").localeCompare(b.name ?? "");
    });

    const top = withinRadius.slice(0, 10);
    if (top.length === 0) {
      result.skipped_no_matches += 1;
      continue;
    }

    const ids = top.map((t) => t.id);
    const hash = buildResultHash(ids);
    if (alert.last_result_hash && alert.last_result_hash === hash) {
      result.skipped_unchanged += 1;
      continue;
    }

    const { tier, email: recipientEmail } = await getUserTierAndRecipient(alert.user_id);
    if (!recipientEmail) {
      result.skipped_missing_auth_email += 1;
      continue;
    }

    const sport = normalizeTiSport(alert.sport);
    const owlsEyeCountsByTournamentId = tier === "insider" ? await loadOwlsEyeCountsByTournamentId(ids) : new Map();
    const email = buildTournamentAlertEmail({
      cadence: alert.cadence,
      tier,
      zip: alertZip5,
      radiusMiles: alert.radius_miles,
      daysAhead: alert.days_ahead,
      sport,
      tournaments: top.map((t) => ({
        id: t.id,
        slug: t.slug,
        name: t.name,
        sport: t.sport,
        city: t.city,
        state: t.state,
        start_date: t.start_date,
        end_date: t.end_date,
        owls_eye_counts: owlsEyeCountsByTournamentId.get(t.id) ?? null,
      })),
    });

    const tournamentsCount = top.length;
    let sendErrorMessage: string | null = null;
    try {
      await sendEmailVerified({
        to: recipientEmail,
        subject: email.subject,
        html: email.html,
        text: email.text,
        kind: "transactional",
      });
    } catch (error) {
      sendErrorMessage = error instanceof Error ? error.message : "Failed to send email.";
      result.send_failures += 1;
    }

    // Log only sends + send errors (v1 KPIs/debugging).
    try {
      const safeError =
        sendErrorMessage && sendErrorMessage.length > 900 ? `${sendErrorMessage.slice(0, 900)}…` : sendErrorMessage;
      await (supabaseAdmin.from("ti_tournament_alert_send_logs" as any) as any).insert({
        alert_id: alert.id,
        user_id: alert.user_id,
        cadence: alert.cadence,
        recipient_email: recipientEmail,
        tournaments_count: tournamentsCount,
        result_hash: hash,
        outcome: sendErrorMessage ? "error" : "sent",
        error_message: safeError,
      });
    } catch {
      // Don't fail the job if logging fails.
    }

    if (sendErrorMessage) continue;

    const { error: updateError } = await (supabaseAdmin.from("user_tournament_alerts" as any) as any)
      .update({
        last_sent_at: nowIso,
        last_result_hash: hash,
      })
      .eq("id", alert.id)
      .eq("user_id", alert.user_id);

    if (updateError) {
      result.update_failures += 1;
      continue;
    }

    result.sent += 1;
  }

  return result;
}
