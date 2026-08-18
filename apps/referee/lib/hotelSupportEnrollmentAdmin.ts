"use server";

import { randomBytes } from "node:crypto";

import {
  HOTEL_SUPPORT_INVITATION_LIFETIME_DAYS,
  isHotelSupportRateCents,
  type HotelSupportRateCents,
  type HotelSupportRecipientType,
} from "../../../packages/lib/hotel-support";
import { hashHotelSupportToken } from "../../../packages/lib/hotel-support/security";
import { requireAdmin } from "./admin";
import { supabaseAdmin } from "./supabaseAdmin";

type InvitationRow = {
  id: string;
  tournament_id: string | null;
  offered_rate_cents: HotelSupportRateCents;
  state: "active" | "consumed" | "revoked";
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
  consumed_at: string | null;
};

type AcceptanceRow = {
  id: string;
  invitation_id: string;
  tournament_id: string | null;
  offered_rate_cents: HotelSupportRateCents;
  contact_name: string;
  contact_email: string;
  contact_phone: string | null;
  contact_title: string | null;
  expected_recipient_type: HotelSupportRecipientType;
  expected_recipient_name: string;
  terms_version: string;
  terms_content_sha256: string;
  accepted_at: string;
};

type ReviewRow = {
  enrollment_id: string;
  status: "submitted" | "approved" | "declined";
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
};

export type AdminHotelSupportEnrollmentView = {
  schemaReady: boolean;
  invitation: InvitationRow | null;
  invitationDisplayState: "active" | "expired" | "consumed" | "revoked" | "none";
  enrollment: AcceptanceRow | null;
  review: ReviewRow | null;
};

export type HotelSupportAdminActionState = {
  status: "idle" | "created" | "saved" | "invalid" | "stale" | "unavailable" | "error";
  message: string;
  enrollmentUrl?: string;
};

function relationMissing(error: { code?: string | null } | null | undefined) {
  return error?.code === "42P01" || error?.code === "PGRST205" || error?.code === "PGRST202";
}

function tiPublicBaseUrl() {
  if (process.env.NODE_ENV !== "production") return "http://localhost:3001";
  const configured = String(process.env.TI_PUBLIC_BASE_URL ?? process.env.NEXT_PUBLIC_TI_SITE_URL ?? "")
    .trim()
    .replace(/\/+$/, "");
  return configured || "https://www.tournamentinsights.com";
}

function displayInvitationState(invitation: InvitationRow | null): AdminHotelSupportEnrollmentView["invitationDisplayState"] {
  if (!invitation) return "none";
  if (invitation.state === "active" && Date.parse(invitation.expires_at) <= Date.now()) return "expired";
  return invitation.state;
}

export async function adminListHotelSupportEnrollments(
  tournamentIds: string[]
): Promise<Record<string, AdminHotelSupportEnrollmentView>> {
  await requireAdmin();
  const uniqueTournamentIds = [...new Set(tournamentIds.filter(Boolean))];
  const empty = (schemaReady: boolean): AdminHotelSupportEnrollmentView => ({
    schemaReady,
    invitation: null,
    invitationDisplayState: "none",
    enrollment: null,
    review: null,
  });
  if (!uniqueTournamentIds.length) return {};

  const invitationsPromise = supabaseAdmin
    .from("ti_hotel_support_invitations" as any)
    .select("id,tournament_id,offered_rate_cents,state,created_at,expires_at,revoked_at,consumed_at")
    .in("tournament_id", uniqueTournamentIds)
    .order("created_at", { ascending: false });
  const acceptancesPromise = supabaseAdmin
    .from("ti_hotel_support_acceptances" as any)
    .select("id,invitation_id,tournament_id,offered_rate_cents,contact_name,contact_email,contact_phone,contact_title,expected_recipient_type,expected_recipient_name,terms_version,terms_content_sha256,accepted_at")
    .in("tournament_id", uniqueTournamentIds)
    .order("accepted_at", { ascending: false });
  const [invitationsResponse, acceptancesResponse] = await Promise.all([
    invitationsPromise,
    acceptancesPromise,
  ]);
  if (invitationsResponse.error) {
    if (relationMissing(invitationsResponse.error)) {
      return Object.fromEntries(uniqueTournamentIds.map((id) => [id, empty(false)]));
    }
    throw invitationsResponse.error;
  }
  if (acceptancesResponse.error) {
    if (relationMissing(acceptancesResponse.error)) {
      return Object.fromEntries(uniqueTournamentIds.map((id) => [id, empty(false)]));
    }
    throw acceptancesResponse.error;
  }

  const invitations = (invitationsResponse.data ?? []) as InvitationRow[];
  const latestInvitationByTournament = new Map<string, InvitationRow>();
  for (const invitation of invitations) {
    if (invitation.tournament_id && !latestInvitationByTournament.has(invitation.tournament_id)) {
      latestInvitationByTournament.set(invitation.tournament_id, invitation);
    }
  }

  const acceptances = (acceptancesResponse.data ?? []) as AcceptanceRow[];
  const latestAcceptanceByTournament = new Map<string, AcceptanceRow>();
  for (const acceptance of acceptances) {
    if (acceptance.tournament_id && !latestAcceptanceByTournament.has(acceptance.tournament_id)) {
      latestAcceptanceByTournament.set(acceptance.tournament_id, acceptance);
    }
  }

  const enrollmentIds = acceptances.map((acceptance) => acceptance.id);
  let reviews: ReviewRow[] = [];
  if (enrollmentIds.length) {
    const reviewsResponse = await supabaseAdmin
      .from("ti_hotel_support_enrollment_reviews" as any)
      .select("enrollment_id,status,reviewed_by,reviewed_at,review_note")
      .in("enrollment_id", enrollmentIds);
    if (reviewsResponse.error) throw reviewsResponse.error;
    reviews = (reviewsResponse.data ?? []) as ReviewRow[];
  }
  const reviewByEnrollment = new Map(reviews.map((review) => [review.enrollment_id, review]));

  return Object.fromEntries(uniqueTournamentIds.map((tournamentId) => {
    const invitation = latestInvitationByTournament.get(tournamentId) ?? null;
    const enrollment = latestAcceptanceByTournament.get(tournamentId) ?? null;
    return [tournamentId, {
      schemaReady: true,
      invitation,
      invitationDisplayState: displayInvitationState(invitation),
      enrollment,
      review: enrollment ? reviewByEnrollment.get(enrollment.id) ?? null : null,
    } satisfies AdminHotelSupportEnrollmentView];
  }));
}

