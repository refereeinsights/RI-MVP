import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  buildVenueNameCityStateFingerprint,
  normalizeIdentityStreet,
  normalizeIdentityText,
  normalizeIdentityUrlHost,
} from "@/lib/identity/fingerprints";

export type VenueImportCsvRow = Record<string, any>;

export type VenueImportRowResult = {
  row_number: number;
  venue_name: string;
  venue_address: string;
  city: string | null;
  state: string | null;
  zip: string | null;
  sport: string | null;
  venue_url: string | null;
  source_url: string | null;
  organization: string | null;
  confidence: string | null;
  notes: string | null;
  action:
    | "inserted"
    | "would_insert"
    | "skipped_existing"
    | "needs_review"
    | "invalid"
    | "parse_error";
  matched_venue_id?: string | null;
  reason?: string | null;
  raw: any;
};

type ImportRowNormalized = {
  row_number: number;
  venue_name: string;
  venue_address: string;
  city: string | null;
  state: string | null;
  zip: string | null;
  sport: string | null;
  venue_url: string | null;
  source_url: string | null;
  organization: string | null;
  confidence: string | null;
  notes: string | null;
  latitude: number | null;
  longitude: number | null;
  raw: any;
};

type VenueRow = {
  id: string;
  name: string | null;
  address1: string | null;
  address: string | null;
  normalized_address?: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  venue_url?: string | null;
  sport?: string | null;
};

const ALLOWED_VENUE_SPORTS = [
  "soccer",
  "baseball",
  "lacrosse",
  "basketball",
  "hockey",
  "volleyball",
  "futsal",
  "softball",
  "football",
  "wrestling",
  "other",
];

function cleanText(value: unknown) {
  const v = String(value ?? "").replace(/\s+/g, " ").trim();
  return v || "";
}

function cleanNullable(value: unknown): string | null {
  const v = cleanText(value);
  return v ? v : null;
}

function cleanZip(value: unknown): string | null {
  const v = String(value ?? "").trim();
  if (!v) return null;
  const digits = v.replace(/[^0-9]+/g, "");
  if (!digits) return null;
  return digits.slice(0, 5);
}

function normalizeState(value: unknown): string | null {
  const v = cleanText(value).toUpperCase();
  if (!v) return null;
  if (/^[A-Z]{2}$/.test(v)) return v;
  return v.slice(0, 2);
}

function normalizeVenueSport(value: unknown): string | null {
  const v = cleanText(value).toLowerCase();
  if (!v) return null;
  return ALLOWED_VENUE_SPORTS.includes(v) ? v : null;
}

function normalizeVenueUrl(value: unknown): string | null {
  const raw = cleanText(value);
  if (!raw) return null;
  try {
    const u = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
    u.hash = "";
    for (const key of Array.from(u.searchParams.keys())) {
      if (key.toLowerCase().startsWith("utm_")) u.searchParams.delete(key);
    }
    u.pathname = u.pathname.replace(/\/+$/, "") || "/";
    return u.toString();
  } catch {
    return raw;
  }
}

