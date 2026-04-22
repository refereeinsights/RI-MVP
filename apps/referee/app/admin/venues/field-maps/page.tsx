import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import crypto from "crypto";

import AdminNav from "@/components/admin/AdminNav";
import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

type QueueStatus = "pending" | "suggested" | "manual_review" | "approved" | "applied" | "skipped" | "error";

type QueueRow = {
  venue_id: string;
  status: QueueStatus;
  bad_venue_url_reason: string | null;
  current_venue_url: string | null;
  current_field_map_url: string | null;
  suggested_venue_url: string | null;
  suggested_field_map_url: string | null;
  suggested_field_map_source: string | null;
  suggested_field_map_confidence: string | null;
  suggested_field_map_type: string | null;
  suggested_field_map_sport?: string | null;
  suggested_field_map_set_primary?: boolean | null;
  applied_field_map_id?: number | null;
  approve_venue_url: boolean | null;
  approve_field_map_url: boolean | null;
  override_good_venue_url: boolean | null;
  notes: string | null;
  updated_at: string | null;
  venues: {
    id: string;
    name: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
    venue_url: string | null;
    field_map_url: string | null;
    venue_url_quality: string | null;
  } | null;
};

type SearchEngine = "brave" | "google";
type DiscoverMode = "broad" | "strict";

function redirectWithNotice(base: string, notice: string): never {
  const joiner = base.includes("?") ? "&" : "?";
  redirect(`${base}${joiner}notice=${encodeURIComponent(notice)}`);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeUrlForHash(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  url.hash = "";
  url.protocol = url.protocol.toLowerCase();
  url.hostname = url.hostname.toLowerCase();

  const trackingPrefixes = ["utm_"];
  const trackingKeys = new Set(["fbclid", "gclid"]);
  const kept: Array<[string, string]> = [];
  url.searchParams.forEach((value, key) => {
    const k = key.toLowerCase();
    if (trackingKeys.has(k)) return;
    if (trackingPrefixes.some((p) => k.startsWith(p))) return;
    kept.push([key, value]);
  });
  kept.sort((a, b) => (a[0] === b[0] ? a[1].localeCompare(b[1]) : a[0].localeCompare(b[0])));
  url.search = "";
  for (const [k, v] of kept) url.searchParams.append(k, v);

  return url.toString();
}

function hashUrlSha256Hex(raw: string) {
  const normalized = normalizeUrlForHash(raw);
  if (!normalized) return null;
  return crypto.createHash("sha256").update(normalized).digest("hex");
}

function safeUrlHost(raw: string) {
  try {
    return new URL(raw).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function scoreMapCandidate(input: { url: string; title?: string | null; snippet?: string | null }) {
  const url = input.url.trim();
  const host = safeUrlHost(url) ?? "";
  const title = (input.title ?? "").toLowerCase();
  const snippet = (input.snippet ?? "").toLowerCase();
  const path = (() => {
    try {
      return new URL(url).pathname.toLowerCase();
    } catch {
      return url.toLowerCase();
    }
  })();

  const blob = `${title} ${snippet} ${path}`;

  // Reject obvious non-venue content.
  const blockedHosts = [
    "tournamentinsights.com",
    "www.tournamentinsights.com",
    "google.com",
    "www.google.com",
    "maps.google.com",
    "maps.app.goo.gl",
    "goo.gl",
    "maps.apple.com",
    "waze.com",
    "www.waze.com",
  ];
  if (blockedHosts.includes(host)) return { score: -999, kind: "blocked" as const };
  if (blob.includes("/venues/") && host.includes("tournamentinsights")) return { score: -999, kind: "blocked" as const };

  let score = 0;

  const isPdf = path.endsWith(".pdf") || url.toLowerCase().includes(".pdf");
  const isImage = /\.(png|jpg|jpeg|webp)$/i.test(path);
  const looksLikeMap =
    /field\s*map|facility\s*map|complex\s*map|campus\s*map|court\s*map|gym\s*map|parking\s*map|field\s*layout|court\s*layout|site\s*map/i.test(
      blob
    ) || /map(\.|\/|_|-)/i.test(path);
  const hasSportsTokens = /field|fields|court|courts|gym|complex|facility|parking|layout|site/i.test(blob);

  if (isPdf) score += 35;
  if (isImage) score += 20;
  if (looksLikeMap) score += 20;
  if (hasSportsTokens) score += 10;

  if (/\bpark(s)?\b|\brecreation\b|\bparks\b|\bschools\b|\bathletics\b|\bdistrict\b|\bcity\b|\bcounty\b/.test(host)) score += 6;
  if (host.endsWith(".gov")) score += 8;
  if (host.endsWith(".edu")) score += 8;

  // Penalize likely generic directories.
  if (/(yelp|facebook|tripadvisor|opentable|wikipedia)\./i.test(host)) score -= 18;

  return { score, kind: isPdf || isImage ? ("artifact" as const) : ("page" as const) };
}

function isStrictEligible(candidate: { url: string; title?: string | null; snippet?: string | null }) {
  const url = candidate.url.toLowerCase();
  const title = (candidate.title ?? "").toLowerCase();
  const snippet = (candidate.snippet ?? "").toLowerCase();
  const blob = `${url} ${title} ${snippet}`;
  const isPdfOrImage = url.includes(".pdf") || /\.(png|jpg|jpeg|webp)(\\?|$)/i.test(url);
  const keyword =
    blob.includes("field map") ||
    blob.includes("facility map") ||
    blob.includes("complex map") ||
    blob.includes("court map") ||
    blob.includes("gym map") ||
    blob.includes("parking map") ||
    blob.includes("field layout") ||
    blob.includes("court layout") ||
    blob.includes("site map");
  return isPdfOrImage || keyword;
}

function inferMapTypeFromUrl(raw: string) {
  const s = raw.toLowerCase();
  if (s.includes("parking")) return "parking_map";
  if (s.includes("court") || s.includes("gym")) return "indoor_court_map";
  if (s.includes("field") && (s.includes("number") || s.includes("field-") || s.includes("fields"))) return "field_numbering";
  if (s.includes("campus")) return "campus_map";
  if (s.includes("complex") || s.includes("layout") || s.includes("facility")) return "complex_layout";
  if (s.includes("map")) return "general_facility_map";
  return "unknown";
}

function inferConfidence(candidate: { url: string; title?: string | null; snippet?: string | null }) {
  const scored = scoreMapCandidate(candidate);
  if (scored.score >= 55) return "high";
  if (scored.score >= 35) return "medium";
  if (scored.score >= 20) return "low";
  return null;
}

async function braveSearch(params: { q: string; count: number }) {
  const token = process.env.BRAVE_SEARCH_API_KEY?.trim();
  if (!token) return { error: "missing_brave_key", results: [] as any[] };

  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  url.searchParams.set("q", params.q);
  url.searchParams.set("count", String(Math.max(1, Math.min(10, params.count))));

  const res = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
      "X-Subscription-Token": token,
    },
    cache: "no-store",
  });

  if (!res.ok) return { error: `brave_http_${res.status}`, results: [] as any[] };
  const json: any = await res.json();
  const results = (json?.web?.results ?? []).map((r: any) => ({
    url: r.url as string,
    title: (r.title ?? null) as string | null,
    snippet: (r.description ?? null) as string | null,
  }));
  return { error: null as string | null, results };
}

