"use server";

import crypto from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { parseCsv } from "@/lib/tournaments/importUtils";
import { buildTournamentSlug } from "@/lib/tournaments/slug";
import { findVenueMatch, type VenueMatchInput } from "@/lib/tournaments/venueNormalization";
import type { Database, RollForwardStatus, TournamentRollForwardLogInsert, TournamentRollForwardLogRow } from "@/lib/types/supabase";
import type { TournamentSource } from "@/lib/types/tournament";

type RollForwardMode = "dry_run" | "apply";

type ParentTournamentRow = {
  id: string;
  name: string;
  slug: string;
  sport: string | null;
  level: string | null;
  state: string | null;
  city: string | null;
  venue: string | null;
  address: string | null;
  zip: string | null;
  start_date: string | null;
  end_date: string | null;
  summary: string | null;
  source: TournamentSource | null;
  source_url: string | null;
  source_domain: string | null;
  tournament_director: string | null;
  tournament_director_email: string | null;
  referee_contact: string | null;
  referee_contact_email: string | null;
  sub_type: string | null;
  ref_cash_tournament: boolean | null;
};

type RollForwardRowAction =
  | "would_create"
  | "created"
  | "already_exists"
  | "pending"
  | "no_dates_announced"
  | "discontinued"
  | "ambiguous"
  | "ambiguous_parent"
  | "missing_parent"
  | "invalid";

type RollForwardRowResult = {
  rowNumber: number;
  action: RollForwardRowAction;
  reason?: string;
  existingTournamentId: string | null;
  existingSlug: string | null;
  parentTournamentId: string | null;
  parentSlug: string | null;
  targetSlug: string | null;
  targetYear: number | null;
  copiedVenueLinks: number;
  createdTournamentId?: string | null;
};

type RollForwardSummary = {
  parsed: number;
  wouldCreate: number;
  created: number;
  alreadyExists: number;
  pending: number;
  noDatesAnnounced: number;
  discontinued: number;
  ambiguous: number;
  missingParent: number;
  invalid: number;
};

type RollForwardOptions = {
  mode: RollForwardMode;
  defaultSource: TournamentSource;
  fallbackSport?: string | null;
};

type NormalizedRollForwardRow = {
  rowNumber: number;
  existingTournamentId: string | null;
  existingSlug: string | null;
  targetYear: number | null;
  batchLabel: string | null;
  rollForwardStatus: RollForwardStatus | null;
  name: string | null;
  sport: string | null;
  level: string | null;
  venue: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  startDate: string | null;
  endDate: string | null;
  sourceUrl: string | null;
  notes: string | null;
  tournamentDirector: string | null;
  tournamentDirectorEmail: string | null;
  refereeContact: string | null;
  refereeContactEmail: string | null;
  raw: Record<string, string>;
};

type RollForwardResult = {
  summary: RollForwardSummary;
  results: RollForwardRowResult[];
  notice: string;
};

type AdminSupabase = SupabaseClient<Database>;

const ROLL_FORWARD_STATUSES: RollForwardStatus[] = [
  "pending",
  "no_dates_announced",
  "discontinued",
  "done",
  "ambiguous",
];

function normalizeKey(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_");
}

function getValue(row: Record<string, string>, ...keys: string[]) {
  const entries = new Map<string, string>();
  for (const [key, value] of Object.entries(row)) {
    entries.set(normalizeKey(key), String(value ?? "").trim());
  }
  for (const key of keys) {
    const value = entries.get(normalizeKey(key));
    if (value) return value;
  }
  return "";
}

function cleanNullable(value: string | null | undefined) {
  const clean = String(value ?? "").trim();
  return clean ? clean : null;
}

function normalizeState(value: string | null | undefined) {
  const clean = cleanNullable(value);
  return clean ? clean.toUpperCase() : null;
}

function normalizeDate(value: string | null | undefined) {
  const clean = cleanNullable(value);
  if (!clean) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) return clean;
  const parsed = new Date(clean);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function normalizeInteger(value: string | null | undefined) {
  const clean = cleanNullable(value);
  if (!clean) return null;
  const num = Number(clean);
  return Number.isInteger(num) ? num : null;
}