export async function adminCreateHotelSupportInvitation(input: {
  tournamentId: string;
  offeredRateCents: number;
}): Promise<HotelSupportAdminActionState> {
  const admin = await requireAdmin();
  if (!input.tournamentId || !isHotelSupportRateCents(input.offeredRateCents)) {
    return { status: "invalid", message: "Choose a supported $5 or $10 rate." };
  }

  const tournament = await supabaseAdmin
    .from("tournaments" as any)
    .select("id")
    .eq("id", input.tournamentId)
    .maybeSingle();
  if (tournament.error || !tournament.data) {
    return { status: "invalid", message: "Tournament not found." };
  }

  const rawToken = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + HOTEL_SUPPORT_INVITATION_LIFETIME_DAYS * 86_400_000).toISOString();
  const response = await (supabaseAdmin as any).rpc("create_ti_hotel_support_invitation_v1", {
    p_tournament_id: input.tournamentId,
    p_offered_rate_cents: input.offeredRateCents,
    p_token_hash: hashHotelSupportToken(rawToken),
    p_expires_at: expiresAt,
    p_admin_id: admin.id,
  });
  if (response.error) {
    return relationMissing(response.error)
      ? { status: "unavailable", message: "Apply the Hotel Support enrollment migration before creating invitations." }
      : { status: "error", message: "Unable to create the enrollment invitation." };
  }

  return {
    status: "created",
    message: "Invitation created. Copy this link now; it cannot be retrieved after you dismiss it.",
    enrollmentUrl: `${tiPublicBaseUrl()}/hotel-support/enroll/${encodeURIComponent(rawToken)}`,
  };
}

export async function adminRevokeHotelSupportInvitation(input: {
  invitationId: string;
}): Promise<HotelSupportAdminActionState> {
  const admin = await requireAdmin();
  if (!input.invitationId) return { status: "invalid", message: "Missing invitation." };
  const response = await (supabaseAdmin as any).rpc("revoke_ti_hotel_support_invitation_v1", {
    p_invitation_id: input.invitationId,
    p_admin_id: admin.id,
  });
  if (response.error) {
    return relationMissing(response.error)
      ? { status: "unavailable", message: "Hotel Support enrollment is not available until its migration is applied." }
      : { status: "error", message: "Unable to revoke the invitation." };
  }
  return response.data
    ? { status: "saved", message: "Invitation revoked." }
    : { status: "stale", message: "The invitation was already used, revoked, or replaced. Reload to review it." };
}

export async function adminReviewHotelSupportEnrollment(input: {
  enrollmentId: string;
  decision: "approved" | "declined";
  reviewNote: string;
}): Promise<HotelSupportAdminActionState> {
  const admin = await requireAdmin();
  if (!input.enrollmentId || !["approved", "declined"].includes(input.decision)) {
    return { status: "invalid", message: "Choose a valid enrollment decision." };
  }
  const reviewNote = input.reviewNote.trim();
  if (reviewNote.length > 1000) return { status: "invalid", message: "Review notes must be 1,000 characters or fewer." };
  const response = await (supabaseAdmin as any).rpc("review_ti_hotel_support_enrollment_v1", {
    p_enrollment_id: input.enrollmentId,
    p_decision: input.decision,
    p_review_note: reviewNote,
    p_admin_id: admin.id,
  });
  if (response.error) {
    return relationMissing(response.error)
      ? { status: "unavailable", message: "Hotel Support enrollment is not available until its migration is applied." }
      : { status: "error", message: "Unable to save the enrollment decision." };
  }
  return response.data
    ? { status: "saved", message: `Enrollment ${input.decision}. This did not activate hotel fee routing.` }
    : { status: "stale", message: "This enrollment was already reviewed. Reload to see its current status." };
}

export async function adminHasApprovedHotelSupportEnrollment(
  tournamentId: string,
  offeredRateCents: HotelSupportRateCents
): Promise<boolean> {
  const acceptancesResponse = await supabaseAdmin
    .from("ti_hotel_support_acceptances" as any)
    .select("id")
    .eq("tournament_id", tournamentId)
    .eq("offered_rate_cents", offeredRateCents)
    .limit(100);
  if (acceptancesResponse.error || !acceptancesResponse.data?.length) return false;
  const ids = (acceptancesResponse.data as Array<{ id: string }>).map((row) => row.id);
  const reviewResponse = await supabaseAdmin
    .from("ti_hotel_support_enrollment_reviews" as any)
    .select("enrollment_id")
    .in("enrollment_id", ids)
    .eq("status", "approved")
    .limit(1);
  return !reviewResponse.error && Boolean(reviewResponse.data?.length);
}
