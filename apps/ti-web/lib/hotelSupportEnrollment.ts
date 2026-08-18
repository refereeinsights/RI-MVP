import {
  HOTEL_SUPPORT_TERMS_VERSION_V2,
  buildHotelSupportTermsV2,
  formatHotelSupportRate,
  validateHotelSupportSubmission,
  type HotelSupportRateCents,
} from "../../../packages/lib/hotel-support";
import {
  hashHotelSupportToken,
  isValidHotelSupportToken,
} from "../../../packages/lib/hotel-support/security";
import { supabaseAdmin } from "./supabaseAdmin";

type InvitationRow = {
  id: string;
  tournament_id: string | null;
  offered_rate_cents: HotelSupportRateCents;
  state: "active" | "consumed" | "revoked";
  expires_at: string;
};

type TournamentRow = {
  id: string;
  name: string;
  start_date: string | null;
  end_date: string | null;
  city: string | null;
  state: string | null;
  slug: string | null;
};

export type PublicHotelSupportInvitation = {
  status: "active" | "submitted";
  tournamentName: string;
  startDate: string | null;
  endDate: string | null;
  city: string | null;
  state: string | null;
  hotelPageUrl: string | null;
  offeredRateCents: HotelSupportRateCents;
  offeredRateLabel: string;
  expiresAt: string;
};

export type PublicHotelSupportInvitationResult =
  | { kind: "available"; invitation: PublicHotelSupportInvitation }
  | { kind: "unavailable"; reason: "invalid" | "expired" | "revoked" | "schema_unavailable" | "error" };

export type HotelSupportEnrollmentActionState = {
  status: "idle" | "error" | "submitted";
  message: string;
  tournamentName?: string;
};

function relationMissing(error: { code?: string | null } | null | undefined) {
  return error?.code === "42P01" || error?.code === "PGRST205" || error?.code === "PGRST202";
}

function publicSiteOrigin() {
  if (process.env.NODE_ENV !== "production") return "http://localhost:3001";
  const configured = String(process.env.NEXT_PUBLIC_TI_SITE_URL ?? "").trim().replace(/\/+$/, "");
  return configured || "https://www.tournamentinsights.com";
}

export async function resolvePublicHotelSupportInvitation(token: string): Promise<PublicHotelSupportInvitationResult> {
  if (!isValidHotelSupportToken(token)) return { kind: "unavailable", reason: "invalid" };
  const invitationResponse = await supabaseAdmin
    .from("ti_hotel_support_invitations" as any)
    .select("id,tournament_id,offered_rate_cents,state,expires_at")
    .eq("token_hash", hashHotelSupportToken(token))
    .maybeSingle();
  if (invitationResponse.error) {
    return {
      kind: "unavailable",
      reason: relationMissing(invitationResponse.error) ? "schema_unavailable" : "error",
    };
  }
  const invitation = invitationResponse.data as InvitationRow | null;
  if (!invitation || !invitation.tournament_id) return { kind: "unavailable", reason: "invalid" };
  if (invitation.state === "revoked") return { kind: "unavailable", reason: "revoked" };
  if (invitation.state === "active" && Date.parse(invitation.expires_at) <= Date.now()) {
    return { kind: "unavailable", reason: "expired" };
  }

  const tournamentResponse = await supabaseAdmin
    .from("tournaments" as any)
    .select("id,name,start_date,end_date,city,state,slug")
    .eq("id", invitation.tournament_id)
    .maybeSingle();
  if (tournamentResponse.error || !tournamentResponse.data) return { kind: "unavailable", reason: "error" };
  const tournament = tournamentResponse.data as TournamentRow;
  const hotelPageUrl = tournament.slug
    ? `${publicSiteOrigin()}/tournaments/${encodeURIComponent(tournament.slug)}/hotels`
    : null;

  return {
    kind: "available",
    invitation: {
      status: invitation.state === "consumed" ? "submitted" : "active",
      tournamentName: tournament.name,
      startDate: tournament.start_date,
      endDate: tournament.end_date,
      city: tournament.city,
      state: tournament.state,
      hotelPageUrl,
      offeredRateCents: invitation.offered_rate_cents,
      offeredRateLabel: formatHotelSupportRate(invitation.offered_rate_cents),
      expiresAt: invitation.expires_at,
    },
  };
}

export async function submitPublicHotelSupportEnrollment(
  token: string,
  formData: FormData
): Promise<HotelSupportEnrollmentActionState> {
  if (!isValidHotelSupportToken(token)) {
    return { status: "error", message: "This enrollment invitation is invalid or unavailable." };
  }
  const validation = validateHotelSupportSubmission({
    contactName: formData.get("contact_name"),
    contactEmail: formData.get("contact_email"),
    contactPhone: formData.get("contact_phone"),
    contactTitle: formData.get("contact_title"),
    expectedRecipientType: formData.get("expected_recipient_type"),
    expectedRecipientName: formData.get("expected_recipient_name"),
    confirmAuthority: formData.get("confirm_authority") === "on",
    confirmHousingEligibility: formData.get("confirm_housing_eligibility") === "on",
    confirmTerms: formData.get("confirm_terms") === "on",
  });
  if (!validation.ok) return { status: "error", message: validation.message };
  const value = validation.value;

  const response = await (supabaseAdmin as any).rpc("submit_ti_hotel_support_enrollment_v2", {
    p_token_hash: hashHotelSupportToken(token),
    p_contact_name: value.contactName,
    p_contact_email: value.contactEmail,
    p_contact_phone: value.contactPhone,
    p_contact_title: value.contactTitle,
    p_expected_recipient_type: value.expectedRecipientType,
    p_expected_recipient_name: value.expectedRecipientName,
    p_confirm_authority: true,
    p_confirm_housing_eligibility: true,
    p_confirm_terms: true,
  });
  if (response.error) {
    return {
      status: "error",
      message: relationMissing(response.error)
        ? "Enrollment is not available yet. Please contact TournamentInsights."
        : "This invitation is invalid, expired, revoked, or already unavailable.",
    };
  }
  const row = Array.isArray(response.data) ? response.data[0] : response.data;
  if (!row?.tournament_name) return { status: "error", message: "Unable to confirm the enrollment submission." };
  return {
    status: "submitted",
    message: "Enrollment received.",
    tournamentName: String(row.tournament_name),
  };
}

export { HOTEL_SUPPORT_TERMS_VERSION_V2, buildHotelSupportTermsV2 };
