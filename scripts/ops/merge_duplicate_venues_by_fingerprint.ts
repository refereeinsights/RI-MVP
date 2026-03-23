import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

type VenueLite = {
  id: string;
  name: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  venue_url: string | null;
  address_fingerprint: string | null;
};

const HELP = process.argv.includes("--help") || process.argv.includes("-h");

function argValue(name: string) {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : null;
}

function clean(value: unknown) {
  const v = String(value ?? "").replace(/\s+/g, " ").trim();
  return v.length ? v : "";
}

function normalizeLower(value: unknown) {
  return clean(value).toLowerCase();
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function pairKey(a: string, b: string) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function buildOutPath(prefix: string) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return path.join("/tmp", `${prefix}_${stamp}.csv`);
}

function toCsvRow(values: Record<string, string>) {
  const cols = Object.keys(values);
  const esc = (v: string) => {
    if (/[",\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
    return v;
  };
  return cols.map((c) => esc(values[c] ?? "")).join(",");
}

function preferLongerText(a: string | null | undefined, b: string | null | undefined) {
  const av = clean(a);
  const bv = clean(b);
  if (!av) return bv || null;
  if (!bv) return av || null;
  const aZip = /\b\d{5}(?:-\d{4})?\b/.test(av);
  const bZip = /\b\d{5}(?:-\d{4})?\b/.test(bv);
  if (aZip !== bZip) return aZip ? av : bv;
  return av.length >= bv.length ? av : bv;
}

async function updateVenueIdSimple(
  supabase: ReturnType<typeof createClient>,
  table: string,
  sourceVenueId: string,
  targetVenueId: string
) {
  try {
    const res = await supabase.from(table as any).update({ venue_id: targetVenueId }).eq("venue_id", sourceVenueId).select("id");
    if (res.error) return 0;
    return (res.data ?? []).length;
  } catch {
    return 0;
  }
}

async function mergeVenue(args: {
  supabase: ReturnType<typeof createClient>;
  sourceVenueId: string;
  targetVenueId: string;
}) {
  const { supabase, sourceVenueId, targetVenueId } = args;

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
  const fill = (key: string) => {
    const cur = (targetVenue as any)[key];
    const inc = (sourceVenue as any)[key];
    if ((cur == null || clean(cur) === "") && inc != null && clean(inc) !== "") patch[key] = inc;
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

  const moved: Record<string, number> = {};

  // tournament_venues
  const { data: links, error: linkErr } = await supabase
    .from("tournament_venues" as any)
    .select("tournament_id")
    .eq("venue_id", sourceVenueId)
    .limit(20000);
  if (linkErr) throw new Error(linkErr.message);
  const tournamentIds = Array.from(new Set((links ?? []).map((r: any) => String(r.tournament_id ?? "")).filter(Boolean)));
  if (tournamentIds.length) {
    const payload = tournamentIds.map((tournament_id) => ({ tournament_id, venue_id: targetVenueId }));
    const up = await supabase.from("tournament_venues" as any).upsert(payload, { onConflict: "tournament_id,venue_id" });
    if (up.error) throw new Error(up.error.message);
    const del = await supabase.from("tournament_venues" as any).delete().eq("venue_id", sourceVenueId);
    if (del.error) throw new Error(del.error.message);
  }
  moved.tournament_venues = tournamentIds.length;

  // venue_reviews unique(user_id, venue_id)
  try {
    const [{ data: srcReviews }, { data: tgtReviews }] = await Promise.all([
      supabase.from("venue_reviews" as any).select("id,user_id").eq("venue_id", sourceVenueId).limit(20000),
      supabase.from("venue_reviews" as any).select("user_id").eq("venue_id", targetVenueId).limit(20000),
    ]);
    const targetUsers = new Set(((tgtReviews ?? []) as any[]).map((r) => String(r.user_id ?? "")).filter(Boolean));
    const conflicts = ((srcReviews ?? []) as any[]).filter((r) => targetUsers.has(String(r.user_id ?? ""))).map((r) => r.id);
    if (conflicts.length) {
      const del = await supabase.from("venue_reviews" as any).delete().in("id", conflicts);
      if (del.error) throw new Error(del.error.message);
    }
    const upd = await supabase.from("venue_reviews" as any).update({ venue_id: targetVenueId }).eq("venue_id", sourceVenueId);
    if (upd.error) throw new Error(upd.error.message);
    moved.venue_reviews = (srcReviews ?? []).length;
  } catch {
    moved.venue_reviews = 0;
  }

  // venue_sport_profiles unique(venue_id, sport)
  try {
    const [{ data: srcProfiles }, { data: tgtProfiles }] = await Promise.all([
      supabase.from("venue_sport_profiles" as any).select("id,sport").eq("venue_id", sourceVenueId).limit(20000),
      supabase.from("venue_sport_profiles" as any).select("sport").eq("venue_id", targetVenueId).limit(20000),
    ]);
    const targetSports = new Set(((tgtProfiles ?? []) as any[]).map((r) => String(r.sport ?? "")).filter(Boolean));
    const conflicts = ((srcProfiles ?? []) as any[]).filter((r) => targetSports.has(String(r.sport ?? ""))).map((r) => r.id);
    if (conflicts.length) {
      const del = await supabase.from("venue_sport_profiles" as any).delete().in("id", conflicts);
      if (del.error) throw new Error(del.error.message);
    }
    const upd = await supabase
      .from("venue_sport_profiles" as any)
      .update({ venue_id: targetVenueId })
      .eq("venue_id", sourceVenueId);
    if (upd.error) throw new Error(upd.error.message);
    moved.venue_sport_profiles = (srcProfiles ?? []).length;
  } catch {
    moved.venue_sport_profiles = 0;
  }

  moved.venue_quick_checks = await updateVenueIdSimple(supabase, "venue_quick_checks", sourceVenueId, targetVenueId);
  moved.venue_quick_check_events = await updateVenueIdSimple(supabase, "venue_quick_check_events", sourceVenueId, targetVenueId);
  moved.tournament_partner_nearby = await updateVenueIdSimple(supabase, "tournament_partner_nearby", sourceVenueId, targetVenueId);
  moved.owls_eye_runs = await updateVenueIdSimple(supabase, "owls_eye_runs", sourceVenueId, targetVenueId);

  // Delete source first to avoid unique constraint collisions if we upgrade target address/name.
  const delVenue = await supabase.from("venues" as any).delete().eq("id", sourceVenueId);
  if (delVenue.error) throw new Error(delVenue.error.message);

  if (Object.keys(patch).length) {
    const updVenue = await supabase.from("venues" as any).update(patch).eq("id", targetVenueId);
    if (updVenue.error) throw new Error(updVenue.error.message);
  }

  return { moved, patched_target_fields: Object.keys(patch) };
}

async function main() {
  const APPLY = process.argv.includes("--apply");
  if (HELP) {
    console.log(
      [
        "Merge duplicate venues by address_fingerprint (conservative).",
        "",
        "Usage:",
        "  TMPDIR=./tmp node --import tsx scripts/ops/merge_duplicate_venues_by_fingerprint.ts",
        "  TMPDIR=./tmp node --import tsx scripts/ops/merge_duplicate_venues_by_fingerprint.ts --apply",
        "",
        "Optional:",
        "  --max_merges=50            (default 25 when --apply, unlimited dry-run)",
        "  --max_groups=200           (default 200)",
        "  --min_group_size=2         (default 2)",
        "",
        "Env required:",
        "  NEXT_PUBLIC_SUPABASE_URL",
        "  SUPABASE_SERVICE_ROLE_KEY",
      ].join("\n")
    );
    return;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const maxGroups = Number(argValue("max_groups") || "200");
  const minGroupSize = Number(argValue("min_group_size") || "2");
  const maxMerges = Number(argValue("max_merges") || (APPLY ? "25" : "1000000"));
  if (!Number.isFinite(maxGroups) || maxGroups <= 0) throw new Error("--max_groups must be positive");
  if (!Number.isFinite(minGroupSize) || minGroupSize < 2) throw new Error("--min_group_size must be >=2");
  if (!Number.isFinite(maxMerges) || maxMerges <= 0) throw new Error("--max_merges must be positive");

  // Load override pairs that must not be auto-merged.
  const keepBothPairs = new Set<string>();
  try {
    const resp = await supabase
      .from("venue_duplicate_overrides" as any)
      .select("venue_a_id,venue_b_id,status")
      .eq("status", "keep_both")
      .limit(20000);
    if (!resp.error) {
      ((resp.data ?? []) as any[]).forEach((row) => {
        const a = String(row.venue_a_id ?? "");
        const b = String(row.venue_b_id ?? "");
        if (isUuid(a) && isUuid(b) && a !== b) keepBothPairs.add(pairKey(a, b));
      });
    }
  } catch {
    // ignore
  }

  // Pull venues (id + fingerprints) in pages.
  const venues: VenueLite[] = [];
  // Supabase PostgREST commonly caps responses at 1000 rows, even with larger ranges.
  const pageSize = 1000;
  for (let offset = 0; offset < 200000; offset += pageSize) {
    const resp = await supabase
      .from("venues" as any)
      .select("id,name,address,city,state,zip,venue_url,address_fingerprint")
      .not("address_fingerprint", "is", null)
      .order("id", { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (resp.error) throw new Error(resp.error.message);
    const rows = (resp.data ?? []) as any[];
    if (!rows.length) break;
    rows.forEach((row) => {
      venues.push({
        id: String(row.id),
        name: row.name ?? null,
        address: row.address ?? null,
        city: row.city ?? null,
        state: row.state ?? null,
        zip: row.zip ?? null,
        venue_url: row.venue_url ?? null,
        address_fingerprint: row.address_fingerprint ?? null,
      });
    });
    if (rows.length < pageSize) break;
  }

  const byFp = new Map<string, VenueLite[]>();
  for (const v of venues) {
    const fp = clean(v.address_fingerprint);
    if (!fp) continue;
    const list = byFp.get(fp) ?? [];
    list.push(v);
    byFp.set(fp, list);
  }

  const groups = Array.from(byFp.entries())
    .map(([fp, list]) => ({ fp, list }))
    .filter((g) => g.list.length >= minGroupSize)
    .sort((a, b) => b.list.length - a.list.length)
    .slice(0, maxGroups);

  // Precompute linked tournament counts + owl run counts for target selection.
  const venueIds = groups.flatMap((g) => g.list.map((v) => v.id));
  const linkedCountByVenue = new Map<string, number>();
  const owlCountByVenue = new Map<string, number>();

  for (let i = 0; i < venueIds.length; i += 200) {
    const chunk = venueIds.slice(i, i + 200);
    const { data, error } = await supabase.from("tournament_venues" as any).select("venue_id").in("venue_id", chunk).limit(20000);
    if (error) throw new Error(error.message);
    (data ?? []).forEach((row: any) => {
      const vid = String(row.venue_id ?? "");
      if (!vid) return;
      linkedCountByVenue.set(vid, (linkedCountByVenue.get(vid) ?? 0) + 1);
    });
  }

  for (let i = 0; i < venueIds.length; i += 200) {
    const chunk = venueIds.slice(i, i + 200);
    try {
      const { data, error } = await supabase.from("owls_eye_runs" as any).select("venue_id").in("venue_id", chunk).limit(20000);
      if (error) continue;
      (data ?? []).forEach((row: any) => {
        const vid = String(row.venue_id ?? "");
        if (!vid) return;
        owlCountByVenue.set(vid, (owlCountByVenue.get(vid) ?? 0) + 1);
      });
    } catch {
      // ignore if table missing
    }
  }

  const pickTarget = (candidates: VenueLite[]) =>
    [...candidates].sort((a, b) => {
      const aOwl = owlCountByVenue.get(a.id) ?? 0;
      const bOwl = owlCountByVenue.get(b.id) ?? 0;
      if (aOwl !== bOwl) return bOwl - aOwl;
      const aLinked = linkedCountByVenue.get(a.id) ?? 0;
      const bLinked = linkedCountByVenue.get(b.id) ?? 0;
      if (aLinked !== bLinked) return bLinked - aLinked;
      const aUrl = a.venue_url ? 1 : 0;
      const bUrl = b.venue_url ? 1 : 0;
      if (aUrl !== bUrl) return bUrl - aUrl;
      const aAddrLen = clean(a.address).length;
      const bAddrLen = clean(b.address).length;
      if (aAddrLen !== bAddrLen) return bAddrLen - aAddrLen;
      return a.id.localeCompare(b.id);
    })[0];

  const outPath = buildOutPath("ri_venue_merge_by_fingerprint");
  const report: Array<Record<string, string>> = [];

  let groupsConsidered = 0;
  let mergesPlanned = 0;
  let mergesDone = 0;
  let groupsSkippedAllKeepBoth = 0;
  let errors = 0;

  for (const group of groups) {
    groupsConsidered += 1;
    const candidates = group.list;
    const target = pickTarget(candidates);
    const sources = candidates.filter((v) => v.id !== target.id);

    const sourcesToMerge = sources.filter((s) => !keepBothPairs.has(pairKey(s.id, target.id)));
    if (sourcesToMerge.length === 0) {
      groupsSkippedAllKeepBoth += 1;
      continue;
    }

    for (const source of sourcesToMerge) {
      mergesPlanned += 1;
      if (mergesPlanned > maxMerges) break;

      if (!APPLY) {
        report.push({
          address_fingerprint: group.fp,
          action: "dry_run_merge",
          source_venue_id: source.id,
          target_venue_id: target.id,
          source_name: clean(source.name),
          target_name: clean(target.name),
          source_address: clean(source.address),
          target_address: clean(target.address),
        });
        continue;
      }

      try {
        const res = await mergeVenue({ supabase, sourceVenueId: source.id, targetVenueId: target.id });
        mergesDone += 1;
        report.push({
          address_fingerprint: group.fp,
          action: "merged",
          source_venue_id: source.id,
          target_venue_id: target.id,
          source_name: clean(source.name),
          target_name: clean(target.name),
          source_address: clean(source.address),
          target_address: clean(target.address),
          moved_tournament_venues: String(res.moved.tournament_venues ?? 0),
          patched_target_fields: res.patched_target_fields.join("|"),
        });
      } catch (e) {
        errors += 1;
        const msg = e instanceof Error ? e.message : "merge_failed";
        report.push({
          address_fingerprint: group.fp,
          action: "error",
          source_venue_id: source.id,
          target_venue_id: target.id,
          error: msg,
        });
      }
    }

    if (mergesPlanned >= maxMerges) break;
  }

  const cols = [
    "address_fingerprint",
    "action",
    "source_venue_id",
    "target_venue_id",
    "source_name",
    "target_name",
    "source_address",
    "target_address",
    "moved_tournament_venues",
    "patched_target_fields",
    "error",
  ];
  fs.writeFileSync(outPath, `${cols.join(",")}\n${report.map((r) => toCsvRow(r)).join("\n")}\n`, "utf8");

  console.log(
    [
      "",
      "Done.",
      `- apply: ${APPLY ? "yes" : "no"}`,
      `- venues_loaded: ${venues.length}`,
      `- groups_considered: ${groupsConsidered}`,
      `- groups_selected: ${groups.length}`,
      `- groups_skipped_all_keep_both: ${groupsSkippedAllKeepBoth}`,
      `- merges_planned: ${mergesPlanned}`,
      `- merges_done: ${mergesDone}`,
      `- errors: ${errors}`,
      `- csv: ${outPath}`,
    ].join("\n")
  );

  if (!APPLY) console.log("Run again with --apply to perform merges.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