function parseAddressBlob(rawAddress: string) {
  const raw = rawAddress
    .replace(/\s+/g, " ")
    .replace(/\s*,\s*(usa|united states)\.?$/i, "")
    .trim();
  if (!raw) return null;

  const commaPattern = /^(.*?),\s*([^,]+),\s*([A-Za-z]{2}|[A-Za-z .]+)\s*,?\s*(\d{5}(?:-\d{4})?)$/;
  const commaMatch = raw.match(commaPattern);
  if (commaMatch) {
    const street = commaMatch[1]?.trim() ?? "";
    const city = commaMatch[2]?.trim() ?? "";
    const state = commaMatch[3]?.trim() ?? "";
    const zip = (commaMatch[4] ?? "").trim();
    if (street && city && state && zip) return { street, city, state, zip };
  }

  // Common variant without commas:
  // "3335 Pine Tar Alley Southaven MS 38672"
  // "5000 W Wellesley Ave Spokane WA 99205"
  const tailMatch = raw.match(/^(.*)\s+([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)$/);
  if (tailMatch) {
    const before = (tailMatch[1] ?? "").trim();
    const state = (tailMatch[2] ?? "").trim();
    const zip = (tailMatch[3] ?? "").trim();
    if (before && state && zip) {
      // Prefer comma split if present: "street, City"
      if (before.includes(",")) {
        const parts = before.split(",").map((p) => p.trim()).filter(Boolean);
        if (parts.length >= 2) {
          const city = parts[parts.length - 1];
          const street = parts.slice(0, -1).join(", ");
          if (street && city) return { street, city, state, zip };
        }
      }

      // Heuristic split: use last street-type token to separate street from city.
      const tokens = before.split(" ").map((t) => t.trim()).filter(Boolean);
      const startsWithNumber = Boolean(tokens[0] && /\d/.test(tokens[0]));
      const STREET_TYPES = new Set([
        "st",
        "street",
        "ave",
        "avenue",
        "rd",
        "road",
        "blvd",
        "boulevard",
        "dr",
        "drive",
        "ln",
        "lane",
        "ct",
        "court",
        "pl",
        "place",
        "pkwy",
        "parkway",
        "way",
        "cir",
        "circle",
        "trl",
        "trail",
        "ter",
        "terrace",
        "hwy",
        "highway",
        "alley",
        "aly",
        "loop",
      ]);

      if (startsWithNumber && tokens.length >= 4) {
        let splitIdx = -1;
        for (let i = tokens.length - 1; i >= 0; i--) {
          if (STREET_TYPES.has(tokens[i].toLowerCase())) {
            splitIdx = i;
            break;
          }
        }
        if (splitIdx !== -1 && splitIdx < tokens.length - 1) {
          const street = tokens.slice(0, splitIdx + 1).join(" ").trim();
          const city = tokens.slice(splitIdx + 1).join(" ").trim();
          if (street && city) return { street, city, state, zip };
        }
      }
    }
  }

  return null;
}

function looksFuzzySimilarName(a: string, b: string) {
  const na = normalizeIdentityText(a).replace(/^the\s+/, "");
  const nb = normalizeIdentityText(b).replace(/^the\s+/, "");
  if (!na || !nb) return false;
  if (na === nb) return true;
  const ta = new Set(na.split(" ").filter(Boolean));
  const tb = new Set(nb.split(" ").filter(Boolean));
  if (ta.size < 2 || tb.size < 2) return false;
  let common = 0;
  for (const t of ta) if (tb.has(t)) common++;
  const overlap = common / Math.max(ta.size, tb.size);
  return overlap >= 0.8;
}

function venueCandidateAddress(v: VenueRow) {
  return v.address1 || v.address || v.normalized_address || null;
}

export async function runVenueCsvImport(args: {
  createdBy: string;
  filename?: string | null;
  dryRun: boolean;
  rows: VenueImportCsvRow[];
}): Promise<{
  ok: true;
  run_id: string;
  dry_run: boolean;
  total_rows: number;
  inserted: number;
  skipped_existing: number;
  needs_review: number;
  invalid: number;
  parse_errors: number;
  summary: string;
}> {
  const rowsRaw = Array.isArray(args.rows) ? args.rows : [];

  const normalizedRows: ImportRowNormalized[] = rowsRaw
    .map((r, idx) => {
      const venue_name = cleanText(r?.venue_name ?? r?.name);
      const venue_address = cleanText(r?.venue_address ?? r?.address ?? r?.venue_address_text ?? r?.address_with_zip);
      const city = cleanNullable(r?.city ?? r?.venue_city);
      const state = normalizeState(r?.state ?? r?.venue_state);
      const zip = cleanZip(r?.zip ?? r?.venue_zip);
      const sport = normalizeVenueSport(r?.sport);
      const venue_url = normalizeVenueUrl(r?.venue_url ?? r?.website ?? r?.url);
      const source_url = normalizeVenueUrl(r?.source_url);
      const organization = cleanNullable(r?.organization ?? r?.organizer ?? r?.association);
      const confidence = cleanNullable(r?.confidence);
      const notes = cleanNullable(r?.notes);
      const latitude = Number.isFinite(Number(r?.latitude)) ? Number(r.latitude) : null;
      const longitude = Number.isFinite(Number(r?.longitude)) ? Number(r.longitude) : null;
      return {
        row_number: idx + 1,
        venue_name,
        venue_address,
        city,
        state,
        zip,
        sport,
        venue_url,
        source_url,
        organization,
        confidence,
        notes,
        latitude,
        longitude,
        raw: r,
      };
    })
    .filter((r) => r.venue_name);

  const startedRun = (await supabaseAdmin
    .from("venue_import_runs" as any)
    .insert({
      created_by: args.createdBy,
      filename: args.filename ?? null,
      dry_run: args.dryRun,
      total_rows: rowsRaw.length,
      inserted: 0,
      skipped_existing: 0,
      needs_review: 0,
      invalid: 0,
      parse_errors: 0,
      summary: null,
    })
    .select("id")
    .single()) as any;

  if (startedRun?.error || !startedRun?.data?.id) {
    throw new Error(startedRun.error?.message ?? "run_create_failed");
  }

  const runId = String((startedRun.data as any).id);

  const cityKeys = Array.from(
    new Set(
      normalizedRows
        .map((r) => `${normalizeIdentityText(r.city || "")}|${normalizeIdentityText(r.state || "")}`)
        .filter((k) => !k.startsWith("|") && !k.endsWith("|"))
    )
  );

  const venuesByCityKey = new Map<string, VenueRow[]>();
  for (const key of cityKeys) {
    const [cityNorm, stateNorm] = key.split("|");
    const state = stateNorm.toUpperCase();
    const city = cityNorm;
    const resp = await supabaseAdmin
      .from("venues" as any)
      .select("id,name,address1,address,normalized_address,city,state,zip,venue_url,sport")
      .eq("state", state)
      .ilike("city", city)
      .limit(3000);
    if (resp.error) {
      throw new Error(`venues_fetch_failed: ${resp.error.message}`);
    }
    venuesByCityKey.set(key, (resp.data ?? []) as VenueRow[]);
  }

  let inserted = 0;
  let skipped_existing = 0;
  let needs_review = 0;
  let invalid = 0;
  let parse_errors = 0;

  const results: VenueImportRowResult[] = [];

  for (const row of normalizedRows) {
    const parsed = parseAddressBlob(row.venue_address);
    const street = cleanText(parsed?.street ?? row.venue_address);
    const city = cleanNullable(parsed?.city ?? row.city);
    const state = normalizeState(parsed?.state ?? row.state);
    const zip = cleanZip(parsed?.zip ?? row.zip);

    if (!row.venue_name) {
      invalid += 1;
      results.push({ ...row, city, state, zip, action: "invalid", reason: "missing_venue_name", raw: row.raw });
      continue;
    }

    if (!street || street.length < 6) {
      invalid += 1;
      results.push({ ...row, city, state, zip, action: "invalid", reason: "missing_venue_address", raw: row.raw });
      continue;
    }

    if (!city || !state) {
      invalid += 1;
      results.push({ ...row, city, state, zip, action: "invalid", reason: "missing_city_state", raw: row.raw });
      continue;
    }

    const cityKey = `${normalizeIdentityText(city)}|${normalizeIdentityText(state)}`;
    const candidates = venuesByCityKey.get(cityKey) ?? [];

    const targetNameNorm = normalizeIdentityText(row.venue_name);
    const targetStreetNorm = normalizeIdentityStreet(street);
    const strongKey = `${targetNameNorm}|${targetStreetNorm}|${normalizeIdentityText(city)}|${normalizeIdentityText(state)}`;

    const strongMatches = candidates.filter((v) => {
      const vName = normalizeIdentityText(v.name);
      const vAddr = normalizeIdentityStreet(venueCandidateAddress(v));
      const key = `${vName}|${vAddr}|${normalizeIdentityText(v.city)}|${normalizeIdentityText(v.state)}`;
      return key === strongKey;
    });

    if (strongMatches.length === 1) {
      skipped_existing += 1;
      results.push({
        ...row,
        city,
        state,
        zip,
        action: "skipped_existing",
        matched_venue_id: strongMatches[0].id,
        reason: "matched_name_and_address",
        raw: row.raw,
      });
      continue;
    }

    const nameCityStateKey = buildVenueNameCityStateFingerprint({
      name: row.venue_name,
      city,
      state,
    });
    const nameCityStateMatches = candidates.filter((v) => {
      const fp = buildVenueNameCityStateFingerprint({ name: v.name, city: v.city, state: v.state });
      return fp && fp === nameCityStateKey;
    });

    if (nameCityStateMatches.length === 1) {
      skipped_existing += 1;
      results.push({
        ...row,
        city,
        state,
        zip,
        action: "skipped_existing",
        matched_venue_id: nameCityStateMatches[0].id,
        reason: "matched_name_city_state",
        raw: row.raw,
      });
      continue;
    }
    if (nameCityStateMatches.length > 1) {
      needs_review += 1;
      results.push({
        ...row,
        city,
        state,
        zip,
        action: "needs_review",
        matched_venue_id: nameCityStateMatches[0]?.id ?? null,
        reason: `multiple_name_city_state_matches (${nameCityStateMatches.length})`,
        raw: row.raw,
      });
      continue;
    }

    const targetUrlHost = row.venue_url ? normalizeIdentityUrlHost(row.venue_url) : "";
    if (targetUrlHost) {
      const hostMatches = candidates.filter((v) => {
        const h = v.venue_url ? normalizeIdentityUrlHost(v.venue_url) : "";
        return h && h === targetUrlHost;
      });
      if (hostMatches.length === 1) {
        needs_review += 1;
        results.push({
          ...row,
          city,
          state,
          zip,
          action: "needs_review",
          matched_venue_id: hostMatches[0].id,
          reason: "matched_venue_url_host",
          raw: row.raw,
        });
        continue;
      }
    }

    const fuzzy = candidates.filter((v) => looksFuzzySimilarName(row.venue_name, v.name || "")).slice(0, 3);
    if (fuzzy.length) {
      needs_review += 1;
      results.push({
        ...row,
        city,
        state,
        zip,
        action: "needs_review",
        matched_venue_id: fuzzy[0].id,
        reason: "fuzzy_name_candidate",
        raw: row.raw,
      });
      continue;
    }

    if (args.dryRun) {
      results.push({ ...row, city, state, zip, action: "would_insert", reason: "no_match", raw: row.raw });
      continue;
    }

    const insertPayload: any = {
      name: row.venue_name,
      address: row.venue_address,
      address1: street || null,
      city,
      state,
      zip,
      sport: row.sport,
      venue_url: row.venue_url,
      latitude: row.latitude,
      longitude: row.longitude,
      normalized_address: normalizeIdentityStreet(street || row.venue_address || ""),
      notes: row.notes || null,
    };

    const insertRes = (await supabaseAdmin.from("venues" as any).insert(insertPayload).select("id").single()) as any;
    if (insertRes?.error || !insertRes?.data?.id) {
      parse_errors += 1;
      results.push({
        ...row,
        city,
        state,
        zip,
        action: "parse_error",
        reason: insertRes?.error?.message ?? "insert_failed",
        raw: row.raw,
      });
      continue;
    }

    inserted += 1;
    results.push({
      ...row,
      city,
      state,
      zip,
      action: "inserted",
      matched_venue_id: String((insertRes.data as any).id),
      reason: "inserted_new",
      raw: row.raw,
    });
  }

  const summary = `rows=${rowsRaw.length}; inserted=${inserted}; skipped_existing=${skipped_existing}; needs_review=${needs_review}; invalid=${invalid}; errors=${parse_errors}`;

  await supabaseAdmin
    .from("venue_import_runs" as any)
    .update({
      total_rows: rowsRaw.length,
      inserted,
      skipped_existing,
      needs_review,
      invalid,
      parse_errors,
      summary,
    })
    .eq("id", runId);

  const rowInserts = results.map((r) => ({
    run_id: runId,
    row_number: r.row_number,
    venue_name: r.venue_name,
    venue_address: r.venue_address,
    city: r.city,
    state: r.state,
    zip: r.zip,
    sport: r.sport,
    venue_url: r.venue_url,
    source_url: r.source_url,
    organization: r.organization,
    confidence: r.confidence,
    notes: r.notes,
    action: r.action,
    matched_venue_id: r.matched_venue_id ?? null,
    reason: r.reason ?? null,
    raw: r.raw ?? null,
  }));

  const CHUNK = 500;
  for (let i = 0; i < rowInserts.length; i += CHUNK) {
    const slice = rowInserts.slice(i, i + CHUNK);
    const resp = await supabaseAdmin.from("venue_import_run_rows" as any).insert(slice);
    if (resp.error) {
      // keep the run; row-level persistence failure shouldn't block the summary
      console.error("[venue-import] failed to persist rows", resp.error);
      break;
    }
  }

  return {
    ok: true,
    run_id: runId,
    dry_run: args.dryRun,
    total_rows: rowsRaw.length,
    inserted,
    skipped_existing,
    needs_review,
    invalid,
    parse_errors,
    summary,
  };
}
