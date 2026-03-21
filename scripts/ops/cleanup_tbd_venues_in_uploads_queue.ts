import { createClient } from "@supabase/supabase-js";

type TournamentRow = {
  id: string;
  name: string | null;
  slug: string | null;
  status: string | null;
  tournament_association?: string | null;
  city: string | null;
  state: string | null;
  start_date: string | null;
  end_date: string | null;
  venue: string | null;
  address: string | null;
  source_url: string | null;
  official_website_url: string | null;
};

function argValue(name: string) {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : null;
}

function normalize(value: string | null | undefined) {
  if (!value) return "";
  return value.replace(/\s+/g, " ").trim();
}

function isTbdToken(value: string) {
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

function cleanMaybeVenueOrAddress(value: string | null | undefined): string | null {
  const raw = normalize(value);
  if (!raw) return null;
  if (isTbdToken(raw)) return null;
  const lower = raw.toLowerCase();
  if (/^(tbd|tba)\b/.test(lower)) {
    const rest = raw.replace(/^(tbd|tba)\b[\\s:–—-]*/i, "").trim();
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

function shouldTouch(t: TournamentRow, opts: { state: string | null; association: string | null; includeAll: boolean }) {
  if ((t.status || "").trim() !== "draft") return false;
  if (!opts.includeAll) {
    const st = (t.state || "").toUpperCase();
    const assoc = (t.tournament_association || "").toUpperCase();
    const wantState = (opts.state || "").toUpperCase();
    const wantAssoc = (opts.association || "").toUpperCase();
    if (wantState && st === wantState) return true;
    if (wantAssoc && assoc === wantAssoc) return true;
    return false;
  }
  return true;
}

async function main() {
  const APPLY = process.argv.includes("--apply");
  const includeAll = process.argv.includes("--all-drafts");
  const state = argValue("state") || "FL";
  const association = argValue("association") || "AYSO";
  const limit = Number(argValue("limit") || "2000");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const pageSize = 1000;
  let offset = 0;

  let scanned = 0;
  let candidates = 0;
  let updated = 0;

  while (scanned < limit) {
    const end = Math.min(offset + pageSize - 1, offset + (limit - scanned) - 1);
    const res = await supabase
      .from("tournaments")
      .select(
        "id,name,slug,status,tournament_association,city,state,start_date,end_date,venue,address,source_url,official_website_url"
      )
      .eq("status", "draft")
      .order("created_at", { ascending: false })
      .range(offset, end);
    if (res.error) throw res.error;
    const rows = (res.data ?? []) as TournamentRow[];
    if (rows.length === 0) break;

    for (const t of rows) {
      scanned += 1;
      if (!shouldTouch(t, { state, association, includeAll })) continue;

      const nextVenue = cleanMaybeVenueOrAddress(t.venue);
      const nextAddress = cleanMaybeVenueOrAddress(t.address);
      const venueChanged = (nextVenue ?? null) !== (t.venue ?? null);
      const addressChanged = (nextAddress ?? null) !== (t.address ?? null);
      if (!venueChanged && !addressChanged) continue;

      candidates += 1;

      const patch: any = {};
      if (venueChanged) patch.venue = nextVenue;
      if (addressChanged) patch.address = nextAddress;

      if (!APPLY) {
        if (candidates <= 10) {
          console.log(
            `[dry-run] ${t.id} :: ${t.name ?? ""} :: ${t.city ?? ""},${t.state ?? ""} :: ${t.start_date ?? ""} :: venue=${JSON.stringify(
              t.venue
            )} -> ${JSON.stringify(nextVenue)} :: address=${JSON.stringify(t.address)} -> ${JSON.stringify(nextAddress)}`
          );
        }
        continue;
      }

      const upd = await supabase.from("tournaments").update(patch).eq("id", t.id);
      if (upd.error) throw upd.error;
      updated += 1;
    }

    offset += rows.length;
    if (rows.length < pageSize) break;
  }

  console.log(
    JSON.stringify(
      {
        apply: APPLY,
        includeAll,
        filter: includeAll ? "all drafts" : `drafts where state=${state} OR association=${association}`,
        scanned,
        candidates,
        updated,
      },
      null,
      2
    )
  );

  if (!APPLY) {
    console.log("Run again with --apply to write updates.");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
