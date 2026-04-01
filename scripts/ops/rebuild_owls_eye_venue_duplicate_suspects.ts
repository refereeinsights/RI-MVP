import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

type VenueRow = {
  id: string;
  name: string | null;
  address: string | null;
  address1?: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  latitude: number | null;
  longitude: number | null;
};

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

function loadEnvLocalIfMissing() {
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) return;
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  const parsed = parseDotenv(fs.readFileSync(envPath, "utf8"));
  for (const [k, v] of Object.entries(parsed)) {
    if (!process.env[k]) process.env[k] = v;
  }
}

function argValue(name: string) {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : null;
}

function clean(value: unknown) {
  const v = String(value ?? "").replace(/\s+/g, " ").trim();
  return v.length ? v : null;
}

function toInt(value: string | null, fallback: number) {
  const n = value ? Number.parseInt(value, 10) : Number.NaN;
  return Number.isFinite(n) ? n : fallback;
}

function collapseSpaces(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeText(value: string | null | undefined) {
  return collapseSpaces(String(value ?? "").toLowerCase().replace(/[^a-z0-9\s]/g, " "));
}

function normalizeStreet(value: string | null | undefined) {
  return collapseSpaces(
    String(value ?? "")
      .toLowerCase()
      .replace(/#\s*[a-z0-9-]+\b/g, " ")
      .replace(/\b(apt|apartment|suite|ste|unit|fl|floor)\s*[a-z0-9-]+\b/g, " ")
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+#\s*[a-z0-9-]+\b/g, " ")
      .replace(/\b(street|st)\b/g, "st")
      .replace(/\b(avenue|ave)\b/g, "ave")
      .replace(/\b(road|rd)\b/g, "rd")
      .replace(/\b(boulevard|blvd)\b/g, "blvd")
      .replace(/\b(drive|dr)\b/g, "dr")
      .replace(/\b(lane|ln)\b/g, "ln")
      .replace(/\b(court|ct)\b/g, "ct")
      .replace(/\b(place|pl)\b/g, "pl")
      .replace(/\b(parkway|pkwy)\b/g, "pkwy")
  );
}

function extractStreetNumber(street: string | null | undefined) {
  const raw = String(street ?? "").trim();
  const m = raw.match(/^\s*(\d{1,6})\b/);
  return m?.[1] ?? null;
}

function pickStreetAddress(row: { address?: string | null; address1?: string | null } | null | undefined) {
  const addr1 = String(row?.address1 ?? "").trim();
  if (addr1) return addr1;
  const addr = String(row?.address ?? "").trim();
  if (addr) return addr;
  return null;
}

function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const x = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.sin(dLng / 2) * Math.sin(dLng / 2) * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(x));
}

