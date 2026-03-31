import Link from "next/link";
import { redirect } from "next/navigation";
import type { User as AuthUser } from "@supabase/supabase-js";
import AdminNav from "@/components/admin/AdminNav";
import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { buildTiAdminSsoUrl } from "@/lib/tiSso";
import LabelPrintSettings from "./LabelPrintSettings";
import PrintLabelButton from "./PrintLabelButton";
import TopTournamentsByStartedTable from "./TopTournamentsByStartedTable";

export const runtime = "nodejs";

type TiUserRow = {
  id: string;
  email: string | null;
  signup_source: string | null;
  signup_source_code: string | null;
  plan: string | null;
  subscription_status: string | null;
  trial_ends_at: string | null;
  current_period_end: string | null;
  created_at: string | null;
  first_seen_at: string | null;
  last_seen_at: string | null;
  display_name: string | null;
  username: string | null;
  reviewer_handle: string | null;
  zip_code: string | null;
  sports_interests: string[] | null;
};

type AuthTroubleshootRow = {
  id: string;
  email: string | null;
  created_at: string | null;
  email_confirmed_at: string | null;
  last_sign_in_at: string | null;
  has_ti_user: boolean;
  ti_plan: string | null;
  ti_status: string | null;
  profile_role: string | null;
};

type EventCodeSource = "ti_event_codes" | "event_codes";

type EventCodeRow = {
  id: string | null;
  code: string | null;
  status: string | null;
  trial_days: number | null;
  max_redemptions: number | null;
  redeemed_count: number | null;
  starts_at: string | null;
  expires_at: string | null;
  created_at: string | null;
  notes: string | null;
  founding_access: boolean;
  raw: Record<string, unknown>;
};

type EventCodeLoadResult = {
  source: EventCodeSource | null;
  rows: EventCodeRow[];
  error: string | null;
};

type QuickCheckMetrics = {
  windowDays: number;
  totalOpened: number;
  totalStarted: number;
  totalDismissed: number;
  totalSubmitted: number;
  totalSubmissions: number;
  avgFieldsCompleted: number;
  submissionFieldCounts: Record<string, number>;
  submissionPageTypeCounts: Record<string, number>;
  topTournamentsByStarted: Array<{
    tournamentId: string | null;
    startedCount: number;
    tournamentName: string | null;
    tournamentSlug: string | null;
    tournamentSport: string | null;
    tournamentState: string | null;
  }>;
  topVenuesBySubmissions: Array<{
    venueId: string | null;
    submissionCount: number;
    lastSubmissionAt: string | null;
    venueName: string | null;
    venueCity: string | null;
    venueState: string | null;
    venueSeoSlug: string | null;
  }>;
};

type QuickCheckRow = {
  venue_id: string;
  source_tournament_id: string | null;
  restroom_cleanliness: number | null;
  shade_score: number | null;
  parking_distance: string | null;
  bring_field_chairs: boolean | null;
  restroom_type: string | null;
};

type TournamentQuickCheckRollup = {
  tournamentId: string;
  submissions: number;
  venuesTouched: number;
  restroomCleanlinessLabel: string | null;
  shadeLabel: string | null;
  parkingDistanceTop: string | null;
  restroomTypeTop: string | null;
  bringChairsValue: string | null;
  bringChairsTitle: string | null;
};

function scoreLabel(kind: "cleanliness" | "shade", value: number | null): string | null {
  if (value == null) return null;
  const rounded = Math.max(1, Math.min(5, Math.round(value)));
  if (kind === "cleanliness") {
    return (
      {
        1: "Poor",
        2: "Fair",
        3: "Good",
        4: "Great",
        5: "Spotless",
      } as const
    )[rounded as 1 | 2 | 3 | 4 | 5];
  }
  return (
    {
      1: "None",
      2: "Poor",
      3: "Fair",
      4: "Good",
      5: "Great",
    } as const
  )[rounded as 1 | 2 | 3 | 4 | 5];
}

function avg(nums: Array<number | null | undefined>): number | null {
  let sum = 0;
  let n = 0;
  for (const v of nums) {
    if (v == null) continue;
    sum += v;
    n++;
  }
  return n ? sum / n : null;
}

