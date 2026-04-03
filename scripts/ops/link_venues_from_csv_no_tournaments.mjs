#!/usr/bin/env node
/**
 * Link venues to existing tournaments from a CSV.
 *
 * Safety:
 * - Never creates tournaments.
 * - Venues are upserted by (name,address,city,state) to avoid duplicates.
 * - Links are written as confirmed (`is_inferred=false`).
 * - Sets `is_primary=true` only when the tournament has no existing primary and the row looks "primary".
 *
 * Usage:
 *   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     node scripts/ops/link_venues_from_csv_no_tournaments.mjs --csv=tmp/file.csv --apply
 */

import fs from "node:fs";
import path from "node:path";

function readArg(name) {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : null;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function cleanText(value) {
  const text = String(value ?? "").trim();
  return text ? text : null;
}

function normalizeSpaces(value) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ");
}

function parseCsvLine(line) {
  // Minimal CSV parser with quoted-field support.
  const out = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      const next = line[i + 1];
      if (inQuotes && next === '"') {
        cur += '"';
        i++;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out.map((v) => v.trim());
}

function isUuidLike(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value ?? "").trim());
}

function looksPrimary(notes, confidence) {
  const conf = String(confidence ?? "").trim().toLowerCase();
  const n = String(notes ?? "").trim().toLowerCase();
  if (conf === "high" && n.startsWith("primary")) return true;
  if (conf === "high" && n.includes("primary")) return true;
  return false;
}

