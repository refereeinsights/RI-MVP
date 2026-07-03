"use server";

import crypto from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { ensureTournamentVenueLink } from "@/lib/tournaments/ensureTournamentVenueLink";
import { parseCsv } from "@/lib/tournaments/importUtils";
import { buildTournamentSlug } from "@/lib/tournaments/slug";
import type { TournamentSource } from "@/lib/types/tournament";
import type { Database } from "@/lib/types/supabase";

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
  ambiguousParent: number;
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
  summary: string | null;
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

function yearFromIsoDate(value: string | null) {
  if (!value) return null;
  const match = value.match(/^(\d{4})-/);
  return match ? Number(match[1]) : null;
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

function parseRows(csvText: string) {
  const parsed = parseCsv(csvText);
  return parsed.rows.map<NormalizedRollForwardRow>((row, index) => ({
    rowNumber: index + 2,
    existingTournamentId: cleanNullable(
      getValue(row, "existing_tournament_id", "parent_tournament_id", "tournament_id")
    ),
    existingSlug: cleanNullable(getValue(row, "existing_slug", "parent_slug")),
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
    summary: cleanNullable(getValue(row, "summary", "notes", "description")),
    tournamentDirector: cleanNullable(getValue(row, "tournament_director", "director")),
    tournamentDirectorEmail: cleanNullable(
      getValue(row, "tournament_director_email", "director_email")
    ),
    refereeContact: cleanNullable(getValue(row, "referee_contact", "contact_name")),
    refereeContactEmail: cleanNullable(getValue(row, "referee_contact_email", "contact_email")),
    raw: row,
  }));
}

async function loadParentById(
  supabase: AdminSupabase,
  tournamentId: string
) {
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

async function loadParentBySlug(
  supabase: AdminSupabase,
  slug: string
) {
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

async function findFallbackParent(
  supabase: AdminSupabase,
  row: NormalizedRollForwardRow,
  targetYear: number
) {
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

async function copyVenueLinks(
  supabase: AdminSupabase,
  parentTournamentId: string,
  childTournamentId: string
) {
  const { data, error } = await supabase
    .from("tournament_venues" as any)
    .select("venue_id,is_primary,is_inferred")
    .eq("tournament_id", parentTournamentId);
  if (error) throw new Error(error.message || "failed_load_parent_venues");
  const links = (data as Array<{ venue_id: string; is_primary: boolean | null; is_inferred: boolean | null }> | null) ?? [];
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

function buildNotice(mode: RollForwardMode, summary: RollForwardSummary) {
  const prefix = mode === "dry_run" ? "Roll-forward dry run" : "Roll-forward apply";
  return `${prefix}: parsed ${summary.parsed}, ${mode === "dry_run" ? "would create" : "created"} ${
    mode === "dry_run" ? summary.wouldCreate : summary.created
  }, already exists ${summary.alreadyExists}, ambiguous ${summary.ambiguousParent}, missing parent ${
    summary.missingParent
  }, invalid ${summary.invalid}. Check server logs for row details.`;
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
    ambiguousParent: 0,
    missingParent: 0,
    invalid: 0,
  };

  for (const row of rows) {
    const targetYear = yearFromIsoDate(row.startDate);
    if (!row.startDate || !targetYear) {
      summary.invalid += 1;
      results.push({
        rowNumber: row.rowNumber,
        action: "invalid",
        reason: "Missing or invalid start_date.",
        existingTournamentId: row.existingTournamentId,
        existingSlug: row.existingSlug,
        parentTournamentId: null,
        parentSlug: null,
        targetSlug: null,
        targetYear: null,
        copiedVenueLinks: 0,
      });
      continue;
    }

    let parent: ParentTournamentRow | null = null;
    try {
      if (row.existingTournamentId) {
        parent = await loadParentById(supabase, row.existingTournamentId);
      } else if (row.existingSlug) {
        parent = await loadParentBySlug(supabase, row.existingSlug);
      } else {
        const fallback = await findFallbackParent(supabase, row, targetYear);
        if (fallback.ambiguous) {
          summary.ambiguousParent += 1;
          results.push({
            rowNumber: row.rowNumber,
            action: "ambiguous_parent",
            reason: "Multiple plausible prior tournaments matched this future sibling row.",
            existingTournamentId: row.existingTournamentId,
            existingSlug: row.existingSlug,
            parentTournamentId: null,
            parentSlug: null,
            targetSlug: null,
            targetYear,
            copiedVenueLinks: 0,
          });
          continue;
        }
        parent = fallback.parent;
      }
    } catch (error) {
      summary.invalid += 1;
      results.push({
        rowNumber: row.rowNumber,
        action: "invalid",
        reason: error instanceof Error ? error.message : "Failed to resolve parent tournament.",
        existingTournamentId: row.existingTournamentId,
        existingSlug: row.existingSlug,
        parentTournamentId: null,
        parentSlug: null,
        targetSlug: null,
        targetYear,
        copiedVenueLinks: 0,
      });
      continue;
    }

    if (!parent) {
      summary.missingParent += 1;
      results.push({
        rowNumber: row.rowNumber,
        action: "missing_parent",
        reason: "No parent tournament matched. Supply existing_tournament_id or existing_slug.",
        existingTournamentId: row.existingTournamentId,
        existingSlug: row.existingSlug,
        parentTournamentId: null,
        parentSlug: null,
        targetSlug: null,
        targetYear,
        copiedVenueLinks: 0,
      });
      continue;
    }

    const effectiveName = row.name ?? parent.name;
    const effectiveState = row.state ?? normalizeState(parent.state);
    const effectiveCity = row.city ?? parent.city ?? null;
    const effectiveSport = row.sport ?? parent.sport ?? options.fallbackSport ?? null;
    if (!effectiveName || !effectiveSport) {
      summary.invalid += 1;
      results.push({
        rowNumber: row.rowNumber,
        action: "invalid",
        reason: "Missing effective tournament name or sport for sibling creation.",
        existingTournamentId: row.existingTournamentId,
        existingSlug: row.existingSlug,
        parentTournamentId: parent.id,
        parentSlug: parent.slug,
        targetSlug: null,
        targetYear,
        copiedVenueLinks: 0,
      });
      continue;
    }

    const targetSlug = buildSeriesSlug(effectiveName, effectiveCity, effectiveState, targetYear);
    if (!targetSlug) {
      summary.invalid += 1;
      results.push({
        rowNumber: row.rowNumber,
        action: "invalid",
        reason: "Could not derive sibling slug.",
        existingTournamentId: row.existingTournamentId,
        existingSlug: row.existingSlug,
        parentTournamentId: parent.id,
        parentSlug: parent.slug,
        targetSlug: null,
        targetYear,
        copiedVenueLinks: 0,
      });
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
      results.push({
        rowNumber: row.rowNumber,
        action: "already_exists",
        reason: `Sibling already exists as ${existingSibling.slug}.`,
        existingTournamentId: row.existingTournamentId,
        existingSlug: row.existingSlug,
        parentTournamentId: parent.id,
        parentSlug: parent.slug,
        targetSlug,
        targetYear,
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
        targetYear,
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
      summary: row.summary ?? parent.summary,
      status: "draft",
      source: (parent.source ?? options.defaultSource) as TournamentSource,
      source_event_id: `rollforward:${parent.id}:${targetYear}:${crypto.randomUUID()}`,
      source_url: sourceUrl,
      source_domain: sourceDomain,
      tournament_director: row.tournamentDirector ?? parent.tournament_director,
      tournament_director_email: row.tournamentDirectorEmail ?? parent.tournament_director_email,
      referee_contact: row.refereeContact ?? parent.referee_contact,
      referee_contact_email: row.refereeContactEmail ?? parent.referee_contact_email,
      raw: {
        kind: "roll_forward",
        parent_tournament_id: parent.id,
        parent_slug: parent.slug,
        target_year: targetYear,
        csv_row: row.raw,
      },
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
          targetYear,
          copiedVenueLinks: 0,
        });
        continue;
      }

      summary.invalid += 1;
      results.push({
        rowNumber: row.rowNumber,
        action: "invalid",
        reason: insertRes.error.message || "Failed to insert sibling tournament.",
        existingTournamentId: row.existingTournamentId,
        existingSlug: row.existingSlug,
        parentTournamentId: parent.id,
        parentSlug: parent.slug,
        targetSlug,
        targetYear,
        copiedVenueLinks: 0,
      });
      continue;
    }

    const newTournamentId = String((insertRes.data as any)?.id || "");
    let copiedVenueLinks = 0;
    try {
      copiedVenueLinks = await copyVenueLinks(supabase, parent.id, newTournamentId);
      if (!copiedVenueLinks) {
        await ensureTournamentVenueLink(newTournamentId);
      }
    } catch (error) {
      console.warn("[roll-forward] venue copy failed", {
        rowNumber: row.rowNumber,
        parentTournamentId: parent.id,
        newTournamentId,
        error: error instanceof Error ? error.message : "unknown",
      });
    }

    summary.created += 1;
    results.push({
      rowNumber: row.rowNumber,
      action: "created",
      existingTournamentId: row.existingTournamentId,
      existingSlug: row.existingSlug,
      parentTournamentId: parent.id,
      parentSlug: parent.slug,
      targetSlug,
      targetYear,
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
