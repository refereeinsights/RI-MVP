import path from "node:path";
import fs from "node:fs";

import { createClient } from "@supabase/supabase-js";

type FlagType = "duration_gt_7_days" | "invalid_date_range";
type Status = "open" | "closed_validated" | "closed_fixed" | "closed_duplicate";

function parseDotenv(contents: string) {
  const out: Record<string, string> = {};
  for (const rawLine of contents.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

function loadEnvLocal() {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  const parsed = parseDotenv(fs.readFileSync(envPath, "utf8"));
  for (const [k, v] of Object.entries(parsed)) {
    if (!process.env[k]) process.env[k] = v;
  }
}

function clean(value: unknown) {
  const v = String(value ?? "").replace(/\s+/g, " ").trim();
  return v.length ? v : null;
}

function hasFlag(name: string) {
  return process.argv.includes(`--${name}`);
}

function argValue(name: string) {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : null;
}

function asNumber(value: unknown, fallback: number) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

type Tournament = {
  id: string;
  name: string | null;
  slug: string | null;
  sport: string | null;
  city: string | null;
  state: string | null;
  start_date: string | null;
  end_date: string | null;
  source_url: string | null;
  official_website_url: string | null;
};

function durationDaysExclusive(startDate: string, endDate: string) {
  // Dates are YYYY-MM-DD. In Postgres, end_date - start_date yields integer day difference (exclusive).
  const a = new Date(`${startDate}T00:00:00Z`).getTime();
  const b = new Date(`${endDate}T00:00:00Z`).getTime();
  return Math.round((b - a) / (24 * 60 * 60 * 1000));
}

function buildDetectedValue(t: Tournament, durationDays: number) {
  return {
    start_date: t.start_date,
    end_date: t.end_date,
    duration_days: durationDays,
    source_url: t.source_url,
    official_website_url: t.official_website_url,
  };
}

async function main() {
  loadEnvLocal();

  const APPLY = hasFlag("apply");
  const DRY_RUN = process.env.DRY_RUN === "1" || !APPLY;
  const limit = asNumber(clean(argValue("limit")), 5000);
  const offset = asNumber(clean(argValue("offset")), 0);

  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
  const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (set env vars or .env.local)");
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Pull canonical tournaments with both dates present. Compute duration client-side.
  const tRes = await supabase
    .from("tournaments" as any)
    .select("id,name,slug,sport,city,state,start_date,end_date,source_url,official_website_url")
    .eq("is_canonical", true)
    .not("start_date", "is", null)
    .not("end_date", "is", null)
    .order("updated_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (tRes.error) throw tRes.error;
  const tournaments: Tournament[] = (tRes.data ?? []) as any;

  let scanned = 0;
  let durationFlagged = 0;
  let invalidFlagged = 0;
  let durationAlreadyOpen = 0;
  let invalidAlreadyOpen = 0;
  let durationReopened = 0;
  let invalidReopened = 0;

  const samplesDuration: Array<{ t: Tournament; durationDays: number }> = [];
  const samplesInvalid: Array<{ t: Tournament; durationDays: number }> = [];

  for (const t of tournaments) {
    scanned += 1;
    if (!t.start_date || !t.end_date) continue;

    const durationDays = durationDaysExclusive(t.start_date, t.end_date);

    let flagType: FlagType | null = null;
    let reason: string | null = null;

    if (durationDays < 0) {
      flagType = "invalid_date_range";
      reason = `Invalid date range: end_date < start_date (duration_days=${durationDays}).`;
    } else if (durationDays > 7) {
      flagType = "duration_gt_7_days";
      reason = `Suspicious tournament duration: (end_date - start_date) = ${durationDays} days (> 7).`;
    }

    if (!flagType || !reason) continue;

    const existingRes = await supabase
      .from("tournament_quality_flags" as any)
      .select("id,status,resolution_notes")
      .eq("tournament_id", t.id)
      .eq("flag_type", flagType)
      .limit(1);
    if (existingRes.error) throw existingRes.error;
    const existing = (existingRes.data ?? [])[0] as { id: string; status: Status; resolution_notes: string | null } | undefined;

    const detected_value = buildDetectedValue(t, durationDays);

    let statusToWrite: Status = "open";
    let reopened = false;
    let alreadyOpen = false;

    if (existing?.status) {
      if (existing.status === "open") {
        alreadyOpen = true;
      } else if (existing.status.startsWith("closed_")) {
        reopened = true;
        statusToWrite = "open";
      }
    }

    if (flagType === "duration_gt_7_days") {
      samplesDuration.push({ t, durationDays });
      if (alreadyOpen) durationAlreadyOpen += 1;
      else if (reopened) durationReopened += 1;
      else durationFlagged += 1;
    } else {
      samplesInvalid.push({ t, durationDays });
      if (alreadyOpen) invalidAlreadyOpen += 1;
      else if (reopened) invalidReopened += 1;
      else invalidFlagged += 1;
    }

    if (DRY_RUN) continue;

    const payload: Record<string, any> = {
      tournament_id: t.id,
      flag_type: flagType,
      severity: "review",
      reason,
      detected_value,
      status: statusToWrite,
    };

    // Preserve existing resolution_notes; do not overwrite.
    if (existing?.resolution_notes) {
      payload.resolution_notes = existing.resolution_notes;
    }

    const upsertRes = await supabase
      .from("tournament_quality_flags" as any)
      .upsert([payload], { onConflict: "tournament_id,flag_type" });
    if (upsertRes.error) throw upsertRes.error;
  }

  const topDuration = samplesDuration
    .sort((a, b) => b.durationDays - a.durationDays)
    .slice(0, 10)
    .map((s) => ({
      id: s.t.id,
      slug: s.t.slug,
      name: s.t.name,
      state: s.t.state,
      city: s.t.city,
      start_date: s.t.start_date,
      end_date: s.t.end_date,
      duration_days: s.durationDays,
    }));

  const topInvalid = samplesInvalid
    .sort((a, b) => a.durationDays - b.durationDays)
    .slice(0, 10)
    .map((s) => ({
      id: s.t.id,
      slug: s.t.slug,
      name: s.t.name,
      state: s.t.state,
      city: s.t.city,
      start_date: s.t.start_date,
      end_date: s.t.end_date,
      duration_days: s.durationDays,
    }));

  console.log(
    JSON.stringify(
      {
        ok: true,
        dry_run: DRY_RUN,
        limit,
        offset,
        scanned,
        duration_gt_7_days: {
          flagged_new: durationFlagged,
          already_open: durationAlreadyOpen,
          reopened: durationReopened,
        },
        invalid_date_range: {
          flagged_new: invalidFlagged,
          already_open: invalidAlreadyOpen,
          reopened: invalidReopened,
        },
        sample_longest: topDuration,
        sample_invalid: topInvalid,
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

