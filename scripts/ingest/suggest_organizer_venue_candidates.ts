import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config();

type MissingTournamentRow = {
  id: string;
};

type TournamentRow = {
  id: string;
  name: string | null;
  state: string | null;
  city: string | null;
  start_date: string | null;
  end_date: string | null;
  tournament_association?: string | null;
  source_domain?: string | null;
  official_website_url?: string | null;
  source_url?: string | null;
};

type VenueRow = {
  id: string;
  name: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  venue_url: string | null;
};

type TournamentVenueLinkRow = {
  tournament_id: string;
  venue_id: string;
  created_at: string | null;
  venues?: VenueRow | null;
};

type OrganizerSpec =
  | { kind: "association"; value: string }
  | { kind: "domain"; value: string }
  | { kind: "unknown" };

const APPLY = process.argv.includes("--apply");
const LIMIT = Number(argValue("limit") ?? "200");
const OFFSET = Number(argValue("offset") ?? "0");
const MAX_PER_TOURNAMENT = Math.max(1, Math.min(10, Number(argValue("max-per-tournament") ?? "5")));
const MIN_EVIDENCE = Math.max(1, Number(argValue("min-evidence") ?? "2"));
const REPORT_PATH = clean(argValue("out")) ?? defaultReportPath();

function defaultReportPath() {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const downloadsDir = path.join(os.homedir(), "Downloads");
  return path.join(downloadsDir, `organizer_venue_candidates_${stamp}.csv`);
}

function argValue(name: string) {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : null;
}

function requireEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name}.`);
  return v;
}

function clean(value: string | null | undefined) {
  const v = String(value ?? "").replace(/\s+/g, " ").trim();
  return v.length ? v : null;
}

function normalizeAddressForBlocklist(value: string | null | undefined) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isBlockedOrganizerAddress(value: string | null | undefined) {
  const normalized = normalizeAddressForBlocklist(value);
  if (!normalized) return false;
  // Organizer mailing address that sometimes gets misclassified as a venue.
  return normalized.includes("1529") && (normalized.includes("3rd") || normalized.includes("third")) && normalized.includes("32250");
}

function normalizeState(value: string | null | undefined) {
  const v = clean(value);
  return v ? v.toUpperCase() : null;
}

function normalizeDomain(value: string | null | undefined) {
  const v = clean(value);
  if (!v) return null;
  return v.replace(/^https?:\/\//i, "").replace(/^www\./i, "").split("/")[0].trim().toLowerCase() || null;
}

function domainFromUrl(url: string | null | undefined) {
  const v = clean(url);
  if (!v) return null;
  try {
    const host = new URL(v).host.replace(/^www\./, "").toLowerCase();
    return host || null;
  } catch {
    return normalizeDomain(v);
  }
}

function buildOrganizerSpec(t: TournamentRow): OrganizerSpec {
  const assoc = clean(t.tournament_association);
  if (assoc) return { kind: "association", value: assoc.toUpperCase() };
  const domain = normalizeDomain(t.source_domain) ?? domainFromUrl(t.official_website_url) ?? domainFromUrl(t.source_url);
  if (domain) return { kind: "domain", value: domain };
  return { kind: "unknown" };
}

function formatVenueAddressText(v: VenueRow) {
  return [clean(v.address), clean(v.city), normalizeState(v.state), clean(v.zip)].filter(Boolean).join(", ");
}

function csvCell(value: string | number | null | undefined) {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function clamp01(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function scoreConfidence(args: { evidenceCount: number; sameState: boolean; sameCity: boolean; recencyDays: number | null }) {
  const base = 0.45 + Math.log2(Math.max(1, args.evidenceCount) + 1) * 0.08;
  const locality = (args.sameState ? 0.12 : 0) + (args.sameCity ? 0.06 : 0);
  const recency = args.recencyDays != null ? (args.recencyDays <= 365 ? 0.06 : args.recencyDays <= 730 ? 0.03 : 0) : 0;
  return clamp01(base + locality + recency);
}

function daysSince(iso: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

async function main() {
  if (!Number.isFinite(LIMIT) || LIMIT <= 0) throw new Error("Invalid --limit");
  if (!Number.isFinite(OFFSET) || OFFSET < 0) throw new Error("Invalid --offset");

  const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(
    REPORT_PATH,
    [
      "tournament_id",
      "tournament_name",
      "organizer_kind",
      "organizer_value",
      "venue_id",
      "venue_name",
      "venue_address_text",
      "evidence_count",
      "confidence",
      "action",
      "note",
    ].join(",") + "\n",
    "utf8"
  );

  const { data: missingRows, error: missingErr } = await supabase
    .rpc("list_missing_venue_link_tournaments" as any, {
      p_limit: LIMIT,
      p_offset: OFFSET,
      p_state: null,
      p_q: null,
    })
    .select("id");

  if (missingErr) throw missingErr;
  const missingIds = ((missingRows as MissingTournamentRow[] | null) ?? []).map((r) => r.id).filter(Boolean);
  if (missingIds.length === 0) {
    console.log("[organizer_candidates] no missing tournaments found in this window");
    console.log(`[organizer_candidates] report=${REPORT_PATH}`);
    return;
  }

  const { data: tournamentsRaw, error: tErr } = await supabase
    .from("tournaments" as any)
    .select("id,name,state,city,start_date,end_date,tournament_association,source_domain,official_website_url,source_url")
    .in("id", missingIds);
  if (tErr) throw tErr;

  const tournaments = ((tournamentsRaw as TournamentRow[] | null) ?? []).filter((t) => Boolean(t?.id));
  const byId = new Map(tournaments.map((t) => [t.id, t]));

  const organizerByTournament = new Map<string, OrganizerSpec>();
  const organizerKeySet = new Set<string>();
  for (const id of missingIds) {
    const t = byId.get(id);
    if (!t) continue;
    const spec = buildOrganizerSpec(t);
    organizerByTournament.set(id, spec);
    if (spec.kind !== "unknown") organizerKeySet.add(`${spec.kind}:${spec.value}`);
  }

  const organizerLinksCache = new Map<string, TournamentVenueLinkRow[]>();
  const fetchOrganizerLinks = async (spec: OrganizerSpec): Promise<TournamentVenueLinkRow[]> => {
    if (spec.kind === "unknown") return [];
    const cacheKey = `${spec.kind}:${spec.value}`;
    const existing = organizerLinksCache.get(cacheKey);
    if (existing) return existing;

    const select =
      "tournament_id,venue_id,created_at,venues(id,name,address,city,state,zip,venue_url),tournaments!inner(id,status,is_canonical,tournament_association,source_domain)";
    let query = supabase
      .from("tournament_venues" as any)
      .select(select)
      .limit(5000);

    if (spec.kind === "association") {
      query = query.ilike("tournaments.tournament_association", spec.value);
    } else {
      // Prefer explicit column if available; otherwise this will error with "column not found" and we fall back to none.
      query = query.eq("tournaments.source_domain", spec.value);
    }

    // Restrict to published + canonical evidence to reduce noise.
    query = query.eq("tournaments.status", "published").eq("tournaments.is_canonical", true);

    const { data, error } = await query;
    if (error) {
      // If domain column isn't present, treat as no evidence rather than failing.
      const msg = String((error as any)?.message ?? "");
      if (spec.kind === "domain" && msg.toLowerCase().includes("source_domain")) {
        organizerLinksCache.set(cacheKey, []);
        return [];
      }
      throw error;
    }

    const rows = ((data as TournamentVenueLinkRow[] | null) ?? []).filter((r) => Boolean(r?.tournament_id && r?.venue_id));
    organizerLinksCache.set(cacheKey, rows);
    return rows;
  };

  let inserted = 0;
  let skippedNoOrganizer = 0;
  let skippedNoEvidence = 0;
  let skippedLowEvidence = 0;
  let skippedBlockedAddress = 0;
  let skippedInsertDuplicate = 0;

  for (const tournamentId of missingIds) {
    const t = byId.get(tournamentId);
    if (!t) continue;
    const spec = organizerByTournament.get(tournamentId) ?? { kind: "unknown" as const };
    if (spec.kind === "unknown") {
      skippedNoOrganizer += 1;
      fs.appendFileSync(
        REPORT_PATH,
        [tournamentId, t.name ?? "", "unknown", "", "", "", "", "", "", "skipped", "no_organizer_key"].map(csvCell).join(",") + "\n"
      );
      continue;
    }

    const evidenceLinks = await fetchOrganizerLinks(spec);
    if (evidenceLinks.length === 0) {
      skippedNoEvidence += 1;
      fs.appendFileSync(
        REPORT_PATH,
        [tournamentId, t.name ?? "", spec.kind, spec.value, "", "", "", "", "", "skipped", "no_evidence_links"].map(csvCell).join(",") + "\n"
      );
      continue;
    }

    const venueAgg = new Map<
      string,
      { venue: VenueRow; tournamentIds: Set<string>; lastLinkedAt: string | null; evidenceCount: number }
    >();
    for (const link of evidenceLinks) {
      const v = link.venues;
      if (!v?.id) continue;
      const entry =
        venueAgg.get(v.id) ?? { venue: v, tournamentIds: new Set<string>(), lastLinkedAt: null, evidenceCount: 0 };
      entry.tournamentIds.add(link.tournament_id);
      entry.evidenceCount = entry.tournamentIds.size;
      if (link.created_at && (!entry.lastLinkedAt || link.created_at > entry.lastLinkedAt)) {
        entry.lastLinkedAt = link.created_at;
      }
      venueAgg.set(v.id, entry);
    }

    const venueCandidates = Array.from(venueAgg.values())
      .filter((entry) => entry.evidenceCount >= MIN_EVIDENCE)
      .map((entry) => {
        const venue = entry.venue;
        const sameState = normalizeState(venue.state) && normalizeState(t.state) ? normalizeState(venue.state) === normalizeState(t.state) : false;
        const sameCity = clean(venue.city) && clean(t.city) ? clean(venue.city)!.toLowerCase() === clean(t.city)!.toLowerCase() : false;
        const recencyDays = daysSince(entry.lastLinkedAt);
        const confidence = scoreConfidence({ evidenceCount: entry.evidenceCount, sameState, sameCity, recencyDays });
        return { ...entry, sameState, sameCity, confidence };
      })
      .sort((a, b) => {
        if (a.sameState !== b.sameState) return a.sameState ? -1 : 1;
        if (a.sameCity !== b.sameCity) return a.sameCity ? -1 : 1;
        if (a.evidenceCount !== b.evidenceCount) return b.evidenceCount - a.evidenceCount;
        const aLast = a.lastLinkedAt ?? "";
        const bLast = b.lastLinkedAt ?? "";
        if (aLast !== bLast) return bLast.localeCompare(aLast);
        return (a.venue.name ?? "").localeCompare(b.venue.name ?? "");
      })
      .slice(0, MAX_PER_TOURNAMENT);

    if (venueCandidates.length === 0) {
      skippedLowEvidence += 1;
      fs.appendFileSync(
        REPORT_PATH,
        [tournamentId, t.name ?? "", spec.kind, spec.value, "", "", "", "", "", "skipped", `no_candidates_min_evidence_${MIN_EVIDENCE}`]
          .map(csvCell)
          .join(",") + "\n"
      );
      continue;
    }

    const sourceUrl = `organizer_pattern:${spec.kind}:${spec.value}`;

    for (const candidate of venueCandidates) {
      const v = candidate.venue;
      if (!clean(v.name)) continue;
      const venueAddressText = formatVenueAddressText(v);
      if (isBlockedOrganizerAddress(venueAddressText)) {
        skippedBlockedAddress += 1;
        fs.appendFileSync(
          REPORT_PATH,
          [
            tournamentId,
            t.name ?? "",
            spec.kind,
            spec.value,
            v.id,
            v.name ?? "",
            venueAddressText,
            candidate.evidenceCount,
            candidate.confidence.toFixed(3),
            "skipped",
            "blocked_organizer_address",
          ]
            .map(csvCell)
            .join(",") + "\n"
        );
        continue;
      }
      const evidenceText = [
        `Organizer ${spec.kind}: ${spec.value}`,
        `Seen in ${candidate.evidenceCount} linked tournaments`,
        candidate.lastLinkedAt ? `last linked ${candidate.lastLinkedAt.slice(0, 10)}` : null,
        candidate.sameState ? "same state" : null,
        candidate.sameCity ? "same city" : null,
      ]
        .filter(Boolean)
        .join("; ");

      if (APPLY) {
        const insertRes = await supabase.from("tournament_venue_candidates" as any).insert({
          tournament_id: tournamentId,
          venue_name: v.name,
          address_text: venueAddressText || null,
          venue_url: v.venue_url,
          source_url: sourceUrl,
          evidence_text: evidenceText,
          confidence: candidate.confidence,
        });
        if (insertRes.error) {
          const msg = String((insertRes.error as any)?.message ?? "");
          if (msg.includes("duplicate") || msg.includes("tournament_venue_candidates_dedupe_idx")) {
            skippedInsertDuplicate += 1;
            fs.appendFileSync(
              REPORT_PATH,
              [
                tournamentId,
                t.name ?? "",
                spec.kind,
                spec.value,
                v.id,
                v.name ?? "",
                venueAddressText,
                candidate.evidenceCount,
                candidate.confidence.toFixed(3),
                "skipped",
                "duplicate_candidate",
              ]
                .map(csvCell)
                .join(",") + "\n"
            );
            continue;
          }
          throw insertRes.error;
        }
        inserted += 1;
      }

      fs.appendFileSync(
        REPORT_PATH,
        [
          tournamentId,
          t.name ?? "",
          spec.kind,
          spec.value,
          v.id,
          v.name ?? "",
          venueAddressText,
          candidate.evidenceCount,
          candidate.confidence.toFixed(3),
          APPLY ? "inserted" : "dry_run",
          "",
        ]
          .map(csvCell)
          .join(",") + "\n"
      );
    }
  }

  console.log(`[organizer_candidates] report=${REPORT_PATH}`);
  console.log(
    `[organizer_candidates] apply=${APPLY} tournaments=${missingIds.length} inserted=${inserted} skipped_no_organizer=${skippedNoOrganizer} skipped_no_evidence=${skippedNoEvidence} skipped_low_evidence=${skippedLowEvidence} skipped_blocked_address=${skippedBlockedAddress} skipped_duplicate=${skippedInsertDuplicate}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