function normalizeRollForwardStatus(value: string | null | undefined) {
  const clean = cleanNullable(value)?.toLowerCase() as RollForwardStatus | undefined;
  if (!clean) return null;
  return ROLL_FORWARD_STATUSES.includes(clean) ? clean : null;
}

function buildSeriesSlug(name: string, city: string | null, state: string | null, year: number) {
  const baseSlug = buildTournamentSlug({ name, city, state });
  return baseSlug ? `${baseSlug}-${year}` : null;
}

function deriveSourceDomain(url: string | null) {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function hasCompleteVenuePayload(row: NormalizedRollForwardRow) {
  return Boolean(row.venue && row.address && row.city && row.state && row.zip);
}

function parseRows(csvText: string) {
  const parsed = parseCsv(csvText);
  return parsed.rows.map<NormalizedRollForwardRow>((row, index) => ({
    rowNumber: index + 2,
    existingTournamentId: cleanNullable(
      getValue(row, "existing_tournament_id", "parent_tournament_id", "tournament_id")
    ),
    existingSlug: cleanNullable(getValue(row, "existing_slug", "parent_slug")),
    targetYear: normalizeInteger(getValue(row, "target_year")),
    batchLabel: cleanNullable(getValue(row, "batch_label", "batch", "research_batch")),
    rollForwardStatus: normalizeRollForwardStatus(getValue(row, "roll_forward_status")),
    name: cleanNullable(getValue(row, "name", "tournament_name")),
    sport: cleanNullable(getValue(row, "sport", "tournament_sport")),
    level: cleanNullable(getValue(row, "level")),
    venue: cleanNullable(getValue(row, "venue", "venue_name")),
    address: cleanNullable(getValue(row, "address", "venue_address", "street")),
    city: cleanNullable(getValue(row, "city")),
    state: normalizeState(getValue(row, "state")),
    zip: cleanNullable(getValue(row, "zip", "postal_code")),
    startDate: normalizeDate(getValue(row, "start_date")),
    endDate: normalizeDate(getValue(row, "end_date")),
    sourceUrl: cleanNullable(getValue(row, "source_url", "official_website_url", "url")),
    notes: cleanNullable(getValue(row, "notes", "summary", "description")),
    tournamentDirector: cleanNullable(getValue(row, "tournament_director", "director")),
    tournamentDirectorEmail: cleanNullable(
      getValue(row, "tournament_director_email", "director_email")
    ),
    refereeContact: cleanNullable(getValue(row, "referee_contact", "contact_name")),
    refereeContactEmail: cleanNullable(getValue(row, "referee_contact_email", "contact_email")),
    raw: row,
  }));
}

async function loadParentById(supabase: AdminSupabase, tournamentId: string) {
  const { data, error } = await supabase
    .from("tournaments" as any)
    .select(
      "id,name,slug,sport,level,state,city,venue,address,zip,start_date,end_date,summary,source,source_url,source_domain,tournament_director,tournament_director_email,referee_contact,referee_contact_email,sub_type,ref_cash_tournament"
    )
    .eq("id", tournamentId)
    .maybeSingle();
  if (error) throw new Error(error.message || "failed_load_parent_by_id");
  return (data as ParentTournamentRow | null) ?? null;
}

async function loadParentBySlug(supabase: AdminSupabase, slug: string) {
  const { data, error } = await supabase
    .from("tournaments" as any)
    .select(
      "id,name,slug,sport,level,state,city,venue,address,zip,start_date,end_date,summary,source,source_url,source_domain,tournament_director,tournament_director_email,referee_contact,referee_contact_email,sub_type,ref_cash_tournament"
    )
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw new Error(error.message || "failed_load_parent_by_slug");
  return (data as ParentTournamentRow | null) ?? null;
}

function stripYearSuffix(slug: string) {
  return slug.replace(/-\d{4}$/, "");
}

async function findFallbackParent(supabase: AdminSupabase, row: NormalizedRollForwardRow, targetYear: number) {
  const effectiveName = row.name;
  const effectiveState = row.state;
  const effectiveSport = row.sport;
  if (!effectiveName || !effectiveState || !effectiveSport) return { parent: null, ambiguous: false };

  const baseSlug = buildTournamentSlug({ name: effectiveName, city: row.city, state: effectiveState });
  if (!baseSlug) return { parent: null, ambiguous: false };

  let query = supabase
    .from("tournaments" as any)
    .select(
      "id,name,slug,sport,level,state,city,venue,address,zip,start_date,end_date,summary,source,source_url,source_domain,tournament_director,tournament_director_email,referee_contact,referee_contact_email,sub_type,ref_cash_tournament"
    )
    .eq("sport", effectiveSport)
    .eq("state", effectiveState)
    .lt("start_date", `${targetYear}-01-01`)
    .order("start_date", { ascending: false })
    .limit(12);

  if (row.city) query = query.eq("city", row.city);

  const { data, error } = await query;
  if (error) throw new Error(error.message || "failed_lookup_fallback_parent");

  const candidates = ((data as ParentTournamentRow[] | null) ?? []).filter((candidate) => {
    if (!candidate.slug) return false;
    const candidateBase = stripYearSuffix(candidate.slug);
    return candidateBase === baseSlug || candidate.slug === baseSlug;
  });

  if (!candidates.length) return { parent: null, ambiguous: false };
  if (candidates.length === 1) return { parent: candidates[0], ambiguous: false };

  const top = candidates[0];
  const second = candidates[1];
  if (top?.start_date && second?.start_date && top.start_date !== second.start_date) {
    return { parent: top, ambiguous: false };
  }

  return { parent: null, ambiguous: true };
}

async function findExistingSibling(
  supabase: AdminSupabase,
  targetSlug: string,
  row: NormalizedRollForwardRow,
  effectiveSport: string,
  effectiveState: string | null
) {
  const bySlug = await supabase
    .from("tournaments" as any)
    .select("id,slug")
    .eq("slug", targetSlug)
    .maybeSingle();
  if (bySlug.error) throw new Error(bySlug.error.message || "failed_lookup_existing_sibling");
  if (bySlug.data) return bySlug.data as { id: string; slug: string };

  if (!row.name || !row.startDate) return null;

  let query = supabase
    .from("tournaments" as any)
    .select("id,slug")
    .eq("name", row.name)
    .eq("sport", effectiveSport)
    .eq("start_date", row.startDate)
    .limit(1);
  if (effectiveState) query = query.eq("state", effectiveState);
  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(error.message || "failed_lookup_existing_sibling_secondary");
  return (data as { id: string; slug: string } | null) ?? null;
}

async function copyVenueLinks(supabase: AdminSupabase, parentTournamentId: string, childTournamentId: string) {
  const { data, error } = await supabase
    .from("tournament_venues" as any)
    .select("venue_id,is_primary,is_inferred")
    .eq("tournament_id", parentTournamentId);
  if (error) throw new Error(error.message || "failed_load_parent_venues");
  const links =
    (data as Array<{ venue_id: string; is_primary: boolean | null; is_inferred: boolean | null }> | null) ?? [];
  if (!links.length) return 0;

  const payload = links.map((link) => ({
    tournament_id: childTournamentId,
    venue_id: link.venue_id,
    is_primary: Boolean(link.is_primary),
    is_inferred: Boolean(link.is_inferred),
  }));
  const upsert = await supabase
    .from("tournament_venues" as any)
    .upsert(payload, { onConflict: "tournament_id,venue_id" });
  if (upsert.error) throw new Error(upsert.error.message || "failed_copy_parent_venues");
  return payload.length;
}

async function upsertVenueAndLinkTournament(params: {
  supabase: AdminSupabase;
  tournamentId: string;
  venue: { name: string; address: string; city: string | null; state: string | null; zip: string | null; sport: string | null };
}) {
  const { supabase, tournamentId, venue } = params;
  const applyNullableFilter = (query: any, field: string, value: string | null) => {
    if (value === null) return query.is(field, null);
    return query.eq(field, value);
  };

  let venueId: string | undefined;
  if (venue.city && venue.state) {
    const { data: candidates, error: candidatesErr } = await (supabase.from("venues") as any)
      .select("id, name, address, city, state")
      .eq("city", venue.city)
      .eq("state", venue.state)
      .limit(50);
    if (candidatesErr) {
      return { linked: false, error: candidatesErr.message || "failed_lookup_venue" };
    }
    const match = findVenueMatch((candidates ?? []) as VenueMatchInput[], venue);
    venueId = (match as any)?.id as string | undefined;
  } else {
    const existingVenueRes = await applyNullableFilter(
      applyNullableFilter(
        applyNullableFilter(
          applyNullableFilter((supabase.from("venues") as any).select("id").limit(1), "name", venue.name),
          "address",
          venue.address
        ),
        "city",
        venue.city
      ),
      "state",
      venue.state
    ).maybeSingle();
    if (existingVenueRes.error) {
      return { linked: false, error: existingVenueRes.error.message || "failed_lookup_venue" };
    }
    venueId = (existingVenueRes.data as any)?.id as string | undefined;
  }

  if (!venueId) {
    const insertRes = await (supabase.from("venues") as any)
      .insert({
        name: venue.name,
        address: venue.address,
        city: venue.city,
        state: venue.state,
        zip: venue.zip,
        sport: venue.sport,
      })
      .select("id")
      .single();
    if (insertRes.error) {
      if ((insertRes.error as any).code === "23505") {
        const retryRes = await applyNullableFilter(
          applyNullableFilter(
            applyNullableFilter(
              applyNullableFilter((supabase.from("venues") as any).select("id").limit(1), "name", venue.name),
              "address",
              venue.address
            ),
            "city",
            venue.city
          ),
          "state",
          venue.state
        ).maybeSingle();
        venueId = (retryRes.data as any)?.id as string | undefined;
        if (!venueId) {
          return { linked: false, error: retryRes.error?.message || "failed_create_venue" };
        }
      } else {
        return { linked: false, error: insertRes.error.message || "failed_create_venue" };
      }
    } else {
      venueId = (insertRes.data as any)?.id as string | undefined;
    }
  }

  if (!venueId) return { linked: false, error: "missing_venue_id" };

  const linkRes = await (supabase.from("tournament_venues") as any).upsert(
    { tournament_id: tournamentId, venue_id: venueId, is_inferred: false },
    { onConflict: "tournament_id,venue_id" }
  );
  if (linkRes.error && (linkRes.error as any).code !== "23505") {
    return { linked: false, error: linkRes.error.message || "failed_link_venue" };
  }

  return { linked: true, venueId };
}

async function upsertRollForwardLog(
  supabase: AdminSupabase,
  payload: TournamentRollForwardLogInsert
) {
  const write = {
    ...payload,
    researched_at: payload.researched_at ?? new Date().toISOString(),
  };
  const { error } = await supabase
    .from("tournament_roll_forward_log")
    .upsert(write, { onConflict: "parent_tournament_id,target_year" });
  if (error) throw new Error(error.message || "failed_upsert_roll_forward_log");
}

function incrementStatusSummary(summary: RollForwardSummary, status: RollForwardStatus) {
  if (status === "pending") summary.pending += 1;
  else if (status === "no_dates_announced") summary.noDatesAnnounced += 1;
  else if (status === "discontinued") summary.discontinued += 1;
  else if (status === "ambiguous") summary.ambiguous += 1;
}

function buildNotice(mode: RollForwardMode, summary: RollForwardSummary) {
  const prefix = mode === "dry_run" ? "Roll-forward dry run" : "Roll-forward apply";
  return `${prefix}: parsed ${summary.parsed}, ${mode === "dry_run" ? "would create" : "created"} ${
    mode === "dry_run" ? summary.wouldCreate : summary.created
  }, already exists ${summary.alreadyExists}, pending ${summary.pending}, no dates ${summary.noDatesAnnounced}, discontinued ${
    summary.discontinued
  }, ambiguous ${summary.ambiguous}, missing parent ${summary.missingParent}, invalid ${
    summary.invalid
  }. Check server logs for row details.`;
}

function normalizeBatchLabel(value: string | null | undefined) {
  const clean = cleanNullable(value);
  if (!clean) return null;
  return clean.slice(0, 120);
}

function buildLogRowResult(
  row: NormalizedRollForwardRow,
  action: RollForwardRowAction,
  parent: ParentTournamentRow | null,
  reason?: string
): RollForwardRowResult {
  return {
    rowNumber: row.rowNumber,
    action,
    reason,
    existingTournamentId: row.existingTournamentId,
    existingSlug: row.existingSlug,
    parentTournamentId: parent?.id ?? null,
    parentSlug: parent?.slug ?? null,
    targetSlug: null,
    targetYear: row.targetYear,
    copiedVenueLinks: 0,
  };
}

export async function rollForwardTournamentsFromCsvText(
  csvText: string,
  options: RollForwardOptions
): Promise<RollForwardResult> {
  const supabase = supabaseAdmin;
  const rows = parseRows(csvText);
  const results: RollForwardRowResult[] = [];
  const summary: RollForwardSummary = {
    parsed: rows.length,
    wouldCreate: 0,
    created: 0,
    alreadyExists: 0,
    pending: 0,
    noDatesAnnounced: 0,
    discontinued: 0,
    ambiguous: 0,
    missingParent: 0,
    invalid: 0,
  };

  for (const row of rows) {
    if (!row.targetYear) {
      summary.invalid += 1;
      results.push(buildLogRowResult(row, "invalid", null, "Missing or invalid target_year."));
      continue;
    }
    if (!row.rollForwardStatus) {
      summary.invalid += 1;
      results.push(buildLogRowResult(row, "invalid", null, "Missing or invalid roll_forward_status."));
      continue;
    }
    if (!row.existingTournamentId && !row.existingSlug) {
      summary.invalid += 1;
      results.push(buildLogRowResult(row, "invalid", null, "Provide existing_tournament_id or existing_slug."));
      continue;
    }

    let parent: ParentTournamentRow | null = null;
    try {
      if (row.existingTournamentId) {
        parent = await loadParentById(supabase, row.existingTournamentId);
      } else if (row.existingSlug) {
        parent = await loadParentBySlug(supabase, row.existingSlug);
      } else {
        const fallback = await findFallbackParent(supabase, row, row.targetYear);
        if (fallback.ambiguous) {
          summary.ambiguous += 1;
          results.push(buildLogRowResult(row, "ambiguous_parent", null, "Multiple plausible prior tournaments matched this row."));
          continue;
        }
        parent = fallback.parent;
      }
    } catch (error) {
      summary.invalid += 1;
      results.push(buildLogRowResult(row, "invalid", null, error instanceof Error ? error.message : "Failed to resolve parent tournament."));
      continue;
    }

    if (!parent) {
      summary.missingParent += 1;
      results.push(buildLogRowResult(row, "missing_parent", null, "No parent tournament matched."));
      continue;
    }

    if (row.rollForwardStatus !== "done") {
      incrementStatusSummary(summary, row.rollForwardStatus);
      if (options.mode === "apply") {
        await upsertRollForwardLog(supabase, {
          parent_tournament_id: parent.id,
          target_year: row.targetYear,
          batch_label: normalizeBatchLabel(row.batchLabel),
          status: row.rollForwardStatus,
          sibling_id: null,
          notes: row.notes,
        });
      }
      results.push(buildLogRowResult(row, row.rollForwardStatus, parent));
      continue;
    }

    if (!row.startDate) {
      summary.invalid += 1;
      results.push(buildLogRowResult(row, "invalid", parent, "done rows require start_date."));
      continue;
    }
    const startYear = Number(row.startDate.slice(0, 4));
    if (startYear !== row.targetYear) {
      summary.invalid += 1;
      results.push(buildLogRowResult(row, "invalid", parent, "start_date year must match target_year."));
      continue;
    }

    const effectiveName = row.name ?? parent.name;
    const effectiveState = row.state ?? normalizeState(parent.state);
    const effectiveCity = row.city ?? parent.city ?? null;
    const effectiveSport = row.sport ?? parent.sport ?? options.fallbackSport ?? null;
    if (!effectiveName || !effectiveSport) {
      summary.invalid += 1;
      results.push(buildLogRowResult(row, "invalid", parent, "Missing effective tournament name or sport for sibling creation."));
      continue;
    }

    const targetSlug = buildSeriesSlug(effectiveName, effectiveCity, effectiveState, row.targetYear);
    if (!targetSlug) {
      summary.invalid += 1;
      results.push(buildLogRowResult(row, "invalid", parent, "Could not derive sibling slug."));
      continue;
    }

    const existingSibling = await findExistingSibling(
      supabase,
      targetSlug,
      { ...row, name: effectiveName },
      effectiveSport,
      effectiveState
    );
    if (existingSibling) {
      summary.alreadyExists += 1;
      if (options.mode === "apply") {
        await upsertRollForwardLog(supabase, {
          parent_tournament_id: parent.id,
          target_year: row.targetYear,
          batch_label: normalizeBatchLabel(row.batchLabel),
          status: "done",
          sibling_id: existingSibling.id,
          notes: row.notes,
        });
      }
      results.push({
        rowNumber: row.rowNumber,
        action: "already_exists",
        reason: `Sibling already exists as ${existingSibling.slug}.`,
        existingTournamentId: row.existingTournamentId,
        existingSlug: row.existingSlug,
        parentTournamentId: parent.id,
        parentSlug: parent.slug,
        targetSlug,
        targetYear: row.targetYear,
        copiedVenueLinks: 0,
        createdTournamentId: existingSibling.id,
      });
      continue;
    }

    if (options.mode === "dry_run") {
      summary.wouldCreate += 1;
      results.push({
        rowNumber: row.rowNumber,
        action: "would_create",
        existingTournamentId: row.existingTournamentId,
        existingSlug: row.existingSlug,
        parentTournamentId: parent.id,
        parentSlug: parent.slug,
        targetSlug,
        targetYear: row.targetYear,
        copiedVenueLinks: 0,
      });
      continue;
    }

    const sourceUrl =
      row.sourceUrl ??
      parent.source_url ??
      `https://tournamentinsights.com/admin/roll-forward/${targetSlug}`;
    const sourceDomain = deriveSourceDomain(sourceUrl) ?? parent.source_domain ?? "tournamentinsights.com";
    const insertPayload = {
      name: effectiveName,
      slug: targetSlug,
      sport: effectiveSport,
      level: row.level ?? parent.level,
      sub_type: parent.sub_type ?? "admin",
      ref_cash_tournament: parent.ref_cash_tournament,
      state: effectiveState,
      city: effectiveCity,
      venue: row.venue ?? parent.venue,
      address: row.address ?? parent.address,
      zip: row.zip ?? parent.zip,
      start_date: row.startDate,
      end_date: row.endDate ?? row.startDate,
      summary: row.notes ?? parent.summary,
      status: "draft",
      source: (parent.source ?? options.defaultSource) as TournamentSource,
      source_event_id: `rollforward:${parent.id}:${row.targetYear}:${crypto.randomUUID()}`,
      source_url: sourceUrl,
      source_domain: sourceDomain,
      tournament_director: row.tournamentDirector ?? parent.tournament_director,
      tournament_director_email: row.tournamentDirectorEmail ?? parent.tournament_director_email,
      referee_contact: row.refereeContact ?? parent.referee_contact,
      referee_contact_email: row.refereeContactEmail ?? parent.referee_contact_email,
    };

    const insertRes = await supabase.from("tournaments" as any).insert(insertPayload).select("id").single();
    if (insertRes.error) {
      if ((insertRes.error as any).code === "23505") {
        summary.alreadyExists += 1;
        results.push({
          rowNumber: row.rowNumber,
          action: "already_exists",
          reason: "Insert collided with an existing sibling row.",
          existingTournamentId: row.existingTournamentId,
          existingSlug: row.existingSlug,
          parentTournamentId: parent.id,
          parentSlug: parent.slug,
          targetSlug,
          targetYear: row.targetYear,
          copiedVenueLinks: 0,
        });
        continue;
      }

      summary.invalid += 1;
      results.push(buildLogRowResult(row, "invalid", parent, insertRes.error.message || "Failed to insert sibling tournament."));
      continue;
    }

    const newTournamentId = String((insertRes.data as any)?.id || "");
    let copiedVenueLinks = 0;
    try {
      copiedVenueLinks = await copyVenueLinks(supabase, parent.id, newTournamentId);
      if (hasCompleteVenuePayload(row) && row.venue && row.address) {
        const venueRes = await upsertVenueAndLinkTournament({
          supabase,
          tournamentId: newTournamentId,
          venue: {
            name: row.venue,
            address: row.address,
            city: row.city,
            state: row.state,
            zip: row.zip,
            sport: effectiveSport,
          },
        });
        if (venueRes.error) {
          console.warn("[roll-forward] venue augment failed", {
            rowNumber: row.rowNumber,
            parentTournamentId: parent.id,
            newTournamentId,
            error: venueRes.error,
          });
        }
      }
    } catch (error) {
      console.warn("[roll-forward] venue copy failed", {
        rowNumber: row.rowNumber,
        parentTournamentId: parent.id,
        newTournamentId,
        error: error instanceof Error ? error.message : "unknown",
      });
    }

    await upsertRollForwardLog(supabase, {
      parent_tournament_id: parent.id,
      target_year: row.targetYear,
      batch_label: normalizeBatchLabel(row.batchLabel),
      status: "done",
      sibling_id: newTournamentId,
      notes: row.notes,
    });

    summary.created += 1;
    results.push({
      rowNumber: row.rowNumber,
      action: "created",
      existingTournamentId: row.existingTournamentId,
      existingSlug: row.existingSlug,
      parentTournamentId: parent.id,
      parentSlug: parent.slug,
      targetSlug,
      targetYear: row.targetYear,
      copiedVenueLinks,
      createdTournamentId: newTournamentId,
    });
  }

  console.log(
    "[roll-forward-tournaments]",
    JSON.stringify(
      {
        mode: options.mode,
        summary,
        rows: results,
      },
      null,
      2
    )
  );

  return {
    summary,
    results,
    notice: buildNotice(options.mode, summary),
  };
}

export async function listTournamentRollForwardLogs(params?: {
  status?: RollForwardStatus | "";
  targetYear?: number | null;
  batchLabel?: string | null;
  limit?: number;
}) {
  let query = supabaseAdmin
    .from("tournament_roll_forward_log")
    .select(
      "id,parent_tournament_id,target_year,batch_label,status,sibling_id,notes,researched_at,created_at,updated_at,parent:tournaments!tournament_roll_forward_log_parent_tournament_id_fkey(id,name,slug,start_date),sibling:tournaments!tournament_roll_forward_log_sibling_id_fkey(id,name,slug,start_date)"
    )
    .order("target_year", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(params?.limit ?? 100);

  if (params?.status) query = query.eq("status", params.status);
  if (params?.targetYear) query = query.eq("target_year", params.targetYear);
  if (params?.batchLabel) query = query.ilike("batch_label", params.batchLabel);

  const { data, error } = await query;
  if (error) throw new Error(error.message || "failed_list_roll_forward_logs");
  return (data ?? []) as Array<
    TournamentRollForwardLogRow & {
      parent?: { id: string; name: string | null; slug: string | null; start_date: string | null } | null;
      sibling?: { id: string; name: string | null; slug: string | null; start_date: string | null } | null;
    }
  >;
}
