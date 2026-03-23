import { createClient } from "@supabase/supabase-js";

function argValue(name: string) {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : null;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function clean(value: unknown) {
  const v = String(value ?? "").replace(/\s+/g, " ").trim();
  return v.length ? v : "";
}

async function main() {
  const APPLY = process.argv.includes("--apply");
  const sourceVenueId = clean(argValue("source"));
  const targetVenueId = clean(argValue("target"));
  if (!isUuid(sourceVenueId) || !isUuid(targetVenueId) || sourceVenueId === targetVenueId) {
    throw new Error("Usage: --source=<uuid> --target=<uuid> [--apply]");
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const [{ data: sourceVenue, error: srcErr }, { data: targetVenue, error: tgtErr }] = await Promise.all([
    supabase
      .from("venues" as any)
      .select("id,name,address,city,state,zip,venue_url,latitude,longitude,timezone,normalized_address")
      .eq("id", sourceVenueId)
      .maybeSingle(),
    supabase
      .from("venues" as any)
      .select("id,name,address,city,state,zip,venue_url,latitude,longitude,timezone,normalized_address")
      .eq("id", targetVenueId)
      .maybeSingle(),
  ]);
  if (srcErr) throw new Error(srcErr.message);
  if (tgtErr) throw new Error(tgtErr.message);
  if (!sourceVenue) throw new Error("source_not_found");
  if (!targetVenue) throw new Error("target_not_found");

  const patch: any = {};
  const preferLongerText = (a: string | null | undefined, b: string | null | undefined) => {
    const av = String(a ?? "").trim();
    const bv = String(b ?? "").trim();
    if (!av) return bv || null;
    if (!bv) return av || null;
    const aZip = /\b\d{5}(?:-\d{4})?\b/.test(av);
    const bZip = /\b\d{5}(?:-\d{4})?\b/.test(bv);
    if (aZip !== bZip) return aZip ? av : bv;
    return av.length >= bv.length ? av : bv;
  };
  const fill = (key: string) => {
    const cur = (targetVenue as any)[key];
    const inc = (sourceVenue as any)[key];
    if ((cur == null || String(cur).trim() === "") && inc != null && String(inc).trim() !== "") patch[key] = inc;
  };
  fill("venue_url");
  fill("zip");
  fill("latitude");
  fill("longitude");
  fill("timezone");
  fill("normalized_address");
  fill("name");
  fill("city");
  fill("state");
  const mergedAddress = preferLongerText((targetVenue as any).address ?? null, (sourceVenue as any).address ?? null);
  if (mergedAddress && mergedAddress !== (targetVenue as any).address) patch.address = mergedAddress;
  // Apply the target patch after repointing + deleting the source to avoid violating
  // the unique (name,address,city,state) constraint when the source row currently
  // holds the "better" address.

  const moved: Record<string, number> = {};

  // tournament_venues (handle conflicts)
  const { data: links, error: linkErr } = await supabase
    .from("tournament_venues" as any)
    .select("tournament_id")
    .eq("venue_id", sourceVenueId)
    .limit(20000);
  if (linkErr) throw new Error(linkErr.message);
  const tournamentIds = Array.from(new Set((links ?? []).map((r: any) => String(r.tournament_id ?? "")).filter(Boolean)));
  if (tournamentIds.length && APPLY) {
    const payload = tournamentIds.map((tournament_id) => ({ tournament_id, venue_id: targetVenueId }));
    const { error } = await supabase.from("tournament_venues" as any).upsert(payload, { onConflict: "tournament_id,venue_id" });
    if (error) throw new Error(error.message);
    const { error: delErr } = await supabase.from("tournament_venues" as any).delete().eq("venue_id", sourceVenueId);
    if (delErr) throw new Error(delErr.message);
  }
  moved.tournament_venues = tournamentIds.length;

  const tryUpdate = async (table: string) => {
    try {
      const { data, error } = await supabase.from(table as any).update({ venue_id: targetVenueId }).eq("venue_id", sourceVenueId).select("id");
      if (error) return 0;
      return (data ?? []).length;
    } catch {
      return 0;
    }
  };

  // venue_reviews unique(user_id, venue_id)
  try {
    const [{ data: src }, { data: tgt }] = await Promise.all([
      supabase.from("venue_reviews" as any).select("id,user_id").eq("venue_id", sourceVenueId).limit(20000),
      supabase.from("venue_reviews" as any).select("user_id").eq("venue_id", targetVenueId).limit(20000),
    ]);
    const targetUsers = new Set(((tgt ?? []) as any[]).map((r) => String(r.user_id ?? "")).filter(Boolean));
    const conflicts = ((src ?? []) as any[]).filter((r) => targetUsers.has(String(r.user_id ?? ""))).map((r) => r.id);
    if (conflicts.length && APPLY) {
      await supabase.from("venue_reviews" as any).delete().in("id", conflicts);
    }
    if (APPLY) {
      await supabase.from("venue_reviews" as any).update({ venue_id: targetVenueId }).eq("venue_id", sourceVenueId);
    }
    moved.venue_reviews = (src ?? []).length;
  } catch {
    moved.venue_reviews = 0;
  }

  // venue_sport_profiles unique(venue_id, sport)
  try {
    const [{ data: src }, { data: tgt }] = await Promise.all([
      supabase.from("venue_sport_profiles" as any).select("id,sport").eq("venue_id", sourceVenueId).limit(20000),
      supabase.from("venue_sport_profiles" as any).select("sport").eq("venue_id", targetVenueId).limit(20000),
    ]);
    const targetSports = new Set(((tgt ?? []) as any[]).map((r) => String(r.sport ?? "")).filter(Boolean));
    const conflicts = ((src ?? []) as any[]).filter((r) => targetSports.has(String(r.sport ?? ""))).map((r) => r.id);
    if (conflicts.length && APPLY) await supabase.from("venue_sport_profiles" as any).delete().in("id", conflicts);
    if (APPLY) await supabase.from("venue_sport_profiles" as any).update({ venue_id: targetVenueId }).eq("venue_id", sourceVenueId);
    moved.venue_sport_profiles = (src ?? []).length;
  } catch {
    moved.venue_sport_profiles = 0;
  }

  moved.venue_quick_checks = APPLY ? await tryUpdate("venue_quick_checks") : 0;
  moved.venue_quick_check_events = APPLY ? await tryUpdate("venue_quick_check_events") : 0;
  moved.tournament_partner_nearby = APPLY ? await tryUpdate("tournament_partner_nearby") : 0;
  moved.owls_eye_runs = APPLY ? await tryUpdate("owls_eye_runs") : 0;

  if (APPLY) {
    const { error } = await supabase.from("venues" as any).delete().eq("id", sourceVenueId);
    if (error) throw new Error(error.message);
  }

  if (Object.keys(patch).length && APPLY) {
    const { error } = await supabase.from("venues" as any).update(patch).eq("id", targetVenueId);
    if (error) throw new Error(error.message);
  }

  console.log(
    JSON.stringify(
      {
        apply: APPLY,
        source_venue_id: sourceVenueId,
        target_venue_id: targetVenueId,
        patched_target_fields: Object.keys(patch),
        moved,
      },
      null,
      2
    )
  );
  if (!APPLY) console.log("Run again with --apply to write changes.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
