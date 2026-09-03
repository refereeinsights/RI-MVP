"use server";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { findVenueMatch, type VenueMatchInput } from "@/lib/tournaments/venueNormalization";

export type ApplyResult =
  | { ok: true; action: string }
  | { ok: false; error: string; conflict?: boolean };

function str(v: unknown): string {
  return String(v ?? "").trim();
}

async function findOrCreateVenue(venueData: {
  name: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip?: string | null;
  sport?: string | null;
}): Promise<string | null> {
  const { name, address, city, state, zip, sport } = venueData;

  if (city && state) {
    const { data: candidates } = await (supabaseAdmin.from("venues" as any) as any)
      .select("id,name,address,city,state")
      .eq("city", city)
      .eq("state", state)
      .limit(50);

    const match = findVenueMatch(
      (candidates ?? []) as VenueMatchInput[],
      { name, address, city, state }
    );
    if (match && (match as any).id) return (match as any).id as string;
  }

  const { data: created, error } = await (supabaseAdmin.from("venues" as any) as any)
    .insert({ name, address, city, state, zip: zip ?? null, sport: sport ?? null })
    .select("id")
    .single();
  if (error) return null;
  return (created as any)?.id ?? null;
}

async function linkVenueToTournament(tournamentId: string, venueId: string): Promise<boolean> {
  const { error } = await (supabaseAdmin.from("tournament_venues" as any) as any)
    .upsert(
      { tournament_id: tournamentId, venue_id: venueId, is_inferred: false },
      { onConflict: "tournament_id,venue_id" }
    );
  return !error || (error as any).code === "23505";
}

async function setNeedsVerification(proposalId: string, reason: string): Promise<ApplyResult> {
  await (supabaseAdmin.from("tournament_enrichment_proposals" as any) as any)
    .update({ status: "needs_verification", updated_at: new Date().toISOString() })
    .eq("id", proposalId);
  return { ok: false, error: reason, conflict: true };
}

async function markApplied(proposalId: string, adminUserId: string): Promise<void> {
  await (supabaseAdmin.from("tournament_enrichment_proposals" as any) as any)
    .update({
      status: "applied",
      applied_by: adminUserId,
      applied_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", proposalId);
}

export async function applyTournamentEnrichmentProposal(
  proposalId: string,
  adminUserId: string
): Promise<ApplyResult> {
  const { data: proposal } = await (supabaseAdmin.from("tournament_enrichment_proposals" as any) as any)
    .select("*")
    .eq("id", proposalId)
    .maybeSingle();
  if (!proposal) return { ok: false, error: "proposal_not_found" };
  if (proposal.status !== "approved") return { ok: false, error: "proposal_not_approved" };
  if (proposal.action_type === "merge_duplicate" || proposal.action_type === "manual_review") {
    return { ok: false, error: "action_requires_manual_handling" };
  }

  const { data: tournament } = await (supabaseAdmin.from("tournaments" as any) as any)
    .select("id,official_website_url,start_date,end_date,city,state")
    .eq("id", proposal.tournament_id)
    .maybeSingle();
  if (!tournament) return { ok: false, error: "tournament_not_found" };

  const proposed = (proposal.proposed_value ?? {}) as Record<string, unknown>;
  const captured = (proposal.current_value ?? {}) as Record<string, unknown>;

  switch (proposal.action_type as string) {
    case "add_official_source": {
      const proposedUrl = str(proposed.url);
      const currentProd = str((tournament as any).official_website_url);
      const capturedUrl = str(captured.url);

      if (capturedUrl && currentProd && currentProd !== capturedUrl) {
        return setNeedsVerification(proposalId, "official_source_changed_since_proposal");
      }
      if (!currentProd) {
        const { error } = await (supabaseAdmin.from("tournaments" as any) as any)
          .update({ official_website_url: proposedUrl, updated_at: new Date().toISOString() })
          .eq("id", proposal.tournament_id);
        if (error) return { ok: false, error: error.message };
        await markApplied(proposalId, adminUserId);
        return { ok: true, action: "official_source_set" };
      }
      if (currentProd === proposedUrl) {
        await markApplied(proposalId, adminUserId);
        return { ok: true, action: "no_op_source_already_matches" };
      }
      return setNeedsVerification(proposalId, "official_source_already_set_with_different_url");
    }

    case "correct_dates": {
      const capturedStart = str(captured.start_date);
      const capturedEnd = str(captured.end_date);
      const currentStart = str((tournament as any).start_date);
      const currentEnd = str((tournament as any).end_date);

      if (
        (capturedStart && capturedStart !== currentStart) ||
        (capturedEnd && capturedEnd !== currentEnd)
      ) {
        return setNeedsVerification(proposalId, "dates_changed_since_proposal");
      }
      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (proposed.start_date) updates.start_date = proposed.start_date;
      if (proposed.end_date) updates.end_date = proposed.end_date;

      const { error } = await (supabaseAdmin.from("tournaments" as any) as any)
        .update(updates)
        .eq("id", proposal.tournament_id);
      if (error) return { ok: false, error: error.message };
      await markApplied(proposalId, adminUserId);
      return { ok: true, action: "dates_updated" };
    }

    case "add_venue":
    case "add_additional_venue": {
      const venueId = await findOrCreateVenue({
        name: str(proposed.name) || null,
        address: str(proposed.address) || null,
        city: str(proposed.city) || null,
        state: str(proposed.state).toUpperCase() || null,
        zip: str(proposed.zip) || null,
        sport: str(proposed.sport) || null,
      });
      if (!venueId) return { ok: false, error: "failed_to_find_or_create_venue" };
      if (!await linkVenueToTournament(proposal.tournament_id, venueId)) {
        return { ok: false, error: "failed_to_link_venue" };
      }
      await markApplied(proposalId, adminUserId);
      return { ok: true, action: "venue_added" };
    }

    case "correct_venue": {
      const venueId = await findOrCreateVenue({
        name: str(proposed.name) || null,
        address: str(proposed.address) || null,
        city: str(proposed.city) || null,
        state: str(proposed.state).toUpperCase() || null,
        zip: str(proposed.zip) || null,
        sport: str(proposed.sport) || null,
      });
      if (!venueId) return { ok: false, error: "failed_to_find_or_create_corrected_venue" };
      if (!await linkVenueToTournament(proposal.tournament_id, venueId)) {
        return { ok: false, error: "failed_to_link_corrected_venue" };
      }
      // Old venue (current_value.venue_id) is preserved — surface for manual cleanup
      await markApplied(proposalId, adminUserId);
      return { ok: true, action: "corrected_venue_linked_old_venue_preserved" };
    }

    case "correct_tournament_location": {
      const capturedCity = str(captured.city);
      const capturedState = str(captured.state).toUpperCase();
      const currentCity = str((tournament as any).city);
      const currentState = str((tournament as any).state).toUpperCase();

      if (
        (capturedCity && capturedCity !== currentCity) ||
        (capturedState && capturedState !== currentState)
      ) {
        return setNeedsVerification(proposalId, "location_changed_since_proposal");
      }
      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (proposed.city) updates.city = proposed.city;
      if (proposed.state) updates.state = str(proposed.state).toUpperCase();

      const { error } = await (supabaseAdmin.from("tournaments" as any) as any)
        .update(updates)
        .eq("id", proposal.tournament_id);
      if (error) return { ok: false, error: error.message };
      await markApplied(proposalId, adminUserId);
      return { ok: true, action: "location_updated" };
    }

    default:
      return { ok: false, error: "unsupported_action_type" };
  }
}
