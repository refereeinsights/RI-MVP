import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { revalidatePath } from "next/cache";

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isOnePrimaryIndexMisconfiguredError(err: any): boolean {
  const code = String(err?.code ?? "");
  if (code !== "23505") return false;
  const msg = String(err?.message ?? "");
  const details = String(err?.details ?? "");
  return /tournament_venues_one_primary_per_tournament_idx/i.test(msg) && /\bKey\s*\(tournament_id\)\s*=/i.test(details);
}

async function tryRepairTournamentVenuesPrimaryIndex() {
  try {
    await (supabaseAdmin as any).rpc("repair_tournament_venues_primary_index_v1", { p_reload_schema: true });
  } catch {
    // ignore (migration not deployed in this env)
  }
}

async function ensureAdminRequest() {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) return null;

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("user_id", data.user.id)
    .maybeSingle();

  if (!profile || profile.role !== "admin") return null;
  return data.user;
}

export async function POST(request: Request) {
  const adminUser = await ensureAdminRequest();
  if (!adminUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: any;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const sourceVenueId = String(payload?.source_venue_id || "").trim();
  const targetVenueId = String(payload?.target_venue_id || "").trim();
  const removeSource = payload?.remove_source !== false;

  if (!isUuid(sourceVenueId) || !isUuid(targetVenueId)) {
    return NextResponse.json({ error: "invalid_venue_id" }, { status: 400 });
  }
  if (sourceVenueId === targetVenueId) {
    return NextResponse.json({ error: "source_and_target_same" }, { status: 400 });
  }

  const [{ data: sourceVenue }, { data: targetVenue }] = await Promise.all([
    supabaseAdmin
      .from("venues" as any)
      .select(
        "id,name,address,city,state,zip,sport,venue_url,latitude,longitude,timezone,normalized_address,address_fingerprint,name_city_state_fingerprint"
      )
      .eq("id", sourceVenueId)
      .maybeSingle(),
    supabaseAdmin
      .from("venues" as any)
      .select(
        "id,name,address,city,state,zip,sport,venue_url,latitude,longitude,timezone,normalized_address,address_fingerprint,name_city_state_fingerprint"
      )
      .eq("id", targetVenueId)
      .maybeSingle(),
  ]);

  if (!sourceVenue) return NextResponse.json({ error: "source_not_found" }, { status: 404 });
  if (!targetVenue) return NextResponse.json({ error: "target_not_found" }, { status: 404 });

  // Prefer keeping more complete metadata by filling blanks on the target from the source.
  const patch: Record<string, any> = {};
  const preferLongerText = (a: string | null | undefined, b: string | null | undefined) => {
    const av = String(a ?? "").trim();
    const bv = String(b ?? "").trim();
    if (!av) return bv || null;
    if (!bv) return av || null;
    // If one contains a ZIP and the other doesn't, prefer the one with ZIP.
    const aZip = /\b\d{5}(?:-\d{4})?\b/.test(av);
    const bZip = /\b\d{5}(?:-\d{4})?\b/.test(bv);
    if (aZip !== bZip) return aZip ? av : bv;
    return av.length >= bv.length ? av : bv;
  };
  const fill = (key: string) => {
    const current = (targetVenue as any)?.[key];
    const incoming = (sourceVenue as any)?.[key];
    if ((current == null || String(current).trim() === "") && incoming != null && String(incoming).trim() !== "") {
      patch[key] = incoming;
    }
  };
  fill("venue_url");
  fill("zip");
  fill("latitude");
  fill("longitude");
  fill("timezone");
  fill("normalized_address");
  // Address: prefer a "better" address, but only upgrade (never erase).
  const mergedAddress = preferLongerText((targetVenue as any)?.address ?? null, (sourceVenue as any)?.address ?? null);
  if (mergedAddress && mergedAddress !== (targetVenue as any)?.address) patch.address = mergedAddress;
  // Name: keep target name unless it's blank.
  fill("name");
  // City/state: keep target unless blank.
  fill("city");
  fill("state");
  // Sport: keep target unless blank.
  fill("sport");

  // Apply the target patch after deleting the source when we are removing it.
  // Otherwise, upgrading (name,address,city,state) can temporarily violate the unique constraint.

  const { data: sourceLinks, error: linksError } = await supabaseAdmin
    .from("tournament_venues" as any)
    .select("tournament_id,is_inferred,is_primary,inference_confidence,inference_method,inferred_at,inference_run_id,venue_sport_profile_id")
    .eq("venue_id", sourceVenueId);
  if (linksError) {
    return NextResponse.json({ error: linksError.message || "source_links_failed" }, { status: 500 });
  }

  const sourceLinkRows = ((sourceLinks as Array<any> | null) ?? []).filter((row) => row?.tournament_id);
  const tournamentIds = Array.from(new Set(sourceLinkRows.map((row) => String(row.tournament_id))));

  if (tournamentIds.length > 0) {
    // Avoid relying on DB defaults (some envs historically had a bad default for is_primary),
    // and try to preserve source link metadata.
    const primaryCandidateTournamentIds = Array.from(new Set(sourceLinkRows.filter((r) => r.is_primary === true).map((r) => String(r.tournament_id))));

    const upsertRows = sourceLinkRows.map((row) => {
      const tournamentId = String(row.tournament_id);
      return {
        tournament_id: tournamentId,
        venue_id: targetVenueId,
        is_inferred: row.is_inferred === true,
        // Never set primary during link-move; we may be inserting alongside an existing primary.
        // We'll set primary afterward, safely, only when no primary exists yet.
        is_primary: false,
        inference_confidence: row.inference_confidence ?? null,
        inference_method: row.inference_method ?? null,
        inferred_at: row.inferred_at ?? null,
        inference_run_id: row.inference_run_id ?? null,
        venue_sport_profile_id: row.venue_sport_profile_id ?? null,
      };
    });
    const attemptUpsert = async () =>
      supabaseAdmin.from("tournament_venues" as any).upsert(upsertRows as any[], { onConflict: "tournament_id,venue_id" });

    const { error: upsertError } = await attemptUpsert();
    if (upsertError && isOnePrimaryIndexMisconfiguredError(upsertError)) {
      await tryRepairTournamentVenuesPrimaryIndex();
      const { error: retryErr } = await attemptUpsert();
      if (!retryErr) {
        // continue
      } else if (isOnePrimaryIndexMisconfiguredError(retryErr)) {
        return NextResponse.json(
          {
            error:
              'Your DB has an incorrect unique index named "tournament_venues_one_primary_per_tournament_idx" that blocks multiple venues per tournament. Apply the migration `supabase/migrations/20260402_tournament_venues_primary_fix_index.sql` and reload the Supabase API schema cache (Settings → API → Reload schema; or run `NOTIFY pgrst, \'reload schema\';`).',
          },
          { status: 409 }
        );
      } else {
        return NextResponse.json({ error: retryErr.message || "target_link_upsert_failed" }, { status: 500 });
      }
    }
    if (upsertError) {
      if (isOnePrimaryIndexMisconfiguredError(upsertError)) {
        return NextResponse.json(
          {
            error:
              'Your DB has an incorrect unique index named "tournament_venues_one_primary_per_tournament_idx" that blocks multiple venues per tournament. Apply the migration `supabase/migrations/20260402_tournament_venues_primary_fix_index.sql` and reload the Supabase API schema cache (Settings → API → Reload schema; or run `NOTIFY pgrst, \'reload schema\';`).',
          },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: upsertError.message || "target_link_upsert_failed" }, { status: 500 });
    }
  }

  // Remove old tournament_venues rows referencing the source venue.
  // Without this, deleting the source venue can fail due to FK constraints (and it leaves duplicate links).
  try {
    await supabaseAdmin.from("tournament_venues" as any).delete().eq("venue_id", sourceVenueId);
  } catch {
    // ignore
  }

  // If the source venue was primary for any tournaments, promote the target venue to primary only when
  // the tournament currently has no other primary. This avoids `tournament_venues_one_primary_per_tournament_idx` violations.
  if (primaryCandidateTournamentIds.length) {
    try {
      // Use a single SQL update to keep the "no existing primary" condition atomic.
      await (supabaseAdmin as any).rpc("set_primary_venue_for_tournaments_if_missing_v1", {
        p_tournament_ids: primaryCandidateTournamentIds,
        p_venue_id: targetVenueId,
      });
    } catch {
      // Fallback: best-effort row-by-row without the helper RPC.
      try {
        const { data: existingPrimaries } = await supabaseAdmin
          .from("tournament_venues" as any)
          .select("tournament_id")
          .in("tournament_id", primaryCandidateTournamentIds)
          .eq("is_primary", true)
          .limit(5000);
        const hasPrimary = new Set(((existingPrimaries ?? []) as any[]).map((r) => String(r.tournament_id ?? "")).filter(Boolean));
        const toPromote = primaryCandidateTournamentIds.filter((tid) => !hasPrimary.has(tid));
        if (toPromote.length) {
          await supabaseAdmin
            .from("tournament_venues" as any)
            .update({ is_primary: true })
            .in("tournament_id", toPromote)
            .eq("venue_id", targetVenueId)
            .eq("is_primary", false);
        }
      } catch {
        // ignore
      }
    }
  }

  // Keep Owl's Eye history attached to the kept venue where possible.
  try {
    await supabaseAdmin.from("owls_eye_runs" as any).update({ venue_id: targetVenueId }).eq("venue_id", sourceVenueId);
  } catch {
    // Ignore if table/column doesn't exist in this environment.
  }

  // Move other venue-linked records (best-effort; ignore missing tables).
  const tryUpdate = async (table: string) => {
    try {
      await supabaseAdmin.from(table as any).update({ venue_id: targetVenueId }).eq("venue_id", sourceVenueId);
    } catch {
      // ignore
    }
  };

  // Handle unique constraints explicitly where they exist.
  try {
    // venue_reviews has unique (user_id, venue_id)
    const [{ data: sourceReviews }, { data: targetReviews }] = await Promise.all([
      supabaseAdmin.from("venue_reviews" as any).select("id,user_id").eq("venue_id", sourceVenueId).limit(20000),
      supabaseAdmin.from("venue_reviews" as any).select("user_id").eq("venue_id", targetVenueId).limit(20000),
    ]);
    const targetUsers = new Set(((targetReviews ?? []) as any[]).map((r) => String(r.user_id ?? "")).filter(Boolean));
    const conflicts = ((sourceReviews ?? []) as any[]).filter((r) => targetUsers.has(String(r.user_id ?? ""))).map((r) => r.id);
    if (conflicts.length) {
      await supabaseAdmin.from("venue_reviews" as any).delete().in("id", conflicts);
    }
    await supabaseAdmin.from("venue_reviews" as any).update({ venue_id: targetVenueId }).eq("venue_id", sourceVenueId);
  } catch {
    // ignore
  }

  try {
    // venue_sport_profiles likely unique (venue_id, sport)
    const [{ data: sourceProfiles }, { data: targetProfiles }] = await Promise.all([
      supabaseAdmin.from("venue_sport_profiles" as any).select("id,sport").eq("venue_id", sourceVenueId).limit(20000),
      supabaseAdmin.from("venue_sport_profiles" as any).select("sport").eq("venue_id", targetVenueId).limit(20000),
    ]);
    const targetSports = new Set(((targetProfiles ?? []) as any[]).map((r) => String(r.sport ?? "")).filter(Boolean));
    const conflicts = ((sourceProfiles ?? []) as any[])
      .filter((r) => targetSports.has(String(r.sport ?? "")))
      .map((r) => r.id);
    if (conflicts.length) {
      await supabaseAdmin.from("venue_sport_profiles" as any).delete().in("id", conflicts);
    }
    await supabaseAdmin
      .from("venue_sport_profiles" as any)
      .update({ venue_id: targetVenueId })
      .eq("venue_id", sourceVenueId);
  } catch {
    // ignore
  }

  await tryUpdate("venue_quick_checks");
  await tryUpdate("venue_quick_check_events");
  await tryUpdate("tournament_partner_nearby");

  if (removeSource) {
    const { error: deleteError } = await supabaseAdmin.from("venues" as any).delete().eq("id", sourceVenueId);
    if (deleteError) {
      return NextResponse.json({ error: deleteError.message || "source_delete_failed" }, { status: 500 });
    }
  }

  if (Object.keys(patch).length) {
    const { error } = await supabaseAdmin.from("venues" as any).update(patch).eq("id", targetVenueId);
    if (error) {
      return NextResponse.json({ error: error.message || "target_patch_failed" }, { status: 500 });
    }
  }

  revalidatePath("/admin/venues");

  return NextResponse.json({
    ok: true,
    source_venue_id: sourceVenueId,
    target_venue_id: targetVenueId,
    moved_tournament_links: tournamentIds.length,
    source_removed: removeSource,
  });
}