async function main() {
  const csvPathRaw = readArg("csv");
  if (!csvPathRaw) {
    console.error("Missing required arg: --csv=path/to/file.csv");
    process.exit(1);
  }
  const csvPath = path.isAbsolute(csvPathRaw) ? csvPathRaw : path.join(process.cwd(), csvPathRaw);
  const apply = hasFlag("apply");

  const url = cleanText(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const key = cleanText(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!url || !key) {
    console.error("Missing env: NEXT_PUBLIC_SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const raw = fs.readFileSync(csvPath, "utf8");
  const linesAll = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (!linesAll.length) {
    console.error("No CSV rows found.");
    process.exit(1);
  }

  const headerLineIdx = linesAll.findIndex((l) => l.toLowerCase().startsWith("tournament_uuid,"));
  if (headerLineIdx === -1) {
    console.error("Missing header row starting with `tournament_uuid,`.");
    process.exit(1);
  }

  const header = parseCsvLine(linesAll[headerLineIdx]);
  const required = [
    "tournament_uuid",
    "tournament_name",
    "venue_name",
    "venue_address",
    "city",
    "state",
    "zip",
    "confidence",
    "notes",
  ];
  const headerLower = header.map((h) => h.toLowerCase());
  const indexes = Object.fromEntries(required.map((k) => [k, headerLower.indexOf(k)]));
  const missingCols = required.filter((k) => indexes[k] === -1);
  if (missingCols.length) {
    console.error("Missing required columns:", missingCols.join(", "));
    console.error("Found header:", header.join(", "));
    process.exit(1);
  }

  const rows = linesAll
    .slice(headerLineIdx + 1)
    .filter((l) => !l.toLowerCase().startsWith("tournament_uuid,")) // drop repeated headers after the first
    .map(parseCsvLine)
    .filter((cols) => cols.some(Boolean))
    .map((cols) => {
      const get = (k) => cols[indexes[k]] ?? "";
      return {
        tournament_key: normalizeSpaces(get("tournament_uuid")),
        tournament_name: normalizeSpaces(get("tournament_name")),
        venue_name: normalizeSpaces(get("venue_name")),
        venue_address: normalizeSpaces(get("venue_address")),
        city: normalizeSpaces(get("city")),
        state: normalizeSpaces(get("state")).toUpperCase(),
        zip: normalizeSpaces(get("zip")).replace(/\D+/g, "").slice(0, 10),
        confidence: normalizeSpaces(get("confidence")).toLowerCase(),
        notes: normalizeSpaces(get("notes")),
      };
    })
    .filter((r) => r.tournament_key && r.venue_name && r.venue_address && r.state);

  const tournamentKeys = Array.from(new Set(rows.map((r) => r.tournament_key)));

  const tournaments = [];
  for (let i = 0; i < tournamentKeys.length; i += 200) {
    const chunk = tournamentKeys.slice(i, i + 200);
    const uuids = chunk.filter(isUuidLike);
    const slugs = chunk.filter((k) => !isUuidLike(k));

    if (uuids.length) {
      const { data, error } = await supabase
        .from("tournaments")
        .select("id,name,slug")
        .in("id", uuids);
      if (error) throw error;
      tournaments.push(...(data ?? []));
    }
    if (slugs.length) {
      const { data, error } = await supabase
        .from("tournaments")
        .select("id,name,slug")
        .in("slug", slugs);
      if (error) throw error;
      tournaments.push(...(data ?? []));
    }
  }
  const tournamentByKey = new Map();
  tournaments.forEach((t) => {
    if (t?.id) tournamentByKey.set(String(t.id), t);
    if (t?.slug) tournamentByKey.set(String(t.slug), t);
  });

  async function resolveTournamentByNameState({ name, state }) {
    const safeName = cleanText(name);
    const safeState = cleanText(state)?.toUpperCase();
    if (!safeName || !safeState) return null;

    const tryNames = Array.from(
      new Set([
        safeName,
        safeName.replace(/\s*\/\s*/g, "/"),
        safeName.replace(/\s+/g, " "),
        safeName.replace(/\s*\/\s*/g, "/").replace(/\s+/g, " "),
      ])
    );

    for (const n of tryNames) {
      const { data, error } = await supabase
        .from("tournaments")
        .select("id,name,slug")
        .eq("state", safeState)
        .ilike("name", n)
        .limit(5);
      if (error) throw error;
      if ((data ?? []).length === 1) return data[0];
      if ((data ?? []).length > 1) return { ambiguous: true, matches: data };
    }

    // Conservative fallback: contains-match on a stable prefix, only if it yields a single hit.
    const prefixCandidates = Array.from(
      new Set([
        safeName,
        safeName.replace(/\s*\/\s*/g, "/"),
      ].map((v) => v.slice(0, 24).trim()).filter((v) => v.length >= 6))
    );
    for (const prefix of prefixCandidates) {
      const { data, error } = await supabase
        .from("tournaments")
        .select("id,name,slug")
        .eq("state", safeState)
        .ilike("name", `%${prefix}%`)
        .limit(5);
      if (error) throw error;
      if ((data ?? []).length === 1) return data[0];
      if ((data ?? []).length > 1) return { ambiguous: true, matches: data };
    }

    // Final conservative fallback: match on first 2–3 alphanumeric words (e.g. "ND Babe Ruth").
    const words = safeName
      .replace(/[^a-z0-9]+/gi, " ")
      .trim()
      .split(/\s+/g)
      .filter(Boolean);
    const keyphrase = words.slice(0, 3).join(" ");
    if (keyphrase.length >= 6) {
      const { data, error } = await supabase
        .from("tournaments")
        .select("id,name,slug")
        .eq("state", safeState)
        .ilike("name", `%${keyphrase}%`)
        .limit(5);
      if (error) throw error;
      if ((data ?? []).length === 1) return data[0];
      if ((data ?? []).length > 1) return { ambiguous: true, matches: data };
    }

    return null;
  }

  const byTournament = new Map();
  for (const row of rows) {
    let t = tournamentByKey.get(row.tournament_key);
    if (!t?.id) {
      const resolved = await resolveTournamentByNameState({ name: row.tournament_name, state: row.state });
      if (resolved?.ambiguous) {
        console.warn(`Ambiguous tournament match for ${row.state} "${row.tournament_name}" (skipping):`);
        (resolved.matches ?? []).forEach((m) => console.warn(" -", m.id, m.slug, m.name));
        continue;
      }
      if (resolved?.id) {
        t = resolved;
        tournamentByKey.set(row.tournament_key, resolved);
        if (resolved.slug) tournamentByKey.set(String(resolved.slug), resolved);
        tournamentByKey.set(String(resolved.id), resolved);
      }
    }
    if (!t?.id) continue;
    const list = byTournament.get(String(t.id)) ?? [];
    list.push({ ...row, tournament_id: String(t.id), tournament_slug: t.slug ?? null });
    byTournament.set(String(t.id), list);
  }

  const missingTournaments = tournamentKeys.filter((k) => !tournamentByKey.has(k));
  if (missingTournaments.length) {
    console.warn(`Skipping ${missingTournaments.length} tournament(s) not found (no tournament creation):`);
    missingTournaments.slice(0, 50).forEach((k) => console.warn(" -", k));
    if (missingTournaments.length > 50) console.warn(" - ...");
  }

  let venuesUpserted = 0;
  let venuesCreated = 0;
  let linksInserted = 0;
  let linksUpdated = 0;
  let primarySet = 0;
  let skippedExistingPrimary = 0;

  for (const [tournamentId, list] of byTournament.entries()) {
    const { count: primaryCount, error: primaryErr } = await supabase
      .from("tournament_venues")
      .select("tournament_id", { count: "exact", head: true })
      .eq("tournament_id", tournamentId)
      .eq("is_primary", true);
    if (primaryErr) throw primaryErr;
    let hasPrimary = (primaryCount ?? 0) > 0;

    for (const row of list) {
      const venuePayload = {
        name: cleanText(row.venue_name),
        address: cleanText(row.venue_address),
        city: cleanText(row.city),
        state: cleanText(row.state),
        zip: cleanText(row.zip),
      };

      if (!venuePayload.name || !venuePayload.address || !venuePayload.state) {
        continue;
      }

      let beforeQuery = supabase
        .from("venues")
        .select("id")
        .ilike("name", venuePayload.name)
        .ilike("address", venuePayload.address)
        .eq("state", venuePayload.state)
        .limit(1);
      beforeQuery = venuePayload.city ? beforeQuery.ilike("city", venuePayload.city) : beforeQuery.is("city", null);
      const { data: before } = await beforeQuery;

      const existed = Boolean(before && before.length);

      const { data: venue, error: venueErr } = await supabase
        .from("venues")
        .upsert(venuePayload, { onConflict: "name,address,city,state" })
        .select("id")
        .maybeSingle();
      if (venueErr) throw venueErr;
      if (!venue?.id) throw new Error("venue_upsert_failed");
      venuesUpserted++;
      if (!existed) venuesCreated++;

      const wantsPrimary = looksPrimary(row.notes, row.confidence);
      const isPrimary = wantsPrimary && !hasPrimary;
      if (wantsPrimary && hasPrimary) skippedExistingPrimary++;

      const linkPayload = {
        tournament_id: tournamentId,
        venue_id: String(venue.id),
        is_inferred: false,
        is_primary: isPrimary,
        inference_confidence: null,
        inference_method: null,
        inferred_at: null,
        inference_run_id: null,
      };

      if (!apply) {
        console.log(
          "[dry-run] link",
          tournamentId,
          "->",
          venue.id,
          isPrimary ? "(primary)" : "",
          venuePayload.name,
          "|",
          venuePayload.address
        );
        continue;
      }

      const { data: linkBefore, error: linkBeforeErr } = await supabase
        .from("tournament_venues")
        .select("tournament_id,venue_id,is_inferred,is_primary")
        .eq("tournament_id", tournamentId)
        .eq("venue_id", String(venue.id))
        .maybeSingle();
      if (linkBeforeErr && linkBeforeErr.code !== "PGRST116") throw linkBeforeErr; // not found is ok

      const { error: linkErr } = await supabase
        .from("tournament_venues")
        .upsert(linkPayload, { onConflict: "tournament_id,venue_id" });
      if (linkErr) throw linkErr;

      if (linkBefore?.tournament_id) linksUpdated++;
      else linksInserted++;

      if (isPrimary) {
        hasPrimary = true;
        primarySet++;
      }
    }
  }

  console.log(
    JSON.stringify(
      {
        mode: apply ? "apply" : "dry-run",
        tournaments_in_csv: tournamentKeys.length,
        tournaments_found: byTournament.size,
        venues_upserted: venuesUpserted,
        venues_created: venuesCreated,
        links_inserted: linksInserted,
        links_updated: linksUpdated,
        primary_set: primarySet,
        primary_skipped_existing: skippedExistingPrimary,
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