function topValue(values: Array<string | null | undefined>): string | null {
  const counts = new Map<string, number>();
  for (const v of values) {
    if (!v) continue;
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestCount = -1;
  for (const [v, c] of counts.entries()) {
    if (c > bestCount) {
      best = v;
      bestCount = c;
    }
  }
  return best;
}

const TI_SPORTS = [
  "soccer",
  "basketball",
  "football",
  "baseball",
  "softball",
  "volleyball",
  "lacrosse",
  "wrestling",
  "hockey",
  "futsal",
] as const;

const TI_SPORT_LABELS: Record<(typeof TI_SPORTS)[number], string> = {
  soccer: "Soccer",
  basketball: "Basketball",
  football: "Football",
  baseball: "Baseball",
  softball: "Softball",
  volleyball: "Volleyball",
  lacrosse: "Lacrosse",
  wrestling: "Wrestling",
  hockey: "Hockey",
  futsal: "Futsal",
};

const USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/;
const ZIP_PATTERN = /^\d{5}(?:-\d{4})?$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
const ALERT_START_OFFSET_DAYS = 21;
const ALERT_DAYS_AHEAD_DEFAULT = 14;
const DEMO_TOURNAMENT_SLUG = "refereeinsights-demo-tournament";

function fmtDate(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

function normalizeDisplayName(value: string | null | undefined) {
  const normalized = (value ?? "").trim();
  return normalized || null;
}

function normalizeUsername(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
}

function normalizeZipCode(value: string | null | undefined) {
  return (value ?? "").trim();
}

function normalizeSportsInterests(values: string[]) {
  const allowed = new Set<string>(TI_SPORTS);
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const value of values) {
    const sport = String(value ?? "").trim().toLowerCase();
    if (!allowed.has(sport) || seen.has(sport)) continue;
    seen.add(sport);
    normalized.push(sport);
  }

  return normalized;
}

function displayNameFromEmail(email: string | null) {
  if (!email) return "Unknown user";
  const local = email.split("@")[0] ?? "";
  const clean = local.replace(/[._-]+/g, " ").trim();
  if (!clean) return email;
  return clean
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function asText(value: unknown) {
  if (value == null) return null;
  const text = String(value).trim();
  return text.length ? text : null;
}

function asInt(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function asBool(value: unknown) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "on";
  }
  return false;
}

function parseEventCodeRow(row: Record<string, unknown>): EventCodeRow {
  return {
    id: asText(row.id),
    code: asText(row.code),
    status: asText(row.status),
    trial_days: asInt(row.trial_days),
    max_redemptions: asInt(row.max_redemptions),
    redeemed_count: asInt(row.redeemed_count),
    starts_at: asText(row.starts_at),
    expires_at: asText(row.expires_at),
    created_at: asText(row.created_at),
    notes: asText(row.notes),
    founding_access: asBool((row as any).founding_access),
    raw: row,
  };
}

async function loadEventCodes(): Promise<EventCodeLoadResult> {
  const tableCandidates: EventCodeSource[] = ["event_codes", "ti_event_codes"];
  let lastErr: string | null = null;
  for (const table of tableCandidates) {
    const res = await (supabaseAdmin as any)
      .from(table as any)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (!res.error) {
      const rows = ((res.data ?? []) as Record<string, unknown>[]).map(parseEventCodeRow);
      return { source: table, rows, error: null };
    }
    lastErr = res.error.message ?? "Unknown error";
  }
  return { source: null, rows: [], error: lastErr ?? "Event code table not found." };
}

function buildPathWithNotice(notice: string, q = "") {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  params.set("notice", notice);
  return `/admin/ti?${params.toString()}`;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function buildPathWithNoticeAndAlertKpis(notice: string) {
  const params = new URLSearchParams();
  params.set("alert_kpis", "1");
  params.set("notice", notice);
  return `/admin/ti?${params.toString()}`;
}

function normalizeZip5(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  if (!ZIP_PATTERN.test(raw)) return null;
  const digits = raw.replace(/\D+/g, "");
  if (digits.length < 5) return null;
  return digits.slice(0, 5);
}

function computeUtcDateString(d: Date) {
  return d.toISOString().slice(0, 10);
}

function addUtcDays(date: Date, days: number) {
  const d = new Date(date.getTime());
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function computeAlertWindowUtc(daysAhead: number) {
  const today = new Date();
  const utcToday = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const windowStart = addUtcDays(utcToday, ALERT_START_OFFSET_DAYS);
  const windowEnd = addUtcDays(utcToday, ALERT_START_OFFSET_DAYS + daysAhead);
  return { start: computeUtcDateString(windowStart), end: computeUtcDateString(windowEnd) };
}

function haversineMiles(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 3958.8; // miles
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function getTiPublicBaseUrl() {
  const configured = (process.env.TI_PUBLIC_BASE_URL ?? "").trim().replace(/\/+$/, "");
  if (configured) return configured;
  return "https://www.tournamentinsights.com";
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeSlug(value: unknown) {
  const slug = String(value ?? "").trim();
  return slug ? slug : null;
}

function normalizeTiSport(value: unknown) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return null;
  const allowed = new Set<string>(TI_SPORTS.map((s) => s.toLowerCase()));
  return allowed.has(raw) ? raw : null;
}

function chunk<T>(items: T[], size: number) {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }
  return result;
}

type OwlsEyeCounts = { coffee: number; food: number; hotels: number; gear: number };

async function fetchLatestOwlsEyeRuns(venueIds: string[]) {
  if (!venueIds.length) return [] as Array<{ id: string; run_id: string | null; venue_id: string | null }>;

  const primary = await (supabaseAdmin.from("owls_eye_runs" as any) as any)
    .select("id,run_id,venue_id,status,updated_at,created_at")
    .in("venue_id", venueIds)
    .order("updated_at", { ascending: false })
    .order("created_at", { ascending: false });

  const primaryErrCode = (primary as any)?.error?.code;
  if (!primary.error) {
    return (primary.data as Array<{ id: string; run_id: string | null; venue_id: string | null }> | null) ?? [];
  }

  // Backward compatibility for environments where updated_at is missing.
  if (primaryErrCode === "42703" || primaryErrCode === "PGRST204") {
    const fallback = await (supabaseAdmin.from("owls_eye_runs" as any) as any)
      .select("id,run_id,venue_id,status,created_at")
      .in("venue_id", venueIds)
      .order("created_at", { ascending: false });
    return (fallback.data as Array<{ id: string; run_id: string | null; venue_id: string | null }> | null) ?? [];
  }

  return [];
}

function buildOwlsEyeTeaserLine(counts: OwlsEyeCounts) {
  const parts: string[] = [];
  if (counts.coffee > 0) parts.push(`☕ ${counts.coffee}`);
  if (counts.food > 0) parts.push(`🍔 ${counts.food}`);
  if (counts.hotels > 0) parts.push(`🏨 ${counts.hotels}`);
  if (counts.gear > 0) parts.push(`⚽ ${counts.gear}`);
  if (!parts.length) return null;
  return `Owl’s Eye™ available — ${parts.join(" · ")}`;
}

async function loadOwlsEyeCountsByTournamentId(tournamentIds: string[]) {
  const result = new Map<string, OwlsEyeCounts>();
  const uniqueTournamentIds = Array.from(new Set(tournamentIds)).filter(Boolean);
  if (!uniqueTournamentIds.length) return result;

  const { data: linksRaw } = await (supabaseAdmin.from("tournament_venues" as any) as any)
    .select("tournament_id,venue_id")
    .in("tournament_id", uniqueTournamentIds);

  const links = ((linksRaw as Array<{ tournament_id: string; venue_id: string }> | null) ?? []).filter(
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

  const countsByRunId = new Map<string, OwlsEyeCounts>();
  for (const group of chunk(runIds, 1000)) {
    const { data: nearbyRowsRaw } = await (supabaseAdmin.from("owls_eye_nearby_food" as any) as any)
      .select("run_id,category")
      .in("run_id", group);

    for (const row of ((nearbyRowsRaw as Array<{ run_id: string; category: string | null }> | null) ?? [])) {
      const runId = String(row.run_id ?? "").trim();
      if (!runId) continue;
      const normalizedCategory = String(row.category ?? "food").toLowerCase();
      const current = countsByRunId.get(runId) ?? { coffee: 0, food: 0, hotels: 0, gear: 0 };
      if (normalizedCategory === "coffee") current.coffee += 1;
      else if (normalizedCategory === "hotel" || normalizedCategory === "hotels") current.hotels += 1;
      else if (normalizedCategory === "sporting_goods" || normalizedCategory === "big_box_fallback") current.gear += 1;
      else current.food += 1;
      countsByRunId.set(runId, current);
    }
  }

  const countsByVenueId = new Map<string, OwlsEyeCounts>();
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

async function sendTestTournamentAlertAction(formData: FormData) {
  "use server";
  await requireAdmin();

  const recipientEmail = String(formData.get("recipient_email") ?? "").trim().toLowerCase();
  const zip5 = normalizeZip5(formData.get("zip_code"));
  const radiusMiles = Number(String(formData.get("radius_miles") ?? "").trim() || "0");
  const sport = normalizeTiSport(formData.get("sport"));

  if (!recipientEmail || !EMAIL_PATTERN.test(recipientEmail)) {
    redirect(buildPathWithNoticeAndAlertKpis("Enter a valid recipient email."));
  }
  if (!zip5) {
    redirect(buildPathWithNoticeAndAlertKpis("Enter a valid ZIP code (e.g., 99216)."));
  }
  if (!Number.isFinite(radiusMiles) || radiusMiles <= 0 || radiusMiles > 500) {
    redirect(buildPathWithNoticeAndAlertKpis("Enter a radius in miles (1-500)."));
  }

  const { data: centroidRaw, error: centroidError } = await (supabaseAdmin.from("zip_centroids" as any) as any)
    .select("zip, latitude, longitude")
    .eq("zip", zip5)
    .maybeSingle();
  if (centroidError) redirect(buildPathWithNoticeAndAlertKpis(`ZIP centroid lookup failed: ${centroidError.message}`));
  const centroid = centroidRaw as { zip?: string | null; latitude?: number | null; longitude?: number | null } | null;
  if (!centroid?.zip || centroid.latitude == null || centroid.longitude == null) {
    redirect(buildPathWithNoticeAndAlertKpis(`No ZIP centroid found for ${zip5}.`));
  }

  const window = computeAlertWindowUtc(ALERT_DAYS_AHEAD_DEFAULT);
  let query = (supabaseAdmin.from("tournaments_public" as any) as any)
    .select("id, slug, name, sport, city, state, zip, start_date, end_date")
    .gte("start_date", window.start)
    .lte("start_date", window.end)
    .order("start_date", { ascending: true })
    .limit(5000);
  if (sport) query = query.eq("sport", sport);
  const { data: tournamentsRaw, error: tournamentsError } = await query;
  if (tournamentsError) redirect(buildPathWithNoticeAndAlertKpis(`Tournament lookup failed: ${tournamentsError.message}`));

  const candidates = ((tournamentsRaw ?? []) as any[])
    .map((row) => {
      const slug = normalizeSlug(row.slug);
      const tz = normalizeZip5(row.zip);
      if (!slug) return null;
      return {
        id: String(row.id ?? ""),
        slug,
        name: String(row.name ?? "").trim() || null,
        sport: String(row.sport ?? "").trim() || null,
        city: String(row.city ?? "").trim() || null,
        state: String(row.state ?? "").trim() || null,
        zip: tz,
        start_date: String(row.start_date ?? "").trim() || null,
        end_date: String(row.end_date ?? "").trim() || null,
      };
    })
    .filter(Boolean) as Array<{
    id: string;
    slug: string;
    name: string | null;
    sport: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
    start_date: string | null;
    end_date: string | null;
  }>;

  const tournamentZips = candidates.map((t) => t.zip).filter((z): z is string => Boolean(z));
  const zipMap = new Map<string, { latitude: number; longitude: number }>();
  for (const group of chunk(Array.from(new Set(tournamentZips)), 500)) {
    const { data, error } = await (supabaseAdmin.from("zip_centroids" as any) as any)
      .select("zip, latitude, longitude")
      .in("zip", group);
    if (error) redirect(buildPathWithNoticeAndAlertKpis(`ZIP centroid batch lookup failed: ${error.message}`));
    for (const row of (data ?? []) as any[]) {
      if (!row?.zip || row.latitude == null || row.longitude == null) continue;
      zipMap.set(String(row.zip), { latitude: Number(row.latitude), longitude: Number(row.longitude) });
    }
  }

  const withinRadius: typeof candidates = [];
  for (const t of candidates) {
    if (!t.zip) continue;
    const tz = zipMap.get(t.zip);
    if (!tz) continue;
    const distance = haversineMiles(centroid.latitude!, centroid.longitude!, tz.latitude, tz.longitude);
    if (distance <= radiusMiles) withinRadius.push(t);
  }

  withinRadius.sort((a, b) => {
    const aDate = a.start_date ?? "9999-12-31";
    const bDate = b.start_date ?? "9999-12-31";
    if (aDate !== bDate) return aDate.localeCompare(bDate);
    return (a.name ?? "").localeCompare(b.name ?? "");
  });

  const top = withinRadius.slice(0, 10);
  if (top.length === 0) {
    redirect(buildPathWithNoticeAndAlertKpis("No tournaments matched this test alert. No email sent."));
  }

  const tiBaseUrl = getTiPublicBaseUrl();
  const subject = `Test tournament alert: ${sport ? (TI_SPORT_LABELS as any)[sport] ?? sport : "Any sport"} near ${zip5}`;

  const owlsEyeCountsByTournamentId = await loadOwlsEyeCountsByTournamentId(top.map((t) => t.id)).catch(
    () => new Map<string, OwlsEyeCounts>()
  );
  const teaserEligibleIds = new Set<string>();
  for (const t of top) {
    if (teaserEligibleIds.size >= 2) break;
    const counts = owlsEyeCountsByTournamentId.get(t.id) ?? null;
    if (!counts) continue;
    const teaser = buildOwlsEyeTeaserLine(counts);
    if (!teaser) continue;
    teaserEligibleIds.add(t.id);
  }

  const listHtml = top
    .map((t) => {
      const place = [t.city, t.state].filter(Boolean).join(", ");
      const dates = [t.start_date, t.end_date].filter(Boolean).join(" → ");
      const href = `${tiBaseUrl}/tournaments/${encodeURIComponent(t.slug)}`;
      const counts = owlsEyeCountsByTournamentId.get(t.id) ?? null;
      const teaserLine = teaserEligibleIds.has(t.id) && counts ? buildOwlsEyeTeaserLine(counts) : null;
      return `<li style="margin: 0 0 10px 0;">
        <div><a href="${href}">${t.name ?? "Tournament"}</a></div>
        <div style="color:#64748b;font-size:12px;">${dates}${place ? ` · ${place}` : ""}${t.sport ? ` · ${t.sport}` : ""}</div>
        ${teaserLine ? `<div style="color:#334155;font-size:12px;margin-top:2px;">${escapeHtml(teaserLine)}</div>` : ""}
      </li>`;
    })
    .join("");

  const html = `
    <div style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; line-height:1.4;">
      <h2 style="margin: 0 0 8px 0;">Test alert results</h2>
      <p style="margin: 0 0 12px 0; color:#334155;">
        ZIP <strong>${zip5}</strong> · Radius <strong>${radiusMiles}</strong> miles ·
        Window <strong>${window.start}</strong> → <strong>${window.end}</strong> (UTC start_date)
      </p>
      <ol style="padding-left: 18px; margin: 0;">${listHtml}</ol>
      ${
        teaserEligibleIds.size > 0
          ? `<p style="margin: 14px 0 0 0; color:#475569; font-size:12px;">
        Weekend Pro unlocks full Owl’s Eye™ venue details.
      </p>`
          : ""
      }
      <p style="margin: 14px 0 0 0; color:#64748b; font-size:12px;">
        This is an admin test send. It does not create or modify user alerts.
      </p>
    </div>
  `;

  try {
    const { sendEmail } = await import("@/lib/email");
    const sendResult = await sendEmail({
      to: recipientEmail,
      subject,
      html,
    });

    if ((sendResult as any)?.skipped) {
      try {
        await (supabaseAdmin.from("ti_tournament_alert_send_logs" as any) as any).insert({
          alert_id: null,
          user_id: null,
          cadence: null,
          recipient_email: recipientEmail,
          tournaments_count: top.length,
          result_hash: null,
          outcome: "error",
          error_message: "test_send: skipped (missing RESEND_API_KEY or no recipients)",
        });
      } catch {
        // ignore logging failures
      }
      redirect(
        buildPathWithNoticeAndAlertKpis(
          "Test alert skipped: RESEND_API_KEY is not configured for the Referee app."
        )
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to send email.";
    try {
      const safeError = message.length > 900 ? `${message.slice(0, 900)}…` : message;
      await (supabaseAdmin.from("ti_tournament_alert_send_logs" as any) as any).insert({
        alert_id: null,
        user_id: null,
        cadence: null,
        recipient_email: recipientEmail,
        tournaments_count: top.length,
        result_hash: null,
        outcome: "error",
        error_message: `test_send: ${safeError}`,
      });
    } catch {
      // ignore logging failures
    }
    redirect(buildPathWithNoticeAndAlertKpis(`Test alert send failed: ${message}`));
  }

  redirect(buildPathWithNoticeAndAlertKpis(`Test alert sent to ${recipientEmail} (${top.length} tournaments).`));
}

async function sendTestSavedTournamentChangeEmailAction(formData: FormData) {
  "use server";
  await requireAdmin();

  const recipientEmail = String(formData.get("recipient_email") ?? "").trim().toLowerCase();
  const slugRaw = String(formData.get("tournament_slug") ?? "").trim();
  const tournamentSlug = slugRaw || DEMO_TOURNAMENT_SLUG;

  if (!recipientEmail || !EMAIL_PATTERN.test(recipientEmail)) {
    redirect(buildPathWithNoticeAndAlertKpis("Enter a valid recipient email."));
  }

  const { data, error } = await (supabaseAdmin.from("tournaments_public" as any) as any)
    .select("id,slug,name,sport,city,state,start_date,end_date")
    .eq("slug", tournamentSlug)
    .maybeSingle();
  if (error) redirect(buildPathWithNoticeAndAlertKpis(`Tournament lookup failed: ${error.message}`));
  if (!data?.id || !data.slug) {
    redirect(buildPathWithNoticeAndAlertKpis(`No public tournament found for slug: ${tournamentSlug}`));
  }

  const tiBaseUrl = getTiPublicBaseUrl();
  const href = `${tiBaseUrl}/tournaments/${encodeURIComponent(String(data.slug))}`;
  const place = [data.city, data.state].filter(Boolean).join(", ");
  const dates = [data.start_date, data.end_date].filter(Boolean).join(" → ");
  const subject = `Saved tournament updated: ${String(data.name ?? "Tournament")}`;
  const html = `
    <div style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; line-height:1.4;">
      <h2 style="margin: 0 0 8px 0;">Saved tournament updated (test)</h2>
      <p style="margin: 0 0 12px 0; color:#334155;">
        This is a one-off test notification that simulates a public tournament detail change.
      </p>
      <div style="padding:12px;border:1px solid #e2e8f0;border-radius:12px;background:#f8fafc;">
        <div style="font-weight:800;color:#0f172a;">${escapeHtml(String(data.name ?? "Tournament"))}</div>
        <div style="color:#64748b;font-size:12px;margin-top:4px;">${escapeHtml(dates || "Dates TBA")}${place ? ` · ${escapeHtml(place)}` : ""}${data.sport ? ` · ${escapeHtml(String(data.sport))}` : ""}</div>
        <div style="margin-top:8px;"><a href="${href}">${href}</a></div>
      </div>
      <p style="margin: 14px 0 0 0; color:#64748b; font-size:12px;">
        This does not require the tournament to actually change in the database.
      </p>
    </div>
  `;

  try {
    const { sendEmail } = await import("@/lib/email");
    const sendResult = await sendEmail({ to: recipientEmail, subject, html });
    if ((sendResult as any)?.skipped) {
      redirect(buildPathWithNoticeAndAlertKpis("Test notification skipped: RESEND_API_KEY is not configured."));
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to send email.";
    try {
      const safeError = message.length > 900 ? `${message.slice(0, 900)}…` : message;
      await (supabaseAdmin.from("ti_tournament_alert_send_logs" as any) as any).insert({
        alert_id: null,
        user_id: null,
        cadence: null,
        recipient_email: recipientEmail,
        tournaments_count: 1,
        result_hash: null,
        outcome: "error",
        error_message: `saved_changes_test_send: ${safeError}`,
      });
    } catch {
      // ignore
    }
    redirect(buildPathWithNoticeAndAlertKpis(`Test notification send failed: ${message}`));
  }

  redirect(buildPathWithNoticeAndAlertKpis(`Test notification sent to ${recipientEmail}.`));
}

async function sendTiUserBulkEmailAction(formData: FormData) {
  "use server";
  await requireAdmin();

  const q = String(formData.get("q") ?? "").trim();
  const subject = String(formData.get("subject") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const sendToAllLoaded = String(formData.get("send_to_all_loaded") ?? "").trim() === "on";
  const confirmSend = String(formData.get("confirm_send") ?? "").trim();

  if (!subject) redirect(buildPathWithNotice("Subject is required.", q));
  if (!body) redirect(buildPathWithNotice("Body is required.", q));
  if (confirmSend !== "SEND") redirect(buildPathWithNotice('Type "SEND" to confirm.', q));

  const MAX_RECIPIENTS = 50;

  let recipients: string[] = [];
  if (sendToAllLoaded) {
    let query = (supabaseAdmin.from("ti_users" as any) as any)
      .select("email,created_at,id")
      .order("created_at", { ascending: false })
      .limit(200);
    if (q) {
      query = isUuid(q) ? query.or(`email.ilike.%${q}%,id.eq.${q}`) : query.ilike("email", `%${q}%`);
    }
    const { data, error } = await query;
    if (error) redirect(buildPathWithNotice(`TI users load failed: ${error.message}`, q));
    recipients = ((data ?? []) as Array<{ email: string | null }>).map((row) => (row.email ?? "").trim().toLowerCase()).filter(Boolean);
  } else {
    recipients = formData
      .getAll("recipient_email")
      .map((value) => String(value ?? "").trim().toLowerCase())
      .filter(Boolean);
  }

  const unique = Array.from(new Set(recipients)).filter((email) => EMAIL_PATTERN.test(email));
  if (!unique.length) redirect(buildPathWithNotice("Select at least one valid recipient email.", q));
  if (unique.length > MAX_RECIPIENTS) {
    redirect(buildPathWithNotice(`Too many recipients (${unique.length}). Max ${MAX_RECIPIENTS} per send.`, q));
  }

  const safeSubject = subject.length > 160 ? `${subject.slice(0, 160)}…` : subject;
  const safeBody = body.length > 12000 ? `${body.slice(0, 12000)}…` : body;
  const html = `
    <div style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; line-height:1.5; color:#0f172a;">
      <div style="white-space: pre-wrap;">${escapeHtml(safeBody)}</div>
      <div style="margin-top:16px; color:#64748b; font-size:12px;">
        You’re receiving this email because you have a TournamentInsights account.
      </div>
    </div>
  `;

  let sent = 0;
  const errors: Array<{ email: string; message: string }> = [];

  try {
    const { sendEmail } = await import("@/lib/email");
    const concurrency = 5;
    for (let i = 0; i < unique.length; i += concurrency) {
      const group = unique.slice(i, i + concurrency);
      const results = await Promise.all(
        group.map(async (email) => {
          try {
            const res = await sendEmail({ to: email, subject: safeSubject, html, text: safeBody });
            if ((res as any)?.skipped) throw new Error("Skipped (email provider not configured).");
            return { ok: true, email } as const;
          } catch (err) {
            const message = err instanceof Error ? err.message : "Failed to send email.";
            return { ok: false, email, message } as const;
          }
        })
      );
      for (const r of results) {
        if (r.ok) sent += 1;
        else errors.push({ email: r.email, message: r.message });
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to send email.";
    redirect(buildPathWithNotice(`Bulk send failed: ${message}`, q));
  }

  for (const e of errors.slice(0, 20)) {
    try {
      const safeError = e.message.length > 900 ? `${e.message.slice(0, 900)}…` : e.message;
      await (supabaseAdmin.from("ti_tournament_alert_send_logs" as any) as any).insert({
        alert_id: null,
        user_id: null,
        cadence: null,
        recipient_email: e.email,
        tournaments_count: null,
        result_hash: null,
        outcome: "error",
        error_message: `admin_blast: ${safeSubject} :: ${safeError}`,
      });
    } catch {
      // ignore
    }
  }

  const failed = errors.length;
  const summary =
    failed === 0
      ? `Bulk email sent to ${sent} recipient(s).`
      : `Bulk email sent to ${sent}/${unique.length}. ${failed} failed (first 20 logged).`;
  redirect(buildPathWithNotice(summary, q));
}

async function updateTiUserFieldAction(formData: FormData) {
  "use server";
  await requireAdmin();
  const id = String(formData.get("id") ?? "").trim();
  const q = String(formData.get("q") ?? "").trim();
  const field = String(formData.get("field") ?? "").trim();
  const valueRaw = String(formData.get("value") ?? "").trim();
  if (!id) redirect(buildPathWithNotice("Missing TI user id.", q));

  const allowed = new Set(["plan", "subscription_status", "trial_ends_at", "current_period_end"]);
  if (!allowed.has(field)) redirect(buildPathWithNotice("Invalid TI user field.", q));

  let value: string | null = valueRaw || null;
  if (field === "plan") value = (valueRaw || "insider").toLowerCase();
  if (field === "subscription_status") value = (valueRaw || "none").toLowerCase();

  const updates: Record<string, unknown> = { [field]: value };
  const { error } = await (supabaseAdmin.from("ti_users" as any) as any).update(updates).eq("id", id);
  if (error) redirect(buildPathWithNotice(`TI user update failed: ${error.message}`, q));
  redirect(buildPathWithNotice(`TI user ${field} updated.`, q));
}

async function updateTiUserProfileAction(formData: FormData) {
  "use server";
  await requireAdmin();

  const id = String(formData.get("id") ?? "").trim();
  const q = String(formData.get("q") ?? "").trim();
  if (!id) redirect(buildPathWithNotice("Missing TI user id.", q));

  const displayName = normalizeDisplayName(String(formData.get("display_name") ?? ""));
  const username = normalizeUsername(String(formData.get("username") ?? ""));
  const zipCode = normalizeZipCode(String(formData.get("zip_code") ?? ""));
  const sportsInterests = normalizeSportsInterests(
    formData.getAll("sports_interests").map((value) => String(value))
  );

  if (!USERNAME_PATTERN.test(username)) {
    redirect(
      buildPathWithNotice(
        "Username must be 3-20 characters using letters, numbers, or underscores.",
        q
      )
    );
  }
  if (!zipCode) redirect(buildPathWithNotice("ZIP code is required.", q));
  if (!ZIP_PATTERN.test(zipCode)) {
    redirect(buildPathWithNotice("Enter a valid ZIP code (e.g., 99216).", q));
  }
  if (sportsInterests.length === 0) {
    redirect(buildPathWithNotice("Pick at least one sport interest.", q));
  }

  const usernameCheck = await (supabaseAdmin.from("ti_users" as any) as any)
    .select("id", { head: true, count: "exact" })
    .or(`username.eq.${username},reviewer_handle.eq.${username}`)
    .neq("id", id);
  if (usernameCheck.error) {
    redirect(buildPathWithNotice(`Username check failed: ${usernameCheck.error.message}`, q));
  }
  if ((usernameCheck.count ?? 0) > 0) {
    redirect(buildPathWithNotice("That username is taken.", q));
  }

  const authLookup = await (supabaseAdmin.auth.admin as any).getUserById(id);
  const existingMetadata = authLookup?.data?.user?.user_metadata ?? {};
  const authMissing = Boolean(authLookup?.error);

  if (!authMissing) {
    const { error: authUpdateError } = await supabaseAdmin.auth.admin.updateUserById(id, {
      user_metadata: {
        ...existingMetadata,
        display_name: displayName,
        username,
        handle: username,
        zip_code: zipCode,
        sports_interests: sportsInterests,
      },
    });
    if (authUpdateError) {
      redirect(buildPathWithNotice(`Auth profile update failed: ${authUpdateError.message}`, q));
    }
  }

  const { error: profileError } = await (supabaseAdmin.from("ti_users" as any) as any)
    .update({
      display_name: displayName,
      username,
      reviewer_handle: username,
      zip_code: zipCode,
      sports_interests: sportsInterests,
    })
    .eq("id", id);
  if (profileError) {
    redirect(buildPathWithNotice(`TI profile update failed: ${profileError.message}`, q));
  }

  redirect(
    buildPathWithNotice(
      authMissing
        ? "TI profile updated, but auth metadata was missing for this user."
        : "TI profile updated.",
      q
    )
  );
}

async function backfillTiUserFromAuthAction(formData: FormData) {
  "use server";
  await requireAdmin();
  const userId = String(formData.get("user_id") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const q = String(formData.get("q") ?? "").trim();
  if (!userId) redirect(buildPathWithNotice("Missing auth user id.", q));

  const payload: Record<string, unknown> = {
    id: userId,
    email: email || null,
  };
  const { error } = await (supabaseAdmin.from("ti_users" as any) as any).upsert(payload, { onConflict: "id" });
  if (error) redirect(buildPathWithNotice(`Backfill TI user failed: ${error.message}`, q));
  redirect(buildPathWithNotice("TI user backfilled from auth.users.", q));
}

async function deleteTiUserAction(formData: FormData) {
  "use server";
  await requireAdmin();

  const id = String(formData.get("id") ?? "").trim();
  const q = String(formData.get("q") ?? "").trim();
  const confirmed = String(formData.get("confirm_delete") ?? "").trim() === "on";
  const deleteAuthUser = String(formData.get("delete_auth_user") ?? "").trim() === "on";

  if (!id) redirect(buildPathWithNotice("Missing TI user id.", q));
  if (!confirmed) redirect(buildPathWithNotice("Confirm delete checkbox is required.", q));

  const { error: savedDeleteError } = await (supabaseAdmin.from("ti_saved_tournaments" as any) as any)
    .delete()
    .eq("user_id", id);
  if (savedDeleteError) {
    redirect(buildPathWithNotice(`TI saved tournaments delete failed: ${savedDeleteError.message}`, q));
  }

  const { error: tiDeleteError } = await (supabaseAdmin.from("ti_users" as any) as any)
    .delete()
    .eq("id", id);
  if (tiDeleteError) {
    redirect(buildPathWithNotice(`TI user delete failed: ${tiDeleteError.message}`, q));
  }

  if (deleteAuthUser) {
    const { error: authDeleteError } = await supabaseAdmin.auth.admin.deleteUser(id);
    if (authDeleteError) {
      redirect(
        buildPathWithNotice(
          `TI record deleted, but global auth delete failed: ${authDeleteError.message}`,
          q
        )
      );
    }
    redirect(buildPathWithNotice("TI user + global auth user deleted.", q));
  }

  redirect(buildPathWithNotice("TI user deleted.", q));
}

async function createEventCodeAction(formData: FormData) {
  "use server";
  await requireAdmin();
  const code = String(formData.get("code") ?? "").trim();
  const trialDays = Number(String(formData.get("trial_days") ?? "").trim() || "7");
  const maxRedemptions = Number(String(formData.get("max_redemptions") ?? "").trim() || "1");
  const startsAt = String(formData.get("starts_at") ?? "").trim();
  const expiresAt = String(formData.get("expires_at") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const foundingAccess = String(formData.get("founding_access") ?? "").trim() === "on";
  if (!code) redirect(buildPathWithNotice("Event code is required."));

  // First try RPC if present.
  const rpc = await (supabaseAdmin as any).rpc("create_event_code", {
    p_code: code,
    p_trial_days: Number.isFinite(trialDays) ? trialDays : 7,
    p_max_redemptions: Number.isFinite(maxRedemptions) ? maxRedemptions : 1,
    p_starts_at: startsAt || null,
    p_expires_at: expiresAt || null,
    p_notes: notes || null,
    p_founding_access: foundingAccess,
  });
  if (!rpc.error) {
    redirect(buildPathWithNotice("Event code created."));
  }

  // Fallback table inserts for current known table names.
  const payload = {
    code,
    status: "active",
    trial_days: Number.isFinite(trialDays) ? trialDays : 7,
    max_redemptions: Number.isFinite(maxRedemptions) ? maxRedemptions : 1,
    starts_at: startsAt || null,
    expires_at: expiresAt || null,
    notes: notes || null,
    founding_access: foundingAccess,
  };
  for (const table of ["ti_event_codes", "event_codes"]) {
    const ins = await (supabaseAdmin.from(table as any) as any).insert(payload);
    if (!ins.error) redirect(buildPathWithNotice("Event code created."));
  }
  redirect(buildPathWithNotice(`Event code create failed: ${rpc.error?.message ?? "unknown error"}`));
}

async function setEventCodeStatusAction(formData: FormData) {
  "use server";
  await requireAdmin();
  const table = String(formData.get("table") ?? "").trim();
  const id = String(formData.get("id") ?? "").trim();
  const status = String(formData.get("status") ?? "").trim().toLowerCase();
  if (!table || !id || !status) redirect(buildPathWithNotice("Missing event code status inputs."));
  const { error } = await (supabaseAdmin.from(table as any) as any)
    .update({
      status,
      is_active: status === "active",
    })
    .eq("id", id);
  if (error) redirect(buildPathWithNotice(`Event code update failed: ${error.message}`));
  redirect(buildPathWithNotice("Event code updated."));
}

async function updateEventCodeAction(formData: FormData) {
  "use server";
  await requireAdmin();
  const table = String(formData.get("table") ?? "").trim();
  const id = String(formData.get("id") ?? "").trim();
  if (!table || !id) redirect(buildPathWithNotice("Missing event code edit inputs."));

  const code = String(formData.get("code") ?? "").trim();
  const status = String(formData.get("status") ?? "").trim().toLowerCase();
  const trialDaysRaw = String(formData.get("trial_days") ?? "").trim();
  const maxRedemptionsRaw = String(formData.get("max_redemptions") ?? "").trim();
  const redeemedCountRaw = String(formData.get("redeemed_count") ?? "").trim();
  const startsAt = String(formData.get("starts_at") ?? "").trim();
  const expiresAt = String(formData.get("expires_at") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const foundingAccess = String(formData.get("founding_access") ?? "").trim() === "on";

  const parseIntOrNull = (value: string) => {
    if (!value) return null;
    const n = Number(value);
    return Number.isFinite(n) ? Math.floor(n) : null;
  };

  const updates: Record<string, unknown> = {
    code: code || null,
    status: status || null,
    is_active: status ? status === "active" : null,
    trial_days: parseIntOrNull(trialDaysRaw),
    max_redemptions: parseIntOrNull(maxRedemptionsRaw),
    redeemed_count: parseIntOrNull(redeemedCountRaw),
    starts_at: startsAt || null,
    expires_at: expiresAt || null,
    notes: notes || null,
    founding_access: foundingAccess,
  };

  const { error } = await (supabaseAdmin.from(table as any) as any).update(updates).eq("id", id);
  if (error) redirect(buildPathWithNotice(`Event code save failed: ${error.message}`));
  redirect(buildPathWithNotice("Event code saved."));
}

async function loadAuthTroubleshooting(q: string): Promise<{ rows: AuthTroubleshootRow[]; error: string | null }> {
  if (!q) return { rows: [], error: null };
  const normalizedQuery = q.trim().toLowerCase();
  if (!normalizedQuery) return { rows: [], error: null };

  const users: AuthUser[] = [];
  try {
    const uuidQuery = isUuid(normalizedQuery);
    const maxPages = 10;
    const perPage = 200;
    for (let page = 1; page <= maxPages; page += 1) {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
      if (error) return { rows: [], error: error.message };
      const pageUsers = data?.users ?? [];
      if (!pageUsers.length) break;
      for (const user of pageUsers) {
        const email = (user.email ?? "").toLowerCase();
        const id = String(user.id ?? "");
        const matches = uuidQuery ? id === normalizedQuery : email.includes(normalizedQuery) || id === normalizedQuery;
        if (matches) users.push(user as AuthUser);
      }
      if (pageUsers.length < perPage) break;
    }

    if (!users.length) return { rows: [], error: null };
    const userIds = users.map((u) => u.id);

    const [{ data: tiRows, error: tiErr }, { data: profileRows, error: profErr }] = await Promise.all([
      (supabaseAdmin.from("ti_users" as any) as any)
        .select("id,plan,status")
        .in("id", userIds),
      (supabaseAdmin.from("profiles" as any) as any)
        .select("user_id,role")
        .in("user_id", userIds),
    ]);
    if (tiErr) return { rows: [], error: tiErr.message };
    if (profErr) return { rows: [], error: profErr.message };

    const tiById = new Map<string, { plan: string | null; status: string | null }>(
      ((tiRows ?? []) as Array<{ id: string; plan: string | null; status: string | null }>).map((row) => [
        row.id,
        { plan: row.plan ?? null, status: row.status ?? null },
      ]),
    );
    const roleById = new Map<string, string | null>(
      ((profileRows ?? []) as Array<{ user_id: string; role: string | null }>).map((row) => [row.user_id, row.role ?? null]),
    );

    const rows: AuthTroubleshootRow[] = users.map((user) => {
      const ti = tiById.get(user.id);
      return {
        id: user.id,
        email: user.email ?? null,
        created_at: user.created_at ?? null,
        email_confirmed_at: user.email_confirmed_at ?? null,
        last_sign_in_at: user.last_sign_in_at ?? null,
        has_ti_user: Boolean(ti),
        ti_plan: ti?.plan ?? null,
        ti_status: ti?.status ?? null,
        profile_role: roleById.get(user.id) ?? null,
      };
    });

    rows.sort((a, b) => {
      const aCreated = a.created_at ? Date.parse(a.created_at) : 0;
      const bCreated = b.created_at ? Date.parse(b.created_at) : 0;
      return bCreated - aCreated;
    });
    return { rows, error: null };
  } catch (error) {
    return { rows: [], error: error instanceof Error ? error.message : "Failed to load auth troubleshooting." };
  }
}

export default async function TiAdminPage({
  searchParams,
}: {
  searchParams?: { q?: string; notice?: string; alert_kpis?: string };
}) {
  const adminUser = await requireAdmin();
  const tiAdminBaseUrl =
    process.env.NODE_ENV === "development"
      ? "http://localhost:3001"
      : "https://www.tournamentinsights.com";
  const q = (searchParams?.q ?? "").trim();
  const notice = (searchParams?.notice ?? "").trim();
  const eventCodeNotice = notice.toLowerCase().includes("event code") ? notice : "";
  const showAlertKpis = String(searchParams?.alert_kpis ?? "").trim() === "1";

  let query = (supabaseAdmin.from("ti_users" as any) as any)
    .select(
      "id,email,signup_source,signup_source_code,plan,subscription_status,trial_ends_at,current_period_end,created_at,first_seen_at,last_seen_at,display_name,username,reviewer_handle,zip_code,sports_interests"
    )
    .order("created_at", { ascending: false })
    .limit(200);
  if (q) {
    query = isUuid(q)
      ? query.or(`email.ilike.%${q}%,id.eq.${q}`)
      : query.ilike("email", `%${q}%`);
  }
  const { data: tiUsers, error: tiUsersErr } = await query;
  const authTroubleshoot = await loadAuthTroubleshooting(q);
  const eventCodes = await loadEventCodes();
  const { data: quickCheckMetricsRaw } = await (supabaseAdmin as any).rpc("get_venue_quick_check_metrics", { p_days: 30 });
  const quickCheckMetrics = (quickCheckMetricsRaw ?? null) as QuickCheckMetrics | null;

  const alertKpis = showAlertKpis ? await loadTournamentAlertKpis() : null;
  const savedChangeKpis = showAlertKpis ? await loadSavedTournamentChangeKpis() : null;

  // Lightweight per-tournament rollups for the "Top tournaments by Yes" table expanders.
  let rollupByTournamentId: Record<string, TournamentQuickCheckRollup | undefined> = {};
  if (quickCheckMetrics?.topTournamentsByStarted?.length) {
    const tournamentIds = Array.from(
      new Set(
        quickCheckMetrics.topTournamentsByStarted
          .map((t) => t.tournamentId)
          .filter((id): id is string => Boolean(id))
      )
    );

    if (tournamentIds.length) {
      const windowDays = quickCheckMetrics.windowDays ?? 30;
      const cutoff = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();
      const { data: rowsRaw } = await (supabaseAdmin.from("venue_quick_checks" as any) as any)
        .select(
          "venue_id,source_tournament_id,restroom_cleanliness,shade_score,parking_distance,bring_field_chairs,restroom_type,created_at"
        )
        .in("source_tournament_id", tournamentIds)
        .gte("created_at", cutoff)
        // Cap this so one spammy tournament doesn't blow up the admin page render.
        .limit(5000);

      const rows = (rowsRaw ?? []) as QuickCheckRow[];
      const byTournament = new Map<string, QuickCheckRow[]>();
      for (const r of rows) {
        const tid = r.source_tournament_id;
        if (!tid) continue;
        const list = byTournament.get(tid) ?? [];
        list.push(r);
        byTournament.set(tid, list);
      }

      rollupByTournamentId = Object.fromEntries(
        Array.from(byTournament.entries()).map(([tournamentId, list]) => {
          const submissions = list.length;
          const venuesTouched = new Set(list.map((r) => r.venue_id).filter(Boolean)).size;
          const cleanlinessAvg = avg(list.map((r) => r.restroom_cleanliness));
          const shadeAvg = avg(list.map((r) => r.shade_score));
          const parkingTop = topValue(list.map((r) => r.parking_distance));
          const restroomTypeTop = topValue(list.map((r) => r.restroom_type));

          const chairsAnswered = list.filter((r) => r.bring_field_chairs != null);
          const chairsYes = chairsAnswered.filter((r) => r.bring_field_chairs === true).length;
          const chairsNo = chairsAnswered.filter((r) => r.bring_field_chairs === false).length;
          const bringChairsYesPct =
            chairsAnswered.length > 0 ? Math.round((chairsYes / chairsAnswered.length) * 100) : null;
          const bringChairsValue =
            chairsAnswered.length === 0
              ? null
              : chairsYes === 0
              ? "No"
              : chairsNo === 0
              ? "Yes"
              : chairsYes === chairsNo
              ? "Mixed"
              : chairsYes > chairsNo
              ? "Yes"
              : "No";
          const bringChairsTitle =
            chairsAnswered.length > 0 && bringChairsYesPct != null
              ? `Yes ${bringChairsYesPct}% (n=${chairsAnswered.length})`
              : null;

          const rollup: TournamentQuickCheckRollup = {
            tournamentId,
            submissions,
            venuesTouched,
            restroomCleanlinessLabel: scoreLabel("cleanliness", cleanlinessAvg),
            shadeLabel: scoreLabel("shade", shadeAvg),
            parkingDistanceTop: parkingTop,
            restroomTypeTop,
            bringChairsValue,
            bringChairsTitle,
          };
          return [tournamentId, rollup];
        })
      );
    }
  }

  return (
    <main style={{ maxWidth: 1400, margin: "0 auto", padding: "1rem" }}>
      <AdminNav />
      <section
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 16,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1 style={{ margin: 0 }}>TI Admin</h1>
          <p style={{ margin: "6px 0 0", color: "#475569" }}>
            Manage TournamentInsights users and event codes from RI admin.
          </p>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          {[
            { sport: "soccer", label: "Soccer TD Outreach" },
            { sport: "baseball", label: "Baseball TD Outreach" },
            { sport: "softball", label: "Softball TD Outreach" },
          ].map((entry) => (
            <Link
              key={entry.sport}
              href={buildTiAdminSsoUrl({
                tiAdminBaseUrl,
                email: adminUser.email ?? "",
                returnTo: `/admin/outreach-previews?sport=${encodeURIComponent(entry.sport)}`,
              })}
              target="_blank"
              rel="noreferrer"
              style={{
                textDecoration: "none",
                padding: "10px 14px",
                borderRadius: 10,
                background: "#ffffff",
                color: "#1d4ed8",
                fontWeight: 800,
                fontSize: 14,
                border: "1px solid #93c5fd",
              }}
            >
              {entry.label}
            </Link>
          ))}
          <Link
            href={buildTiAdminSsoUrl({
              tiAdminBaseUrl,
              email: adminUser.email ?? "",
              returnTo: `/admin/outreach-dashboard?sport=soccer`,
            })}
            target="_blank"
            rel="noreferrer"
            style={{
              textDecoration: "none",
              padding: "10px 14px",
              borderRadius: 10,
              background: "#ffffff",
              color: "#1d4ed8",
              fontWeight: 800,
              fontSize: 14,
              border: "1px solid #93c5fd",
            }}
          >
            TI Outreach Dashboard
          </Link>
          <Link
            href="/admin/ti"
            style={{
              textDecoration: "none",
              padding: "10px 14px",
              borderRadius: 10,
              background: "linear-gradient(135deg, #1d4ed8 0%, #2563eb 100%)",
              color: "#fff",
              fontWeight: 800,
              fontSize: 14,
              border: "1px solid #1d4ed8",
            }}
          >
            TI Admin
          </Link>
        </div>
      </section>

      <section style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 14, background: "#fff", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18 }}>Tournament Alert KPIs</h2>
            <p style={{ margin: "6px 0 0 0", color: "#64748b", fontSize: 13 }}>
              Adoption + sends + Resend errors (email + error message).
            </p>
          </div>
          {showAlertKpis ? (
            <Link href="/admin/ti" style={{ fontSize: 13 }}>
              Hide
            </Link>
          ) : (
            <Link href="/admin/ti?alert_kpis=1" style={{ padding: "8px 10px", border: "1px solid #cbd5e1", borderRadius: 10 }}>
              Load alert KPIs
            </Link>
          )}
        </div>

        {showAlertKpis ? (
          alertKpis?.error ? (
            <p style={{ color: "#b91c1c", margin: "10px 0 0 0" }}>Unable to load KPIs: {alertKpis.error}</p>
          ) : (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(160px, 1fr))", gap: 10, marginTop: 12 }}>
                {[
                  ["Users with alerts", String(alertKpis?.usersWithAnyAlerts ?? 0)],
                  ["Active alerts", String(alertKpis?.activeAlerts ?? 0)],
                  ["Daily active", String(alertKpis?.activeDailyAlerts ?? 0)],
                  ["Weekly active", String(alertKpis?.activeWeeklyAlerts ?? 0)],
                ].map(([label, value]) => (
                  <div key={label} style={{ border: "1px solid #e2e8f0", borderRadius: 12, padding: 10 }}>
                    <div style={{ fontSize: 12, color: "#64748b", fontWeight: 700 }}>{label}</div>
                    <div style={{ fontSize: 18, fontWeight: 800, marginTop: 4 }}>{value}</div>
                  </div>
                ))}
              </div>

              <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <div style={{ border: "1px solid #e2e8f0", borderRadius: 12, padding: 12 }}>
                  <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                    <h3 style={{ margin: 0, fontSize: 15 }}>Sends (last 7 days)</h3>
                    <span style={{ fontSize: 12, color: "#64748b" }}>Successful sends only</span>
                  </div>
                  <div style={{ display: "grid", gap: 6, marginTop: 10, fontSize: 13 }}>
                    <div><strong>Daily:</strong> {alertKpis?.sendsLast7DaysDaily ?? 0}</div>
                    <div><strong>Weekly:</strong> {alertKpis?.sendsLast7DaysWeekly ?? 0}</div>
                  </div>
                </div>

                <div style={{ border: "1px solid #e2e8f0", borderRadius: 12, padding: 12 }}>
                  <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                    <h3 style={{ margin: 0, fontSize: 15 }}>Errors (last 7 days)</h3>
                    <span style={{ fontSize: 12, color: "#64748b" }}>Resend failures</span>
                  </div>
                  <div style={{ display: "grid", gap: 6, marginTop: 10, fontSize: 13 }}>
                    <div><strong>Daily:</strong> {alertKpis?.errorsLast7DaysDaily ?? 0}</div>
                    <div><strong>Weekly:</strong> {alertKpis?.errorsLast7DaysWeekly ?? 0}</div>
                  </div>
                </div>
              </div>

              <div style={{ marginTop: 14 }}>
                <h3 style={{ margin: "0 0 8px 0", fontSize: 15 }}>Latest send errors</h3>
                {alertKpis?.recentErrors?.length ? (
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 920 }}>
                      <thead>
                        <tr>
                          {[
                            ["When", 170],
                            ["Cadence", 90],
                            ["Email", 260],
                            ["Alert", 140],
                            ["Error", 520],
                          ].map(([h, w]) => (
                            <th
                              key={String(h)}
                              style={{ textAlign: "left", borderBottom: "1px solid #e5e7eb", padding: "8px 6px", fontSize: 12, width: w }}
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {alertKpis.recentErrors.map((row, idx) => (
                          <tr key={`${row.id ?? idx}`}>
                            <td style={{ borderBottom: "1px solid #f1f5f9", padding: "8px 6px", fontSize: 12 }}>{fmtDate(row.created_at)}</td>
                            <td style={{ borderBottom: "1px solid #f1f5f9", padding: "8px 6px", fontSize: 12 }}>{row.cadence ?? "—"}</td>
                            <td style={{ borderBottom: "1px solid #f1f5f9", padding: "8px 6px", fontSize: 12, wordBreak: "break-word" }}>{row.recipient_email ?? "—"}</td>
                            <td style={{ borderBottom: "1px solid #f1f5f9", padding: "8px 6px", fontSize: 12, fontFamily: "monospace" }}>{row.alert_id ?? "—"}</td>
                            <td style={{ borderBottom: "1px solid #f1f5f9", padding: "8px 6px", fontSize: 12, color: "#b91c1c" }}>
                              {row.error_message ?? "Unknown error"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p style={{ margin: 0, color: "#64748b", fontSize: 13 }}>No errors found.</p>
                )}
              </div>

              <div style={{ marginTop: 14, border: "1px solid #e2e8f0", borderRadius: 12, padding: 12, background: "#f8fafc" }}>
                <h3 style={{ margin: "0 0 6px 0", fontSize: 15 }}>Send a test alert</h3>
                <p style={{ margin: "0 0 12px 0", fontSize: 13, color: "#64748b" }}>
                  One-off send (does not create an alert). Uses the v1 planning window: tournaments with start_date between UTC{" "}
                  <strong>today + {ALERT_START_OFFSET_DAYS}</strong> and <strong>today + {ALERT_START_OFFSET_DAYS + ALERT_DAYS_AHEAD_DEFAULT}</strong>.
                </p>
                <form action={sendTestTournamentAlertAction} style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(140px, 1fr))", gap: 10, alignItems: "end" }}>
                  <label style={{ display: "grid", gap: 6, fontSize: 13 }}>
                    <span style={{ fontWeight: 700 }}>Recipient email</span>
                    <input name="recipient_email" defaultValue={adminUser.email ?? ""} placeholder="name@domain.com" required style={{ padding: "9px 10px", borderRadius: 10, border: "1px solid #cbd5e1" }} />
                  </label>
                  <label style={{ display: "grid", gap: 6, fontSize: 13 }}>
                    <span style={{ fontWeight: 700 }}>ZIP code</span>
                    <input name="zip_code" defaultValue="" placeholder="99216" required style={{ padding: "9px 10px", borderRadius: 10, border: "1px solid #cbd5e1" }} />
                  </label>
                  <label style={{ display: "grid", gap: 6, fontSize: 13 }}>
                    <span style={{ fontWeight: 700 }}>Radius (miles)</span>
                    <input name="radius_miles" type="number" min={1} max={500} defaultValue={25} required style={{ padding: "9px 10px", borderRadius: 10, border: "1px solid #cbd5e1" }} />
                  </label>
                  <label style={{ display: "grid", gap: 6, fontSize: 13 }}>
                    <span style={{ fontWeight: 700 }}>Sport</span>
                    <select name="sport" defaultValue="" style={{ padding: "9px 10px", borderRadius: 10, border: "1px solid #cbd5e1", background: "#fff" }}>
                      <option value="">Any sport</option>
                      {TI_SPORTS.map((value) => (
                        <option key={value} value={value}>
                          {TI_SPORT_LABELS[value]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div style={{ gridColumn: "1 / -1", display: "flex", justifyContent: "flex-end" }}>
                    <button type="submit" style={{ padding: "9px 12px", borderRadius: 10, border: "1px solid #1d4ed8", background: "#2563eb", color: "#fff", fontWeight: 800 }}>
                      Send test alert
                    </button>
                  </div>
                </form>
              </div>

              <div style={{ marginTop: 14, border: "1px solid #e2e8f0", borderRadius: 12, padding: 12, background: "#fff" }}>
                <h3 style={{ margin: "0 0 6px 0", fontSize: 15 }}>Saved tournament change notifications</h3>
                <p style={{ margin: "0 0 12px 0", fontSize: 13, color: "#64748b" }}>
                  Opt-in usage + recent errors. Notifications are computed from public `tournaments_public` fields only (no venue/enrichment updates).
                </p>

                {savedChangeKpis?.error ? (
                  <p style={{ margin: 0, color: "#b91c1c", fontSize: 13 }}>Unable to load: {savedChangeKpis.error}</p>
                ) : (
                  <>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(160px, 1fr))", gap: 10 }}>
                      {[
                        ["Users opted-in", String(savedChangeKpis?.usersOptedIn ?? 0)],
                        ["Subscriptions", String(savedChangeKpis?.subscriptionsOptedIn ?? 0)],
                        ["Notified (7d)", String(savedChangeKpis?.subscriptionsNotifiedLast7Days ?? 0)],
                        ["Errors (7d)", String(savedChangeKpis?.errorsLast7Days ?? 0)],
                      ].map(([label, value]) => (
                        <div key={label} style={{ border: "1px solid #e2e8f0", borderRadius: 12, padding: 10 }}>
                          <div style={{ fontSize: 12, color: "#64748b", fontWeight: 700 }}>{label}</div>
                          <div style={{ fontSize: 18, fontWeight: 800, marginTop: 4 }}>{value}</div>
                        </div>
                      ))}
                    </div>

                    <div style={{ marginTop: 12 }}>
                      <h4 style={{ margin: "0 0 8px 0", fontSize: 14 }}>Latest send errors</h4>
                      {savedChangeKpis?.recentErrors?.length ? (
                        <div style={{ overflowX: "auto" }}>
                          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
                            <thead>
                              <tr>
                                {[
                                  ["When", 170],
                                  ["Email", 260],
                                  ["Error", 520],
                                ].map(([h, w]) => (
                                  <th
                                    key={String(h)}
                                    style={{ textAlign: "left", borderBottom: "1px solid #e5e7eb", padding: "8px 6px", fontSize: 12, width: w }}
                                  >
                                    {h}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {savedChangeKpis.recentErrors.map((row, idx) => (
                                <tr key={`${row.id ?? idx}`}>
                                  <td style={{ borderBottom: "1px solid #f1f5f9", padding: "8px 6px", fontSize: 12 }}>{fmtDate(row.created_at)}</td>
                                  <td style={{ borderBottom: "1px solid #f1f5f9", padding: "8px 6px", fontSize: 12, wordBreak: "break-word" }}>{row.recipient_email ?? "—"}</td>
                                  <td style={{ borderBottom: "1px solid #f1f5f9", padding: "8px 6px", fontSize: 12, color: "#b91c1c" }}>{row.error_message ?? "Unknown error"}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <p style={{ margin: 0, color: "#64748b", fontSize: 13 }}>No errors found.</p>
                      )}
                    </div>

                    <div style={{ marginTop: 12, borderTop: "1px solid #e2e8f0", paddingTop: 12 }}>
                      <h4 style={{ margin: "0 0 8px 0", fontSize: 14 }}>Send a test notification</h4>
                      <form action={sendTestSavedTournamentChangeEmailAction} style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(180px, 1fr))", gap: 10, alignItems: "end" }}>
                        <label style={{ display: "grid", gap: 6, fontSize: 13 }}>
                          <span style={{ fontWeight: 700 }}>Recipient email</span>
                          <input name="recipient_email" defaultValue={adminUser.email ?? ""} placeholder="name@domain.com" required style={{ padding: "9px 10px", borderRadius: 10, border: "1px solid #cbd5e1" }} />
                        </label>
                        <label style={{ display: "grid", gap: 6, fontSize: 13 }}>
                          <span style={{ fontWeight: 700 }}>Tournament slug</span>
                          <input name="tournament_slug" defaultValue={DEMO_TOURNAMENT_SLUG} placeholder={DEMO_TOURNAMENT_SLUG} style={{ padding: "9px 10px", borderRadius: 10, border: "1px solid #cbd5e1" }} />
                        </label>
                        <div style={{ display: "flex", justifyContent: "flex-end" }}>
                          <button type="submit" style={{ padding: "9px 12px", borderRadius: 10, border: "1px solid #1d4ed8", background: "#2563eb", color: "#fff", fontWeight: 800 }}>
                            Send test notification
                          </button>
                        </div>
                      </form>
                    </div>
                  </>
                )}
              </div>
            </>
          )
        ) : null}
      </section>

      {notice ? (
        <p style={{ margin: "0 0 12px", padding: "8px 10px", background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 8 }}>
          {notice}
        </p>
      ) : null}

      <details style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, marginBottom: 16, background: "#fff" }} open>
        <summary
          style={{
            cursor: "pointer",
            listStyle: "auto",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            fontWeight: 800,
          }}
        >
          <span>Quick Venue Check Analytics</span>
          <span style={{ fontSize: 12, color: "#64748b", fontWeight: 600 }}>
            {quickCheckMetrics ? `Last ${quickCheckMetrics.windowDays} days` : "Metrics unavailable"}
          </span>
        </summary>
        {quickCheckMetrics ? (
          <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              {[
                { label: "Opened", value: quickCheckMetrics.totalOpened },
                { label: "Yes (Started)", value: quickCheckMetrics.totalStarted },
                { label: "No (Dismissed)", value: quickCheckMetrics.totalDismissed },
                { label: "Submitted (event)", value: quickCheckMetrics.totalSubmitted },
                { label: "Submissions (DB)", value: quickCheckMetrics.totalSubmissions },
                { label: "Avg fields", value: quickCheckMetrics.avgFieldsCompleted },
              ].map((tile) => (
                <div
                  key={tile.label}
                  style={{
                    minWidth: 160,
                    padding: "10px 12px",
                    borderRadius: 12,
                    border: "1px solid #e2e8f0",
                    background: "#f8fafc",
                  }}
                >
                  <div style={{ fontSize: 12, color: "#64748b", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                    {tile.label}
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 900, marginTop: 2 }}>{tile.value}</div>
                </div>
              ))}
            </div>

            <div style={{ display: "grid", gap: 10 }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                {[
                  { label: "Restroom type", key: "restroom_type" },
                  { label: "Cleanliness", key: "restroom_cleanliness" },
                  { label: "Parking distance", key: "parking_distance" },
                  { label: "Shade score", key: "shade_score" },
                  { label: "Bring chairs", key: "bring_field_chairs" },
                ].map((row) => (
                  <div
                    key={row.key}
                    style={{
                      minWidth: 180,
                      padding: "10px 12px",
                      borderRadius: 12,
                      border: "1px solid #e2e8f0",
                      background: "#ffffff",
                    }}
                  >
                    <div style={{ fontSize: 12, color: "#64748b", fontWeight: 800 }}>{row.label}</div>
                    <div style={{ fontSize: 18, fontWeight: 900, marginTop: 2 }}>
                      {quickCheckMetrics.submissionFieldCounts?.[row.key] ?? 0}
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                {[
                  { label: "From venue pages", key: "venue" },
                  { label: "From tournament pages", key: "tournament" },
                  { label: "Unknown source", key: "unknown" },
                ].map((row) => (
                  <div
                    key={row.key}
                    style={{
                      minWidth: 200,
                      padding: "10px 12px",
                      borderRadius: 12,
                      border: "1px solid #e2e8f0",
                      background: "#ffffff",
                    }}
                  >
                    <div style={{ fontSize: 12, color: "#64748b", fontWeight: 800 }}>{row.label}</div>
                    <div style={{ fontSize: 18, fontWeight: 900, marginTop: 2 }}>
                      {quickCheckMetrics.submissionPageTypeCounts?.[row.key] ?? 0}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {quickCheckMetrics.topTournamentsByStarted?.length ? (
              <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden" }}>
                <div style={{ padding: "10px 12px", background: "#f8fafc", fontWeight: 900 }}>
                  Top tournaments by “Yes” (Started)
                </div>
                <TopTournamentsByStartedTable
                  rows={quickCheckMetrics.topTournamentsByStarted}
                  tiAdminBaseUrl={tiAdminBaseUrl}
                  rollupByTournamentId={rollupByTournamentId}
                />
              </div>
            ) : null}

            {quickCheckMetrics.topVenuesBySubmissions?.length ? (
              <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden" }}>
                <div style={{ padding: "10px 12px", background: "#f8fafc", fontWeight: 900 }}>
                  Top venues by submissions
                </div>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ textAlign: "left" }}>
                        <th style={{ padding: "10px 12px", fontSize: 12, color: "#64748b" }}>Venue</th>
                        <th style={{ padding: "10px 12px", fontSize: 12, color: "#64748b" }}>City</th>
                        <th style={{ padding: "10px 12px", fontSize: 12, color: "#64748b" }}>State</th>
                        <th style={{ padding: "10px 12px", fontSize: 12, color: "#64748b" }}>Submissions</th>
                        <th style={{ padding: "10px 12px", fontSize: 12, color: "#64748b" }}>Last</th>
                      </tr>
                    </thead>
                    <tbody>
                      {quickCheckMetrics.topVenuesBySubmissions.map((row) => {
                        const label = row.venueName || row.venueId || "Unknown";
                        const venueHref = row.venueSeoSlug
                          ? `${tiAdminBaseUrl}/venues/${row.venueSeoSlug}`
                          : row.venueId
                          ? `${tiAdminBaseUrl}/venues/${row.venueId}`
                          : null;
                        const last = row.lastSubmissionAt ? fmtDate(row.lastSubmissionAt) : "—";
                        return (
                          <tr key={row.venueId ?? label} style={{ borderTop: "1px solid #e5e7eb" }}>
                            <td style={{ padding: "10px 12px", fontWeight: 800 }}>
                              {venueHref ? (
                                <a href={venueHref} target="_blank" rel="noreferrer" style={{ color: "#1d4ed8", textDecoration: "none" }}>
                                  {label}
                                </a>
                              ) : (
                                label
                              )}
                            </td>
                            <td style={{ padding: "10px 12px" }}>{row.venueCity ?? "—"}</td>
                            <td style={{ padding: "10px 12px" }}>{row.venueState ?? "—"}</td>
                            <td style={{ padding: "10px 12px", fontWeight: 900 }}>{row.submissionCount}</td>
                            <td style={{ padding: "10px 12px" }}>{last}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <div style={{ marginTop: 12, color: "#64748b" }}>
            Quick check metrics RPC not found yet (apply latest Supabase migrations).
          </div>
        )}
      </details>

      <details
        style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, marginBottom: 16, background: "#fff" }}
      >
        <summary
          style={{
            cursor: "pointer",
            listStyle: "auto",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            fontWeight: 800,
          }}
        >
          <span>TI User Admin</span>
          <span style={{ fontSize: 12, color: "#64748b", fontWeight: 600 }}>
            {tiUsersErr ? "Load error" : `${(tiUsers ?? []).length} users loaded`}
          </span>
        </summary>
        <div style={{ marginTop: 12 }}>
          <form action="/admin/ti" method="get" style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
            <input name="q" defaultValue={q} placeholder="Search email or user id" style={{ padding: 8, minWidth: 280 }} />
            <button type="submit">Search</button>
            <Link href="/admin/ti" style={{ alignSelf: "center" }}>
              Clear
            </Link>
          </form>
          <details style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 12, background: "#fff", marginBottom: 12 }}>
            <summary style={{ cursor: "pointer", listStyle: "auto", fontWeight: 800 }}>
              Send email to selected users
            </summary>
            <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
              <p style={{ margin: 0, color: "#64748b", fontSize: 12 }}>
                Sends individual emails (no BCC) to protect recipient privacy. Limit: 50 recipients per send.
              </p>
              <form action={sendTiUserBulkEmailAction} style={{ display: "grid", gap: 10 }}>
                <input type="hidden" name="q" value={q} />
                <label style={{ display: "grid", gap: 4, fontSize: 12, color: "#334155" }}>
                  Subject
                  <input name="subject" placeholder="Subject" style={{ padding: 8 }} required />
                </label>
                <label style={{ display: "grid", gap: 4, fontSize: 12, color: "#334155" }}>
                  Body (plain text)
                  <textarea
                    name="body"
                    placeholder="Paste message content…"
                    rows={8}
                    style={{ padding: 8, resize: "vertical" }}
                    required
                  />
                </label>
                <div style={{ display: "grid", gap: 8 }}>
                  <label style={{ display: "inline-flex", gap: 8, alignItems: "center", fontSize: 12, color: "#334155" }}>
                    <input type="checkbox" name="send_to_all_loaded" />
                    Send to all loaded users (current search results)
                  </label>
                  <div style={{ border: "1px solid #e2e8f0", borderRadius: 10, padding: 10, maxHeight: 220, overflow: "auto", background: "#f8fafc" }}>
                    {((tiUsers ?? []) as TiUserRow[]).length ? (
                      <div style={{ display: "grid", gap: 6 }}>
                        {((tiUsers ?? []) as TiUserRow[]).map((row) => {
                          const email = (row.email ?? "").trim();
                          if (!email) return null;
                          return (
                            <label
                              key={`bulk-${row.id}`}
                              style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, color: "#0f172a" }}
                            >
                              <input type="checkbox" name="recipient_email" value={email} />
                              <span style={{ fontWeight: 700 }}>{displayNameFromEmail(email)}</span>
                              <span style={{ color: "#64748b" }}>{email}</span>
                            </label>
                          );
                        })}
                      </div>
                    ) : (
                      <div style={{ color: "#64748b", fontSize: 12 }}>No users loaded.</div>
                    )}
                  </div>
                </div>
                <label style={{ display: "grid", gap: 4, fontSize: 12, color: "#334155" }}>
                  Confirm by typing <code>SEND</code>
                  <input name="confirm_send" placeholder="SEND" style={{ padding: 8, maxWidth: 160 }} required />
                </label>
                <div>
                  <button type="submit" style={{ padding: "8px 12px", fontWeight: 800 }}>
                    Send email
                  </button>
                </div>
              </form>
            </div>
          </details>
          {tiUsersErr ? (
            <p style={{ color: "#b91c1c" }}>TI users load failed: {tiUsersErr.message}</p>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {((tiUsers ?? []) as TiUserRow[]).map((row, idx) => (
                <details
                  key={row.id}
                  style={{
                    border: "1px solid #dbe4ef",
                    borderRadius: 10,
                    background: idx % 2 === 0 ? "#ffffff" : "#f3f7fb",
                  }}
                >
                <summary
                  style={{
                    cursor: "pointer",
                    listStyle: "auto",
                    padding: "10px 12px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 10,
                  }}
                >
                  <span style={{ fontWeight: 700 }}>
                    {displayNameFromEmail(row.email)} <span style={{ fontWeight: 500, color: "#334155" }}>({row.email ?? "—"})</span>
                  </span>
                  <span style={{ fontSize: 12, color: "#64748b" }}>
                    {row.username ?? row.reviewer_handle ?? "—"} · {row.plan ?? "insider"} · {row.subscription_status ?? "none"}
                  </span>
                </summary>
                <div style={{ padding: "0 12px 12px", borderTop: "1px solid #dbe4ef", display: "grid", gap: 10 }}>
                  <div style={{ fontFamily: "monospace", fontSize: 12, color: "#475569", marginTop: 8 }}>{row.id}</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 10 }}>
                    <div style={{ fontSize: 12 }}>
                      <div style={{ color: "#64748b" }}>Signup source</div>
                      <div>{row.signup_source ?? "website"}</div>
                    </div>
                    <div style={{ fontSize: 12 }}>
                      <div style={{ color: "#64748b" }}>Source code</div>
                      <div>{row.signup_source_code ?? "—"}</div>
                    </div>
                    <div style={{ fontSize: 12 }}>
                      <div style={{ color: "#64748b" }}>Created</div>
                      <div>{fmtDate(row.created_at)}</div>
                    </div>
                    <div style={{ fontSize: 12 }}>
                      <div style={{ color: "#64748b" }}>Seen</div>
                      <div>{fmtDate(row.last_seen_at ?? row.first_seen_at)}</div>
                    </div>
                    <div style={{ fontSize: 12 }}>
                      <div style={{ color: "#64748b" }}>Display name</div>
                      <div>{row.display_name ?? "—"}</div>
                    </div>
                    <div style={{ fontSize: 12 }}>
                      <div style={{ color: "#64748b" }}>Username</div>
                      <div>{row.username ?? row.reviewer_handle ?? "—"}</div>
                    </div>
                    <div style={{ fontSize: 12 }}>
                      <div style={{ color: "#64748b" }}>ZIP</div>
                      <div>{row.zip_code ?? "—"}</div>
                    </div>
                    <div style={{ fontSize: 12 }}>
                      <div style={{ color: "#64748b" }}>Sports interests</div>
                      <div>
                        {(row.sports_interests ?? []).length
                          ? (row.sports_interests ?? [])
                              .map((sport) => TI_SPORT_LABELS[sport as keyof typeof TI_SPORT_LABELS] ?? sport)
                              .join(", ")
                          : "—"}
                      </div>
                    </div>
                  </div>
                  <form
                    action={updateTiUserProfileAction}
                    style={{
                      border: "1px solid #dbe4ef",
                      borderRadius: 10,
                      padding: 12,
                      display: "grid",
                      gap: 12,
                      background: "#fff",
                    }}
                  >
                    <input type="hidden" name="id" value={row.id} />
                    <input type="hidden" name="q" value={q} />
                    <div style={{ fontWeight: 700, fontSize: 13 }}>Profile settings</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
                      <label style={{ display: "grid", gap: 4, fontSize: 12, color: "#334155" }}>
                        Full name
                        <input
                          name="display_name"
                          defaultValue={row.display_name ?? ""}
                          placeholder="Optional"
                          style={{ padding: 8 }}
                        />
                      </label>
                      <label style={{ display: "grid", gap: 4, fontSize: 12, color: "#334155" }}>
                        Username
                        <input
                          name="username"
                          defaultValue={row.username ?? row.reviewer_handle ?? ""}
                          placeholder="Choose a username"
                          required
                          style={{ padding: 8 }}
                        />
                      </label>
                      <label style={{ display: "grid", gap: 4, fontSize: 12, color: "#334155" }}>
                        ZIP code
                        <input
                          name="zip_code"
                          defaultValue={row.zip_code ?? ""}
                          placeholder="99216"
                          required
                          style={{ padding: 8 }}
                        />
                      </label>
                    </div>
                    <fieldset
                      style={{
                        border: "1px solid #e5e7eb",
                        borderRadius: 10,
                        padding: 10,
                        display: "grid",
                        gap: 8,
                      }}
                    >
                      <legend style={{ fontSize: 12, fontWeight: 700, padding: "0 6px" }}>Sports interests</legend>
                      <div style={{ fontSize: 12, color: "#64748b" }}>
                        Choose one or more. These are the same values used in TI personalization.
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8 }}>
                        {TI_SPORTS.map((sport) => (
                          <label
                            key={`${row.id}-${sport}`}
                            style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12, color: "#334155" }}
                          >
                            <input
                              type="checkbox"
                              name="sports_interests"
                              value={sport}
                              defaultChecked={(row.sports_interests ?? []).includes(sport)}
                            />
                            <span>{TI_SPORT_LABELS[sport]}</span>
                          </label>
                        ))}
                      </div>
                    </fieldset>
                    <div>
                      <button type="submit">Save profile settings</button>
                    </div>
                  </form>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 8 }}>
                    <form action={updateTiUserFieldAction} style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                      <input type="hidden" name="id" value={row.id} />
                      <input type="hidden" name="q" value={q} />
                      <input type="hidden" name="field" value="plan" />
                      <label style={{ fontSize: 12, color: "#64748b" }}>Plan</label>
                      <select name="value" defaultValue={(row.plan ?? "insider").toLowerCase()} style={{ padding: 6 }}>
                        <option value="insider">insider</option>
                        <option value="weekend_pro">weekend_pro</option>
                      </select>
                      <button type="submit">Set</button>
                    </form>
                    <form action={updateTiUserFieldAction} style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                      <input type="hidden" name="id" value={row.id} />
                      <input type="hidden" name="q" value={q} />
                      <input type="hidden" name="field" value="subscription_status" />
                      <label style={{ fontSize: 12, color: "#64748b" }}>Subscription</label>
                      <select name="value" defaultValue={(row.subscription_status ?? "none").toLowerCase()} style={{ padding: 6 }}>
                        <option value="none">none</option>
                        <option value="active">active</option>
                        <option value="trialing">trialing</option>
                        <option value="canceled">canceled</option>
                        <option value="past_due">past_due</option>
                      </select>
                      <button type="submit">Set</button>
                    </form>
                    <form action={updateTiUserFieldAction} style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                      <input type="hidden" name="id" value={row.id} />
                      <input type="hidden" name="q" value={q} />
                      <input type="hidden" name="field" value="trial_ends_at" />
                      <label style={{ fontSize: 12, color: "#64748b" }}>Trial ends</label>
                      <input
                        name="value"
                        defaultValue={row.trial_ends_at ? row.trial_ends_at.slice(0, 16) : ""}
                        placeholder="YYYY-MM-DDTHH:mm"
                        style={{ padding: 6, width: 170 }}
                      />
                      <button type="submit">Set</button>
                    </form>
                    <form action={updateTiUserFieldAction} style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                      <input type="hidden" name="id" value={row.id} />
                      <input type="hidden" name="q" value={q} />
                      <input type="hidden" name="field" value="current_period_end" />
                      <label style={{ fontSize: 12, color: "#64748b" }}>Renewal</label>
                      <input
                        name="value"
                        defaultValue={row.current_period_end ? row.current_period_end.slice(0, 16) : ""}
                        placeholder="YYYY-MM-DDTHH:mm"
                        style={{ padding: 6, width: 170 }}
                      />
                      <button type="submit">Set</button>
                    </form>
                  </div>
                  <div
                    style={{
                      marginTop: 2,
                      padding: "8px 10px",
                      border: "1px solid #fecaca",
                      background: "#fff5f5",
                      borderRadius: 8,
                    }}
                  >
                    <form action={deleteTiUserAction} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 }}>
                      <input type="hidden" name="id" value={row.id} />
                      <input type="hidden" name="q" value={q} />
                      <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12 }}>
                        <input type="checkbox" name="confirm_delete" />
                        Confirm TI delete
                      </label>
                      <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "#b91c1c" }}>
                        <input type="checkbox" name="delete_auth_user" />
                        Include RI+TI auth delete
                      </label>
                      <button
                        type="submit"
                        style={{
                          background: "#fee2e2",
                          border: "1px solid #ef4444",
                          color: "#991b1b",
                          borderRadius: 7,
                          padding: "6px 10px",
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                      >
                        Delete user
                      </button>
                    </form>
                  </div>
                </div>
                </details>
              ))}
            </div>
          )}
        </div>
      </details>

      <section style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}>Auth Troubleshooting</h2>
        <p style={{ marginTop: 0, color: "#475569", fontSize: 13 }}>
          Uses <code>auth.users</code> + <code>ti_users</code> + <code>profiles</code> for signup/login troubleshooting.
          Search by email or auth user id above.
        </p>
        {!q ? (
          <p style={{ margin: 0, color: "#64748b", fontSize: 13 }}>Enter an email/id in search to run auth troubleshooting.</p>
        ) : authTroubleshoot.error ? (
          <p style={{ margin: 0, color: "#b91c1c" }}>Auth troubleshooting failed: {authTroubleshoot.error}</p>
        ) : authTroubleshoot.rows.length === 0 ? (
          <p style={{ margin: 0, color: "#64748b", fontSize: 13 }}>No matching auth.users rows found.</p>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {authTroubleshoot.rows.map((row) => (
              <details key={row.id} style={{ border: "1px solid #dbe4ef", borderRadius: 10, background: "#fff" }}>
                <summary
                  style={{
                    cursor: "pointer",
                    listStyle: "auto",
                    padding: "10px 12px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 10,
                  }}
                >
                  <span style={{ fontWeight: 700 }}>
                    {displayNameFromEmail(row.email)} <span style={{ fontWeight: 500, color: "#334155" }}>({row.email ?? "—"})</span>
                  </span>
                  <span style={{ fontSize: 12, color: "#64748b" }}>
                    auth:{row.email_confirmed_at ? "confirmed" : "pending"} · ti:{row.has_ti_user ? "present" : "missing"}
                  </span>
                </summary>
                <div style={{ padding: "0 12px 12px", borderTop: "1px solid #dbe4ef", display: "grid", gap: 10 }}>
                  <div style={{ fontFamily: "monospace", fontSize: 12, color: "#475569", marginTop: 8 }}>{row.id}</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 8, fontSize: 12 }}>
                    <div><div style={{ color: "#64748b" }}>Auth created</div><div>{fmtDate(row.created_at)}</div></div>
                    <div><div style={{ color: "#64748b" }}>Email confirmed</div><div>{fmtDate(row.email_confirmed_at)}</div></div>
                    <div><div style={{ color: "#64748b" }}>Last sign-in</div><div>{fmtDate(row.last_sign_in_at)}</div></div>
                    <div><div style={{ color: "#64748b" }}>TI row</div><div>{row.has_ti_user ? `yes (${row.ti_plan ?? "free"} · ${row.ti_status ?? "active"})` : "missing"}</div></div>
                    <div><div style={{ color: "#64748b" }}>Profile role</div><div>{row.profile_role ?? "—"}</div></div>
                  </div>
                  {!row.has_ti_user ? (
                    <form action={backfillTiUserFromAuthAction} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <input type="hidden" name="user_id" value={row.id} />
                      <input type="hidden" name="email" value={row.email ?? ""} />
                      <input type="hidden" name="q" value={q} />
                      <button type="submit">Backfill TI user from auth</button>
                    </form>
                  ) : null}
                </div>
              </details>
            ))}
          </div>
        )}
      </section>

      <section style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12 }}>
        <h2 style={{ marginTop: 0 }}>Event Code Admin</h2>
        {eventCodeNotice ? (
          <p
            style={{
              margin: "0 0 12px",
              padding: "10px 12px",
              background: "#ecfeff",
              border: "1px solid #a5f3fc",
              borderRadius: 8,
              color: "#155e75",
              fontWeight: 600,
            }}
          >
            {eventCodeNotice}
          </p>
        ) : null}
        <form action={createEventCodeAction} style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", marginBottom: 12 }}>
          <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 700 }}>
            Code <span style={{ color: "#b91c1c" }}>(required)</span>
            <input name="code" placeholder="e.g. SPRING2026" required style={{ padding: 8 }} />
          </label>
          <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 700 }}>
            Trial days <span style={{ color: "#b91c1c" }}>(required)</span>
            <input name="trial_days" type="number" min={1} defaultValue={7} required style={{ padding: 8 }} />
          </label>
          <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 700 }}>
            Max redemptions <span style={{ color: "#b91c1c" }}>(required)</span>
            <input name="max_redemptions" type="number" min={1} defaultValue={1} required style={{ padding: 8 }} />
          </label>
          <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 700 }}>
            Starts at <span style={{ color: "#64748b", fontWeight: 500 }}>(optional ISO)</span>
            <input name="starts_at" placeholder="2026-03-01T00:00:00Z" style={{ padding: 8 }} />
          </label>
          <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 700 }}>
            Expires at <span style={{ color: "#64748b", fontWeight: 500 }}>(optional ISO)</span>
            <input name="expires_at" placeholder="2026-06-01T00:00:00Z" style={{ padding: 8 }} />
          </label>
          <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 700 }}>
            Notes <span style={{ color: "#64748b", fontWeight: 500 }}>(optional)</span>
            <input name="notes" placeholder="Campaign notes" style={{ padding: 8 }} />
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, fontWeight: 700 }}>
            <input name="founding_access" type="checkbox" />
            Founding Access
          </label>
          <div style={{ display: "flex", alignItems: "end" }}>
            <button type="submit" style={{ padding: "8px 10px" }}>Create event code</button>
          </div>
        </form>
        {eventCodes.error ? (
          <p style={{ color: "#b91c1c", marginTop: 0 }}>
            Event code list unavailable: {eventCodes.error}
          </p>
        ) : (
          <>
            <LabelPrintSettings />
            <p style={{ marginTop: 0, color: "#475569", fontSize: 13 }}>
              Source table: <strong>{eventCodes.source}</strong>
            </p>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1180, tableLayout: "fixed" }}>
                <thead>
                  <tr>
                    {[
                      ["Code", "130px"],
                      ["Status", "110px"],
                      ["Trial Days", "90px"],
                      ["Redeemed", "90px"],
                      ["Max Redemptions", "120px"],
                      ["Founding Access", "120px"],
                      ["Starts", "180px"],
                      ["Expires", "180px"],
                      ["Created", "120px"],
                      ["Notes", "220px"],
                      ["Actions", "180px"],
                    ].map(([head, width]) => (
                      <th
                        key={head}
                        style={{
                          textAlign: "left",
                          borderBottom: "1px solid #e5e7eb",
                          padding: "8px 6px",
                          fontSize: 12,
                          width,
                          verticalAlign: "bottom",
                        }}
                      >
                        {head}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {eventCodes.rows.map((row, idx) => (
                    <tr key={`${row.id ?? row.code ?? "row"}-${idx}`}>
                      <td style={{ borderBottom: "1px solid #f1f5f9", padding: "8px 6px", fontWeight: 700 }}>
                        <input
                          form={`event-code-edit-${row.id ?? idx}`}
                          name="code"
                          defaultValue={row.code ?? ""}
                          style={{ width: 130, padding: 6, fontWeight: 700 }}
                        />
                      </td>
                      <td style={{ borderBottom: "1px solid #f1f5f9", padding: "8px 6px" }}>
                        <select form={`event-code-edit-${row.id ?? idx}`} name="status" defaultValue={row.status ?? "active"} style={{ padding: 6 }}>
                          <option value="active">active</option>
                          <option value="inactive">inactive</option>
                          <option value="exhausted">exhausted</option>
                          <option value="expired">expired</option>
                        </select>
                      </td>
                      <td style={{ borderBottom: "1px solid #f1f5f9", padding: "8px 6px" }}>
                        <input
                          form={`event-code-edit-${row.id ?? idx}`}
                          name="trial_days"
                          type="number"
                          min={1}
                          defaultValue={row.trial_days ?? 7}
                          style={{ width: 78, padding: 6 }}
                        />
                      </td>
                      <td style={{ borderBottom: "1px solid #f1f5f9", padding: "8px 6px" }}>
                        <input
                          form={`event-code-edit-${row.id ?? idx}`}
                          name="redeemed_count"
                          type="number"
                          min={0}
                          defaultValue={row.redeemed_count ?? 0}
                          style={{ width: 78, padding: 6 }}
                          title="Redeemed count"
                        />
                      </td>
                      <td style={{ borderBottom: "1px solid #f1f5f9", padding: "8px 6px" }}>
                        <input
                          form={`event-code-edit-${row.id ?? idx}`}
                          name="max_redemptions"
                          type="number"
                          min={1}
                          defaultValue={row.max_redemptions ?? 1}
                          style={{ width: 104, padding: 6 }}
                          title="Max redemptions"
                        />
                      </td>
                      <td style={{ borderBottom: "1px solid #f1f5f9", padding: "8px 6px", fontSize: 12 }}>
                        <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                          <input
                            form={`event-code-edit-${row.id ?? idx}`}
                            name="founding_access"
                            type="checkbox"
                            defaultChecked={Boolean(row.founding_access)}
                          />
                          Founding Access
                        </label>
                      </td>
                      <td style={{ borderBottom: "1px solid #f1f5f9", padding: "8px 6px", fontSize: 12 }}>
                        <input
                          form={`event-code-edit-${row.id ?? idx}`}
                          name="starts_at"
                          defaultValue={row.starts_at ?? ""}
                          placeholder="ISO"
                          style={{ width: 180, padding: 6 }}
                        />
                      </td>
                      <td style={{ borderBottom: "1px solid #f1f5f9", padding: "8px 6px", fontSize: 12 }}>
                        <input
                          form={`event-code-edit-${row.id ?? idx}`}
                          name="expires_at"
                          defaultValue={row.expires_at ?? ""}
                          placeholder="ISO"
                          style={{ width: 180, padding: 6 }}
                        />
                      </td>
                      <td style={{ borderBottom: "1px solid #f1f5f9", padding: "8px 6px", fontSize: 12 }}>{fmtDate(row.created_at)}</td>
                      <td style={{ borderBottom: "1px solid #f1f5f9", padding: "8px 6px", fontSize: 12 }}>
                        <input
                          form={`event-code-edit-${row.id ?? idx}`}
                          name="notes"
                          defaultValue={row.notes ?? ""}
                          style={{ width: 220, padding: 6 }}
                        />
                      </td>
                      <td style={{ borderBottom: "1px solid #f1f5f9", padding: "8px 6px" }}>
                        {eventCodes.source && row.id ? (
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                            <form id={`event-code-edit-${row.id ?? idx}`} action={updateEventCodeAction}>
                              <input type="hidden" name="table" value={eventCodes.source} />
                              <input type="hidden" name="id" value={row.id} />
                              <button type="submit">Save</button>
                            </form>
                            <PrintLabelButton
                              code={row.code ?? ""}
                              foundingAccess={Boolean(row.founding_access)}
                              formId={`event-code-edit-${row.id ?? idx}`}
                            />
                            <form action={setEventCodeStatusAction}>
                              <input type="hidden" name="table" value={eventCodes.source} />
                              <input type="hidden" name="id" value={row.id} />
                              <input type="hidden" name="status" value="active" />
                              <button type="submit">Activate</button>
                            </form>
                            <form action={setEventCodeStatusAction}>
                              <input type="hidden" name="table" value={eventCodes.source} />
                              <input type="hidden" name="id" value={row.id} />
                              <input type="hidden" name="status" value="inactive" />
                              <button type="submit">Deactivate</button>
                            </form>
                          </div>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </main>
  );
}

async function loadTournamentAlertKpis(): Promise<{
  error: string | null;
  usersWithAnyAlerts: number;
  activeAlerts: number;
  activeDailyAlerts: number;
  activeWeeklyAlerts: number;
  sendsLast7DaysDaily: number;
  sendsLast7DaysWeekly: number;
  errorsLast7DaysDaily: number;
  errorsLast7DaysWeekly: number;
  recentErrors: Array<{
    id: string;
    created_at: string | null;
    cadence: string | null;
    recipient_email: string | null;
    alert_id: string | null;
    error_message: string | null;
  }>;
}> {
  const empty = {
    error: null,
    usersWithAnyAlerts: 0,
    activeAlerts: 0,
    activeDailyAlerts: 0,
    activeWeeklyAlerts: 0,
    sendsLast7DaysDaily: 0,
    sendsLast7DaysWeekly: 0,
    errorsLast7DaysDaily: 0,
    errorsLast7DaysWeekly: 0,
    recentErrors: [],
  };

  try {
    const since7dIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const [
      usersAny,
      activeAny,
      activeDaily,
      activeWeekly,
      sendsDaily,
      sendsWeekly,
      errsDaily,
      errsWeekly,
      recentErrors,
    ] = await Promise.all([
      (supabaseAdmin.from("user_tournament_alerts" as any) as any)
        .select("user_id", { count: "exact", head: true })
        .neq("user_id", "")
        .then((r: any) => r.count ?? 0),
      (supabaseAdmin.from("user_tournament_alerts" as any) as any)
        .select("id", { count: "exact", head: true })
        .eq("is_active", true)
        .then((r: any) => r.count ?? 0),
      (supabaseAdmin.from("user_tournament_alerts" as any) as any)
        .select("id", { count: "exact", head: true })
        .eq("is_active", true)
        .eq("cadence", "daily")
        .then((r: any) => r.count ?? 0),
      (supabaseAdmin.from("user_tournament_alerts" as any) as any)
        .select("id", { count: "exact", head: true })
        .eq("is_active", true)
        .eq("cadence", "weekly")
        .then((r: any) => r.count ?? 0),
      (supabaseAdmin.from("ti_tournament_alert_send_logs" as any) as any)
        .select("id", { count: "exact", head: true })
        .eq("outcome", "sent")
        .eq("cadence", "daily")
        .gte("created_at", since7dIso)
        .then((r: any) => r.count ?? 0),
      (supabaseAdmin.from("ti_tournament_alert_send_logs" as any) as any)
        .select("id", { count: "exact", head: true })
        .eq("outcome", "sent")
        .eq("cadence", "weekly")
        .gte("created_at", since7dIso)
        .then((r: any) => r.count ?? 0),
      (supabaseAdmin.from("ti_tournament_alert_send_logs" as any) as any)
        .select("id", { count: "exact", head: true })
        .eq("outcome", "error")
        .eq("cadence", "daily")
        .gte("created_at", since7dIso)
        .then((r: any) => r.count ?? 0),
      (supabaseAdmin.from("ti_tournament_alert_send_logs" as any) as any)
        .select("id", { count: "exact", head: true })
        .eq("outcome", "error")
        .eq("cadence", "weekly")
        .gte("created_at", since7dIso)
        .then((r: any) => r.count ?? 0),
      (supabaseAdmin.from("ti_tournament_alert_send_logs" as any) as any)
        .select("id,created_at,cadence,recipient_email,alert_id,error_message")
        .eq("outcome", "error")
        .order("created_at", { ascending: false })
        .limit(25)
        .then((r: any) => (r.data ?? []) as any[]),
    ]);

    const distinctUsers = await loadDistinctUsersWithAlerts().catch(() => usersAny);

    return {
      ...empty,
      usersWithAnyAlerts: distinctUsers,
      activeAlerts: activeAny,
      activeDailyAlerts: activeDaily,
      activeWeeklyAlerts: activeWeekly,
      sendsLast7DaysDaily: sendsDaily,
      sendsLast7DaysWeekly: sendsWeekly,
      errorsLast7DaysDaily: errsDaily,
      errorsLast7DaysWeekly: errsWeekly,
      recentErrors: (recentErrors ?? []).map((row: any) => ({
        id: String(row.id ?? ""),
        created_at: row.created_at ?? null,
        cadence: row.cadence ?? null,
        recipient_email: row.recipient_email ?? null,
        alert_id: row.alert_id ?? null,
        error_message: row.error_message ?? null,
      })),
    };
  } catch (error) {
    return { ...empty, error: error instanceof Error ? error.message : "Failed to load alert KPIs." };
  }
}

async function loadDistinctUsersWithAlerts(): Promise<number> {
  const { data, error } = await (supabaseAdmin.from("user_tournament_alerts" as any) as any)
    .select("user_id");
  if (error) throw error;
  const rows = (data ?? []) as Array<{ user_id?: string | null }>;
  const ids = new Set<string>();
  for (const r of rows) {
    const id = String(r.user_id ?? "").trim();
    if (id) ids.add(id);
  }
  return ids.size;
}

async function loadSavedTournamentChangeKpis(): Promise<{
  error: string | null;
  usersOptedIn: number;
  subscriptionsOptedIn: number;
  subscriptionsNotifiedLast7Days: number;
  errorsLast7Days: number;
  recentErrors: Array<{
    id: string;
    created_at: string | null;
    recipient_email: string | null;
    error_message: string | null;
  }>;
}> {
  const empty = {
    error: null,
    usersOptedIn: 0,
    subscriptionsOptedIn: 0,
    subscriptionsNotifiedLast7Days: 0,
    errorsLast7Days: 0,
    recentErrors: [],
  };

  try {
    const since7dIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const [subsOptedInRes, subsNotifiedRes, errorsRes, recentErrorsRes, optedRowsRes] = await Promise.all([
      (supabaseAdmin.from("ti_saved_tournaments" as any) as any)
        .select("id", { count: "exact", head: true })
        .eq("notify_on_changes", true),
      (supabaseAdmin.from("ti_saved_tournaments" as any) as any)
        .select("id", { count: "exact", head: true })
        .eq("notify_on_changes", true)
        .gte("last_notified_at", since7dIso),
      (supabaseAdmin.from("ti_tournament_alert_send_logs" as any) as any)
        .select("id", { count: "exact", head: true })
        .eq("outcome", "error")
        .gte("created_at", since7dIso)
        .ilike("error_message", "saved_changes:%"),
      (supabaseAdmin.from("ti_tournament_alert_send_logs" as any) as any)
        .select("id,created_at,recipient_email,error_message")
        .eq("outcome", "error")
        .ilike("error_message", "saved_changes:%")
        .order("created_at", { ascending: false })
        .limit(25),
      (supabaseAdmin.from("ti_saved_tournaments" as any) as any)
        .select("user_id")
        .eq("notify_on_changes", true),
    ]);

    const subsOptedIn = (subsOptedInRes as any).count ?? 0;
    const subsNotified = (subsNotifiedRes as any).count ?? 0;
    const errorsLast7Days = (errorsRes as any).count ?? 0;

    const rows = ((optedRowsRes as any).data ?? []) as Array<{ user_id?: string | null }>;
    const userIds = new Set<string>();
    for (const r of rows) {
      const id = String(r.user_id ?? "").trim();
      if (id) userIds.add(id);
    }

    const recentErrors = (((recentErrorsRes as any).data ?? []) as any[]).map((row) => ({
      id: String(row.id ?? ""),
      created_at: row.created_at ?? null,
      recipient_email: row.recipient_email ?? null,
      error_message: row.error_message ?? null,
    }));

    return {
      ...empty,
      usersOptedIn: userIds.size,
      subscriptionsOptedIn: subsOptedIn,
      subscriptionsNotifiedLast7Days: subsNotified,
      errorsLast7Days,
      recentErrors,
    };
  } catch (error) {
    return {
      ...empty,
      error: error instanceof Error ? error.message : "Failed to load saved-tournament notification KPIs.",
    };
  }
}
