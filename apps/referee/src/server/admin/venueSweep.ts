import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { TournamentRow } from "@/lib/types/tournament";
import { atlasSearch, getSearchProviderName } from "@/server/atlas/search";
import {
  getRegistryRowByUrl,
  normalizeSourceUrl,
  TERMINAL_REVIEW_STATUSES,
  upsertRegistry,
} from "@/server/admin/sources";
import { createTournamentFromUrl } from "@/server/admin/pasteUrl";

type VenueRow = {
  id: string;
  name: string | null;
  city: string | null;
  state: string | null;
  sport: string | null;
  venue_url?: string | null;
};

function clean(val: unknown) {
  return String(val ?? "").trim();
}

function safeSport(value: string | null | undefined) {
  const v = clean(value).toLowerCase();
  return (v || "other") as TournamentRow["sport"];
}

function buildVenueSweepQueries(venue: VenueRow) {
  const name = clean(venue.name);
  const city = clean(venue.city);
  const state = clean(venue.state).toUpperCase();
  const sport = safeSport(venue.sport);

  // Keep these short (Brave hard limit is 400 chars; other providers are more forgiving).
  const quoted = name.includes('"') ? name.replace(/"/g, "") : `"${name}"`;

  const base = [
    `${quoted} tournament ${city} ${state}`,
    `${quoted} youth tournament ${state}`,
    `${quoted} ${sport} tournament ${state}`,
    `${quoted} schedule ${sport} ${state}`,
  ];

  // Some venues are generic names; add city/state anchored variants.
  if (city && state) {
    base.push(`${quoted} tournament ${city}`);
  }

  // Keep deterministic and unique.
  return Array.from(new Set(base.map((q) => q.replace(/\s+/g, " ").trim()).filter(Boolean))).slice(0, 8);
}

export async function runVenueSweepToDraftUploads(args: {
  venueId: string;
  createdBy: string;
  perQueryLimit?: number;
  maxTotalUrls?: number;
}) {
  const perQueryLimit = Math.max(1, Math.min(20, Math.floor(args.perQueryLimit ?? 6)));
  const maxTotalUrls = Math.max(1, Math.min(120, Math.floor(args.maxTotalUrls ?? 25)));

  const venueResp = await supabaseAdmin
    .from("venues" as any)
    .select("id,name,city,state,sport,venue_url")
    .eq("id", args.venueId)
    .maybeSingle();

  const venue = (venueResp.data ?? null) as VenueRow | null;
  if (!venue?.id) {
    return { ok: false as const, reason: "venue_not_found" as const };
  }

  const name = clean(venue.name);
  const city = clean(venue.city);
  const state = clean(venue.state).toUpperCase();
  if (!name) return { ok: false as const, reason: "missing_venue_name" as const };
  if (!city || !state) return { ok: false as const, reason: "missing_city_state" as const };

  const provider = getSearchProviderName();
  const queries = buildVenueSweepQueries(venue);

  const deduped = new Map<string, { url: string; discovered_query: string }>();
  let totalFound = 0;

  for (const query of queries) {
    const results = await atlasSearch(query, perQueryLimit);
    totalFound += results.length;
    for (const result of results) {
      const raw = clean(result.url);
      if (!raw) continue;
      let canonical = "";
      try {
        canonical = normalizeSourceUrl(raw).canonical;
      } catch {
        continue;
      }
      if (deduped.has(canonical)) continue;
      deduped.set(canonical, { url: canonical, discovered_query: query });
      if (deduped.size >= maxTotalUrls) break;
    }
    if (deduped.size >= maxTotalUrls) break;
  }

  let inserted_sources = 0;
  let skipped_existing = 0;
  let skipped_terminal = 0;

  const toSweep: Array<{ url: string; discovered_query: string; source_id: string }> = [];

  for (const item of deduped.values()) {
    const normalized = item.url;
    const existing = await getRegistryRowByUrl(normalized);
    if (existing.row) {
      const status = (existing.row.review_status || "").trim();
      if (TERMINAL_REVIEW_STATUSES.has(status)) skipped_terminal += 1;
      else skipped_existing += 1;
      continue;
    }

    const { registry_id } = await upsertRegistry({
      source_url: normalized,
      source_type: "venue_sweep",
      sport: venue.sport || null,
      state: venue.state || null,
      review_status: "needs_review",
      review_notes: `discovered via venue sweep (venue_id=${venue.id})`,
      is_active: true,
    });

    // Persist provenance, but don't fail the sweep on a uniqueness race.
    const prov = await supabaseAdmin.from("tournament_source_discoveries" as any).insert({
      created_by: args.createdBy,
      provider,
      query: item.discovered_query,
      venue_id: venue.id,
      source_id: registry_id,
    });
    if (prov.error && (prov.error as any)?.code !== "23505") {
      console.warn("[venue-sweep] provenance insert failed", prov.error);
    }

    inserted_sources += 1;
    toSweep.push({ url: normalized, discovered_query: item.discovered_query, source_id: registry_id });
  }

  let imported_tournaments = 0;
  let sweep_errors = 0;
  const imported_ids: string[] = [];
  const sweep_failures: Array<{ url: string; message: string }> = [];

  for (const item of toSweep) {
    try {
      const res: any = await createTournamentFromUrl({
        url: item.url,
        sport: safeSport(venue.sport),
        sourceType: "venue_sweep",
        status: "draft",
        source: "external_crawl",
      });

      const extracted = Number(res?.extracted_count ?? 0) || 0;
      imported_tournaments += extracted > 0 ? extracted : 0;
      const tournamentId = clean(res?.tournamentId);
      if (tournamentId) {
        imported_ids.push(tournamentId);
        // Attach the originating venue as an inferred link for reviewer context.
        const link = await supabaseAdmin.from("tournament_venues" as any).upsert(
          {
            tournament_id: tournamentId,
            venue_id: venue.id,
            is_inferred: true,
          },
          { onConflict: "tournament_id,venue_id" }
        );
        if (link.error) {
          // Non-fatal; some environments may not have `is_inferred` yet.
          console.warn("[venue-sweep] failed to upsert inferred tournament_venues link", link.error);
        }
      }
    } catch (err: any) {
      sweep_errors += 1;
      const message = String(err?.message ?? "unknown error");
      sweep_failures.push({ url: item.url, message });
    }
  }

  return {
    ok: true as const,
    venue_id: venue.id,
    provider,
    queries,
    total_found: totalFound,
    discovered_urls: deduped.size,
    inserted_sources,
    skipped_existing,
    skipped_terminal,
    imported_tournaments,
    imported_ids,
    sweep_errors,
    sweep_failures: sweep_failures.slice(0, 10),
    sample_urls: Array.from(deduped.values())
      .slice(0, 10)
      .map((v) => v.url),
  };
}
