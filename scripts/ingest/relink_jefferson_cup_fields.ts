import os from "node:os";
import path from "node:path";
import fs from "node:fs";

import * as dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { load } from "cheerio";

import { normalizeIdentityStreet, normalizeIdentityText } from "../../apps/referee/lib/identity/fingerprints";

dotenv.config({ path: ".env.local" });
dotenv.config();

const DEFAULT_FIELDS_URL = "https://jeffersoncup.rutournaments.com/fields/";
const DEFAULT_TOURNAMENT_NAMES = [
  // Exact names in DB currently use an em dash (—). We still match flexibly.
  "2026 Jefferson Cup — Boys Showcase",
  "2026 Jefferson Cup — Boys Weekend",
  "2026 Jefferson Cup — Girls Showcase",
  "2026 Jefferson Cup — Girls Weekend",
];

type TournamentRow = {
  id: string;
  name: string | null;
  status?: string | null;
  is_canonical?: boolean | null;
  sport?: string | null;
};

type VenueRow = {
  id: string;
  name: string | null;
  address: string | null;
  address1: string | null;
  normalized_address?: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  sport?: string | null;
  venue_url?: string | null;
};

type ParsedField = {
  name: string;
  address_blob: string;
  directions_url: string | null;
  field_map_url: string | null;
};

type ResolvedAddress = {
  street: string;
  city: string;
  state: string;
  zip: string;
};

function clean(value: string | null | undefined) {
  const out = String(value ?? "").trim();
  return out.length ? out : null;
}

function hasFlag(name: string) {
  return process.argv.slice(2).some((a) => a === `--${name}`);
}

function argValue(name: string) {
  const prefix = `--${name}=`;
  const arg = process.argv.slice(2).find((a) => a.startsWith(prefix));
  if (!arg) return null;
  return arg.slice(prefix.length);
}

function requireEnv(name: string) {
  const value = clean(process.env[name]);
  if (!value) throw new Error(`Missing ${name}.`);
  return value;
}

function normalizeName(value: string | null | undefined) {
  return normalizeIdentityText(value).toLowerCase();
}

function normalizeCity(value: string | null | undefined) {
  return normalizeIdentityText(value).toLowerCase();
}

function normalizeState(value: string | null | undefined) {
  const raw = normalizeIdentityText(value).toUpperCase();
  if (!raw) return "";
  if (/^[A-Z]{2}$/.test(raw)) return raw;
  return raw.slice(0, 2);
}

function normalizeAddress(value: string | null | undefined) {
  return normalizeIdentityStreet(value).toLowerCase();
}

function venueCandidateAddress(v: VenueRow) {
  return v.address1 || v.address || v.normalized_address || null;
}