async function findDuplicateVenueCandidates(args: {
  supabase: ReturnType<typeof createClient>;
  venueId: string;
  venue: VenueRow;
  venueLat: number | null;
  venueLng: number | null;
  minScore: number;
  maxCandidates: number;
}) {
  const venueName = normalizeText(args.venue.name);
  const venueStreetRaw = pickStreetAddress(args.venue) || null;
  const venueStreetSearch = normalizeText(venueStreetRaw);
  const venueStreet = normalizeStreet(venueStreetRaw);
  const venueCity = normalizeText(args.venue.city);
  const venueState = normalizeText(args.venue.state);
  const venueStreetNumber = extractStreetNumber(venueStreetRaw);

  const candidateMap = new Map<string, VenueRow>();
  const seedName = venueName.split(" ").filter(Boolean).slice(0, 2).join(" ");
  const seedStreet = venueStreetSearch.split(" ").filter(Boolean).slice(0, 3).join(" ");
  const rawState = String(args.venue.state ?? "").trim();

  if (rawState) {
    if (seedName.length >= 3) {
      const { data } = await args.supabase
        .from("venues" as any)
        .select("id,name,address,address1,city,state,zip,latitude,longitude")
        .eq("state", rawState)
        .ilike("name", `%${seedName}%`)
        .limit(80);
      for (const row of (data ?? []) as any[]) candidateMap.set(String(row.id), row as VenueRow);
    }
    if (seedStreet.length >= 3) {
      const { data } = await args.supabase
        .from("venues" as any)
        .select("id,name,address,address1,city,state,zip,latitude,longitude")
        .eq("state", rawState)
        .or(`address.ilike.%${seedStreet}%,address1.ilike.%${seedStreet}%`)
        .limit(80);
      for (const row of (data ?? []) as any[]) candidateMap.set(String(row.id), row as VenueRow);
    }
  }

  candidateMap.delete(args.venueId);

  const scored = Array.from(candidateMap.values())
    .map((row) => {
      const rowName = normalizeText(row.name);
      const rowStreetRaw = pickStreetAddress(row) || null;
      const rowStreet = normalizeStreet(rowStreetRaw);
      const rowCity = normalizeText(row.city);
      const rowState = normalizeText(row.state);
      const rowStreetNumber = extractStreetNumber(rowStreetRaw);

      let score = 0;
      const nameExact = Boolean(venueName && rowName && venueName === rowName);
      const cityExact = Boolean(venueCity && rowCity && venueCity === rowCity);
      const stateExact = Boolean(venueState && rowState && venueState === rowState);
      const streetExact = Boolean(venueStreet && rowStreet && venueStreet === rowStreet);
      const streetContains = Boolean(venueStreet && rowStreet && (venueStreet.includes(rowStreet) || rowStreet.includes(venueStreet)));
      let gotDistanceBonus = false;

      if (nameExact) score += 50;
      else if (venueName && rowName && (venueName.includes(rowName) || rowName.includes(venueName))) score += 30;

      if (streetExact) score += 45;
      else if (streetContains) score += 25;

      if (venueStreetNumber && rowStreetNumber && venueStreetNumber === rowStreetNumber) score += 15;
      if (cityExact) score += 10;
      if (stateExact) score += 10;

      const rowLat = typeof row.latitude === "number" && Number.isFinite(row.latitude) ? row.latitude : null;
      const rowLng = typeof row.longitude === "number" && Number.isFinite(row.longitude) ? row.longitude : null;
      if (args.venueLat != null && args.venueLng != null && rowLat != null && rowLng != null) {
        const meters = haversineMeters({ lat: args.venueLat, lng: args.venueLng }, { lat: rowLat, lng: rowLng });
        if (meters <= 120) {
          score += 40;
          gotDistanceBonus = true;
        } else if (meters <= 300) {
          score += 25;
          gotDistanceBonus = true;
        }
      }

      if (nameExact && stateExact && !cityExact && !streetExact && !streetContains && !gotDistanceBonus) {
        score = 0;
      }

      return { row, score };
    })
    .filter((item) => item.score >= args.minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, args.maxCandidates);

  if (!scored.length) return [];

  return scored;
}