async function googleCseSearch(params: { q: string; count: number }) {
  const key = process.env.GOOGLE_CSE_API_KEY?.trim();
  const cx = process.env.GOOGLE_CSE_CX?.trim();
  if (!key || !cx) return { error: "missing_google_cse_key", results: [] as any[] };

  const url = new URL("https://www.googleapis.com/customsearch/v1");
  url.searchParams.set("key", key);
  url.searchParams.set("cx", cx);
  url.searchParams.set("q", params.q);
  url.searchParams.set("num", String(Math.max(1, Math.min(10, params.count))));

  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) return { error: `google_http_${res.status}`, results: [] as any[] };
  const json: any = await res.json();
  const results = (json?.items ?? []).map((r: any) => ({
    url: r.link as string,
    title: (r.title ?? null) as string | null,
    snippet: (r.snippet ?? null) as string | null,
  }));
  return { error: null as string | null, results };
}

function clampInt(value: string | null, fallback: number, min: number, max: number) {
  const n = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

export default async function VenueFieldMapsQueuePage({
  searchParams,
}: {
  searchParams?: {
    q?: string;
    status?: QueueStatus | "all";
    limit?: string;
    offset?: string;
    notice?: string;
  };
}) {
  await requireAdmin();

  const q = (searchParams?.q ?? "").trim();
  const status = (searchParams?.status ?? "pending") as QueueStatus | "all";
  const limit = clampInt(searchParams?.limit ?? null, 25, 1, 200);
  const offset = clampInt(searchParams?.offset ?? null, 0, 0, 50_000);
  const notice = (searchParams?.notice ?? "").trim();

  const basePath = "/admin/venues/field-maps";
  const engine = ((searchParams as any)?.engine ?? "brave") as SearchEngine;
  const discoverMode = ((searchParams as any)?.discover_mode ?? "broad") as DiscoverMode;

  const schemaHelp = {
    title: "Field map queue schema not deployed yet",
    body: [
      "Apply these Supabase migrations:",
      "- `supabase/migrations/20260422_ti_venue_url_cleanup_field_maps_queue.sql`",
      "- `supabase/migrations/20260422_ti_venue_field_maps_multi.sql`",
      "",
      "Then reload PostgREST's schema cache (Supabase SQL editor): `NOTIFY pgrst, 'reload schema';`",
    ].join("\n"),
  };

  const buildHref = (overrides: Record<string, string | null | undefined>) => {
    const params = new URLSearchParams();
    const nextQ = overrides.q ?? q;
    const nextStatus = overrides.status ?? status;
    const nextLimit = overrides.limit ?? String(limit);
    const nextOffset = overrides.offset ?? String(offset);
    const nextEngine = overrides.engine ?? engine;
    const nextDiscoverMode = overrides.discover_mode ?? discoverMode;

    if (nextQ) params.set("q", nextQ);
    if (nextStatus && nextStatus !== "pending") params.set("status", nextStatus);
    if (nextLimit && nextLimit !== "25") params.set("limit", nextLimit);
    if (nextOffset && nextOffset !== "0") params.set("offset", nextOffset);
    if (nextEngine && nextEngine !== "brave") params.set("engine", nextEngine);
    if (nextDiscoverMode && nextDiscoverMode !== "broad") params.set("discover_mode", nextDiscoverMode);
    return `${basePath}${params.toString() ? `?${params.toString()}` : ""}`;
  };

  async function quickPasteAction(formData: FormData) {
    "use server";
    const admin = await requireAdmin();
    const redirectTo = String(formData.get("redirect_to") || basePath);
    const quickAction = String(formData.get("quick_action") || "");
    const [modeRaw, venueIdRaw] = quickAction.split(":");
    const venueId = String(venueIdRaw || "").trim();
    const mode = String(modeRaw || "");
    const mapUrl = String(formData.get(`quick_map_url_${venueId}`) || "").trim();
    const sport = String(formData.get(`quick_sport_${venueId}`) || "").trim() || null;
    const setPrimary = formData.get(`quick_set_primary_${venueId}`) === "on";

    if (!venueId) return redirectWithNotice(redirectTo, "Venue id missing.");
    if (!mapUrl) return redirectWithNotice(redirectTo, "Paste a map URL first.");

    // Ensure queue row exists + snapshot current venue values.
    const { data: venue, error: venueErr } = await supabaseAdmin
      .from("venues" as any)
      .select("id,venue_url,field_map_url")
      .eq("id", venueId)
      .maybeSingle();
    if (venueErr || !venue) {
      console.error("field-maps quick paste: venue load failed", { venueId, venueErr });
      return redirectWithNotice(redirectTo, "Venue not found.");
    }

    const mapType = inferMapTypeFromUrl(mapUrl);
    const confidence = inferConfidence({ url: mapUrl, title: null, snippet: null });
    const nextNotes = `[manual_paste] ${mapUrl}${sport ? ` (sport=${sport})` : ""}${setPrimary ? " (primary)" : ""}`;

    const { error: upsertErr } = await supabaseAdmin
      .from("venue_url_review_queue" as any)
      .upsert(
        {
          venue_id: venueId,
          status: mode === "approve" || mode === "apply" ? "approved" : "pending",
          current_venue_url: (venue as any).venue_url ?? null,
          current_field_map_url: (venue as any).field_map_url ?? null,
          suggested_field_map_url: mapUrl,
          suggested_field_map_source: "manual_paste",
          suggested_field_map_confidence: confidence,
          suggested_field_map_type: mapType,
          suggested_field_map_sport: sport,
          suggested_field_map_set_primary: setPrimary,
          approve_field_map_url: mode === "approve" || mode === "apply",
          reviewed_by: admin.id,
          last_reviewed_at: new Date().toISOString(),
          notes: nextNotes,
        },
        { onConflict: "venue_id" }
      );

    if (upsertErr) {
      console.error("field-maps quick paste: queue upsert failed", { venueId, upsertErr });
      return redirectWithNotice(redirectTo, "Failed to save queue row.");
    }

    if (mode !== "apply") {
      revalidatePath(basePath);
      return redirectWithNotice(redirectTo, "Saved + approved (ready to apply).");
    }

    // Apply immediately: insert into venue_field_maps and optionally set primary.
    const mapHash = hashUrlSha256Hex(mapUrl);
    let appliedMapId: number | null = null;
    if (mapHash) {
      const { data: existingRaw, error: existingErr } = await supabaseAdmin
        .from("venue_field_maps" as any)
        .select("id")
        .eq("venue_id", venueId)
        .eq("map_hash", mapHash)
        .maybeSingle();
      if (existingErr) {
        console.error("field-maps quick apply: existing map lookup failed", { venueId, existingErr });
      } else if ((existingRaw as any)?.id) {
        appliedMapId = Number((existingRaw as any).id);
      }
    }

    if (!appliedMapId) {
      const { data: inserted, error: insErr } = await supabaseAdmin
        .from("venue_field_maps" as any)
        .insert({
          venue_id: venueId,
          map_url: mapUrl,
          map_hash: mapHash,
          map_source: "manual_paste",
          map_confidence: confidence,
          map_type: mapType,
          sport,
          is_primary: false,
        })
        .select("id")
        .maybeSingle();
      if (insErr || !inserted) {
        console.error("field-maps quick apply: insert failed", { venueId, insErr });
        return redirectWithNotice(redirectTo, "Apply failed: could not insert map.");
      }
      appliedMapId = Number((inserted as any).id);
      await supabaseAdmin.from("venue_field_maps_audit_log" as any).insert({
        venue_id: venueId,
        event_type: "insert",
        map_id: appliedMapId,
        map_url: mapUrl,
        actor: admin.id,
        reason: "manual quick apply from admin queue",
      });
    }

    if (setPrimary) {
      await supabaseAdmin.from("venue_field_maps" as any).update({ is_primary: false }).eq("venue_id", venueId).eq("is_primary", true);
      await supabaseAdmin.from("venue_field_maps" as any).update({ is_primary: true }).eq("id", appliedMapId);
      await supabaseAdmin.from("venue_field_maps_audit_log" as any).insert({
        venue_id: venueId,
        event_type: "set_primary",
        map_id: appliedMapId,
        map_url: mapUrl,
        actor: admin.id,
        reason: "manual quick apply from admin queue",
      });

      // Cache back onto venues for legacy surfaces.
      const prevFieldMapUrl = (venue as any).field_map_url ?? null;
      const { error: venueUpdateErr } = await supabaseAdmin
        .from("venues" as any)
        .update({
          field_map_url: mapUrl,
          field_map_source: "manual_paste",
          field_map_confidence: confidence,
          field_map_type: mapType,
          field_map_hash: mapHash,
          field_map_last_checked_at: new Date().toISOString(),
        })
        .eq("id", venueId);
      if (venueUpdateErr) {
        console.error("field-maps quick apply: venue cache update failed", { venueId, venueUpdateErr });
      } else {
        await supabaseAdmin.from("venue_url_audit_log" as any).insert({
          venue_id: venueId,
          event_type: "apply",
          previous_venue_url: (venue as any).venue_url ?? null,
          new_venue_url: null,
          previous_field_map_url: prevFieldMapUrl,
          new_field_map_url: mapUrl,
          actor: admin.id,
          reason: "manual quick apply primary map from admin queue",
        });
      }
    }

    await supabaseAdmin
      .from("venue_url_review_queue" as any)
      .update({ status: "applied", applied_field_map_id: appliedMapId })
      .eq("venue_id", venueId);

    revalidatePath(basePath);
    revalidatePath("/admin/venues");
    return redirectWithNotice(redirectTo, setPrimary ? "Applied (primary set)." : "Applied (map added).");
  }

  async function seedQueueAction(formData: FormData) {
    "use server";
    const adminBase = String(formData.get("redirect_to") || basePath);
    const seedLimit = clampInt(String(formData.get("seed_limit") ?? ""), 200, 1, 2000);

    // Fail fast with an actionable message when the migration hasn't been applied yet.
    const { error: probeErr } = await supabaseAdmin
      .from("venue_url_review_queue" as any)
      .select("venue_id", { count: "exact", head: true } as any);
    if (probeErr) {
      console.error("field-maps seed: queue table probe failed", probeErr);
      return redirectWithNotice(adminBase, schemaHelp.body);
    }

    // Best-effort probe for multi-map storage. If missing, seeding still works but maps can't be applied to the table.
    const { error: mapsProbeErr } = await supabaseAdmin
      .from("venue_field_maps" as any)
      .select("id", { count: "exact", head: true } as any);
    if (mapsProbeErr) {
      console.warn("field-maps seed: venue_field_maps probe failed (ok pre-migration)", mapsProbeErr);
    }

    // Tier 1: only venues linked to tournaments and missing field maps / venue url or missing quality.
    // Keep it throttled: limit inserts by the newest linked tournaments.
    // Note: uses ON CONFLICT DO NOTHING to avoid resetting existing review state.
    const { data: linkRows, error: linkErr } = await supabaseAdmin
      .from("tournament_venues" as any)
      .select("venue_id, created_at")
      .order("created_at", { ascending: false })
      .limit(seedLimit);

    if (linkErr) {
      console.error("field-maps seed: failed to load tournament_venues", linkErr);
      return redirectWithNotice(adminBase, "Seed failed: could not load tournament_venues.");
    }

    const venueIds = Array.from(new Set((linkRows ?? []).map((r: any) => String(r.venue_id)).filter(Boolean)));
    if (!venueIds.length) return redirectWithNotice(adminBase, "No venues found to seed.");

    const { data: venues, error: venuesErr } = await supabaseAdmin
      .from("venues" as any)
      .select("id, venue_url, field_map_url, venue_url_quality")
      .in("id", venueIds);

    if (venuesErr) {
      console.error("field-maps seed: failed to load venues", venuesErr);
      if ((venuesErr as any)?.code === "42703" || String((venuesErr as any)?.message || "").includes("field_map_url")) {
        return redirectWithNotice(adminBase, schemaHelp.body);
      }
      return redirectWithNotice(adminBase, "Seed failed: could not load venues.");
    }

    const seedRows = (venues ?? [])
      .filter((v: any) => !v.field_map_url || !v.venue_url || !v.venue_url_quality)
      .slice(0, seedLimit)
      .map((v: any) => ({
        venue_id: v.id,
        status: "pending",
        current_venue_url: v.venue_url ?? null,
        current_field_map_url: v.field_map_url ?? null,
      }));

    if (!seedRows.length) return redirectWithNotice(adminBase, "Nothing to seed (already covered).");

    const { error: insErr } = await supabaseAdmin
      .from("venue_url_review_queue" as any)
      .upsert(seedRows, { onConflict: "venue_id", ignoreDuplicates: true } as any);

    if (insErr) {
      console.error("field-maps seed: upsert failed", insErr);
      if ((insErr as any)?.code === "PGRST205") {
        return redirectWithNotice(adminBase, schemaHelp.body);
      }
      return redirectWithNotice(adminBase, "Seed failed: insert error.");
    }

    revalidatePath(basePath);
    return redirectWithNotice(adminBase, `Seeded ${seedRows.length} venue(s) into the review queue.`);
  }

  async function bulkQueueAction(formData: FormData) {
    "use server";
    const admin = await requireAdmin();
    const adminBase = String(formData.get("redirect_to") || basePath);
    const action = String(formData.get("bulk_action") || "");
    const ids = (formData.getAll("selected") as string[]).map((v) => v.trim()).filter(Boolean);
    if (!ids.length) return redirectWithNotice(adminBase, "Select at least one venue.");
    const chosenEngine = (String(formData.get("engine") || "brave") as SearchEngine) || "brave";
    const chosenDiscoverMode = (String(formData.get("discover_mode") || "broad") as DiscoverMode) || "broad";

    if (action === "approve_maps") {
      const { data: rowsRaw, error: rowsErr } = await supabaseAdmin
        .from("venue_url_review_queue" as any)
        .select("venue_id,suggested_field_map_url")
        .in("venue_id", ids);
      if (rowsErr) {
        console.error("field-maps bulk approve failed (load rows)", rowsErr);
        return redirectWithNotice(adminBase, "Bulk approve failed.");
      }

      const rows = (rowsRaw ?? []) as any[];
      const eligibleIds = rows
        .filter((r) => Boolean(String(r.suggested_field_map_url ?? "").trim()))
        .map((r) => String(r.venue_id));

      const skipped = ids.length - eligibleIds.length;
      if (!eligibleIds.length) {
        return redirectWithNotice(adminBase, "Nothing to approve: selected rows have no suggested map URL yet.");
      }

      const { error } = await supabaseAdmin
        .from("venue_url_review_queue" as any)
        .update({
          approve_field_map_url: true,
          status: "approved",
          reviewed_by: admin.id,
          last_reviewed_at: new Date().toISOString(),
        })
        .in("venue_id", eligibleIds);
      if (error) {
        console.error("field-maps bulk approve failed", error);
        return redirectWithNotice(adminBase, "Bulk approve failed.");
      }
      revalidatePath(basePath);
      return redirectWithNotice(
        adminBase,
        skipped ? `Approved ${eligibleIds.length} venue(s). Skipped ${skipped} with no suggested map URL.` : `Approved ${eligibleIds.length} venue(s).`
      );
    }

    if (action === "discover_maps") {
      const { error: mapsProbeErr } = await supabaseAdmin
        .from("venue_field_maps" as any)
        .select("id", { count: "exact", head: true } as any);
      if (mapsProbeErr) {
        console.error("field-maps discover: venue_field_maps probe failed", mapsProbeErr);
        return redirectWithNotice(adminBase, schemaHelp.body);
      }

      const { data: venueRowsRaw, error: venueRowsErr } = await supabaseAdmin
        .from("venues" as any)
        .select("id,name,city,state,zip,venue_url")
        .in("id", ids);

      if (venueRowsErr) {
        console.error("field-maps discover: failed to load venues", venueRowsErr);
        return redirectWithNotice(adminBase, "Discover failed: could not load venues.");
      }

      const venueById = new Map<string, any>();
      for (const v of (venueRowsRaw ?? []) as any[]) venueById.set(String(v.id), v);

      let updated = 0;
      let skipped = 0;
      let noMatch = 0;
      let errored = 0;

      for (const venueId of ids) {
        const v = venueById.get(venueId);
        if (!v) {
          errored += 1;
          continue;
        }

        const { data: queueRaw, error: queueErr } = await supabaseAdmin
          .from("venue_url_review_queue" as any)
          .select("venue_id,suggested_field_map_url,notes,status")
          .eq("venue_id", venueId)
          .maybeSingle();

        if (queueErr || !queueRaw) {
          console.error("field-maps discover: queue load failed", { venueId, queueErr });
          errored += 1;
          continue;
        }

        if (String((queueRaw as any).suggested_field_map_url ?? "").trim()) {
          skipped += 1;
          continue;
        }

        const name = String(v.name ?? "").trim();
        const city = String(v.city ?? "").trim();
        const st = String(v.state ?? "").trim();
        const zip = String(v.zip ?? "").trim();

        const baseTerms = [name, city, st].filter(Boolean).join(" ");
        const queries = [
          `${baseTerms} field map pdf`,
          `${baseTerms} facility map pdf`,
          `${baseTerms} complex map`,
          zip ? `${name} ${zip} field map pdf` : null,
        ].filter(Boolean) as string[];

        let best: { url: string; title?: string | null; snippet?: string | null; score: number } | null = null;
        let lastErr: string | null = null;

        for (const q of queries.slice(0, 3)) {
          const searchRes =
            chosenEngine === "google" ? await googleCseSearch({ q, count: 6 }) : await braveSearch({ q, count: 6 });
          if (searchRes.error) {
            lastErr = searchRes.error;
            continue;
          }
          for (const r of searchRes.results) {
            if (chosenDiscoverMode === "strict" && !isStrictEligible(r)) continue;
            const scored = scoreMapCandidate(r);
            if (scored.score <= 0) continue;
            if (!best || scored.score > best.score) {
              best = { url: r.url, title: r.title, snippet: r.snippet, score: scored.score };
            }
          }
          if (best && best.score >= 55) break; // stop early on high-confidence hit
          await sleep(1100); // throttle: ~<= 1 req/sec globally per action execution
        }

        if (!best) {
          noMatch += 1;
          const nextNotes = [
            String((queueRaw as any).notes ?? "").trim(),
            `[discover:${chosenEngine}] no match${lastErr ? ` (${lastErr})` : ""} for "${baseTerms}"`,
          ]
            .filter(Boolean)
            .join("\n");
          await supabaseAdmin.from("venue_url_review_queue" as any).update({ notes: nextNotes }).eq("venue_id", venueId);
          continue;
        }

        const confidence = inferConfidence(best);
        const type = inferMapTypeFromUrl(best.url);
        const nextNotes = [
          String((queueRaw as any).notes ?? "").trim(),
          `[discover:${chosenEngine}] picked (${best.score}) ${best.url}`,
        ]
          .filter(Boolean)
          .join("\n");

        const { error: updErr } = await supabaseAdmin
          .from("venue_url_review_queue" as any)
          .update({
            suggested_field_map_url: best.url,
            suggested_field_map_source: `discover_${chosenEngine}`,
            suggested_field_map_confidence: confidence,
            suggested_field_map_type: type,
            status: (queueRaw as any).status === "pending" ? "suggested" : (queueRaw as any).status,
            notes: nextNotes,
          })
          .eq("venue_id", venueId);

        if (updErr) {
          console.error("field-maps discover: update failed", { venueId, updErr });
          errored += 1;
          continue;
        }

        updated += 1;
        await sleep(300); // small pacing between venues
      }

      revalidatePath(basePath);
      return redirectWithNotice(
        adminBase,
        `Discover complete (${chosenEngine}/${chosenDiscoverMode}). updated=${updated}, skipped=${skipped}, no_match=${noMatch}, errored=${errored}.`
      );
    }

    if (action === "delete_queue_rows") {
      const { error } = await supabaseAdmin.from("venue_url_review_queue" as any).delete().in("venue_id", ids);
      if (error) {
        console.error("field-maps bulk delete failed", error);
        return redirectWithNotice(adminBase, "Bulk delete failed.");
      }
      revalidatePath(basePath);
      return redirectWithNotice(adminBase, `Removed ${ids.length} row(s) from the queue (venues not deleted).`);
    }

    if (action === "mark_not_found") {
      const now = new Date().toISOString();
      const { data: rowsRaw, error: rowsErr } = await supabaseAdmin
        .from("venue_url_review_queue" as any)
        .select("venue_id,notes,status")
        .in("venue_id", ids);
      if (rowsErr) {
        console.error("field-maps bulk not-found failed (load rows)", rowsErr);
        return redirectWithNotice(adminBase, "Mark not found failed.");
      }

      let updated = 0;
      for (const row of (rowsRaw ?? []) as any[]) {
        const venueId = String(row.venue_id);
        const priorNotes = String(row.notes ?? "").trim();
        const nextNotes = [priorNotes, `[${now}] not found: no field map located (manual skip)`].filter(Boolean).join("\n");
        const { error } = await supabaseAdmin
          .from("venue_url_review_queue" as any)
          .update({
            status: "skipped",
            notes: nextNotes,
            last_reviewed_at: now,
          })
          .eq("venue_id", venueId);
        if (error) {
          console.error("field-maps bulk not-found update failed", { venueId, error });
          continue;
        }
        updated += 1;
      }

      revalidatePath(basePath);
      return redirectWithNotice(adminBase, `Marked ${updated} row(s) as skipped (venues not deleted).`);
    }

    if (action === "apply_selected") {
      const { error: mapsProbeErr } = await supabaseAdmin
        .from("venue_field_maps" as any)
        .select("id", { count: "exact", head: true } as any);
      if (mapsProbeErr) {
        console.error("field-maps apply: venue_field_maps probe failed", mapsProbeErr);
        return redirectWithNotice(adminBase, schemaHelp.body);
      }

      let applied = 0;
      let stale = 0;
      let skipped = 0;
      let errored = 0;

      for (const venueId of ids) {
        const { data: queueRaw, error: queueErr } = await supabaseAdmin
          .from("venue_url_review_queue" as any)
          .select(
            "venue_id,status,current_venue_url,current_field_map_url,suggested_venue_url,suggested_field_map_url,suggested_field_map_source,suggested_field_map_confidence,suggested_field_map_type,approve_venue_url,approve_field_map_url,override_good_venue_url,notes"
          )
          .eq("venue_id", venueId)
          .maybeSingle();

        const queue = (queueRaw as any) as any;

        if (queueErr || !queue) {
          console.error("field-maps apply: queue load failed", { venueId, queueErr });
          errored += 1;
          continue;
        }

        if (queue.status !== "approved") {
          skipped += 1;
          continue;
        }

        const { data: venueRaw, error: venueErr } = await supabaseAdmin
          .from("venues" as any)
          .select("id,venue_url,field_map_url,venue_url_quality")
          .eq("id", venueId)
          .maybeSingle();

        const venue = (venueRaw as any) as any;

        if (venueErr || !venue) {
          console.error("field-maps apply: venue load failed", { venueId, venueErr });
          errored += 1;
          continue;
        }

        const liveVenueUrl = (venue.venue_url ?? null) as string | null;
        const liveFieldMapUrl = (venue.field_map_url ?? null) as string | null;
        const snapshotVenueUrl = (queue.current_venue_url ?? null) as string | null;
        const snapshotFieldMapUrl = (queue.current_field_map_url ?? null) as string | null;

        if (liveVenueUrl !== snapshotVenueUrl || liveFieldMapUrl !== snapshotFieldMapUrl) {
          stale += 1;
          const nextNotes = [
            (queue.notes ?? "").trim(),
            `[${new Date().toISOString()}] Live venue record changed since snapshot; re-review required.`,
          ]
            .filter(Boolean)
            .join("\n");
          await supabaseAdmin
            .from("venue_url_review_queue" as any)
            .update({ status: "manual_review", notes: nextNotes })
            .eq("venue_id", venueId);
          continue;
        }

        const approveVenueUrl = Boolean(queue.approve_venue_url);
        const approveFieldMapUrl = Boolean(queue.approve_field_map_url);
        const overrideGoodVenueUrl = Boolean(queue.override_good_venue_url);

        const suggestedVenueUrl = (queue.suggested_venue_url ?? "").trim() || null;
        const suggestedFieldMapUrl = (queue.suggested_field_map_url ?? "").trim() || null;
        const suggestedFieldMapSport = (queue.suggested_field_map_sport ?? "").trim() || null;
        const suggestedSetPrimary = Boolean(queue.suggested_field_map_set_primary);

        const shouldApplyVenueUrl =
          approveVenueUrl &&
          Boolean(suggestedVenueUrl) &&
          (String(venue.venue_url_quality ?? "").toLowerCase() !== "good" || overrideGoodVenueUrl);
        const shouldApplyFieldMapUrl = approveFieldMapUrl && Boolean(suggestedFieldMapUrl);

        if (!shouldApplyVenueUrl && !shouldApplyFieldMapUrl) {
          skipped += 1;
          continue;
        }

        const nextVenueUpdates: Record<string, any> = {
          venue_url_last_checked_at: new Date().toISOString(),
        };
        let newVenueUrl: string | null = null;
        let newFieldMapUrl: string | null = null;
        let appliedFieldMapIdForQueue: number | null = null;

        if (shouldApplyVenueUrl) {
          newVenueUrl = suggestedVenueUrl;
          nextVenueUpdates.venue_url = suggestedVenueUrl;
          nextVenueUpdates.venue_url_quality = "good";
        }

        if (shouldApplyFieldMapUrl) {
          // Only set newFieldMapUrl if we actually update the cached `venues.field_map_url` (primary).
          newFieldMapUrl = suggestedSetPrimary ? suggestedFieldMapUrl : null;

          const mapHash = suggestedFieldMapUrl ? hashUrlSha256Hex(suggestedFieldMapUrl) : null;
          const { data: existingMapsRaw, error: existingMapsErr } = await supabaseAdmin
            .from("venue_field_maps" as any)
            .select("id,is_primary,map_hash")
            .eq("venue_id", venueId)
            .limit(50);

          if (existingMapsErr) {
            console.error("field-maps apply: failed to load existing maps", { venueId, existingMapsErr });
            errored += 1;
            continue;
          }

          const existingMaps = ((existingMapsRaw ?? []) as any[]).map((m) => ({
            id: Number(m.id),
            is_primary: Boolean(m.is_primary),
            map_hash: (m.map_hash ?? null) as string | null,
          }));

          const alreadyExists =
            mapHash && existingMaps.some((m) => (m.map_hash ?? null) === mapHash);

          let appliedMapId: number | null = null;
          if (!alreadyExists) {
            const { data: inserted, error: insertErr } = await supabaseAdmin
              .from("venue_field_maps" as any)
              .insert({
                venue_id: venueId,
                map_url: suggestedFieldMapUrl,
                map_hash: mapHash,
                map_source: queue.suggested_field_map_source ?? null,
                map_confidence: queue.suggested_field_map_confidence ?? null,
                map_type: queue.suggested_field_map_type ?? null,
                sport: suggestedFieldMapSport,
                is_primary: false,
              })
              .select("id")
              .maybeSingle();

            if (insertErr || !inserted) {
              console.error("field-maps apply: insert failed", { venueId, insertErr });
              errored += 1;
              continue;
            }
            appliedMapId = Number((inserted as any).id);
            appliedFieldMapIdForQueue = appliedMapId;

            const { error: mapsAuditErr } = await supabaseAdmin.from("venue_field_maps_audit_log" as any).insert({
              venue_id: venueId,
              event_type: "insert",
              map_id: appliedMapId,
              map_url: suggestedFieldMapUrl,
              actor: admin.id,
              reason: "applied from venue_url_review_queue",
            });
            if (mapsAuditErr) {
              console.error("field-maps apply: map audit insert failed", { venueId, mapsAuditErr });
            }
          }

          if (suggestedSetPrimary) {
            // Unset any existing primary, then set the new map primary.
            await supabaseAdmin.from("venue_field_maps" as any).update({ is_primary: false }).eq("venue_id", venueId).eq("is_primary", true);
            if (appliedMapId) {
              await supabaseAdmin.from("venue_field_maps" as any).update({ is_primary: true }).eq("id", appliedMapId);
            }

            // Cache the primary map back onto venues for legacy surfaces.
            nextVenueUpdates.field_map_url = suggestedFieldMapUrl;
            nextVenueUpdates.field_map_source = (queue.suggested_field_map_source ?? null) as string | null;
            nextVenueUpdates.field_map_confidence = (queue.suggested_field_map_confidence ?? null) as string | null;
            nextVenueUpdates.field_map_type = (queue.suggested_field_map_type ?? null) as string | null;
            nextVenueUpdates.field_map_hash = suggestedFieldMapUrl ? hashUrlSha256Hex(suggestedFieldMapUrl) : null;
            nextVenueUpdates.field_map_last_checked_at = new Date().toISOString();

            const { error: mapsAuditErr } = await supabaseAdmin.from("venue_field_maps_audit_log" as any).insert({
              venue_id: venueId,
              event_type: "set_primary",
              map_id: appliedMapId,
              map_url: suggestedFieldMapUrl,
              actor: admin.id,
              reason: "set primary from venue_url_review_queue",
            });
            if (mapsAuditErr) {
              console.error("field-maps apply: primary audit insert failed", { venueId, mapsAuditErr });
            }
          }

          // Persist the inserted map id onto the queue row for traceability.
          if (appliedMapId) appliedFieldMapIdForQueue = appliedMapId;
        }

        const { error: venueUpdateErr } = await supabaseAdmin.from("venues" as any).update(nextVenueUpdates).eq("id", venueId);
        if (venueUpdateErr) {
          console.error("field-maps apply: venue update failed", { venueId, venueUpdateErr });
          errored += 1;
          continue;
        }

        const reason = "applied from venue_url_review_queue";
        const { error: auditErr } = await supabaseAdmin.from("venue_url_audit_log" as any).insert({
          venue_id: venueId,
          event_type: "apply",
          previous_venue_url: liveVenueUrl,
          new_venue_url: newVenueUrl,
          previous_field_map_url: liveFieldMapUrl,
          new_field_map_url: newFieldMapUrl,
          actor: admin.id,
          reason,
        });
        if (auditErr) {
          console.error("field-maps apply: audit insert failed", { venueId, auditErr });
          // Non-fatal: venue updates already applied; keep going.
        }

        const { error: queueUpdateErr } = await supabaseAdmin
          .from("venue_url_review_queue" as any)
          .update({
            status: "applied",
            previous_venue_url: liveVenueUrl,
            previous_field_map_url: liveFieldMapUrl,
            applied_field_map_id: appliedFieldMapIdForQueue,
            reviewed_by: admin.id,
            last_reviewed_at: new Date().toISOString(),
          })
          .eq("venue_id", venueId);
        if (queueUpdateErr) {
          console.error("field-maps apply: queue update failed", { venueId, queueUpdateErr });
          // Non-fatal.
        }

        applied += 1;
      }

      revalidatePath(basePath);
      revalidatePath("/admin/venues");
      return redirectWithNotice(
        adminBase,
        `Apply complete. applied=${applied}, stale=${stale}, skipped=${skipped}, errored=${errored}.`
      );
    }

    return redirectWithNotice(adminBase, "Unknown bulk action.");
  }

  let query = supabaseAdmin
    .from("venue_url_review_queue" as any)
    .select(
      "venue_id,status,bad_venue_url_reason,current_venue_url,current_field_map_url,suggested_venue_url,suggested_field_map_url,suggested_field_map_source,suggested_field_map_confidence,suggested_field_map_type,suggested_field_map_sport,suggested_field_map_set_primary,applied_field_map_id,approve_venue_url,approve_field_map_url,override_good_venue_url,notes,updated_at,venues:venues(id,name,city,state,zip,venue_url,field_map_url,venue_url_quality)"
    )
    .order("updated_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (status !== "all") query = query.eq("status", status);

  if (q) {
    // Basic search across joined venue fields + URLs.
    const safe = q.replace(/%/g, "\\%").replace(/_/g, "\\_");
    query = query.or(
      [
        `venues.name.ilike.%${safe}%`,
        `venues.city.ilike.%${safe}%`,
        `venues.state.ilike.%${safe}%`,
        `venues.zip.ilike.%${safe}%`,
        `current_venue_url.ilike.%${safe}%`,
        `suggested_field_map_url.ilike.%${safe}%`,
      ].join(",")
    );
  }

  const { data: rowsRaw, error } = await query;
  if (error) {
    console.error("field-maps: query failed", error);
  }

  const rows = (rowsRaw ?? []) as unknown as QueueRow[];
  const schemaMissing = Boolean(error) && ((error as any)?.code === "PGRST205" || String((error as any)?.message || "").includes("schema cache"));

  const StatusLink = ({ value, label }: { value: QueueStatus | "all"; label: string }) => {
    const active = value === status;
    return (
      <Link
        href={buildHref({ status: value === "pending" ? null : value })}
        style={{
          padding: "6px 10px",
          borderRadius: 999,
          border: `1px solid ${active ? "#0f172a" : "#d1d5db"}`,
          background: active ? "#eef2ff" : "#fff",
          color: "#111",
          fontWeight: 800,
          fontSize: 12,
          textDecoration: "none",
        }}
      >
        {label}
      </Link>
    );
  };

  return (
    <div style={{ padding: 24 }}>
      <AdminNav />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0 }}>Venue field maps</h1>
          <p style={{ margin: "6px 0 0 0", color: "#4b5563" }}>
            Queue-based review for `field_map_url` (and optional `venue_url`), with bulk approve/apply.
          </p>
          {notice ? (
            <p style={{ margin: "10px 0 0 0", padding: "10px 12px", borderRadius: 12, background: "#ecfeff", border: "1px solid #67e8f9" }}>
              <strong>Notice:</strong> {notice}
            </p>
          ) : null}
          {schemaMissing ? (
            <div
              style={{
                marginTop: 10,
                padding: "12px 14px",
                borderRadius: 14,
                background: "#fff7ed",
                border: "1px solid #fdba74",
                color: "#7c2d12",
              }}
            >
              <div style={{ fontWeight: 900 }}>{schemaHelp.title}</div>
              <div style={{ marginTop: 6, fontSize: 13, whiteSpace: "pre-wrap" }}>{schemaHelp.body}</div>
            </div>
          ) : null}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Link
            href="/admin/venues"
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              background: "#fff",
              border: "1px solid #e5e7eb",
              textDecoration: "none",
              fontWeight: 900,
              color: "#111827",
            }}
          >
            Back to venues
          </Link>
        </div>
      </div>

      <div style={{ marginTop: 16, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <StatusLink value="pending" label="Pending" />
        <StatusLink value="suggested" label="Suggested" />
        <StatusLink value="manual_review" label="Manual review" />
        <StatusLink value="approved" label="Approved" />
        <StatusLink value="applied" label="Applied" />
        <StatusLink value="error" label="Error" />
        <StatusLink value="all" label="All" />
      </div>

      <form action={seedQueueAction} style={{ marginTop: 16, border: "1px solid #e5e7eb", borderRadius: 14, padding: 14, background: "#fafafa" }}>
        <input type="hidden" name="redirect_to" value={buildHref({})} />
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <button
            type="submit"
            disabled={schemaMissing}
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #0f766e",
              background: "#fff",
              color: "#0f766e",
              fontWeight: 900,
              opacity: schemaMissing ? 0.5 : 1,
              cursor: schemaMissing ? "not-allowed" : "pointer",
            }}
          >
            Seed queue (tournament-linked)
          </button>
          <label style={{ fontSize: 12, color: "#374151", display: "inline-flex", gap: 6, alignItems: "center" }}>
            Limit
            <input
              name="seed_limit"
              type="number"
              min={1}
              max={2000}
              defaultValue={200}
              style={{ width: 90, padding: "6px 8px", borderRadius: 10, border: "1px solid #d1d5db" }}
            />
          </label>
          <span style={{ fontSize: 12, color: "#6b7280" }}>
            Inserts into `venue_url_review_queue` with `ON CONFLICT DO NOTHING` (won&apos;t reset existing review state).
          </span>
        </div>
      </form>

      <form style={{ marginTop: 16, display: "grid", gap: 8, gridTemplateColumns: "2fr 1fr auto auto" }} action="GET">
        <input name="q" placeholder="Search venue / city / url" defaultValue={q} style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb" }} />
        <select name="status" defaultValue={status} style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb" }}>
          <option value="pending">pending</option>
          <option value="suggested">suggested</option>
          <option value="manual_review">manual_review</option>
          <option value="approved">approved</option>
          <option value="applied">applied</option>
          <option value="skipped">skipped</option>
          <option value="error">error</option>
          <option value="all">all</option>
        </select>
        <select name="engine" defaultValue={engine} style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb" }}>
          <option value="brave">Brave search</option>
          <option value="google">Google CSE</option>
        </select>
        <select name="discover_mode" defaultValue={discoverMode} style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb" }}>
          <option value="broad">Discover: broad</option>
          <option value="strict">Discover: strict</option>
        </select>
        <label style={{ display: "inline-flex", gap: 6, alignItems: "center", color: "#374151", fontSize: 12 }}>
          Limit
          <input name="limit" type="number" min={1} max={200} defaultValue={limit} style={{ width: 80, padding: "6px 8px", borderRadius: 10, border: "1px solid #e5e7eb" }} />
        </label>
        <button type="submit" style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #111827", background: "#111827", color: "#fff", fontWeight: 900 }}>
          Filter
        </button>
      </form>

      <form action={bulkQueueAction} style={{ marginTop: 18 }}>
        <input type="hidden" name="redirect_to" value={buildHref({})} />
        <input type="hidden" name="engine" value={engine} />
        <input type="hidden" name="discover_mode" value={discoverMode} />
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
          <button
            formNoValidate
            name="bulk_action"
            value="approve_maps"
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              border: "none",
              background: "#0a7a2f",
              color: "#fff",
              fontWeight: 900,
            }}
          >
            Approve selected maps
          </button>
          <span style={{ alignSelf: "center", fontSize: 12, color: "#6b7280" }}>
            Approve/apply only works once `suggested_field_map_url` is filled in (use `Edit`).
          </span>
          <button
            formNoValidate
            name="bulk_action"
            value="discover_maps"
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #0f766e",
              background: "#fff",
              color: "#0f766e",
              fontWeight: 900,
            }}
          >
            Discover maps (bulk)
          </button>
          <span style={{ alignSelf: "center", fontSize: 12, color: "#6b7280" }}>
            Uses {engine === "google" ? "`GOOGLE_CSE_API_KEY` + `GOOGLE_CSE_CX`" : "`BRAVE_SEARCH_API_KEY`"}; runs sequentially with throttling.
          </span>
          <button
            formNoValidate
            name="bulk_action"
            value="apply_selected"
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #1d4ed8",
              background: "#fff",
              color: "#1d4ed8",
              fontWeight: 900,
            }}
          >
            Apply selected (approved)
          </button>
          <button
            formNoValidate
            name="bulk_action"
            value="mark_not_found"
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #6b7280",
              background: "#fff",
              color: "#374151",
              fontWeight: 900,
            }}
          >
            Mark not found (skip)
          </button>
          <button
            formNoValidate
            name="bulk_action"
            value="delete_queue_rows"
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #b00020",
              background: "#fff",
              color: "#b00020",
              fontWeight: 900,
            }}
          >
            Remove from queue
          </button>
        </div>

        <div style={{ overflowX: "auto", border: "1px solid #e5e7eb", borderRadius: 14 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
                <th style={{ padding: 10, textAlign: "left" }}>Select</th>
                <th style={{ padding: 10, textAlign: "left" }}>Venue</th>
                <th style={{ padding: 10, textAlign: "left" }}>Status</th>
                <th style={{ padding: 10, textAlign: "left" }}>Current</th>
                <th style={{ padding: 10, textAlign: "left" }}>Suggested</th>
                <th style={{ padding: 10, textAlign: "left" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: 14, color: "#6b7280" }}>
                    {error ? "Failed to load queue rows." : "No queue rows found for this filter."}
                  </td>
                </tr>
              ) : (
                rows.map((row) => {
                  const venue = row.venues;
                  const title = venue?.name ?? row.venue_id;
                  const meta = [venue?.city, venue?.state, venue?.zip].filter(Boolean).join(", ");
                  const currentMap = row.current_field_map_url ?? venue?.field_map_url ?? null;
                  const suggestedMap = row.suggested_field_map_url ?? null;
                  const mapLink = suggestedMap || currentMap;
                  const sport = (row as any).suggested_field_map_sport ?? null;
                  const setPrimary = Boolean((row as any).suggested_field_map_set_primary);

                  return (
                    <tr key={row.venue_id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                      <td style={{ padding: 10, verticalAlign: "top" }}>
                        <input type="checkbox" name="selected" value={row.venue_id} />
                      </td>
                      <td style={{ padding: 10, verticalAlign: "top", minWidth: 220 }}>
                        <div style={{ fontWeight: 900 }}>{title}</div>
                        <div style={{ marginTop: 2, color: "#6b7280" }}>{meta || "—"}</div>
                        <div style={{ marginTop: 6 }}>
                          <Link href={`/admin/venues/${row.venue_id}`} style={{ color: "#2563eb", fontWeight: 800, textDecoration: "none" }}>
                            Venue →
                          </Link>
                        </div>
                      </td>
                      <td style={{ padding: 10, verticalAlign: "top", minWidth: 120 }}>
                        <div style={{ fontWeight: 900 }}>{row.status}</div>
                        {row.approve_field_map_url ? (
                          <div style={{ marginTop: 4, fontSize: 12, color: "#0a7a2f", fontWeight: 900 }}>map approved</div>
                        ) : null}
                        {row.override_good_venue_url ? (
                          <div style={{ marginTop: 4, fontSize: 12, color: "#b45309", fontWeight: 900 }}>override good URL</div>
                        ) : null}
                      </td>
                      <td style={{ padding: 10, verticalAlign: "top", minWidth: 320 }}>
                        <div style={{ color: "#111827", fontWeight: 800, marginBottom: 4 }}>field_map_url</div>
                        {currentMap ? (
                          <a href={currentMap} target="_blank" rel="noreferrer" style={{ color: "#1d4ed8", wordBreak: "break-word" }}>
                            {currentMap}
                          </a>
                        ) : (
                          <div style={{ color: "#6b7280" }}>—</div>
                        )}
                        <div style={{ marginTop: 10, color: "#111827", fontWeight: 800, marginBottom: 4 }}>venue_url</div>
                        {row.current_venue_url ? (
                          <a href={row.current_venue_url} target="_blank" rel="noreferrer" style={{ color: "#1d4ed8", wordBreak: "break-word" }}>
                            {row.current_venue_url}
                          </a>
                        ) : (
                          <div style={{ color: "#6b7280" }}>—</div>
                        )}
                      </td>
                      <td style={{ padding: 10, verticalAlign: "top", minWidth: 340 }}>
                        <div style={{ color: "#111827", fontWeight: 800, marginBottom: 4 }}>suggested_field_map_url</div>
                        {suggestedMap ? (
                          <a href={suggestedMap} target="_blank" rel="noreferrer" style={{ color: "#1d4ed8", wordBreak: "break-word" }}>
                            {suggestedMap}
                          </a>
                        ) : (
                          <div style={{ color: "#6b7280" }}>—</div>
                        )}
                        <div style={{ marginTop: 10, padding: 10, borderRadius: 12, border: "1px dashed #e5e7eb", background: "#fcfcfd" }}>
                          <div style={{ fontSize: 12, fontWeight: 900, color: "#111827" }}>Quick paste</div>
                            <input
                              name={`quick_map_url_${row.venue_id}`}
                              placeholder="Paste map URL…"
                              defaultValue=""
                              style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb" }}
                            />
                            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                              <input
                                name={`quick_sport_${row.venue_id}`}
                                placeholder="sport (optional)"
                                style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb", width: 160 }}
                              />
                              <label style={{ display: "inline-flex", gap: 8, alignItems: "center", fontSize: 12, color: "#0a7a2f", fontWeight: 900 }}>
                                <input type="checkbox" name={`quick_set_primary_${row.venue_id}`} />
                                Set primary
                              </label>
                            </div>
                            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                              <button
                                formNoValidate
                                formAction={quickPasteAction}
                                name="quick_action"
                                value={`approve:${row.venue_id}`}
                                style={{
                                  padding: "8px 10px",
                                  borderRadius: 10,
                                  border: "1px solid #0a7a2f",
                                  background: "#fff",
                                  color: "#0a7a2f",
                                  fontWeight: 900,
                                }}
                              >
                                Paste + approve
                              </button>
                              <button
                                formNoValidate
                                formAction={quickPasteAction}
                                name="quick_action"
                                value={`apply:${row.venue_id}`}
                                style={{
                                  padding: "8px 10px",
                                  borderRadius: 10,
                                  border: "1px solid #1d4ed8",
                                  background: "#fff",
                                  color: "#1d4ed8",
                                  fontWeight: 900,
                                }}
                              >
                                Paste + apply
                              </button>
                            </div>
                          <div style={{ marginTop: 8, fontSize: 12, color: "#6b7280" }}>
                            Multiple maps are stored in `venue_field_maps` (use sport to differentiate). “Set primary” caches to `venues.field_map_url`.
                          </div>
                        </div>
                        <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
                          {sport ? (
                            <span style={{ fontSize: 12, fontWeight: 900, color: "#111827" }}>sport: {sport}</span>
                          ) : null}
                          {setPrimary ? (
                            <span style={{ fontSize: 12, fontWeight: 900, color: "#0a7a2f" }}>primary</span>
                          ) : null}
                          {row.suggested_field_map_confidence ? (
                            <span style={{ fontSize: 12, fontWeight: 900, color: "#111827" }}>
                              conf: {row.suggested_field_map_confidence}
                            </span>
                          ) : null}
                          {row.suggested_field_map_type ? (
                            <span style={{ fontSize: 12, fontWeight: 900, color: "#111827" }}>
                              type: {row.suggested_field_map_type}
                            </span>
                          ) : null}
                          {row.suggested_field_map_source ? (
                            <span style={{ fontSize: 12, fontWeight: 900, color: "#111827" }}>
                              src: {row.suggested_field_map_source}
                            </span>
                          ) : null}
                        </div>
                        {row.notes ? (
                          <div style={{ marginTop: 8, fontSize: 12, color: "#6b7280", whiteSpace: "pre-wrap" }}>{row.notes}</div>
                        ) : null}
                      </td>
                      <td style={{ padding: 10, verticalAlign: "top", minWidth: 180 }}>
                        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                          <Link href={`/admin/venues/field-maps/${row.venue_id}`} style={{ color: "#111827", fontWeight: 900, textDecoration: "none" }}>
                            Edit
                          </Link>
                          {mapLink ? (
                            <a href={mapLink} target="_blank" rel="noreferrer" style={{ color: "#2563eb", fontWeight: 900, textDecoration: "none" }}>
                              Open map
                            </a>
                          ) : (
                            <span style={{ color: "#9ca3af", fontWeight: 800 }}>Open map</span>
                          )}
                        </div>
                        <div style={{ marginTop: 10, fontSize: 12, color: "#6b7280" }}>
                          Updated {row.updated_at ? new Date(row.updated_at).toLocaleString() : "—"}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </form>

      <div style={{ marginTop: 16, display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div style={{ color: "#6b7280", fontSize: 12 }}>
          Showing {rows.length} row(s) • offset {offset} • limit {limit}
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <Link
            href={buildHref({ offset: String(Math.max(0, offset - limit)) })}
            style={{
              padding: "8px 10px",
              borderRadius: 10,
              border: "1px solid #e5e7eb",
              textDecoration: "none",
              fontWeight: 900,
              color: "#111827",
              background: "#fff",
              opacity: offset > 0 ? 1 : 0.5,
              pointerEvents: offset > 0 ? "auto" : "none",
            }}
          >
            Prev
          </Link>
          <Link
            href={buildHref({ offset: String(offset + limit) })}
            style={{
              padding: "8px 10px",
              borderRadius: 10,
              border: "1px solid #e5e7eb",
              textDecoration: "none",
              fontWeight: 900,
              color: "#111827",
              background: "#fff",
            }}
          >
            Next
          </Link>
        </div>
      </div>
    </div>
  );
}
