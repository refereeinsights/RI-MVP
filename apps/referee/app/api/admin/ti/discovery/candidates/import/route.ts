import crypto from "node:crypto";
import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { slugifyTournamentName } from "@/lib/admin/tiDiscovery";

export const runtime = "nodejs";

function asText(v: unknown) {
  return typeof v === "string" ? v.trim() : "";
}

function splitVenueRaw(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) return [];

  // Prefer explicit separators to avoid splitting "City, ST" fragments.
  const primaryParts = trimmed.split(/\s*(?:\n+|;|\|)\s*/g).map((p) => p.trim()).filter(Boolean);
  const parts =
    primaryParts.length > 1
      ? primaryParts
      : trimmed
          .split(/\s*,\s*/g)
          .map((p) => p.trim())
          .filter((p) => p.length >= 3);

  // Hard cap to avoid pathological pastes.
  return Array.from(new Set(parts)).slice(0, 20);
}

export async function POST(req: Request) {
  const user = await requireAdmin();
  const body = (await req.json().catch(() => null)) as { candidate_id?: string } | null;
  const candidateId = asText(body?.candidate_id);
  if (!candidateId) return NextResponse.json({ ok: false, error: "Missing candidate_id" }, { status: 400 });

  const { data: cand, error: candErr } = await supabaseAdmin
    .from("tournament_discovery_candidates" as any)
    .select("*")
    .eq("id", candidateId)
    .maybeSingle();
  const candidate = cand as any;
  if (candErr || !candidate) return NextResponse.json({ ok: false, error: candErr?.message ?? "Candidate not found" }, { status: 404 });

  if (candidate.import_status === "imported") {
    return NextResponse.json({ ok: false, error: "Candidate already imported", imported_tournament_id: candidate.imported_tournament_id }, { status: 409 });
  }
  if (!candidate.source_url) return NextResponse.json({ ok: false, error: "Candidate missing source_url" }, { status: 400 });

  const name = String(candidate.name ?? "").trim();
  const baseSlug = slugifyTournamentName(name);
  const slugRoot = baseSlug || `tournament-${Date.now()}`;
  let slug = slugRoot;
  for (let i = 2; i < 100; i += 1) {
    const { data: exists } = await supabaseAdmin.from("tournaments" as any).select("id").eq("slug", slug).maybeSingle();
    if (!exists) break;
    slug = `${slugRoot}-${i}`;
  }

  let sourceDomain: string | null = null;
  try {
    sourceDomain = new URL(String(candidate.source_url)).hostname.replace(/^www\./, "");
  } catch {
    sourceDomain = null;
  }

  const insertPayload: Record<string, any> = {
    id: crypto.randomUUID(),
    name,
    slug,
    sport: candidate.sport,
    city: candidate.city,
    state: candidate.state,
    venue: candidate.venue_raw ?? null,
    start_date: candidate.start_date,
    end_date: candidate.end_date,
    official_website_url: candidate.official_website_url ?? null,
    source_url: candidate.source_url,
    source_domain: sourceDomain,
    source: "admin_upload",
    status: "draft",
    is_canonical: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { data: created, error: insertErr } = await supabaseAdmin
    .from("tournaments" as any)
    .insert(insertPayload)
    .select("id,slug")
    .maybeSingle();
  const createdRow = created as any;
  if (insertErr || !createdRow?.id) return NextResponse.json({ ok: false, error: insertErr?.message ?? "Insert failed" }, { status: 500 });

  // Multi-venue ingestion:
  // - Parse `venue_raw` (comma/semicolon/newline) into multiple venue names.
  // - Upsert venues using an empty-string address so unknown addresses dedupe consistently.
  // - Link via tournament_venues; set the first linked venue as primary.
  const venueNames = typeof candidate.venue_raw === "string" ? splitVenueRaw(candidate.venue_raw) : [];
  if (venueNames.length) {
    const venueIds: string[] = [];
    for (const venueName of venueNames) {
      const venuePayload: Record<string, any> = {
        name: venueName,
        address: "", // allow stable dedupe for unknown address
        city: candidate.city ?? null,
        state: candidate.state ?? null,
        zip: null,
        sport: candidate.sport ?? null,
      };
      const { data: venueRow, error: venueErr } = await supabaseAdmin
        .from("venues" as any)
        .upsert(venuePayload, { onConflict: "name,address,city,state" })
        .select("id")
        .maybeSingle();
      if (venueErr) continue;
      const venueId = (venueRow as any)?.id ? String((venueRow as any).id) : null;
      if (venueId) venueIds.push(venueId);
    }

    for (let i = 0; i < venueIds.length; i += 1) {
      const venueId = venueIds[i];
      await supabaseAdmin.from("tournament_venues" as any).upsert(
        {
          tournament_id: createdRow.id,
          venue_id: venueId,
          is_primary: i === 0,
        },
        { onConflict: "tournament_id,venue_id" },
      );
    }
  }

  const { error: patchErr } = await supabaseAdmin
    .from("tournament_discovery_candidates" as any)
    .update({
      import_status: "imported",
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
      imported_tournament_id: createdRow.id,
      imported_at: new Date().toISOString(),
    })
    .eq("id", candidateId);
  if (patchErr) return NextResponse.json({ ok: false, error: patchErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, imported_tournament_id: createdRow.id, imported_slug: createdRow.slug });
}
