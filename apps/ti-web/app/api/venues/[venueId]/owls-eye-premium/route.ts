import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { getTiTierServer } from "@/lib/entitlementsServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { DEMO_STARFIRE_VENUE_ID } from "@/lib/owlsEyeScores";
import { isPremiumPreviewTournamentSlug } from "@/lib/premiumPreview";

export const runtime = "nodejs";

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

type PlaceRow = {
  place_id: string | null;
  name: string | null;
  category: string | null;
  address: string | null;
  distance_meters: number | null;
  maps_url: string | null;
  provider: string | null;
  place_latitude: number | null;
  place_longitude: number | null;
};

function normalizeCategory(value: string | null | undefined): "coffee" | "food" | "hotels" | "quick_eats" | "hangouts" | "ignored" {
  const raw = (value ?? "").trim().toLowerCase();
  if (!raw) return "food";
  if (raw === "coffee") return "coffee";
  if (raw === "quick_eats") return "quick_eats";
  if (raw === "hangouts") return "hangouts";
  if (raw === "hotel" || raw === "hotels") return "hotels";
  if (raw === "sporting_goods" || raw === "big_box_fallback") return "ignored";
  return "food";
}

function parseRequestedCategories(param: string | null): Array<"coffee" | "food" | "hotels" | "quick_eats" | "hangouts"> {
  const raw = (param ?? "").trim();
  const fallback: Array<"coffee" | "food" | "hotels" | "quick_eats" | "hangouts"> = [
    "coffee",
    "food",
    "hotels",
    "quick_eats",
    "hangouts",
  ];
  if (!raw) return fallback;
  const allowed = new Set(fallback);
  const values = raw
    .split(",")
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean)
    .map((v) => {
      if (v === "hotel" || v === "hotels") return "hotels";
      return v as any;
    })
    .filter((v) => allowed.has(v));
  return values.length ? values : fallback;
}

export async function GET(request: Request, context: { params: { venueId: string } }) {
  const venueId = context.params.venueId;
  if (!venueId || !isUuid(venueId)) {
    return NextResponse.json({ ok: false, error: "invalid_venue_id" }, { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const tournamentSlug = (searchParams.get("tournamentSlug") ?? "").trim();
  const tournamentId = (searchParams.get("tournamentId") ?? "").trim();
  const requestedCategories = parseRequestedCategories(searchParams.get("categories"));

  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { tier } = await getTiTierServer(user ?? null);
  const isDemoVenue = venueId === DEMO_STARFIRE_VENUE_ID;

  let resolvedTournamentSlug = tournamentSlug.toLowerCase();
  let resolvedTournamentId = tournamentId && isUuid(tournamentId) ? tournamentId : "";

  if (!resolvedTournamentSlug && resolvedTournamentId) {
    const { data: tRow } = await supabaseAdmin
      .from("tournaments_public" as any)
      .select("id,slug")
      .eq("id", resolvedTournamentId)
      .maybeSingle<{ id: string; slug: string | null }>();
    resolvedTournamentSlug = String(tRow?.slug ?? "").trim().toLowerCase();
  }

  if (resolvedTournamentSlug && !resolvedTournamentId) {
    const { data: tRow } = await supabaseAdmin
      .from("tournaments_public" as any)
      .select("id,slug")
      .eq("slug", resolvedTournamentSlug)
      .maybeSingle<{ id: string; slug: string | null }>();
    resolvedTournamentId = String(tRow?.id ?? "").trim();
    resolvedTournamentSlug = String(tRow?.slug ?? resolvedTournamentSlug).trim().toLowerCase();
  }

  const hasTournamentContext = Boolean(resolvedTournamentSlug);
  if (tier !== "weekend_pro" && !isDemoVenue && !hasTournamentContext) {
    return NextResponse.json({ ok: false, error: "missing_tournament_context", tier }, { status: 400 });
  }

  // Leak prevention: if a tournament context is provided, only allow venues actually linked to that tournament.
  if (resolvedTournamentId && isUuid(resolvedTournamentId)) {
    const { data: linked } = await supabaseAdmin
      .from("tournament_venues" as any)
      .select("id")
      .eq("tournament_id", resolvedTournamentId)
      .eq("venue_id", venueId)
      .eq("is_inferred", false)
      .limit(1);

    if (!linked || linked.length === 0) {
      return NextResponse.json({ ok: false, error: "venue_not_in_tournament", tier }, { status: 404 });
    }
  }

  const hasPremiumPreviewTournament = isPremiumPreviewTournamentSlug(resolvedTournamentSlug);
  const canViewPremiumDetails = tier === "weekend_pro" || isDemoVenue || hasPremiumPreviewTournament;

  if (!canViewPremiumDetails) {
    return NextResponse.json({ ok: false, error: "forbidden", tier }, { status: user ? 403 : 401 });
  }

  const { data: run } = await supabaseAdmin
    .from("owls_eye_runs" as any)
    .select("id,run_id,venue_id,status,created_at")
    .eq("venue_id", venueId)
    .eq("status", "complete")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const runId = (run as any)?.run_id ?? (run as any)?.id ?? null;
  if (!runId) {
    return NextResponse.json({
      ok: true,
      venueId,
      tournamentSlug: resolvedTournamentSlug || null,
      tier,
      runId: null,
      groups: {},
    });
  }

  const { data: rows } = await supabaseAdmin
    .from("owls_eye_nearby_food" as any)
    .select("place_id,name,category,address,distance_meters,maps_url,provider,place_latitude,place_longitude")
    .eq("run_id", runId)
    .order("distance_meters", { ascending: true })
    .order("name", { ascending: true });

  const byCategory: Record<string, any> = {};
  for (const key of requestedCategories) {
    byCategory[key] = { count: 0, has_coords: false, items: [] as any[] };
  }

  for (const row of ((rows as PlaceRow[] | null) ?? [])) {
    const normalized = normalizeCategory(row.category);
    if (normalized === "ignored") continue;
    if (!(normalized in byCategory)) continue;

    const lat = typeof row.place_latitude === "number" && Number.isFinite(row.place_latitude) ? row.place_latitude : null;
    const lng = typeof row.place_longitude === "number" && Number.isFinite(row.place_longitude) ? row.place_longitude : null;
    if (lat !== null && lng !== null) byCategory[normalized].has_coords = true;

    byCategory[normalized].items.push({
      place_id: row.place_id,
      name: row.name,
      address: row.address,
      distance_meters: row.distance_meters,
      maps_url: row.maps_url,
      provider: row.provider,
      place_latitude: lat,
      place_longitude: lng,
    });
  }

  for (const key of Object.keys(byCategory)) {
    byCategory[key].count = byCategory[key].items.length;
  }

  const groups = Object.fromEntries(
    requestedCategories
      .filter((k) => (byCategory[k]?.count ?? 0) > 0)
      .map((k) => [k, byCategory[k]])
  );

  return NextResponse.json({
    ok: true,
    venueId,
    tournamentSlug: resolvedTournamentSlug || null,
    tier,
    runId,
    groups,
  });
}
