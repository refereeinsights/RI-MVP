"use server";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { ensureTournamentVenueLink } from "@/lib/tournaments/ensureTournamentVenueLink";
import { TOURNAMENT_SPORTS } from "@/lib/tournaments/sports";

export async function updatePendingTournamentDraftFromFormData(tournamentId: string, formData: FormData): Promise<{ error?: string }> {
  const key = (field: string) => `${field}_${tournamentId}`;
  const stringOrUndefined = (field: string) => {
    const value = String(formData.get(key(field)) || "").trim();
    return value ? value : undefined;
  };

  const sportRaw = String(formData.get(key("edit_sport")) || "").trim().toLowerCase();
  const sportValue = (TOURNAMENT_SPORTS as readonly string[]).includes(sportRaw) ? sportRaw : undefined;
  const stateRaw = stringOrUndefined("edit_state");
  const sourceUrlInput = stringOrUndefined("edit_source_url");
  const officialWebsiteInput = stringOrUndefined("edit_official_website_url");

  let normalizedSourceUrl = sourceUrlInput;
  if (sourceUrlInput) {
    try {
      normalizedSourceUrl = new URL(sourceUrlInput).toString();
    } catch {
      try {
        normalizedSourceUrl = new URL(`https://${sourceUrlInput}`).toString();
      } catch {
        normalizedSourceUrl = sourceUrlInput;
      }
    }
  }

  let normalizedOfficialWebsite = officialWebsiteInput;
  if (officialWebsiteInput) {
    try {
      normalizedOfficialWebsite = new URL(officialWebsiteInput).toString();
    } catch {
      try {
        normalizedOfficialWebsite = new URL(`https://${officialWebsiteInput}`).toString();
      } catch {
        normalizedOfficialWebsite = officialWebsiteInput;
      }
    }
  }

  let sourceDomain: string | null = null;
  if (normalizedSourceUrl) {
    try {
      sourceDomain = new URL(normalizedSourceUrl).hostname.replace(/^www\./, "");
    } catch {
      sourceDomain = null;
    }
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const assignIfDefined = (field: string, value: unknown) => {
    if (value === undefined) return;
    updates[field] = value;
  };

  assignIfDefined("name", stringOrUndefined("edit_name"));
  assignIfDefined("sport", sportValue);
  assignIfDefined("city", stringOrUndefined("edit_city"));
  if (stateRaw !== undefined) assignIfDefined("state", stateRaw ? stateRaw.toUpperCase() : null);
  assignIfDefined("zip", stringOrUndefined("edit_zip"));
  assignIfDefined("venue", stringOrUndefined("edit_venue"));
  assignIfDefined("address", stringOrUndefined("edit_address"));
  assignIfDefined("tournament_director", stringOrUndefined("edit_tournament_director"));
  assignIfDefined("tournament_director_email", stringOrUndefined("edit_tournament_director_email"));
  assignIfDefined("start_date", stringOrUndefined("edit_start_date"));
  assignIfDefined("end_date", stringOrUndefined("edit_end_date"));
  assignIfDefined("source_url", normalizedSourceUrl);
  if (normalizedSourceUrl !== undefined) assignIfDefined("source_domain", sourceDomain);
  assignIfDefined("official_website_url", normalizedOfficialWebsite);
  assignIfDefined("summary", stringOrUndefined("edit_summary"));

  const { error } = await supabaseAdmin.from("tournaments" as any).update(updates).eq("id", tournamentId).eq("status", "draft");
  if (error) return { error: `Update failed: ${error.message}` };

  const venueLinkRes = await ensureTournamentVenueLink(tournamentId);
  if (venueLinkRes.error) return { error: `Venue link failed: ${venueLinkRes.error}` };

  return {};
}