function pickExistingVenue(params: { name: string; street: string; city: string; state: string; candidates: VenueRow[] }) {
  const targetName = normalizeName(params.name);
  const targetCity = normalizeCity(params.city);
  const targetState = normalizeState(params.state);
  const targetAddr = normalizeAddress(params.street);

  const scored = params.candidates
    .filter((v) => normalizeState(v.state) === targetState && normalizeCity(v.city) === targetCity)
    .map((v) => {
      const name = normalizeName(v.name);
      const addr = normalizeAddress(venueCandidateAddress(v));
      const score = (name === targetName ? 10 : 0) + (targetAddr && addr && addr === targetAddr ? 100 : 0);
      return { v, score, name, addr };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  const best = scored[0]?.v ?? null;
  if (!best) return null;

  // Require name match unless address is exact.
  const bestName = normalizeName(best.name);
  const bestAddr = normalizeAddress(venueCandidateAddress(best));
  if (bestName !== targetName && !(targetAddr && bestAddr && targetAddr === bestAddr)) return null;
  return best;
}

function normalizeAddressBlob(raw: string) {
  const compact = raw.replace(/\s+/g, " ").trim();
  // Common data issue on the page: missing comma/space between street suffix and city.
  const suffixes =
    "(?:Rd|Road|St|Street|Ave|Avenue|Blvd|Boulevard|Dr|Drive|Pkwy|Parkway|Way|Ln|Lane|Ct|Court|Pl|Place|Hwy|Highway|Cir|Circle|Trl|Trail|Ter|Terrace|Pike|Loop|Sq|Square)";
  // Handle both "RdRichmond" and "Rd Richmond" cases.
  const attached = compact.replace(new RegExp(`\\b(${suffixes})(?=[A-Z])`, "g"), "$1, ");
  return attached.replace(new RegExp(`\\b(${suffixes})\\b(?!,)\\s*(?=[A-Z])`, "g"), "$1, ");
}

function parseAddressBlob(rawAddress: string): ResolvedAddress | null {
  let raw = normalizeAddressBlob(rawAddress)
    .replace(/\s*,\s*(usa|united states)\.?$/i, "")
    .trim();
  if (!raw) return null;

  // Some rows omit the comma between city and state (e.g., "Ashland VA 23005").
  if (!/,\s*[A-Z]{2}\s*\d{5}/.test(raw) && /\s+[A-Z]{2}\s*\d{5}/.test(raw)) {
    raw = raw.replace(/\s+([A-Z]{2})\s*(\d{5}(?:-\d{4})?)\s*$/, ", $1 $2");
  }

  const stateZip = raw.match(/,\s*([A-Z]{2})\s*(\d{5}(?:-\d{4})?)\s*$/);
  if (!stateZip || stateZip.index == null) return null;

  const state = stateZip[1];
  const zip = stateZip[2];
  const before = raw.slice(0, stateZip.index).trim();

  const lastComma = before.lastIndexOf(",");
  if (lastComma < 0) return null;
  const street = before.slice(0, lastComma).trim();
  const city = before.slice(lastComma + 1).trim();
  if (!street || !city || !state || !zip) return null;
  return { street, city, state, zip };
}

async function fetchFields(url: string): Promise<ParsedField[]> {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`Failed to fetch fields page (${res.status})`);
  const html = await res.text();

  const $ = load(html);
  const table = $("table.wptb-preview-table").first();
  if (!table.length) throw new Error("Fields table not found on page");

  const rows: ParsedField[] = [];
  table.find("tbody tr").each((idx, tr) => {
    const cells = $(tr).find("td");
    if (cells.length < 2) return;

    const name = $(cells[0]!).text().replace(/\s+/g, " ").trim();
    const addressBlob = $(cells[1]!).text().replace(/\s+/g, " ").trim();
    if (!name || !addressBlob || name.toLowerCase() === "field") return;

    const fieldMapUrl = $(cells[2] ?? null)
      ?.find("a")
      ?.attr("href");
    const directionsUrl = $(cells[3] ?? null)
      ?.find("a")
      ?.attr("href");

    rows.push({
      name,
      address_blob: addressBlob,
      field_map_url: clean(fieldMapUrl),
      directions_url: clean(directionsUrl),
    });
  });

  // Dedupe by name + address_blob (stable)
  const seen = new Set<string>();
  const out: ParsedField[] = [];
  for (const row of rows) {
    const key = `${row.name}|${row.address_blob}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

function defaultReportPath() {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const downloadsDir = path.join(os.homedir(), "Downloads");
  return path.join(downloadsDir, `jefferson_cup_fields_relink_${stamp}.csv`);
}

function escapeCsvCell(value: string) {
  if (value.includes("\"") || value.includes(",") || value.includes("\n")) {
    return `"${value.replace(/\"/g, "\"\"")}"`;
  }
  return value;
}

function writeReportCsv(reportPath: string, rows: Array<Record<string, any>>) {
  const header = [
    "tournament_id",
    "tournament_name",
    "venue_id",
    "venue_name",
    "venue_address",
    "venue_city",
    "venue_state",
    "venue_zip",
    "action",
    "message",
  ];
  const lines = [header.join(",")];
  for (const row of rows) {
    const cols = header.map((h) => escapeCsvCell(String(row[h] ?? "")));
    lines.push(cols.join(","));
  }
  fs.writeFileSync(reportPath, lines.join("\n"), "utf8");
}