async function main() {
  loadEnvLocalIfMissing();

  const APPLY = process.argv.includes("--apply");
  const resetOpen = process.argv.includes("--reset_open");
  const limit = toInt(argValue("limit"), 500);
  const offset = toInt(argValue("offset"), 0);
  const minScore = toInt(argValue("min_score"), 60);
  const maxCandidates = toInt(argValue("max_candidates"), 8);
  const stateFilter = clean(argValue("state"));

  const supabaseUrl = clean(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const serviceRoleKey = clean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (set env vars or .env.local)");
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

  // Some environments created `owls_eye_venue_duplicate_suspects` without an `updated_at` column,
  // but still attached the `set_updated_at()` trigger. That breaks UPDATEs (INSERTs still work).
  // Detect this and skip updates so we can still (re)populate suspects safely.
  let allowUpdates = true;
  try {
    const probe = await supabase.from("owls_eye_venue_duplicate_suspects" as any).select("updated_at").limit(1);
    if (probe.error && (probe.error.code === "42703" || probe.error.code === "PGRST204")) {
      allowUpdates = false;
      console.warn("[rebuild] owls_eye_venue_duplicate_suspects missing updated_at; skipping updates (inserts only)");
    }
  } catch {
    allowUpdates = true;
  }

  if (resetOpen && APPLY) {
    console.log("[rebuild] deleting existing open suspects...");
    const resp = await supabase.from("owls_eye_venue_duplicate_suspects" as any).delete().eq("status", "open");
    if (resp.error) throw new Error(`reset_open_failed:${resp.error.message}`);
  } else if (resetOpen) {
    console.log("[dry-run] would delete existing open suspects (pass --apply to execute)");
  }

  let q = supabase
    .from("venues" as any)
    .select("id,name,address,address1,city,state,zip,latitude,longitude")
    .order("id", { ascending: true })
    .range(offset, offset + limit - 1);
  if (stateFilter) q = q.eq("state", stateFilter);

  const { data: venuesRaw, error } = await q;
  if (error) throw new Error(`venues_fetch_failed:${error.message}`);
  const venues = (venuesRaw ?? []) as any[];

  console.log(`[rebuild] venues=${venues.length} offset=${offset} limit=${limit} apply=${APPLY ? "yes" : "no"}`);

  let scanned = 0;
  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  const now = new Date().toISOString();

  for (const v of venues) {
    scanned += 1;
    const venueId = String(v?.id ?? "").trim();
    const state = String(v?.state ?? "").trim();
    if (!venueId || !state) {
      skipped += 1;
      continue;
    }

    const venue: VenueRow = {
      id: venueId,
      name: v?.name ?? null,
      address: v?.address ?? null,
      address1: v?.address1 ?? null,
      city: v?.city ?? null,
      state: v?.state ?? null,
      zip: v?.zip ?? null,
      latitude: typeof v?.latitude === "number" ? v.latitude : null,
      longitude: typeof v?.longitude === "number" ? v.longitude : null,
    };

    const scored = await findDuplicateVenueCandidates({
      supabase,
      venueId,
      venue,
      venueLat: venue.latitude,
      venueLng: venue.longitude,
      minScore,
      maxCandidates,
    });
    if (!scored.length) continue;

    const candidateIds = scored.map((s) => String(s.row.id)).filter(Boolean);
    const existingResp = await supabase
      .from("owls_eye_venue_duplicate_suspects" as any)
      .select("candidate_venue_id,status")
      .eq("source_venue_id", venueId)
      .in("candidate_venue_id", candidateIds)
      .limit(100);
    if (existingResp.error) throw new Error(`existing_lookup_failed:${existingResp.error.message}`);

    const existingRows = (existingResp.data ?? []) as Array<{ candidate_venue_id: string | null; status: string | null }>;
    const statusByCandidate = new Map(
      existingRows
        .filter((r) => r?.candidate_venue_id)
        .map((r) => [String(r.candidate_venue_id), String(r.status ?? "open")])
    );

    for (const item of scored) {
      const candidateVenueId = String(item.row.id ?? "").trim();
      if (!candidateVenueId) continue;
      const status = statusByCandidate.get(candidateVenueId);
      if (status && status !== "open") continue;

      const payload = {
        source_venue_id: venueId,
        candidate_venue_id: candidateVenueId,
        score: Math.round(Number(item.score ?? 0) || 0),
        status: "open",
        last_seen_at: now,
      } as any;

      if (!APPLY) {
        if (!status) inserted += 1;
        else updated += 1;
        continue;
      }

      if (!status) {
        const ins = await supabase.from("owls_eye_venue_duplicate_suspects" as any).insert({
          ...payload,
          first_seen_at: now,
          created_by: null,
        });
        if (ins.error) throw new Error(`insert_failed:${ins.error.message}`);
        inserted += 1;
      } else {
        if (!allowUpdates) {
          // Leave existing open suspects as-is (score/last_seen_at may be stale).
          updated += 1;
          continue;
        }
        const upd = await supabase
          .from("owls_eye_venue_duplicate_suspects" as any)
          .update({ score: payload.score, last_seen_at: now })
          .eq("source_venue_id", venueId)
          .eq("candidate_venue_id", candidateVenueId)
          .eq("status", "open");
        if (upd.error) {
          // If the env has the broken updated_at trigger, disable updates and continue inserts.
          if (upd.error.message.includes("updated_at")) {
            allowUpdates = false;
            console.warn("[rebuild] update failed due to missing updated_at; switching to inserts-only mode");
            updated += 1;
            continue;
          }
          throw new Error(`update_failed:${upd.error.message}`);
        }
        updated += 1;
      }
    }
  }

  console.log(
    JSON.stringify(
      {
        scanned,
        skipped,
        would_insert: APPLY ? undefined : inserted,
        would_update: APPLY ? undefined : updated,
        inserted: APPLY ? inserted : undefined,
        updated: APPLY ? updated : undefined,
      },
      null,
      2
    )
  );
  console.log("[rebuild] done");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
