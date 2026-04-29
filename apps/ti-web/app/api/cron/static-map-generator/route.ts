import { NextResponse } from "next/server";
import sharp from "sharp";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { EXTERNAL_API, EXTERNAL_API_SURFACE, trackExternalCall } from "@/lib/trackExternalCall";
import {
  TI_STATIC_MAP_BUCKET,
  buildMapboxStaticImageUrl,
  buildSupabasePublicObjectUrl,
  buildStaticMapStoragePath,
  computeStaticMapSourceHash,
  selectStaticMapMarkerCandidates,
  type VenueCoordCandidate,
} from "@/lib/staticTournamentMaps";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const LOCK_KEY = "ti_static_map_generator_v1";
const WIDTH = 800;
const HEIGHT = 400;
const MAX_MARKERS = 20;
const MARKER_STYLE = "soccer-v1";
const MARKER_COLOR = "00AA55";
const DEFAULT_STYLE = "mapbox/streets-v12";
const LEASE_MINUTES = 30;

function isAuthorized(req: Request) {
  const url = new URL(req.url);
  const tokenFromQuery = url.searchParams.get("token");
  const tokenFromHeader = req.headers.get("x-cron-secret");
  const token = (tokenFromQuery ?? tokenFromHeader ?? "").trim();
  return Boolean(process.env.CRON_SECRET && token && token === process.env.CRON_SECRET);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getMapboxSecretToken() {
  return (process.env.MAPBOX_SECRET_TOKEN ?? process.env.MAPBOX_ACCESS_TOKEN ?? "").trim();
}

type CandidateTournamentRow = {
  id: string;
  slug: string | null;
  static_map_path: string | null;
  static_map_source_hash: string | null;
  static_map_version: number | null;
  static_map_status: string | null;
  static_map_updated_at: string | null;
  static_map_processing_started_at: string | null;
};

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const targetSlug = (url.searchParams.get("slug") ?? "").trim().toLowerCase();
  const targetTournamentId = (url.searchParams.get("tournamentId") ?? "").trim();
  const force = (url.searchParams.get("force") ?? "").trim() === "1";
  const batchLimitRaw = (url.searchParams.get("batchLimit") ?? "").trim();

  const { data: lock, error: lockError } = await (supabaseAdmin as any).rpc("acquire_cron_job_lock", {
    p_key: LOCK_KEY,
    p_ttl_seconds: 10 * 60,
  });
  if (lockError) {
    return NextResponse.json({ ok: false, error: lockError.message }, { status: 500 });
  }
  if (!lock) {
    return NextResponse.json({ ok: true, skipped: true, reason: "lock_held" });
  }

  const startedAt = new Date();
  const leaseCutoff = new Date(Date.now() - LEASE_MINUTES * 60 * 1000).toISOString();
  const refreshCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const result = {
    ok: true,
    started_at: startedAt.toISOString(),
    scanned: 0,
    processed: 0,
    claimed: 0,
    skipped_lease_held: 0,
    skipped_claim_filter_miss: 0,
    claim_errors: 0,
    claim_error_sample: null as string | null,
    updated: 0,
    skipped_no_coords: 0,
    skipped_up_to_date: 0,
    failures: 0,
    rate_limited: false,
    items: [] as Array<{
      tournament_id: string;
      slug: string | null;
      status: "updated" | "up_to_date" | "no_coords" | "error" | "rate_limited" | "lease_held" | "claim_miss" | "claim_error";
      static_map_path?: string | null;
      static_map_public_url?: string | null;
      error?: string | null;
    }>,
    ms: 0,
  };

  try {
    const token = getMapboxSecretToken();
    if (!token) {
      return NextResponse.json({ ok: false, error: "missing MAPBOX_SECRET_TOKEN" }, { status: 500 });
    }

    // Default batch size is tuned for Vercel's request timeout. You can raise this locally for backfills.
    const DEFAULT_BATCH_LIMIT = 50;
    const batchLimitParsed = Number.parseInt(batchLimitRaw || "", 10);
    const BATCH_LIMIT =
      Number.isFinite(batchLimitParsed) && batchLimitParsed > 0
        ? Math.min(Math.max(batchLimitParsed, 1), 300)
        : DEFAULT_BATCH_LIMIT;
    let rawCandidates: CandidateTournamentRow[] | null = null;

    if (targetTournamentId || targetSlug) {
      const q = (supabaseAdmin.from("tournaments" as any) as any)
        .select(
          "id,slug,static_map_path,static_map_source_hash,static_map_version,static_map_status,static_map_updated_at,static_map_processing_started_at"
        )
        .eq("status", "published")
        .eq("is_canonical", true)
        .limit(1);

      const { data: single, error: singleError } = targetTournamentId
        ? await q.eq("id", targetTournamentId).maybeSingle()
        : await q.eq("slug", targetSlug).maybeSingle();

      if (singleError) {
        return NextResponse.json({ ok: false, error: singleError.message }, { status: 500 });
      }
      rawCandidates = single ? [single as CandidateTournamentRow] : [];
    } else {
      const { data: batch, error: candidateError } = await (supabaseAdmin
        .from("tournaments" as any) as any)
        .select(
          "id,slug,static_map_path,static_map_source_hash,static_map_version,static_map_status,static_map_updated_at,static_map_processing_started_at"
        )
        .eq("status", "published")
        .eq("is_canonical", true)
        // Keep the batch focused on work we can actually do.
        // - `missing` with no usable venue coords is intentionally retried on a slow cadence (refreshCutoff).
        // - `error` / `queued` should be retried promptly.
        // - `processing` rows are safe to include; the claim/lease check prevents double-processing.
        .or(
          [
            "static_map_status.eq.error",
            "static_map_status.eq.queued",
            "static_map_status.eq.processing",
            // Never attempted / unknown freshness
            `and(static_map_status.neq.ready,static_map_path.is.null,static_map_updated_at.is.null)`,
            // Regular refresh cadence for anything non-ready
            `and(static_map_status.neq.ready,static_map_path.is.null,static_map_updated_at.lt.${refreshCutoff})`,
            // For `missing` we also re-check on the same slow cadence (covers the common "no coords" case).
            `and(static_map_status.eq.missing,static_map_updated_at.lt.${refreshCutoff})`,
          ].join(",")
        )
        .order("updated_at", { ascending: false })
        .limit(BATCH_LIMIT);

      if (candidateError) {
        return NextResponse.json({ ok: false, error: candidateError.message }, { status: 500 });
      }
      rawCandidates = (batch as CandidateTournamentRow[] | null) ?? [];
    }

    const candidates = (rawCandidates ?? []).filter((row) => Boolean(row?.id));
    result.scanned = candidates.length;

    const mapStyle = (process.env.MAPBOX_STATIC_STYLE ?? "").trim() || DEFAULT_STYLE;
    const version = Number(process.env.TI_STATIC_MAP_VERSION ?? 1) || 1;
    const supabaseBaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
    const mapPadding = (() => {
      const raw = Number.parseInt(String(process.env.TI_STATIC_MAP_PADDING ?? "").trim() || "60", 10);
      if (!Number.isFinite(raw)) return 60;
      return Math.min(Math.max(raw, 0), 200);
    })();

    for (const t of candidates) {
      result.processed += 1;

      const processingStartedAt = (t.static_map_processing_started_at ?? "").trim();
      if (!force && processingStartedAt) {
        const startedMs = Date.parse(processingStartedAt);
        const cutoffMs = Date.parse(leaseCutoff);
        if (Number.isFinite(startedMs) && Number.isFinite(cutoffMs) && startedMs > cutoffMs) {
          result.skipped_lease_held += 1;
          result.items.push({
            tournament_id: t.id,
            slug: t.slug ?? null,
            status: "lease_held",
          });
          continue;
        }
      }

      if (!force && processingStartedAt && processingStartedAt > leaseCutoff) {
        result.skipped_lease_held += 1;
        result.items.push({
          tournament_id: t.id,
          slug: t.slug ?? null,
          status: "lease_held",
        });
        continue;
      }

      // Lease/claim the work item.
      const claimQuery = (supabaseAdmin.from("tournaments" as any) as any)
        .update({
          static_map_status: "processing",
          static_map_processing_started_at: new Date().toISOString(),
          static_map_error: null,
        })
        .eq("id", t.id)
        .select("id");

      const { data: claimed, error: claimError } = force
        ? await claimQuery.maybeSingle()
        : await claimQuery.or(`static_map_processing_started_at.is.null,static_map_processing_started_at.lt.${leaseCutoff}`).maybeSingle();

      if (claimError) {
        result.claim_errors += 1;
        if (!result.claim_error_sample) result.claim_error_sample = claimError.message;
        result.items.push({
          tournament_id: t.id,
          slug: t.slug ?? null,
          status: "claim_error",
          error: claimError.message,
        });
        continue;
      }
      if (!claimed) {
        result.skipped_claim_filter_miss += 1;
        result.items.push({
          tournament_id: t.id,
          slug: t.slug ?? null,
          status: "claim_miss",
        });
        continue;
      }
      result.claimed += 1;

      try {
        const { data: venueLinksRaw, error: venueError } = await supabaseAdmin
          .from("tournament_venues" as any)
          .select("venue_id,is_primary,created_at,venues(id,name,city,state,zip,latitude,longitude)")
          .eq("tournament_id", t.id)
          .eq("is_inferred", false)
          .order("is_primary", { ascending: false })
          .order("created_at", { ascending: true });

        if (venueError) throw venueError;

        const venueCandidates: VenueCoordCandidate[] = ((venueLinksRaw as any[]) ?? [])
          .map((row: any) => {
            const v = row?.venues ?? null;
            if (!v?.id) return null;
            return {
              venueId: String(v.id),
              name: v.name ?? null,
              latitude: typeof v.latitude === "number" ? v.latitude : Number(v.latitude ?? NaN),
              longitude: typeof v.longitude === "number" ? v.longitude : Number(v.longitude ?? NaN),
              isPrimary: Boolean(row?.is_primary),
            } satisfies VenueCoordCandidate;
          })
          .filter(Boolean) as VenueCoordCandidate[];

        const markerCandidates = selectStaticMapMarkerCandidates(venueCandidates, MAX_MARKERS);

        if (!markerCandidates.length) {
          result.skipped_no_coords += 1;
          await (supabaseAdmin.from("tournaments" as any) as any)
            .update({
              static_map_status: "missing",
              static_map_error: null,
              static_map_updated_at: new Date().toISOString(),
              static_map_processing_started_at: null,
            })
            .eq("id", t.id);
          result.items.push({
            tournament_id: t.id,
            slug: t.slug ?? null,
            status: "no_coords",
          });
          continue;
        }

        const coords = markerCandidates.map((c) => ({ lat: c.lat, lng: c.lng }));
        const hash = computeStaticMapSourceHash({
          coords,
          style: mapStyle,
          width: WIDTH,
          height: HEIGHT,
          markerStyle: MARKER_STYLE,
          maxMarkers: MAX_MARKERS,
          version: t.static_map_version ?? version,
        });

        const existingHash = (t.static_map_source_hash ?? "").trim();
        const existingPath = (t.static_map_path ?? "").trim();
        if (existingHash && existingPath && existingHash === hash) {
          result.skipped_up_to_date += 1;
          await (supabaseAdmin.from("tournaments" as any) as any)
            .update({
              static_map_status: "ready",
              static_map_error: null,
              static_map_processing_started_at: null,
              static_map_updated_at: new Date().toISOString(),
              static_map_version: t.static_map_version ?? version,
            })
            .eq("id", t.id);
          result.items.push({
            tournament_id: t.id,
            slug: t.slug ?? null,
            status: "up_to_date",
            static_map_path: existingPath,
            static_map_public_url: existingPath
              ? buildSupabasePublicObjectUrl({ baseUrl: supabaseBaseUrl, bucket: TI_STATIC_MAP_BUCKET, path: existingPath })
              : null,
          });
          continue;
        }

        const staticUrl = buildMapboxStaticImageUrl({
          style: mapStyle,
          width: WIDTH,
          height: HEIGHT,
          coords,
          markerColorHex: MARKER_COLOR,
          token,
          padding: mapPadding,
        });
        if (!staticUrl) throw new Error("failed_to_build_mapbox_url");

        // Throttle a bit to keep API usage reasonable during backfills.
        await sleep(75);

        const res = await trackExternalCall(EXTERNAL_API.mapbox, "static_map", EXTERNAL_API_SURFACE.static_map_cron, () => fetch(staticUrl));
        if (!res.ok) {
          throw new Error(`mapbox_static_failed_${res.status}`);
        }

        const inputBuffer = Buffer.from(await res.arrayBuffer());
        const webp = await sharp(inputBuffer)
          .webp({ quality: 78, effort: 4 })
          .toBuffer();

        const path = buildStaticMapStoragePath(t.id, hash);
        const { error: uploadError } = await supabaseAdmin.storage.from(TI_STATIC_MAP_BUCKET).upload(path, webp, {
          contentType: "image/webp",
          cacheControl: "31536000",
          upsert: false,
        });

        if (uploadError) {
          // If the object already exists (hash collision), that's fine — just keep it.
          const code = (uploadError as any)?.statusCode ?? (uploadError as any)?.code ?? "";
          const msg = String((uploadError as any)?.message ?? uploadError);
          const alreadyExists = msg.toLowerCase().includes("exists") || String(code) === "409";
          if (!alreadyExists) throw uploadError;
        }

        await (supabaseAdmin.from("tournaments" as any) as any)
          .update({
            static_map_path: path,
            static_map_source_hash: hash,
            static_map_version: t.static_map_version ?? version,
            static_map_status: "ready",
            static_map_error: null,
            static_map_updated_at: new Date().toISOString(),
            static_map_processing_started_at: null,
          })
          .eq("id", t.id);

        result.updated += 1;
        result.items.push({
          tournament_id: t.id,
          slug: t.slug ?? null,
          status: "updated",
          static_map_path: path,
          static_map_public_url: buildSupabasePublicObjectUrl({ baseUrl: supabaseBaseUrl, bucket: TI_STATIC_MAP_BUCKET, path }),
        });
      } catch (err) {
        const message = String((err as any)?.message ?? err ?? "unknown_error").slice(0, 240);
        const isRateLimit = message.includes("429") || /rate.?limit/i.test(message);
        if (isRateLimit) {
          result.rate_limited = true;
          await (supabaseAdmin.from("tournaments" as any) as any)
            .update({
              static_map_status: "missing",
              static_map_error: null,
              static_map_processing_started_at: null,
            })
            .eq("id", t.id);
          result.items.push({
            tournament_id: t.id,
            slug: t.slug ?? null,
            status: "rate_limited",
            error: message,
          });
          break;
        }
        result.failures += 1;
        await (supabaseAdmin.from("tournaments" as any) as any)
          .update({
            static_map_status: "error",
            static_map_error: message,
            static_map_updated_at: new Date().toISOString(),
            static_map_processing_started_at: null,
          })
          .eq("id", t.id);
        result.items.push({
          tournament_id: t.id,
          slug: t.slug ?? null,
          status: "error",
          error: message,
        });
      }
    }

    result.ms = Date.now() - startedAt.getTime();

    try {
      await supabaseAdmin.from("cron_job_results" as any).insert({
        job_key: LOCK_KEY,
        started_at: result.started_at,
        scanned: result.scanned,
        processed: result.processed,
        claimed: result.claimed,
        skipped_lease_held: result.skipped_lease_held,
        updated: result.updated,
        skipped_no_coords: result.skipped_no_coords,
        skipped_up_to_date: result.skipped_up_to_date,
        failures: result.failures,
        ms: result.ms,
      });
    } catch {
      // Best-effort — never fail the cron response due to logging.
    }

    return NextResponse.json(result);
  } finally {
    try {
      await (supabaseAdmin as any).rpc("release_cron_job_lock", { p_key: LOCK_KEY });
    } catch {
      // Best-effort unlock: TTL will eventually expire.
    }
  }
}