async function main() {
  const fieldsUrl = clean(argValue("url")) ?? DEFAULT_FIELDS_URL;
  const outPath = clean(argValue("out")) ?? defaultReportPath();
  const apply = hasFlag("apply");

  const namesArg = clean(argValue("tournaments"));
  const tournamentNames = namesArg
    ? namesArg
        .split("|")
        .map((s) => s.trim())
        .filter(Boolean)
    : DEFAULT_TOURNAMENT_NAMES;

  const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  const parsedFields = await fetchFields(fieldsUrl);
  const resolvedVenues = parsedFields
    .map((f) => {
      const resolved = parseAddressBlob(f.address_blob);
      if (!resolved) return null;
      return {
        venue_name: f.name,
        venue_address: resolved.street,
        venue_city: resolved.city,
        venue_state: resolved.state,
        venue_zip: resolved.zip,
        venue_url: f.directions_url || f.field_map_url || fieldsUrl,
      };
    })
    .filter((v): v is NonNullable<typeof v> => Boolean(v));

  if (resolvedVenues.length === 0) throw new Error("No venues parsed from fields page.");

  const tournamentRows: TournamentRow[] = [];
  for (const name of tournamentNames) {
    const exactResp = await supabase
      .from("tournaments" as any)
      .select("id,name,status,is_canonical,sport")
      .eq("name", name)
      .limit(20);
    if (exactResp.error) throw exactResp.error;
    let rows = (exactResp.data ?? []) as TournamentRow[];

    if (rows.length === 0) {
      const tokens = name
        .replace(/\b20\d{2}\b/g, "")
        .replace(/[—–-]/g, " ")
        .replace(/[()]/g, " ")
        .split(/\s+/)
        .map((t) => t.trim())
        .filter((t) => t.length >= 3);
      const pattern = `%${tokens.join("%")}%`;

      const fuzzyResp = await supabase
        .from("tournaments" as any)
        .select("id,name,status,is_canonical,sport")
        .ilike("name", pattern)
        .limit(50);
      if (fuzzyResp.error) throw fuzzyResp.error;
      rows = (fuzzyResp.data ?? []) as TournamentRow[];
    }

    if (rows.length === 0) throw new Error(`Tournament not found (exact or fuzzy): ${name}`);

    // Prefer published + canonical, else first.
    const best =
      rows.find((r) => (r.status ?? "").toLowerCase() === "published" && r.is_canonical === true) ??
      rows.find((r) => (r.status ?? "").toLowerCase() === "published") ??
      rows[0]!;
    tournamentRows.push(best);
  }

  const tournamentIds = tournamentRows.map((t) => t.id);

  const { data: existingLinks, error: linkErr } = await supabase
    .from("tournament_venues" as any)
    .select("tournament_id,venue_id")
    .in("tournament_id", tournamentIds)
    .limit(200000);
  if (linkErr) throw linkErr;

  const existingLinkCount = (existingLinks ?? []).length;
  const existingLinkSet = new Set(
    ((existingLinks ?? []) as Array<{ tournament_id: string | null; venue_id: string | null }>)
      .filter((r) => r.tournament_id && r.venue_id)
      .map((r) => `${r.tournament_id}|${r.venue_id}`),
  );

  const cityKeys = Array.from(
    new Set(resolvedVenues.map((v) => `${normalizeState(v.venue_state)}|${normalizeCity(v.venue_city)}`))
  );
  const venuesByCityKey = new Map<string, VenueRow[]>();
  for (const key of cityKeys) {
    const [state, city] = key.split("|");
    const resp = await supabase
      .from("venues" as any)
      .select("id,name,address,address1,normalized_address,city,state,zip,sport,venue_url")
      .eq("state", state)
      .ilike("city", city)
      .limit(5000);
    if (resp.error) throw resp.error;
    venuesByCityKey.set(key, (resp.data ?? []) as VenueRow[]);
  }

  let venuesCreated = 0;
  let venuesMatched = 0;
  let linksCreated = 0;
  let linksAlreadyPresent = 0;

  const reportRows: Array<Record<string, any>> = [];

  if (!apply) {
    console.log(
      JSON.stringify(
        {
          tool: "jefferson_cup_fields_relink",
          dryRun: true,
          tournaments: tournamentRows.map((t) => ({ id: t.id, name: t.name })),
          parsed_fields: parsedFields.length,
          venues_parsed: resolvedVenues.length,
          existing_links_to_remove: existingLinkCount,
          note: "Run with --apply to delete existing tournament_venues links for these tournaments and replace with the fields list.",
          report: outPath,
        },
        null,
        2,
      ),
    );
    return;
  }

  // 1) Unlink all existing venues for these tournaments.
  const delResp = await supabase.from("tournament_venues" as any).delete().in("tournament_id", tournamentIds);
  if (delResp.error) throw delResp.error;

  // 2) For each parsed venue, find/create venue, then link to each tournament.
  const nowIso = new Date().toISOString();
  for (const v of resolvedVenues) {
    const key = `${normalizeName(v.venue_name)}|${normalizeAddress(v.venue_address)}|${normalizeCity(v.venue_city)}|${normalizeState(
      v.venue_state,
    )}`;
    let venueId: string | null = null;

    const candidates = venuesByCityKey.get(`${normalizeState(v.venue_state)}|${normalizeCity(v.venue_city)}`) ?? [];
    const existing = pickExistingVenue({
      name: v.venue_name,
      street: v.venue_address,
      city: v.venue_city,
      state: v.venue_state,
      candidates,
    });
    if (existing?.id) {
      venueId = existing.id;
      venuesMatched += 1;
    } else {
      const sport = tournamentRows[0]?.sport ?? null;
      const insertPayload: any = {
        name: v.venue_name,
        address: v.venue_address,
        address1: v.venue_address,
        city: v.venue_city,
        state: normalizeState(v.venue_state),
        zip: v.venue_zip,
        sport,
        venue_url: v.venue_url,
        updated_at: nowIso,
      };
      const insertResp = await supabase.from("venues" as any).insert(insertPayload).select("id").single();
      if (insertResp.error) {
        // Retry fetch + match in case we hit a uniqueness race.
        const retryResp = await supabase
          .from("venues" as any)
          .select("id,name,address,address1,normalized_address,city,state,zip,sport,venue_url")
          .eq("state", normalizeState(v.venue_state))
          .ilike("city", v.venue_city)
          .limit(5000);
        if (retryResp.error) throw retryResp.error;
        const retryExisting = pickExistingVenue({
          name: v.venue_name,
          street: v.venue_address,
          city: v.venue_city,
          state: v.venue_state,
          candidates: (retryResp.data ?? []) as VenueRow[],
        });
        if (!retryExisting?.id) throw insertResp.error;
        venueId = retryExisting.id;
        venuesMatched += 1;
      } else {
        venueId = (insertResp.data as any)?.id ?? null;
        venuesCreated += 1;
      }
    }

    if (!venueId) continue;

    for (const t of tournamentRows) {
      const linkKey = `${t.id}|${venueId}`;
      if (existingLinkSet.has(linkKey)) {
        linksAlreadyPresent += 1;
      }
      const upsertResp = await supabase
        .from("tournament_venues" as any)
        .upsert({ tournament_id: t.id, venue_id: venueId }, { onConflict: "tournament_id,venue_id" });
      if (upsertResp.error) throw upsertResp.error;
      linksCreated += 1;

      reportRows.push({
        tournament_id: t.id,
        tournament_name: t.name ?? "",
        venue_id: venueId,
        venue_name: v.venue_name,
        venue_address: v.venue_address,
        venue_city: v.venue_city,
        venue_state: normalizeState(v.venue_state),
        venue_zip: v.venue_zip,
        action: existing?.id ? "linked_existing_venue" : "created_or_linked",
        message: "linked_from_fields_page",
      });
    }
  }

  writeReportCsv(outPath, reportRows);

  console.log(
    JSON.stringify(
      {
        tool: "jefferson_cup_fields_relink",
        dryRun: false,
        tournaments: tournamentRows.map((t) => ({ id: t.id, name: t.name })),
        parsed_fields: parsedFields.length,
        venues_parsed: resolvedVenues.length,
        existing_links_removed: existingLinkCount,
        venues_created: venuesCreated,
        venues_matched: venuesMatched,
        links_upserted: linksCreated,
        links_already_present_prior: linksAlreadyPresent,
        report: outPath,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
