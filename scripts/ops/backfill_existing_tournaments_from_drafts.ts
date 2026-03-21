import { createClient } from "@supabase/supabase-js";
import { buildTournamentNameStateSeasonFingerprint } from "../../apps/referee/lib/identity/fingerprints";

function normalize(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function isTbdToken(value: unknown) {
  const v = normalize(value).toLowerCase();
  if (!v) return false;
  const compact = v.replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  if (!compact) return false;
  if (compact === "tbd" || compact === "tba") return true;
  if (compact === "to be determined" || compact === "to be announced") return true;
  if (compact === "tbd tba" || compact === "tbd tba venues" || compact === "tbd venues") return true;
  if (compact === "tbd - tba" || compact === "tba - tbd") return true;
  return false;
}

function cleanMaybeVenueOrAddress(value: unknown): string | null {
  const raw = normalize(value);
  if (!raw) return null;
  if (isTbdToken(raw)) return null;
  const lower = raw.toLowerCase();
  if (/^(tbd|tba)\b/.test(lower)) {
    const rest = raw.replace(/^(tbd|tba)\b[\s:–—-]*/i, "").trim();
    if (!rest || isTbdToken(rest)) return null;
    return rest;
  }
  const parts = raw
    .split(";")
    .map((p) => normalize(p))
    .filter(Boolean)
    .filter((p) => !isTbdToken(p));
  if (parts.length === 0) return null;
  return parts.join("; ");
}

function isBlank(value: unknown) {
  if (value === null || value === undefined) return true;
  const v = normalize(value);
  if (!v) return true;
  if (isTbdToken(v)) return true;
  return false;
}

type DraftRow = {
  id: string;
  name?: string | null;
  city?: string | null;
  state?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  zip?: string | null;
  venue?: string | null;
  address?: string | null;
  summary?: string | null;
  source_url?: string | null;
  official_website_url?: string | null;
  tournament_director?: string | null;
  tournament_director_email?: string | null;
  tournament_venues?:
    | Array<{ venue_id?: string | null; venues?: { id?: string | null; name?: string | null } | null }>
    | null;
};

type ExistingRow = {
  id: string;
  status: string;
  city?: string | null;
  state?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  zip?: string | null;
  venue?: string | null;
  address?: string | null;
  summary?: string | null;
  source_url?: string | null;
  official_website_url?: string | null;
  tournament_director?: string | null;
  tournament_director_email?: string | null;
};

async function main() {
  const apply = process.argv.includes("--apply");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const { data: draftData, error: draftErr } = await supabase
    .from("tournaments")
    .select(
      "id,name,city,state,start_date,end_date,zip,venue,address,summary,source_url,official_website_url,tournament_director,tournament_director_email,tournament_venues(venue_id,venues(id,name))"
    )
    .eq("status", "draft")
    .order("updated_at", { ascending: false })
    .limit(2000);
  if (draftErr) throw draftErr;
  const drafts = (draftData ?? []) as unknown as DraftRow[];

  let scanned = 0;
  let candidates = 0;
  let merged = 0;
  let archived = 0;
  let patched = 0;
  let fields_patched = 0;
  let venue_links_upserted = 0;
  let skipped_no_fingerprint = 0;
  let skipped_no_match = 0;
  let skipped_multiple = 0;

  for (const draft of drafts) {
    scanned += 1;
    const hasVenueLinks = (draft.tournament_venues ?? []).some((tv) => tv?.venue_id && !isBlank(tv?.venues?.name));
    const hasAnyUsefulField =
      hasVenueLinks ||
      !isBlank(draft.official_website_url) ||
      !isBlank(draft.source_url) ||
      !isBlank(draft.tournament_director_email) ||
      !isBlank(cleanMaybeVenueOrAddress(draft.venue)) ||
      !isBlank(cleanMaybeVenueOrAddress(draft.address));
    if (!hasAnyUsefulField) continue;
    candidates += 1;

    const fp = buildTournamentNameStateSeasonFingerprint({
      name: draft.name ?? null,
      state: draft.state ?? null,
      startDate: draft.start_date ?? null,
      endDate: draft.end_date ?? null,
    });
    if (!fp) {
      skipped_no_fingerprint += 1;
      continue;
    }

    let q = supabase
      .from("tournaments")
      .select(
        "id,status,city,state,start_date,end_date,zip,venue,address,summary,source_url,official_website_url,tournament_director,tournament_director_email"
      )
      .eq("name_state_season_fingerprint", fp)
      .in("status", ["published", "stale"])
      .limit(5);
    if (!isBlank(draft.city)) q = q.eq("city", draft.city ?? null);
    if (!isBlank(draft.state)) q = q.eq("state", draft.state ?? null);

    const { data: existingData, error: exErr } = await q;
    if (exErr) throw exErr;
    const matches = (existingData ?? []) as unknown as ExistingRow[];

    if (matches.length === 0) {
      skipped_no_match += 1;
      continue;
    }
    if (matches.length > 1) {
      skipped_multiple += 1;
      continue;
    }

    const existing = matches[0];
    merged += 1;

    const patch: Record<string, unknown> = {};
    const mergeField = (field: keyof ExistingRow, value: unknown) => {
      const current = (existing as any)[field];
      if (!isBlank(current) || isBlank(value)) return;
      patch[field as string] = value;
      (existing as any)[field] = value;
      fields_patched += 1;
    };

    mergeField("official_website_url", normalize(draft.official_website_url) || null);
    mergeField("source_url", normalize(draft.source_url) || null);
    mergeField("tournament_director_email", normalize(draft.tournament_director_email) || null);
    mergeField("tournament_director", normalize(draft.tournament_director) || null);
    mergeField("end_date", normalize(draft.end_date) || null);
    mergeField("zip", normalize(draft.zip) || null);
    mergeField("summary", normalize(draft.summary) || null);
    mergeField("venue", cleanMaybeVenueOrAddress(draft.venue));
    mergeField("address", cleanMaybeVenueOrAddress(draft.address));

    const venueIds = (draft.tournament_venues ?? [])
      .map((tv) => ({ venue_id: tv?.venue_id ?? null, venue_name: tv?.venues?.name ?? null }))
      .filter((tv) => tv.venue_id && !isBlank(tv.venue_name))
      .map((tv) => tv.venue_id as string);

    if (apply) {
      if (Object.keys(patch).length) {
        const { error: updErr } = await supabase.from("tournaments").update(patch).eq("id", existing.id);
        if (updErr) throw updErr;
        patched += 1;
      }

      if (venueIds.length) {
        const payload = Array.from(new Set(venueIds)).map((venue_id) => ({ tournament_id: existing.id, venue_id }));
        const { error: upErr } = await supabase
          .from("tournament_venues")
          .upsert(payload, { onConflict: "tournament_id,venue_id" });
        if (upErr) throw upErr;
        venue_links_upserted += payload.length;
      }

      const draftSummary = normalize(draft.summary);
      const note = `Merged into ${existing.id}.`;
      const archivedSummary = draftSummary ? `${draftSummary}\n\n${note}` : note;
      const { error: archErr } = await supabase
        .from("tournaments")
        .update({ status: "archived", summary: archivedSummary })
        .eq("id", draft.id);
      if (archErr) throw archErr;
    }

    archived += 1;
  }

  console.log(
    JSON.stringify(
      {
        apply,
        scanned,
        candidates,
        merged,
        archived,
        patched,
        fields_patched,
        venue_links_upserted,
        skipped_no_fingerprint,
        skipped_no_match,
        skipped_multiple,
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
