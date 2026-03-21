import { createClient } from "@supabase/supabase-js";

type TournamentRow = { id: string; state: string | null };

async function main() {
  const apply = process.argv.includes("--apply");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  // GotSoccer / organizer HQ address frequently misclassified as a tournament venue.
  const patterns = ["%1529%third%", "%1529%3rd%"];
  const cityPattern = "%jacksonville%beach%";

  const ids = new Set<string>();
  for (const pat of patterns) {
    const resp = await supabase
      .from("tournaments")
      .select("id,state")
      .ilike("address", pat)
      .ilike("address", cityPattern)
      .limit(5000);
    if (resp.error) throw resp.error;
    for (const row of (resp.data ?? []) as TournamentRow[]) {
      if (!row?.id) continue;
      // Avoid touching a legitimate Florida tournament address.
      if ((row.state ?? "").toUpperCase() === "FL") continue;
      ids.add(row.id);
    }
  }

  const idList = Array.from(ids);
  if (!idList.length) {
    console.log(JSON.stringify({ apply, matches: 0, updated: 0, skipped_has_links: 0 }, null, 2));
    return;
  }

  const { data: linkRows, error: linkErr } = await supabase
    .from("tournament_venues")
    .select("tournament_id")
    .in("tournament_id", idList)
    .limit(20000);
  if (linkErr) throw linkErr;
  const linked = new Set<string>((linkRows ?? []).map((r: any) => String(r.tournament_id ?? "")).filter(Boolean));
  const toUpdate = idList.filter((id) => !linked.has(id));

  if (!apply) {
    console.log(JSON.stringify({ apply, matches: idList.length, would_update: toUpdate.length, skipped_has_links: linked.size }, null, 2));
    return;
  }

  if (!toUpdate.length) {
    console.log(JSON.stringify({ apply, matches: idList.length, updated: 0, skipped_has_links: linked.size }, null, 2));
    return;
  }

  const upd = await supabase
    .from("tournaments")
    .update({ address: null })
    .in("id", toUpdate);
  if (upd.error) throw upd.error;

  console.log(JSON.stringify({ apply, matches: idList.length, updated: toUpdate.length, skipped_has_links: linked.size }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

