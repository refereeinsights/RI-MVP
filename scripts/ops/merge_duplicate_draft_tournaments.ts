import { createClient } from "@supabase/supabase-js";

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
  created_at?: string | null;
  updated_at?: string | null;
  tournament_venues?:
    | Array<{ venue_id?: string | null; venues?: { id?: string | null; name?: string | null } | null }>
    | null;
};

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

function keyFor(row: DraftRow) {
  return [
    normalize(row.name).toLowerCase(),
    normalize(row.city).toLowerCase(),
    normalize(row.state).toLowerCase(),
    normalize(row.start_date),
  ].join("|");
}

function score(row: DraftRow) {
  let s = 0;
  const venues = (row.tournament_venues ?? []).filter((tv) => {
    const name = tv?.venues?.name ?? null;
    return !isBlank(name);
  });
  if (venues.length) s += 50 + venues.length * 2;
  if (!isBlank(row.official_website_url)) s += 12;
  if (!isBlank(row.source_url)) s += 6;
  if (!isBlank(row.tournament_director_email)) s += 12;
  if (!isBlank(row.tournament_director)) s += 4;
  if (!isBlank(cleanMaybeVenueOrAddress(row.venue))) s += 6;
  if (!isBlank(cleanMaybeVenueOrAddress(row.address))) s += 6;
  if (!isBlank(row.end_date)) s += 3;
  if (!isBlank(row.summary)) s += 1;
  return s;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const pageSize = 1000;
  const all: DraftRow[] = [];
  for (let page = 0; page < 25; page++) {
    const from = page * pageSize;
    const to = from + pageSize - 1;
    const { data, error } = await supabase
      .from("tournaments")
      .select(
        "id,name,city,state,start_date,end_date,zip,venue,address,summary,source_url,official_website_url,tournament_director,tournament_director_email,created_at,updated_at,tournament_venues(venue_id,venues(id,name))"
      )
      .eq("status", "draft")
      .order("updated_at", { ascending: false })
      .range(from, to);
    if (error) throw error;
    const rows = (data ?? []) as unknown as DraftRow[];
    if (!rows.length) break;
    all.push(...rows);
    if (rows.length < pageSize) break;
  }

  const groups = new Map<string, DraftRow[]>();
  for (const row of all) {
    const key = keyFor(row);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  }

  let groupsWithDupes = 0;
  let losersArchived = 0;
  let winnersPatched = 0;
  let fieldsPatched = 0;
  let venueLinksUpserted = 0;

  for (const [key, rows] of groups.entries()) {
    if (rows.length < 2) continue;
    if (key === "|||") continue;
    groupsWithDupes += 1;

    const sorted = [...rows].sort((a, b) => {
      const sa = score(a);
      const sb = score(b);
      if (sb !== sa) return sb - sa;
      return String(a.created_at ?? "").localeCompare(String(b.created_at ?? ""));
    });

    const winner = sorted[0];
    const losers = sorted.slice(1);

    for (const loser of losers) {
      const patch: Record<string, unknown> = {};
      const mergeField = (field: keyof DraftRow, value: unknown) => {
        const current = (winner as any)[field];
        if (!isBlank(current) || isBlank(value)) return;
        patch[field as string] = value;
        (winner as any)[field] = value;
        fieldsPatched += 1;
      };

      mergeField("official_website_url", normalize(loser.official_website_url) || null);
      mergeField("source_url", normalize(loser.source_url) || null);
      mergeField("tournament_director_email", normalize(loser.tournament_director_email) || null);
      mergeField("tournament_director", normalize(loser.tournament_director) || null);
      mergeField("end_date", normalize(loser.end_date) || null);
      mergeField("zip", normalize(loser.zip) || null);
      mergeField("summary", normalize(loser.summary) || null);
      mergeField("venue", cleanMaybeVenueOrAddress(loser.venue));
      mergeField("address", cleanMaybeVenueOrAddress(loser.address));

      const loserVenueIds = (loser.tournament_venues ?? [])
        .map((tv) => ({ venue_id: tv?.venue_id ?? null, venue_name: tv?.venues?.name ?? null }))
        .filter((tv) => tv.venue_id && !isBlank(tv.venue_name))
        .map((tv) => tv.venue_id as string);

      if (apply) {
        if (Object.keys(patch).length) {
          const { error: updErr } = await supabase.from("tournaments").update(patch).eq("id", winner.id);
          if (updErr) throw updErr;
          winnersPatched += 1;
        }

        if (loserVenueIds.length) {
          const payload = Array.from(new Set(loserVenueIds)).map((venue_id) => ({
            tournament_id: winner.id,
            venue_id,
          }));
          const { error: upErr } = await supabase
            .from("tournament_venues")
            .upsert(payload, { onConflict: "tournament_id,venue_id" });
          if (upErr) throw upErr;
          venueLinksUpserted += payload.length;
        }

        const loserSummary = normalize(loser.summary);
        const archiveNote = `Archived duplicate of ${winner.id}.`;
        const archivedSummary = loserSummary ? `${loserSummary}\n\n${archiveNote}` : archiveNote;
        const { error: archErr } = await supabase
          .from("tournaments")
          .update({ status: "archived", summary: archivedSummary })
          .eq("id", loser.id);
        if (archErr) throw archErr;
      }

      losersArchived += 1;
    }
  }

  console.log(
    JSON.stringify(
      {
        apply,
        draft_rows_scanned: all.length,
        groups_total: groups.size,
        groups_with_dupes: groupsWithDupes,
        duplicates_archived: losersArchived,
        winners_patched: winnersPatched,
        fields_patched: fieldsPatched,
        venue_links_upserted: venueLinksUpserted,
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

