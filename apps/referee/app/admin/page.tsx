import SportsPickerClient from "@/components/SportsPickerClient";
import TournamentLookup from "@/components/TournamentLookup";
import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import OwlsEyePanel from "./owls-eye/OwlsEyePanel";
import AdminNav from "@/components/admin/AdminNav";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

import {
  requireAdmin,
  adminSearchUsers,
  adminUpdateUserProfile,
  adminSetUserDisabled,
  adminListBadges,
  adminGetUserBadges,
  adminAwardBadge,
  adminRevokeBadge,
  adminListVerificationRequests,
  adminSetVerificationStatus,
  adminResendConfirmationEmail,
  adminListTournamentReviews,
  adminUpdateTournamentReview,
  adminDeleteTournamentReview,
  adminListSchoolReviews,
  adminUpdateSchoolReview,
  adminDeleteSchoolReview,
  adminListTournamentContacts,
  adminCreateTournamentContact,
  adminUpdateTournamentContact,
  adminDeleteTournamentContact,
  adminListRefereeContacts,
  adminCreateRefereeContact,
  adminUpdateRefereeContact,
  adminDeleteRefereeContact,
  adminFindTournamentIdBySlug,
  adminFindTournamentIdBySlugOrName,
  adminLinkRefereeContactToTournament,
  adminUnlinkRefereeContactFromTournament,
  adminListPendingTournaments,
  adminUpdateTournamentStatus,
  adminDeleteTournament,
  type AdminPendingTournament,
  adminSearchPublishedTournaments,
  adminUpdateTournamentDetails,
  type AdminListedTournament,
  type AdminBadgeRow,
  type AdminUserRow,
  type ReviewStatus,
  type ContactStatus,
} from "@/lib/admin";
import { queueEnrichmentJobs } from "@/server/enrichment/pipeline";
import {
  cleanCsvRows,
  csvRowsToTournamentRows,
  extractHtmlFromMhtml,
  extractUSClubTournamentsFromHtml,
  extractEventsFromJsonLd,
  extractGrassrootsCalendar,
  importTournamentRecords,
  parseCsv,
} from "@/lib/tournaments/importUtils";
import type {
  TournamentRow,
  TournamentSource,
  TournamentStatus,
  TournamentSubmissionType,
} from "@/lib/types/tournament";
import { createTournamentFromUrl, fetchHtml } from "@/server/admin/pasteUrl";
import {
  insertRun as insertSourceRun,
  normalizeSourceUrl,
  upsertRegistry as upsertSourceRegistry,
  updateRegistrySweep,
  updateRunExtractedJson,
} from "@/server/admin/sources";

type Tab =
  | "users"
  | "verification"
  | "badges"
  | "reviews"
  | "school-reviews"
  | "tournament-contacts"
  | "referee-contacts"
  | "tournament-uploads"
  | "tournament-listings"
  | "owls-eye";
type VStatus = "pending" | "approved" | "rejected";
const SCHOOL_SPORTS = ["soccer", "basketball", "football"];
const CONTACT_TYPES = ["assignor", "director", "general", "referee_coordinator"] as const;
const CONTACT_STATUSES: ContactStatus[] = ["pending", "verified", "rejected"];
const TOURNAMENT_SPORTS = ["soccer", "basketball", "football"] as const;
const TOURNAMENT_SOURCES: TournamentSource[] = [
  "external_crawl",
  "us_club_soccer",
  "soccerwire",
  "gotsoccer",
  "cal_south",
  "public_submission",
];
const SUBMISSION_TYPES = ["internet", "website", "paid", "admin"] as const;
const SUBMISSION_LABELS: Record<string, string> = {
  internet: "Crawler/import",
  website: "Public submission",
  paid: "Paid submission",
  admin: "Admin upload",
};
const isSubmissionType = (value: string): value is TournamentSubmissionType =>
  SUBMISSION_TYPES.includes(value as (typeof SUBMISSION_TYPES)[number]);

function safeSportsArray(value: any): string[] {
  if (Array.isArray(value)) return value.filter(Boolean).map(String);
  return [];
}

function redirectWithNotice(target: FormDataEntryValue | null, notice: string): never {
  const base =
    typeof target === "string" && target.length > 0 ? target : "/admin";
  const joiner = base.includes("?") ? "&" : "?";
  redirect(`${base}${joiner}notice=${encodeURIComponent(notice)}`);
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: {
    tab?: Tab;
    q?: string;
    vstatus?: VStatus;
    rstatus?: ReviewStatus;
    cstatus?: ContactStatus;
    notice?: string;
    fallback_source_url?: string;
  };
}) {
  await requireAdmin();
  const owlsEyeAdminToken =
    process.env.NEXT_PUBLIC_OWLS_EYE_ADMIN_TOKEN ?? process.env.OWLS_EYE_ADMIN_TOKEN ?? "";

  const tab: Tab = (searchParams.tab as Tab) ?? "verification";
  const q = searchParams.q ?? "";
  const vstatus: VStatus = (searchParams.vstatus as VStatus) ?? "pending";
  const reviewStatus: ReviewStatus = (searchParams.rstatus as ReviewStatus) ?? "pending";
  const contactStatus: ContactStatus = (searchParams.cstatus as ContactStatus) ?? "pending";
  const notice = searchParams.notice ?? "";
  const fallbackSourceUrlParam = searchParams.fallback_source_url ?? "";

  const params = new URLSearchParams();
  params.set("tab", tab);
  if (tab === "verification") {
    params.set("vstatus", vstatus);
  }
  if (tab === "reviews" || tab === "school-reviews") {
    params.set("rstatus", reviewStatus);
  }
  if (tab === "tournament-contacts") {
    params.set("cstatus", contactStatus);
  }
  if (q) {
    params.set("q", q);
  }
  const adminBasePath = params.toString() ? `/admin?${params.toString()}` : "/admin";

  const badges: AdminBadgeRow[] = await adminListBadges();

  const users: AdminUserRow[] =
    tab === "users" || tab === "badges" ? (q ? await adminSearchUsers(q) : []) : [];

  const requests =
    tab === "verification" ? await adminListVerificationRequests(vstatus) : [];

  const reviewSubmissions =
    tab === "reviews" ? await adminListTournamentReviews(reviewStatus) : [];
  const schoolReviewSubmissions =
    tab === "school-reviews" ? await adminListSchoolReviews(reviewStatus) : [];
  const tournamentContacts =
    tab === "tournament-contacts" ? await adminListTournamentContacts(contactStatus) : [];
  const refereeContacts =
    tab === "referee-contacts" ? await adminListRefereeContacts() : [];
  const tournamentsMissingContacts =
    tab === "tournament-contacts"
      ? await supabaseAdmin
          .from("tournaments" as any)
          .select("id,name,url")
          .not("url", "is", null)
          .order("created_at", { ascending: false })
          .limit(50)
          .then((res) => res.data ?? [])
      : [];
  const pendingTournaments: AdminPendingTournament[] =
    tab === "tournament-uploads" ? await adminListPendingTournaments() : [];
  const listedTournaments: AdminListedTournament[] =
    tab === "tournament-listings" ? await adminSearchPublishedTournaments(q) : [];

  const formatDateInput = (value?: string | null) => {
    if (!value) return "";
    return value.slice(0, 10);
  };

  async function updateUser(formData: FormData) {
    "use server";

    const user_id = String(formData.get("user_id") || "");
    const role = String(formData.get("role") || "");
    const years = String(formData.get("years_refereeing") || "").trim();
    const sportsCsv = String(formData.get("sports") || "").trim();
    const redirectTo = formData.get("redirect_to");

    await adminUpdateUserProfile({
      user_id,
      role: role || null,
      years_refereeing: years ? Number(years) : null,
      sports: sportsCsv
        ? sportsCsv.split(",").map((s) => s.trim()).filter(Boolean)
        : null,
    });

    redirectWithNotice(redirectTo, "Profile updated");
  }

  async function setDisabled(formData: FormData) {
    "use server";
    const user_id = String(formData.get("user_id") || "");
    const disabled = String(formData.get("disabled") || "") === "true";
    const redirectTo = formData.get("redirect_to");
    await adminSetUserDisabled(user_id, disabled);
    redirectWithNotice(redirectTo, disabled ? "User disabled" : "User enabled");
  }

  async function queueEnrichmentAction(formData: FormData) {
    "use server";
    const redirectTo = formData.get("redirect_to");
    const idFromLookup = String(formData.get("tournament_id") || "").trim();
    const idFromSelect = String(formData.get("tournament_id_select") || "").trim();
    const tournament_id = idFromLookup || idFromSelect;

    if (!tournament_id) {
      redirectWithNotice(redirectTo, "Missing tournament id");
    }
    try {
      await queueEnrichmentJobs([tournament_id]);
    } catch (err: any) {
      // Let framework redirects bubble through
      if (typeof err?.message === "string" && err.message.includes("NEXT_REDIRECT")) {
        throw err;
      }
      const msg =
        typeof err?.message === "string"
          ? `Queue failed: ${err.message}`
          : "Queue failed";
      redirectWithNotice(redirectTo, msg);
    }
    redirectWithNotice(redirectTo, "Enrichment queued");
  }

  async function awardBadgeAction(formData: FormData) {
    "use server";
    const user_id = String(formData.get("user_id") || "");
    const badge_id = Number(formData.get("badge_id"));
    const redirectTo = formData.get("redirect_to");
    if (!user_id || !badge_id) return;
    await adminAwardBadge({ user_id, badge_id });
    redirectWithNotice(redirectTo, "Badge awarded");
  }

  async function resendConfirmationAction(formData: FormData) {
    "use server";
    const email = String(formData.get("email") || "").trim();
    const redirectTo = formData.get("redirect_to");
    if (!email) return;
    await adminResendConfirmationEmail({ email });
    redirectWithNotice(redirectTo, "Confirmation email sent");
  }

  async function revokeBadgeAction(formData: FormData) {
    "use server";
    const user_id = String(formData.get("user_id") || "");
    const badge_id = Number(formData.get("badge_id"));
    const redirectTo = formData.get("redirect_to");
    if (!user_id || !badge_id) return;
    await adminRevokeBadge({ user_id, badge_id });
    redirectWithNotice(redirectTo, "Badge revoked");
  }

  async function approveVerificationAction(formData: FormData) {
    "use server";
    const request_id = Number(formData.get("request_id"));
    const admin_notes = String(formData.get("admin_notes") || "").trim();
    const redirectTo = formData.get("redirect_to");

    await adminSetVerificationStatus({
      request_id,
      status: "approved",
      admin_notes: admin_notes || null,
    });
    redirectWithNotice(redirectTo, "Verification approved");
  }

  async function rejectVerificationAction(formData: FormData) {
    "use server";
    const request_id = Number(formData.get("request_id"));
    const admin_notes = String(formData.get("admin_notes") || "").trim();
    const redirectTo = formData.get("redirect_to");

    await adminSetVerificationStatus({
      request_id,
      status: "rejected",
      admin_notes: admin_notes || null,
    });
    redirectWithNotice(redirectTo, "Verification rejected");
  }

  async function quickApproveVerificationAction(formData: FormData) {
    "use server";
    const request_id = Number(formData.get("request_id"));
    const redirectTo = formData.get("redirect_to");

    await adminSetVerificationStatus({
      request_id,
      status: "approved",
      admin_notes: null,
    });
    redirectWithNotice(redirectTo, "Verification approved");
  }

  async function updateReviewAction(formData: FormData) {
    "use server";
    const review_id = String(formData.get("review_id") || "");
    if (!review_id) return;

    const redirectTo = formData.get("redirect_to");
    const statusInput = String(formData.get("status") || "pending");
    const normalizedStatus: ReviewStatus =
      statusInput === "approved" || statusInput === "rejected" ? statusInput : "pending";

    const numberFields = [
      "overall_score",
      "logistics_score",
      "facilities_score",
      "pay_score",
      "support_score",
    ] as const;

    const updates: Record<string, any> = {
      status: normalizedStatus,
    };

    for (const field of numberFields) {
      const raw = formData.get(field);
      const value = raw !== null ? Number(raw) : null;
      if (typeof value === "number" && Number.isFinite(value)) {
        updates[field] = value;
      }
    }

    const workedGamesRaw = formData.get("worked_games");
    if (workedGamesRaw !== null && workedGamesRaw !== "") {
      const value = Number(workedGamesRaw);
      updates.worked_games = Number.isFinite(value) ? value : null;
    } else {
      updates.worked_games = null;
    }

    const shiftDetail = String(formData.get("shift_detail") || "").trim();
    updates.shift_detail = shiftDetail || null;

    await adminUpdateTournamentReview({ review_id, updates });
    redirectWithNotice(redirectTo, "Review updated");
  }

  async function deleteReviewAction(formData: FormData) {
    "use server";
    const review_id = String(formData.get("review_id") || "");
    if (!review_id) return;
    const redirectTo = formData.get("redirect_to");
    await adminDeleteTournamentReview(review_id);
    redirectWithNotice(redirectTo, "Review deleted");
  }

  async function updateSchoolReviewAction(formData: FormData) {
    "use server";
    const review_id = String(formData.get("review_id") || "");
    if (!review_id) return;

    const redirectTo = formData.get("redirect_to");
    const statusInput = String(formData.get("status") || "pending");
    const normalizedStatus: ReviewStatus =
      statusInput === "approved" || statusInput === "rejected" ? statusInput : "pending";

    const numberFields = [
      "overall_score",
      "logistics_score",
      "facilities_score",
      "pay_score",
      "support_score",
    ] as const;

    const updates: Record<string, any> = {
      status: normalizedStatus,
    };

    for (const field of numberFields) {
      const raw = formData.get(field);
      const value = raw !== null ? Number(raw) : null;
      if (typeof value === "number" && Number.isFinite(value)) {
        updates[field] = value;
      }
    }

    const workedGamesRaw = formData.get("worked_games");
    if (workedGamesRaw !== null && workedGamesRaw !== "") {
      const value = Number(workedGamesRaw);
      updates.worked_games = Number.isFinite(value) ? value : null;
    } else {
      updates.worked_games = null;
    }

    const shiftDetail = String(formData.get("shift_detail") || "").trim();
    updates.shift_detail = shiftDetail || null;

    const sportValue = String(formData.get("sport") || "");
    if (sportValue && SCHOOL_SPORTS.includes(sportValue)) {
      updates.sport = sportValue;
    }

    await adminUpdateSchoolReview({ review_id, updates });
    redirectWithNotice(redirectTo, "Review updated");
  }

  async function deleteSchoolReviewAction(formData: FormData) {
    "use server";
    const review_id = String(formData.get("review_id") || "");
    if (!review_id) return;
    const redirectTo = formData.get("redirect_to");
    await adminDeleteSchoolReview(review_id);
    redirectWithNotice(redirectTo, "Review deleted");
  }

  async function createTournamentContactAction(formData: FormData) {
    "use server";
    const redirectTo = formData.get("redirect_to");
    const typeInput = String(formData.get("contact_type") || "general").toLowerCase();
    const allowedTypes = ["assignor", "director", "general"];
    const statusInput = String(formData.get("status") || "pending").toLowerCase();
    const allowedStatuses: ContactStatus[] = ["pending", "verified", "rejected"];
    const tournamentIdInput = String(formData.get("tournament_id") || "").trim();
    const tournamentSlugOrName = String(formData.get("tournament_slug") || "").trim();

    let tournament_id = tournamentIdInput || null;
    if (!tournament_id && tournamentSlugOrName) {
      tournament_id = await adminFindTournamentIdBySlugOrName(tournamentSlugOrName);
    }

    await adminCreateTournamentContact({
      tournament_id,
      type: allowedTypes.includes(typeInput) ? (typeInput as any) : "general",
      status: allowedStatuses.includes(statusInput as ContactStatus)
        ? (statusInput as ContactStatus)
        : "pending",
      name: (formData.get("name") as string) || null,
      email: (formData.get("email") as string) || null,
      phone: (formData.get("phone") as string) || null,
      source_url: (formData.get("source_url") as string) || null,
      notes: (formData.get("notes") as string) || null,
      confidence: formData.get("confidence")
        ? Number(formData.get("confidence"))
        : null,
    });

    redirectWithNotice(redirectTo, "Tournament contact added");
  }

  async function updateTournamentContactAction(formData: FormData) {
    "use server";
    const id = String(formData.get("contact_id") || "");
    if (!id) return;
    const redirectTo = formData.get("redirect_to");
    const statusInput = String(formData.get("status") || "").toLowerCase();
    const allowedStatuses: ContactStatus[] = ["pending", "verified", "rejected"];

    const updates: any = {};
    if (allowedStatuses.includes(statusInput as ContactStatus)) {
      updates.status = statusInput;
    }
    const confidenceRaw = formData.get("confidence");
    if (confidenceRaw && confidenceRaw !== "") {
      const value = Number(confidenceRaw);
      if (Number.isFinite(value)) updates.confidence = value;
    }
    const notes = String(formData.get("notes") || "").trim();
    updates.notes = notes || null;

    await adminUpdateTournamentContact(id, updates);
    redirectWithNotice(redirectTo, "Tournament contact updated");
  }

  async function deleteTournamentContactAction(formData: FormData) {
    "use server";
    const id = String(formData.get("contact_id") || "");
    if (!id) return;
    const redirectTo = formData.get("redirect_to");
    await adminDeleteTournamentContact(id);
    redirectWithNotice(redirectTo, "Tournament contact deleted");
  }

  async function createRefereeContactAction(formData: FormData) {
    "use server";
    const redirectTo = formData.get("redirect_to");
    const typeInput = String(formData.get("contact_type") || "general").toLowerCase();
    const statusInput = String(formData.get("status") || "pending").toLowerCase();
    const confidenceRaw = String(formData.get("confidence") || "").trim();
    const confidence =
      confidenceRaw === "" ? null : Number.isFinite(Number(confidenceRaw)) ? Number(confidenceRaw) : null;
    const selectedTournamentId = String(formData.get("tournament_id") || "").trim();
    const tournamentLookup = String(formData.get("tournament_slug") || "").trim();
    let tournamentId: string | null = selectedTournamentId || null;
    if (!tournamentId && tournamentLookup) {
      tournamentId = await adminFindTournamentIdBySlugOrName(tournamentLookup);
    }

    const newContactId = await adminCreateRefereeContact({
      name: (formData.get("name") as string) || null,
      organization: (formData.get("organization") as string) || null,
      role: (formData.get("role") as string) || null,
      email: (formData.get("email") as string) || null,
      phone: (formData.get("phone") as string) || null,
      state: (formData.get("state") as string) || null,
      city: (formData.get("city") as string) || null,
      notes: (formData.get("notes") as string) || null,
      source_url: (formData.get("source_url") as string) || null,
      type: CONTACT_TYPES.includes(typeInput as any)
        ? (typeInput as (typeof CONTACT_TYPES)[number])
        : "general",
      status: CONTACT_STATUSES.includes(statusInput as ContactStatus)
        ? (statusInput as ContactStatus)
        : "pending",
      confidence,
    });
    if (newContactId && tournamentId) {
      await adminLinkRefereeContactToTournament({
        contact_id: newContactId,
        tournament_id: tournamentId,
        notes: null,
      });
      redirectWithNotice(redirectTo, "Referee contact added and linked");
    } else if (newContactId && tournamentLookup && !tournamentId) {
      redirectWithNotice(redirectTo, "Contact added (tournament not found)");
    } else {
      redirectWithNotice(redirectTo, "Referee contact added");
    }
  }

  async function updateRefereeContactAction(formData: FormData) {
    "use server";
    const id = String(formData.get("contact_id") || "");
    if (!id) return;
    const redirectTo = formData.get("redirect_to");

    const updates: any = {};
    ["name", "organization", "role", "email", "phone", "state", "city"].forEach((field) => {
      if (formData.has(field)) {
        const value = String(formData.get(field) || "").trim();
        updates[field] = value || null;
      }
    });

    if (formData.has("notes")) {
      const notes = String(formData.get("notes") || "").trim();
      updates.notes = notes || null;
    }

    if (formData.has("source_url")) {
      const url = String(formData.get("source_url") || "").trim();
      updates.source_url = url || null;
    }

    if (formData.has("contact_type")) {
      const typeValue = String(formData.get("contact_type") || "").toLowerCase();
      if (CONTACT_TYPES.includes(typeValue as any)) {
        updates.type = typeValue;
      }
    }

    if (formData.has("status")) {
      const statusValue = String(formData.get("status") || "").toLowerCase();
      if (CONTACT_STATUSES.includes(statusValue as ContactStatus)) {
        updates.status = statusValue;
      }
    }

    if (formData.has("confidence")) {
      const confidenceRaw = String(formData.get("confidence") || "").trim();
      updates.confidence =
        confidenceRaw === "" ? null : Number.isFinite(Number(confidenceRaw)) ? Number(confidenceRaw) : null;
    }

    await adminUpdateRefereeContact(id, updates);
    redirectWithNotice(redirectTo, "Referee contact updated");
  }

  async function deleteRefereeContactAction(formData: FormData) {
    "use server";
    const id = String(formData.get("contact_id") || "");
    if (!id) return;
    const redirectTo = formData.get("redirect_to");
    await adminDeleteRefereeContact(id);
    redirectWithNotice(redirectTo, "Referee contact deleted");
  }

  async function linkRefereeContactAction(formData: FormData) {
    "use server";
    const contactId = String(formData.get("contact_id") || "");
    const redirectTo = formData.get("redirect_to");
    const selectedId = String(formData.get("tournament_id") || "").trim();
    const lookup = String(formData.get("tournament_slug") || "").trim();
    const notes = String(formData.get("link_notes") || "").trim();

    if (!contactId || (!selectedId && !lookup)) {
      redirectWithNotice(redirectTo, "Tournament selection required");
      return;
    }

    let tournamentId = selectedId;
    if (!tournamentId && lookup) {
      tournamentId = await adminFindTournamentIdBySlugOrName(lookup);
    }
    if (!tournamentId) {
      redirectWithNotice(redirectTo, "Tournament not found");
      return;
    }

    await adminLinkRefereeContactToTournament({
      contact_id: contactId,
      tournament_id: tournamentId,
      notes: notes || null,
    });
    redirectWithNotice(redirectTo, "Contact linked to tournament");
  }

  async function unlinkRefereeContactAction(formData: FormData) {
    "use server";
    const linkId = String(formData.get("link_id") || "");
    if (!linkId) return;
    const redirectTo = formData.get("redirect_to");
    await adminUnlinkRefereeContactFromTournament(linkId);
    redirectWithNotice(redirectTo, "Contact unlinked");
  }

  async function approveTournamentAction(formData: FormData) {
    "use server";
    const tournamentId = String(formData.get("tournament_id") || "");
    if (!tournamentId) return;
    const redirectTo = formData.get("redirect_to");
    await adminUpdateTournamentStatus({ tournament_id: tournamentId, status: "published" });
    redirectWithNotice(redirectTo, "Tournament approved");
  }

  async function archiveTournamentAction(formData: FormData) {
    "use server";
    const tournamentId = String(formData.get("tournament_id") || "");
    if (!tournamentId) return;
    const redirectTo = formData.get("redirect_to");
    await adminUpdateTournamentStatus({ tournament_id: tournamentId, status: "archived" });
    redirectWithNotice(redirectTo, "Tournament archived");
  }

  async function bulkTournamentAction(formData: FormData) {
    "use server";
    const redirectTo = formData.get("redirect_to");
    const action = String(formData.get("bulk_action") || "");
    const ids = formData.getAll("selected") as string[];
    if (!ids.length) {
      return redirectWithNotice(redirectTo, "Select at least one tournament.");
    }
    if (action === "approve") {
      await Promise.all(ids.map((id) => adminUpdateTournamentStatus({ tournament_id: id, status: "published" })));
      return redirectWithNotice(redirectTo, `${ids.length} tournament(s) approved.`);
    } else if (action === "archive") {
      await Promise.all(ids.map((id) => adminUpdateTournamentStatus({ tournament_id: id, status: "archived" })));
      return redirectWithNotice(redirectTo, `${ids.length} tournament(s) archived.`);
    } else if (action === "delete") {
      await Promise.all(ids.map((id) => adminDeleteTournament(id)));
      return redirectWithNotice(redirectTo, `${ids.length} tournament(s) deleted.`);
    } else {
      return redirectWithNotice(redirectTo, "Unknown bulk action.");
    }
  }

  async function importTournamentsAction(formData: FormData) {
    "use server";
    const file = formData.get("upload") as File | null;
    const redirectTo = formData.get("redirect_to");
    const treatConfirmed = String(formData.get("treat_confirmed") || "") === "on";
    const status: TournamentStatus = treatConfirmed ? "published" : "draft";
    const source = (formData.get("source") as TournamentSource) ?? "external_crawl";
    const fallbackSportInput = String(formData.get("fallback_sport") || "soccer").toLowerCase();
    const fallbackSport = TOURNAMENT_SPORTS.includes(fallbackSportInput as any)
      ? (fallbackSportInput as (typeof TOURNAMENT_SPORTS)[number])
      : "soccer";
    const fallbackLevel = String(formData.get("fallback_level") || "").trim() || null;
    const fallbackName = String(formData.get("fallback_name") || "").trim() || null;
    const fallbackVenue = String(formData.get("fallback_venue") || "").trim() || null;
    const fallbackCity = String(formData.get("fallback_city") || "").trim() || null;
    const fallbackState = String(formData.get("fallback_state") || "").trim() || null;
    const fallbackZip = String(formData.get("fallback_zip") || "").trim() || null;
    const fallbackSourceUrlRaw = String(formData.get("fallback_source_url") || "").trim() || "";
    const fallbackContactEmail = String(formData.get("fallback_contact_email") || "").trim() || null;
    const fallbackContactPhone = String(formData.get("fallback_contact_phone") || "").trim() || null;
    const fallbackSummary = String(formData.get("fallback_summary") || "").trim() || null;

    let records: TournamentRow[] = [];
    let dropSummary = "";
    let csvOriginalRowCount: number | null = null;
    let csvDropReasons: string[] = [];
    const normalizedSourceUrl = fallbackSourceUrlRaw ? normalizeSourceUrl(fallbackSourceUrlRaw).canonical : null;
    const fileProvided = file && file.size > 0;

    if (fileProvided) {
      const buffer = Buffer.from(await file!.arrayBuffer());
      const contents = buffer.toString("utf8");
      const filename = file!.name.toLowerCase();

      if (filename.endsWith(".csv")) {
        const { rows } = parseCsv(contents);
        csvOriginalRowCount = rows.length;
        const { kept, dropped } = cleanCsvRows(rows);
        if (dropped.length) {
          csvDropReasons = dropped.slice(0, 3).map((entry) => {
            const name = entry.row?.name || entry.row?.slug || "row";
            return `${name}: ${entry.reason}`;
          });
          dropSummary = `${dropped.length} row(s) skipped by cleaner`;
        }
        if (!kept.length) {
          const message =
            dropSummary || "CSV parsed but no usable tournaments remained after cleaning.";
          return redirectWithNotice(redirectTo, message);
        }
        records = csvRowsToTournamentRows(kept, { status, source, subType: "admin" });
      } else if (
        filename.endsWith(".html") ||
        filename.endsWith(".htm") ||
        filename.endsWith(".mhtml")
      ) {
        const html = filename.endsWith(".mhtml") ? extractHtmlFromMhtml(contents) : contents;
        records = extractUSClubTournamentsFromHtml(html, {
          sport: fallbackSport,
          level: fallbackLevel,
          status,
          source,
          subType: "admin",
        });
      } else {
        return redirectWithNotice(redirectTo, "Unsupported file type. Use CSV, HTML, or MHTML.");
      }
    } else if (normalizedSourceUrl && normalizedSourceUrl.includes("grassroots365.com")) {
      const candidates = new Set<string>();
      candidates.add(normalizedSourceUrl);
      try {
        const u = new URL(normalizedSourceUrl);
        if (u.pathname !== "/calendar/") {
          candidates.add(`${u.origin}/calendar/`);
        }
        candidates.add(`${u.origin}/calendar/?print=true`);
        candidates.add(`${u.origin}/calendar/?vtype=list`);
      } catch {
        // ignore URL parsing errors; still try the original
      }

      let parsedFrom = "";
      for (const candidate of candidates) {
        const html = await fetchHtml(candidate);
        if (!html) continue;
        // Try JSON-LD first, then fallback to table parser.
        let parsed: TournamentRow[] = extractEventsFromJsonLd(html, {
          sport: fallbackSport,
          status,
          source,
          fallbackUrl: candidate,
        });
        if (!parsed.length) {
          parsed = extractGrassrootsCalendar(html, {
            sport: fallbackSport,
            status,
            source,
            fallbackUrl: candidate,
          });
        }
        if (parsed.length) {
          records = parsed;
          parsedFrom = candidate;
          break;
        }
      }

      if (!records.length) {
        return redirectWithNotice(
          redirectTo,
          "Sweep fetched but no events were parsed from grassroots365 (tried calendar variants)."
        );
      } else {
        dropSummary = `Parsed ${records.length} events from ${parsedFrom || normalizedSourceUrl}`;
      }
    } else {
      return redirectWithNotice(redirectTo, "Please choose a file to import.");
    }

    if (!records.length) {
      return redirectWithNotice(redirectTo, "No tournaments detected in the uploaded file.");
    }

    // apply fallbacks to records where missing
    records = records.map((r) => ({
      ...r,
      name: r.name || fallbackName || r.slug,
      venue: r.venue ?? fallbackVenue,
      city: r.city ?? fallbackCity ?? "Unknown",
      state: r.state ?? fallbackState ?? "NA",
      zip: (r as any).zip ?? fallbackZip,
      source_url: r.source_url || fallbackSourceUrlRaw || r.source_url,
      summary: r.summary ?? fallbackSummary,
      referee_contact: (r as any).referee_contact ?? fallbackContactEmail ?? fallbackContactPhone ?? null,
    }));

    let registryId: string | null = null;
    let runId: string | null = null;

    if (normalizedSourceUrl) {
      const uploadLabel = fileProvided ? file!.name.toLowerCase() : "live-fetch";
      const registry = await upsertSourceRegistry({
        source_url: normalizedSourceUrl,
        source_type: "platform_listing",
        sport: fallbackSport,
        state: fallbackState,
        city: fallbackCity,
        notes: `Upload: ${uploadLabel}`,
        is_active: true,
      });
      registryId = registry.registry_id;
      runId = await insertSourceRun({
        registry_id: registry.registry_id,
        source_url: normalizedSourceUrl,
        url: normalizedSourceUrl,
        http_status: 200,
        title: uploadLabel,
        extracted_json: {
          action: "import",
          discovered_count: records.length,
          warnings: csvDropReasons.slice(0, 3),
          params: { sport: fallbackSport, state: fallbackState, city: fallbackCity },
        },
        extract_confidence: 0.6,
      });
    }

    const result = await importTournamentRecords(records);
    const noticeParts: string[] = [];
    noticeParts.push(
      result.failures.length === 0
        ? `Imported ${result.success} tournament${result.success === 1 ? "" : "s"}.`
        : `Imported ${result.success} tournament(s); ${result.failures.length} failed.`
    );

    if (dropSummary) {
      const detail = csvDropReasons.length ? ` ${csvDropReasons.join("; ")}` : "";
      noticeParts.push(`${dropSummary}.${detail}`);
    }
    if (csvOriginalRowCount !== null && records.length < csvOriginalRowCount) {
      noticeParts.push(`Cleaner kept ${records.length}/${csvOriginalRowCount} rows.`);
    }
    if (result.failures.length) {
      const examples = result.failures
        .slice(0, 2)
        .map((failure) => failure.error.replace(/\s+/g, " ").trim())
        .filter(Boolean);
      if (examples.length) {
        noticeParts.push(`Sample failure: ${examples.join(" | ")}`);
      }
    }

    if (runId) {
      await updateRunExtractedJson(runId, {
        action: "import",
        discovered_count: records.length,
        imported_count: result.success,
        duplicates_skipped_count: result.failures.length,
        params: { sport: fallbackSport, state: fallbackState, city: fallbackCity },
      });
    }
    if (registryId) {
      await updateRegistrySweep(registryId, "ok", `Discovered ${records.length}, imported ${result.success}`);
      if (result.tournamentIds?.length) {
        await supabaseAdmin
          .from("tournaments" as any)
          .update({ discovery_source_id: registryId, discovery_sweep_id: runId })
          .in("id", result.tournamentIds);
      }
    }

    return redirectWithNotice(redirectTo, noticeParts.join(" ").trim());
  }

  async function dedupePendingTournamentsAction(formData: FormData) {
    "use server";
    await requireAdmin();
    const redirectTo = formData.get("redirect_to") || "/admin?tab=tournament-uploads";
    const { data, error } = await supabaseAdmin
      .from("tournaments" as any)
      .select("id,name,city,state,start_date,created_at")
      .eq("status", "pending");
    if (error) {
      return redirectWithNotice(redirectTo, `Cleanup failed: ${error.message}`);
    }
    if (!data || !Array.isArray(data) || !data.length) {
      return redirectWithNotice(redirectTo, "Cleanup: no pending tournaments found.");
    }

    const rows = data as {
      id: string;
      name?: string | null;
      city?: string | null;
      state?: string | null;
      start_date?: string | null;
      created_at: string;
    }[];

    const keep = new Map<string, { id: string; created_at: string }>();
    const dupes: string[] = [];
    for (const row of rows) {
      const key = `${(row.name || "").toLowerCase().trim()}|${(row.city || "").toLowerCase().trim()}|${(row.state || "").toLowerCase().trim()}|${row.start_date || ""}`;
      if (!keep.has(key)) {
        keep.set(key, { id: row.id, created_at: row.created_at });
      } else {
        const existing = keep.get(key)!;
        if (row.created_at < existing.created_at) {
          dupes.push(existing.id);
          keep.set(key, { id: row.id, created_at: row.created_at });
        } else {
          dupes.push(row.id);
        }
      }
    }
    if (!dupes.length) {
      return redirectWithNotice(redirectTo, "Cleanup: no duplicates found (name/city/state/start_date).");
    }
    const { error: delErr } = await supabaseAdmin.from("tournaments" as any).delete().in("id", dupes);
    if (delErr) {
      return redirectWithNotice(redirectTo, `Cleanup failed: ${delErr.message}`);
    }
    return redirectWithNotice(redirectTo, `Cleanup removed ${dupes.length} pending duplicate(s).`);
  }

  async function queuePendingEnrichmentAction(formData: FormData) {
    "use server";
    await requireAdmin();
    const redirectTo = formData.get("redirect_to") || "/admin?tab=tournament-uploads";
    const { data: pending, error: pendingErr } = await supabaseAdmin
      .from("tournaments" as any)
      .select("id")
      .eq("status", "pending")
      .eq("enrichment_skip", false);
    if (pendingErr) {
      return redirectWithNotice(redirectTo, `Queue failed: ${pendingErr.message}`);
    }
    const rows = (pending ?? []) as { id: string }[];
    const ids = rows.map((r) => r.id);
    if (!ids.length) {
      return redirectWithNotice(redirectTo, "No pending tournaments to queue.");
    }
    const { data: existingJobs, error: jobErr } = await supabaseAdmin
      .from("tournament_enrichment_jobs" as any)
      .select("tournament_id,status")
      .in("tournament_id", ids);
    if (jobErr) {
      return redirectWithNotice(redirectTo, `Queue failed: ${jobErr.message}`);
    }
    const blocked = new Set(
      (existingJobs ?? [])
        .filter((j) => ["queued", "running", "done"].includes(String(j.status)))
        .map((j) => j.tournament_id)
    );
    const toQueue = ids.filter((id) => !blocked.has(id));
    if (!toQueue.length) {
      return redirectWithNotice(redirectTo, "All pending tournaments already have enrichment jobs.");
    }
    const payload = toQueue.map((id) => ({ tournament_id: id }));
    const { error: insertErr } = await supabaseAdmin
      .from("tournament_enrichment_jobs" as any)
      .insert(payload, { ignoreDuplicates: true });
    if (insertErr) {
      return redirectWithNotice(redirectTo, `Queue failed: ${insertErr.message}`);
    }
    return redirectWithNotice(redirectTo, `Queued enrichment for ${payload.length} pending tournament(s).`);
  }

  async function createFromUrlAction(formData: FormData) {
    "use server";
    const url = String(formData.get("tournament_url") || "").trim();
    const sportRaw = String(formData.get("tournament_sport") || "soccer").toLowerCase();
    const redirectTo = formData.get("redirect_to");
    const sport = TOURNAMENT_SPORTS.includes(sportRaw as any) ? (sportRaw as any) : "soccer";
    if (!url) {
      return redirectWithNotice(redirectTo, "URL is required.");
    }
    try {
      const res = await createTournamentFromUrl({ url, sport, status: "draft", source: "external_crawl" });
      return redirectWithNotice(
        redirectTo,
        `Created "${res.meta.name ?? res.slug}" and queued enrichment.`
      );
    } catch (err: any) {
      // Let Next.js redirect errors bubble through so we don't surface NEXT_REDIRECT as a failure notice.
      if (err?.digest && String(err.digest).includes("NEXT_REDIRECT")) {
        throw err;
      }
      console.error("[createFromUrl]", err);
      return redirectWithNotice(redirectTo, `Failed to create from URL: ${err?.message ?? "unknown error"}`);
    }
  }

  async function updateTournamentDetailsAction(formData: FormData) {
    "use server";
    const tournament_id = String(formData.get("tournament_id") || "");
    if (!tournament_id) return;
    const redirectTo = formData.get("redirect_to");

    const stringOrNull = (key: string) => {
      const value = (formData.get(key) as string | null)?.trim() ?? "";
      return value ? value : null;
    };

    const sportValue = (formData.get("sport") as string | null)?.trim() ?? "";
    const subTypeRaw = (formData.get("sub_type") as string | null)?.trim() ?? "";
    const subType: TournamentSubmissionType | null =
      subTypeRaw && isSubmissionType(subTypeRaw) ? subTypeRaw : null;
    const stateValue = stringOrNull("state");
    const startDate = stringOrNull("start_date");
    const endDate = stringOrNull("end_date");
    const summary = stringOrNull("summary");
    const sourceUrlInput = stringOrNull("source_url");

    let normalizedUrl = sourceUrlInput;
    if (sourceUrlInput) {
      try {
        normalizedUrl = new URL(sourceUrlInput).toString();
      } catch {
        try {
          normalizedUrl = new URL(`https://${sourceUrlInput}`).toString();
        } catch {
          normalizedUrl = sourceUrlInput;
        }
      }
    }
    let sourceDomain: string | null = null;
    if (normalizedUrl) {
      try {
        sourceDomain = new URL(normalizedUrl).hostname.replace(/^www\./, "");
      } catch {
        sourceDomain = null;
      }
    }

    await adminUpdateTournamentDetails({
      tournament_id,
      updates: {
        name: stringOrNull("name"),
        sport: sportValue || null,
        level: stringOrNull("level"),
        sub_type: subType,
        cash_tournament: formData.get("cash_tournament") === "on",
        city: stringOrNull("city"),
        state: stateValue ? stateValue.toUpperCase() : null,
        venue: stringOrNull("venue"),
        address: stringOrNull("address"),
        start_date: startDate,
        end_date: endDate,
        summary,
        referee_pay: stringOrNull("referee_pay"),
        referee_contact: stringOrNull("referee_contact"),
        source_url: normalizedUrl,
        source_domain: sourceDomain,
      },
    });

    revalidatePath("/tournaments");
    redirectWithNotice(redirectTo, "Tournament details updated");
  }

  const tabLink = (t: Tab) => {
    const sp = new URLSearchParams();
    sp.set("tab", t);
    if (t === "verification") {
      sp.set("vstatus", vstatus);
    }
    if (t === "reviews" || t === "school-reviews") {
      sp.set("rstatus", reviewStatus);
    }
    if (t === "tournament-contacts") {
      sp.set("cstatus", contactStatus);
    }
    if (q) {
      sp.set("q", q);
    }
    return `/admin?${sp.toString()}`;
  };

  const vLink = (s: VStatus) => `/admin?tab=verification&vstatus=${s}`;
  const reviewLink = (s: ReviewStatus) => `/admin?tab=reviews&rstatus=${s}`;
  const schoolReviewLink = (s: ReviewStatus) => `/admin?tab=school-reviews&rstatus=${s}`;
  const tournamentContactLink = (s: ContactStatus) =>
    `/admin?tab=tournament-contacts&cstatus=${s}`;

  const TabButton = ({ t, label }: { t: Tab; label: string }) => (
    <a
      href={tabLink(t)}
      style={{
        padding: "10px 12px",
        borderRadius: 999,
        border: "1px solid #111",
        background: tab === t ? "#111" : "#fff",
        color: tab === t ? "#fff" : "#111",
        fontWeight: 900,
        textDecoration: "none",
      }}
    >
      {label}
    </a>
  );

  const StatusPill = ({ s, label }: { s: VStatus; label: string }) => (
    <a
      href={vLink(s)}
      style={{
        padding: "8px 10px",
        borderRadius: 999,
        border: "1px solid #111",
        background: vstatus === s ? "#111" : "#fff",
        color: vstatus === s ? "#fff" : "#111",
        fontWeight: 900,
        textDecoration: "none",
        fontSize: 13,
      }}
    >
      {label}
    </a>
  );

  return (
    <div style={{ padding: 20, maxWidth: 1200, margin: "0 auto" }}>
      <h1 style={{ fontSize: 26, fontWeight: 900, marginBottom: 10 }}>
        Admin Dashboard
      </h1>
      <div style={{ marginBottom: 12 }}>
        <AdminNav />
      </div>

      {notice && (
        <div
          style={{
            background: "#e0f2f1",
            border: "1px solid #26a69a",
            color: "#004d40",
            padding: "10px 14px",
            borderRadius: 10,
            marginBottom: 16,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
          }}
        >
          <span>{notice}</span>
          <a
            href={adminBasePath}
            style={{
              fontSize: 12,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "#004d40",
            }}
          >
            Dismiss
          </a>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 18 }}>
        <TabButton t="verification" label="Verification" />
        <TabButton t="users" label="Users" />
        <TabButton t="badges" label="Badges" />
        <TabButton t="reviews" label="Tournament reviews" />
        <TabButton t="school-reviews" label="School reviews" />
        <TabButton t="tournament-contacts" label="Tournament contacts" />
        <TabButton t="referee-contacts" label="Referee contacts" />
        <TabButton t="tournament-uploads" label="Tournament uploads" />
        <TabButton t="tournament-listings" label="Tournament listings" />
        <TabButton t="owls-eye" label="Owl's Eye" />
        <a
          href="/admin/tournaments/enrichment"
          style={{
            padding: "10px 12px",
            borderRadius: 999,
            border: "1px solid #111",
            background: "#fff",
            color: "#111",
            fontWeight: 900,
            textDecoration: "none",
          }}
        >
          Enrichment
        </a>
        <a
          href="/admin/venues"
          style={{
            padding: "10px 12px",
            borderRadius: 999,
            border: "1px solid #111",
            background: "#fff",
            color: "#111",
            fontWeight: 900,
            textDecoration: "none",
          }}
        >
          Venues
        </a>
      </div>

      {tab === "owls-eye" && (
        <section style={{ marginBottom: 22 }}>
          <OwlsEyePanel embedded adminToken={owlsEyeAdminToken || undefined} />
        </section>
      )}

      {/* VERIFICATION TAB */}
      {tab === "verification" && (
        <section style={{ marginBottom: 22 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 10,
            }}
          >
            <h2 style={{ fontSize: 18, fontWeight: 900, margin: 0 }}>
              Verification requests
            </h2>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <StatusPill s="pending" label="Pending" />
              <StatusPill s="approved" label="Approved" />
              <StatusPill s="rejected" label="Rejected" />
            </div>
          </div>

          <div style={{ marginTop: 10, color: "#555", fontSize: 13 }}>
            Showing: <strong>{vstatus}</strong> ({requests.length})
          </div>

          <div style={{ marginTop: 12 }}>
            {requests.length === 0 ? (
              <div style={{ color: "#555" }}>No requests.</div>
            ) : (
              requests.map((r: any) => (
                <div
                  key={r.id}
                  style={{
                    border: "1px solid #ddd",
                    borderRadius: 12,
                    padding: 14,
                    marginBottom: 10,
                    background: "#fff",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 12,
                      flexWrap: "wrap",
                    }}
                  >
                    <div style={{ minWidth: 320 }}>
                      <div style={{ fontWeight: 900 }}>
                        {r.user_profile?.handle ?? "—"} ({r.user_profile?.email ?? "—"})
                      </div>
                      <div style={{ color: "#555", fontSize: 13 }}>
                        Real name: {r.user_profile?.real_name ?? "—"}
                      </div>
                      <div style={{ color: "#555", fontSize: 13 }}>
                        Submitted: {new Date(r.submitted_at).toLocaleString()}
                      </div>
                      <div style={{ color: "#555", fontSize: 13 }}>
                        Association: {r.association ?? "—"} | Level: {r.level ?? "—"}
                      </div>

                      {r.evidence_url ? (
                        <div style={{ marginTop: 6 }}>
                          <a
                            href={r.evidence_url}
                            target="_blank"
                            rel="noreferrer"
                            style={{ fontSize: 13 }}
                          >
                            View evidence ↗
                          </a>
                        </div>
                      ) : (
                        <div style={{ marginTop: 6, fontSize: 13, color: "#777" }}>
                          No evidence URL
                        </div>
                      )}

                      {r.notes ? (
                        <div style={{ marginTop: 8, fontSize: 13, color: "#444" }}>
                          <strong>User notes:</strong> {r.notes}
                        </div>
                      ) : null}

                      {r.reviewed_at ? (
                        <div style={{ marginTop: 8, fontSize: 12, color: "#555" }}>
                          Reviewed: {new Date(r.reviewed_at).toLocaleString()} by{" "}
                          {r.reviewer_profile?.handle ?? "admin"}
                        </div>
                      ) : null}

                      {r.admin_notes ? (
                        <div style={{ marginTop: 6, fontSize: 12, color: "#555" }}>
                          <strong>Admin notes:</strong> {r.admin_notes}
                        </div>
                      ) : null}
                    </div>

                    {vstatus === "pending" ? (
                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                        <form action={quickApproveVerificationAction}>
                          <input type="hidden" name="request_id" value={r.id} />
                          <input type="hidden" name="redirect_to" value={adminBasePath} />
                          <button
                            style={{
                              padding: "10px 12px",
                              borderRadius: 10,
                              border: "none",
                              background: "#111",
                              color: "#fff",
                              fontWeight: 900,
                              cursor: "pointer",
                            }}
                            title="Approve immediately (no notes)"
                          >
                            Quick approve
                          </button>
                        </form>

                        <form action={approveVerificationAction} style={{ display: "grid", gap: 8 }}>
                          <input type="hidden" name="request_id" value={r.id} />
                          <input type="hidden" name="redirect_to" value={adminBasePath} />
                          <input
                            name="admin_notes"
                            placeholder="Admin notes (optional)"
                            style={{
                              padding: 8,
                              borderRadius: 10,
                              border: "1px solid #bbb",
                              width: 260,
                            }}
                          />
                          <button
                            style={{
                              padding: "10px 12px",
                              borderRadius: 10,
                              border: "none",
                              background: "#0a7a2f",
                              color: "#fff",
                              fontWeight: 900,
                            }}
                          >
                            Approve
                          </button>
                        </form>

                        <form action={rejectVerificationAction} style={{ display: "grid", gap: 8 }}>
                          <input type="hidden" name="request_id" value={r.id} />
                          <input type="hidden" name="redirect_to" value={adminBasePath} />
                          <input
                            name="admin_notes"
                            placeholder="Reason / admin notes"
                            style={{
                              padding: 8,
                              borderRadius: 10,
                              border: "1px solid #bbb",
                              width: 260,
                            }}
                          />
                          <button
                            style={{
                              padding: "10px 12px",
                              borderRadius: 10,
                              border: "1px solid #b00020",
                              background: "#fff",
                              color: "#b00020",
                              fontWeight: 900,
                            }}
                          >
                            Reject
                          </button>
                        </form>
                      </div>
                    ) : (
                      <div style={{ color: "#555", fontSize: 13 }}>
                        No actions for non-pending.
                      </div>
                    )}
                  </div>

                  <div style={{ marginTop: 10, color: "#555", fontSize: 12 }}>
                    Approving awards <strong>Verified Referee</strong> via your DB trigger.
                  </div>
                </div>
              ))
            )}
          </div>
      </section>
    )}

      {/* TOURNAMENT LISTINGS */}
      {tab === "tournament-listings" && (
        <section style={{ marginBottom: 22 }}>
          <div style={{ marginBottom: 12 }}>
            <h2 style={{ fontSize: 18, fontWeight: 900, margin: 0 }}>Tournament details</h2>
            <p style={{ color: "#555", fontSize: 13, marginTop: 6 }}>
              Search published tournaments and update the information shown on the public listings page.
            </p>
          </div>
          <form
            method="GET"
            action="/admin"
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 10,
              alignItems: "center",
              marginBottom: 16,
            }}
          >
            <input type="hidden" name="tab" value="tournament-listings" />
            <input
              type="text"
              name="q"
              placeholder="Search by name, slug, city, or state"
              defaultValue={q}
              style={{
                flex: "1 1 260px",
                padding: 10,
                borderRadius: 10,
                border: "1px solid #bbb",
              }}
            />
            <button
              type="submit"
              style={{
                padding: "10px 16px",
                borderRadius: 999,
                border: "none",
                background: "#111",
                color: "#fff",
                fontWeight: 800,
              }}
            >
              Search
            </button>
            <a
              href="/admin?tab=tournament-listings"
              style={{
                padding: "10px 16px",
                borderRadius: 999,
                border: "1px solid #111",
                textDecoration: "none",
                color: "#111",
                fontWeight: 800,
              }}
            >
              Reset
            </a>
          </form>
          {listedTournaments.length === 0 ? (
            <div style={{ color: "#555", border: "1px dashed #ccc", padding: 16, borderRadius: 12 }}>
              {q
                ? "No tournaments matched your search."
                : "Enter a search above to load tournaments. Recent published events will appear here."}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {listedTournaments.map((t) => (
                <form
                  key={t.id}
                  action={updateTournamentDetailsAction}
                  style={{
                    border: "1px solid #ddd",
                    borderRadius: 14,
                    padding: 16,
                    background: "#fff",
                    display: "grid",
                    gap: 12,
                  }}
                >
                  <input type="hidden" name="redirect_to" value={adminBasePath} />
                  <input type="hidden" name="tournament_id" value={t.id} />
                  <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                    <div>
                      <div style={{ fontWeight: 900 }}>{t.name}</div>
                      <div style={{ fontSize: 12, color: "#666" }}>Slug: {t.slug}</div>
                    </div>
                    <Link href={`/tournaments/${t.slug}`} target="_blank" style={{ fontSize: 13 }}>
                      View public page ↗
                    </Link>
                  </div>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))",
                      gap: 12,
                    }}
                  >
                    <label style={{ fontSize: 12, fontWeight: 700 }}>
                      Name
                      <input
                        type="text"
                        name="name"
                        defaultValue={t.name}
                        style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px solid #ccc" }}
                      />
                    </label>
                    <label style={{ fontSize: 12, fontWeight: 700 }}>
                      Sport
                      <select
                        name="sport"
                        defaultValue={t.sport}
                        style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px solid #ccc" }}
                      >
                        {TOURNAMENT_SPORTS.map((sport) => (
                          <option key={sport} value={sport}>
                            {sport}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label style={{ fontSize: 12, fontWeight: 700 }}>
                      Level
                      <input
                        type="text"
                        name="level"
                        defaultValue={t.level ?? ""}
                        style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px solid #ccc" }}
                      />
                    </label>
                    <label style={{ fontSize: 12, fontWeight: 700 }}>
                      Submission type
                      <select
                        name="sub_type"
                        defaultValue={t.sub_type ?? ""}
                        style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px solid #ccc" }}
                      >
                        <option value="">(auto)</option>
                        {Object.keys(SUBMISSION_LABELS).map((key) => (
                          <option key={key} value={key}>
                            {SUBMISSION_LABELS[key] ?? key}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label style={{ fontSize: 12, fontWeight: 700, display: "flex", alignItems: "flex-end", gap: 6 }}>
                      <input
                        type="checkbox"
                        name="cash_tournament"
                        defaultChecked={Boolean(t.cash_tournament)}
                        style={{ width: 18, height: 18 }}
                      />
                      Cash tournament
                    </label>
                  </div>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))",
                      gap: 12,
                    }}
                  >
                    <label style={{ fontSize: 12, fontWeight: 700 }}>
                      City
                      <input
                        type="text"
                        name="city"
                        defaultValue={t.city ?? ""}
                        style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px solid #ccc" }}
                      />
                    </label>
                    <label style={{ fontSize: 12, fontWeight: 700 }}>
                      State
                      <input
                        type="text"
                        name="state"
                        defaultValue={t.state ?? ""}
                        style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px solid #ccc" }}
                      />
                    </label>
                    <label style={{ fontSize: 12, fontWeight: 700 }}>
                      Venue
                      <input
                        type="text"
                        name="venue"
                        defaultValue={t.venue ?? ""}
                        style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px solid #ccc" }}
                      />
                    </label>
                    <label style={{ fontSize: 12, fontWeight: 700 }}>
                      Address
                      <input
                        type="text"
                        name="address"
                        defaultValue={t.address ?? ""}
                        style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px solid #ccc" }}
                      />
                    </label>
                  </div>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))",
                      gap: 12,
                    }}
                  >
                    <label style={{ fontSize: 12, fontWeight: 700 }}>
                      Start date
                      <input
                        type="date"
                        name="start_date"
                        defaultValue={formatDateInput(t.start_date)}
                        style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px solid #ccc" }}
                      />
                    </label>
                    <label style={{ fontSize: 12, fontWeight: 700 }}>
                      End date
                      <input
                        type="date"
                        name="end_date"
                        defaultValue={formatDateInput(t.end_date)}
                        style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px solid #ccc" }}
                      />
                    </label>
                  </div>
                  <label style={{ fontSize: 12, fontWeight: 700 }}>
                    Summary
                    <textarea
                      name="summary"
                      rows={3}
                      defaultValue={t.summary ?? ""}
                      style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px solid #ccc" }}
                    />
                  </label>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))",
                      gap: 12,
                    }}
                  >
                    <label style={{ fontSize: 12, fontWeight: 700 }}>
                      Tournament website
                      <input
                        type="url"
                        name="source_url"
                        defaultValue={t.source_url ?? ""}
                        style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px solid #ccc" }}
                      />
                    </label>
                    <label style={{ fontSize: 12, fontWeight: 700 }}>
                      Referee pay
                      <input
                        type="text"
                        name="referee_pay"
                        defaultValue={t.referee_pay ?? ""}
                        style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px solid #ccc" }}
                      />
                    </label>
                    <label style={{ fontSize: 12, fontWeight: 700 }}>
                      Referee contact summary
                      <input
                        type="text"
                        name="referee_contact"
                        defaultValue={t.referee_contact ?? ""}
                        style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px solid #ccc" }}
                      />
                    </label>
                  </div>
                  <div style={{ display: "flex", gap: 10 }}>
                    <button
                      style={{
                        padding: "10px 14px",
                        borderRadius: 10,
                        border: "none",
                        background: "#111",
                        color: "#fff",
                        fontWeight: 900,
                      }}
                    >
                      Save changes
                    </button>
                  </div>
                </form>
              ))}
            </div>
          )}
        </section>
      )}

      {/* TOURNAMENT UPLOADS */}
      {tab === "tournament-uploads" && (
        <section style={{ marginBottom: 22 }}>
          <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 900, margin: 0 }}>Tournament uploads</h2>
              <p style={{ color: "#555", marginTop: 4, fontSize: 13 }}>
                Run the cleaner/importer on CSV or HTML files and stage tournaments as drafts or confirmed entries.
                Approve, archive, or delete the imports below once they look good.
              </p>
            </div>
            <div style={{ fontSize: 13, color: "#555", alignSelf: "center" }}>
              Pending: <strong>{pendingTournaments.length}</strong>
            </div>
          </div>

          <div
            style={{
              marginTop: 16,
              border: "1px solid #ddd",
              borderRadius: 14,
              padding: 16,
              background: "#fff",
            }}
          >
            <h3 style={{ marginTop: 0 }}>Create from URL</h3>
            <form action={createFromUrlAction} style={{ display: "grid", gap: 10, marginBottom: 16 }}>
              <input type="hidden" name="redirect_to" value={adminBasePath} />
              <label style={{ fontSize: 12, fontWeight: 700 }}>
                Tournament URL
                <input
                  type="url"
                  name="tournament_url"
                  placeholder="https://example.com/event"
                  defaultValue={fallbackSourceUrlParam}
                  required
                  style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px solid #ccc", marginTop: 4 }}
                />
              </label>
              <label style={{ fontSize: 12, fontWeight: 700 }}>
                Sport
                <select name="tournament_sport" defaultValue="soccer" style={{ width: "100%", padding: 8 }}>
                  {TOURNAMENT_SPORTS.map((sport) => (
                    <option key={sport} value={sport}>
                      {sport}
                    </option>
                  ))}
                </select>
              </label>
              <button
                style={{
                  padding: "8px 12px",
                  borderRadius: 8,
                  border: "none",
                  background: "#0f172a",
                  color: "#fff",
                  fontWeight: 800,
                  width: "fit-content",
                }}
              >
                Create Pending from URL
              </button>
              <p style={{ fontSize: 12, color: "#555", margin: 0 }}>
                Fetches metadata (title, description, dates, location) and queues enrichment automatically.
              </p>
            </form>

            <h3 style={{ marginTop: 0 }}>Upload tournaments</h3>
            <form action={importTournamentsAction} style={{ display: "grid", gap: 12 }}>
              <input type="hidden" name="redirect_to" value={adminBasePath} />
              <label style={{ fontSize: 12, fontWeight: 700 }}>
                File (.csv, .html, .htm, .mhtml)
                <input
                  type="file"
                  name="upload"
                  accept=".csv,.html,.htm,.mhtml"
                  style={{ width: "100%", marginTop: 4 }}
                />
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12 }}>
                <label style={{ fontSize: 12, fontWeight: 700 }}>
                  Source
                  <select name="source" defaultValue="external_crawl" style={{ width: "100%", padding: 8 }}>
                    {TOURNAMENT_SOURCES.map((src) => (
                      <option key={src} value={src}>
                        {src}
                      </option>
                    ))}
                  </select>
                </label>
                <label style={{ fontSize: 12, fontWeight: 700 }}>
                  Sport (used for HTML files)
                  <select name="fallback_sport" defaultValue="soccer" style={{ width: "100%", padding: 8 }}>
                    {TOURNAMENT_SPORTS.map((sport) => (
                      <option key={sport} value={sport}>
                        {sport}
                      </option>
                    ))}
                  </select>
                </label>
                <label style={{ fontSize: 12, fontWeight: 700 }}>
                  Level (optional)
                  <input
                    type="text"
                    name="fallback_level"
                    placeholder="e.g. regional"
                    style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px solid #ccc" }}
                  />
                </label>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 12 }}>
                <label style={{ fontSize: 12, fontWeight: 700 }}>
                  Fallback name (optional)
                  <input
                    type="text"
                    name="fallback_name"
                    placeholder="Tournament name"
                    style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px solid #ccc" }}
                  />
                </label>
                <label style={{ fontSize: 12, fontWeight: 700 }}>
                  Start date (optional)
                  <input type="date" name="fallback_start_date" style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px solid #ccc" }} />
                </label>
                <label style={{ fontSize: 12, fontWeight: 700 }}>
                  End date (optional)
                  <input type="date" name="fallback_end_date" style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px solid #ccc" }} />
                </label>
                <label style={{ fontSize: 12, fontWeight: 700 }}>
                  Venue (optional)
                  <input
                    type="text"
                    name="fallback_venue"
                    placeholder="Venue name"
                    style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px solid #ccc" }}
                  />
                </label>
                <label style={{ fontSize: 12, fontWeight: 700 }}>
                  City (optional)
                  <input
                    type="text"
                    name="fallback_city"
                    placeholder="City"
                    style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px solid #ccc" }}
                  />
                </label>
                <label style={{ fontSize: 12, fontWeight: 700 }}>
                  State (optional)
                  <input
                    type="text"
                    name="fallback_state"
                    placeholder="State"
                    style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px solid #ccc" }}
                  />
                </label>
                <label style={{ fontSize: 12, fontWeight: 700 }}>
                  Zip (optional)
                  <input
                    type="text"
                    name="fallback_zip"
                    placeholder="Zip"
                    style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px solid #ccc" }}
                  />
                </label>
                <label style={{ fontSize: 12, fontWeight: 700 }}>
                  Source URL (optional)
                  <input
                    type="url"
                    name="fallback_source_url"
                    defaultValue={fallbackSourceUrlParam}
                    placeholder="https://example.com"
                    style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px solid #ccc" }}
                  />
                </label>
                <label style={{ fontSize: 12, fontWeight: 700 }}>
                  Contact email (optional)
                  <input
                    type="email"
                    name="fallback_contact_email"
                    placeholder="contact@example.com"
                    style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px solid #ccc" }}
                  />
                </label>
                <label style={{ fontSize: 12, fontWeight: 700 }}>
                  Contact phone (optional)
                  <input
                    type="text"
                    name="fallback_contact_phone"
                    placeholder="(555) 123-4567"
                    style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px solid #ccc" }}
                  />
                </label>
              </div>
              <label style={{ fontSize: 12, fontWeight: 700 }}>
                Summary/notes (optional)
                <textarea
                  name="fallback_summary"
                  rows={3}
                  placeholder="Short description"
                  style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px solid #ccc" }}
                />
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                <input type="checkbox" name="treat_confirmed" />
                Mark as confirmed/published
              </label>
              <p style={{ fontSize: 12, color: "#777", margin: 0 }}>
                Cleaner removes duplicate slugs, missing locations, off-sport entries, and invalid URLs. A summary
                appears in the notice banner after import.
              </p>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button
                  type="submit"
                  style={{
                    padding: "10px 12px",
                    borderRadius: 10,
                    border: "none",
                    background: "#111",
                    color: "#fff",
                    fontWeight: 900,
                    width: "fit-content",
                  }}
                >
                  Run cleaner & import
                </button>
              </div>
            </form>
            <form action={queuePendingEnrichmentAction} style={{ marginTop: 8 }}>
              <input type="hidden" name="redirect_to" value={adminBasePath} />
              <button
                type="submit"
                style={{
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "1px solid #555",
                  background: "#fff",
                  color: "#111",
                  fontWeight: 800,
                  width: "fit-content",
                }}
              >
                Queue enrichment for pending
              </button>
            </form>
            <form action={dedupePendingTournamentsAction} style={{ marginTop: 8 }}>
              <input type="hidden" name="redirect_to" value={adminBasePath} />
              <button
                type="submit"
                style={{
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "1px solid #555",
                  background: "#fff",
                  color: "#111",
                  fontWeight: 800,
                  width: "fit-content",
                }}
              >
                Cleanup pending duplicates
              </button>
            </form>
          </div>

          {pendingTournaments.length === 0 ? (
            <div
              style={{
                marginTop: 16,
                color: "#555",
                border: "1px solid #ddd",
                borderRadius: 14,
                padding: 16,
                background: "#f8f8f8",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
              }}
            >
              <div>
                <strong>No pending tournaments.</strong> Upload a CSV/HTML file above to add new drafts.
              </div>
              <div style={{ marginTop: 8 }}>
                <Link href="/tournaments" style={{ color: "#0f3d2e", fontWeight: 600 }}>
                  View live tournaments →
                </Link>
              </div>
            </div>
          ) : (
            <form action={bulkTournamentAction} style={{ marginTop: 16 }}>
              <input type="hidden" name="redirect_to" value={adminBasePath} />
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
                <button
                  name="bulk_action"
                  value="approve"
                  style={{
                    padding: "10px 12px",
                    borderRadius: 10,
                    border: "none",
                    background: "#0a7a2f",
                    color: "#fff",
                    fontWeight: 900,
                  }}
                >
                  Approve selected
                </button>
                <button
                  name="bulk_action"
                  value="archive"
                  style={{
                    padding: "10px 12px",
                    borderRadius: 10,
                    border: "1px solid #b98500",
                    background: "#fff",
                    color: "#b98500",
                    fontWeight: 900,
                  }}
                >
                  Archive selected
                </button>
                <button
                  name="bulk_action"
                  value="delete"
                  style={{
                    padding: "10px 12px",
                    borderRadius: 10,
                    border: "1px solid #b00020",
                    background: "#fff",
                    color: "#b00020",
                    fontWeight: 900,
                  }}
                >
                  Delete selected
                </button>
              </div>
              <div
                id="tournament-selection-summary"
                style={{ fontSize: 13, color: "#444", marginBottom: 8 }}
                aria-live="polite"
              >
                No tournaments selected
              </div>

              <div style={{ overflowX: "auto" }}>
                <table
                  style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    fontSize: 13,
                    minWidth: 700,
                  }}
                >
                  <thead>
                    <tr style={{ background: "#f5f5f5" }}>
                      <th style={{ padding: 8, borderBottom: "1px solid #ddd" }}>
                        <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12 }}>
                          <input
                            type="checkbox"
                            id="tournament-select-all"
                            aria-label="Select or deselect all pending tournaments"
                          />
                          <span style={{ color: "#333", fontWeight: 600 }}>All</span>
                        </label>
                      </th>
                      <th style={{ padding: 8, borderBottom: "1px solid #ddd", textAlign: "left" }}>Tournament</th>
                      <th style={{ padding: 8, borderBottom: "1px solid #ddd", textAlign: "left" }}>Location</th>
                      <th style={{ padding: 8, borderBottom: "1px solid #ddd", textAlign: "left" }}>Dates</th>
                      <th style={{ padding: 8, borderBottom: "1px solid #ddd", textAlign: "left" }}>Venue & address</th>
                      <th style={{ padding: 8, borderBottom: "1px solid #ddd", textAlign: "left" }}>Referee info</th>
                      <th style={{ padding: 8, borderBottom: "1px solid #ddd", textAlign: "left" }}>Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingTournaments.map((t) => (
                      <tr key={t.id}>
                        <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>
                          <input
                            className="pending-tournament-checkbox"
                            type="checkbox"
                            name="selected"
                            value={t.id}
                          />
                        </td>
                        <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>
                          <div style={{ fontWeight: 700 }}>{t.name}</div>
                          <div style={{ color: "#666" }}>Slug: {t.slug}</div>
                          <div style={{ color: "#666" }}>
                            Sport: {t.sport} {t.level ? `• ${t.level}` : ""}
                          </div>
                          {t.summary && (
                            <div style={{ marginTop: 4, color: "#444" }}>
                              {t.summary.length > 160 ? `${t.summary.slice(0, 160)}…` : t.summary}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: 8, borderBottom: "1px solid #eee", color: "#555" }}>
                          {t.city ? `${t.city}, ` : ""}
                          {t.state ?? "State unknown"}
                        </td>
                        <td style={{ padding: 8, borderBottom: "1px solid #eee", color: "#555" }}>
                          {t.start_date || t.end_date ? (
                            <>
                              {t.start_date ?? "TBD"}
                              {t.end_date && t.end_date !== t.start_date ? ` – ${t.end_date}` : ""}
                            </>
                          ) : (
                            "TBD"
                          )}
                        </td>
                        <td style={{ padding: 8, borderBottom: "1px solid #eee", color: "#555" }}>
                          {t.venue ? <div>{t.venue}</div> : <div>Venue TBD</div>}
                          {t.address && <div style={{ color: "#777" }}>{t.address}</div>}
                        </td>
                        <td style={{ padding: 8, borderBottom: "1px solid #eee", color: "#555" }}>
                          {t.referee_pay ? <div>Pay: {t.referee_pay}</div> : <div>Pay info TBD</div>}
                          {t.referee_contact && (
                            <div style={{ color: "#777" }}>Contact: {t.referee_contact}</div>
                          )}
                          {t.cash_tournament && (
                            <div style={{ color: "#0f5132", fontWeight: 600 }}>Cash tournament</div>
                          )}
                        </td>
                        <td style={{ padding: 8, borderBottom: "1px solid #eee", color: "#555" }}>
                          {t.source_url ? (
                            <a href={t.source_url} target="_blank" rel="noreferrer">
                              {t.source_domain ?? "link"}
                            </a>
                          ) : (
                            "—"
                          )}
                          <div style={{ fontSize: 12, color: "#999" }}>
                            Updated {t.updated_at ? new Date(t.updated_at).toLocaleDateString() : "–"}
                          </div>
                          {t.sub_type && (
                            <div style={{ fontSize: 12, color: "#0f3d2e", marginTop: 4 }}>
                              {SUBMISSION_LABELS[t.sub_type] ?? t.sub_type}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <script
                dangerouslySetInnerHTML={{
                  __html: `(function(){function init(){var master=document.getElementById("tournament-select-all");var summary=document.getElementById("tournament-selection-summary");if(!master||!summary)return;var boxes=[].slice.call(document.querySelectorAll(".pending-tournament-checkbox"));var update=function(){var checked=boxes.filter(function(cb){return cb.checked;}).length;if(!boxes.length){summary.textContent="No tournaments available";master.checked=false;master.indeterminate=false;return;}if(checked===0){summary.textContent="No tournaments selected";master.checked=false;master.indeterminate=false;}else{summary.textContent=checked+" tournament"+(checked===1?"":"s")+" selected";master.checked=checked===boxes.length;master.indeterminate=checked>0&&checked<boxes.length;}};master.addEventListener("change",function(){boxes.forEach(function(cb){cb.checked=master.checked;});master.indeterminate=false;update();});boxes.forEach(function(cb){cb.addEventListener("change",update);});update();}if(document.readyState!=="loading"){init();}else{document.addEventListener("DOMContentLoaded",init);}})();`,
                }}
              />
            </form>
          )}
        </section>
      )}

      {/* TOURNAMENT CONTACTS */}
      {tab === "tournament-contacts" && (
        <section style={{ marginBottom: 22 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 10,
            }}
          >
            <h2 style={{ fontSize: 18, fontWeight: 900, margin: 0 }}>Tournament contacts</h2>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {(["pending", "verified", "rejected"] as ContactStatus[]).map((status) => (
                <a
                  key={status}
                  href={tournamentContactLink(status)}
                  style={{
                    padding: "8px 10px",
                    borderRadius: 999,
                    border: "1px solid #111",
                    background: contactStatus === status ? "#111" : "#fff",
                    color: contactStatus === status ? "#fff" : "#111",
                    fontWeight: 900,
                    textDecoration: "none",
                    fontSize: 13,
                  }}
                >
                  {status.charAt(0).toUpperCase() + status.slice(1)}
                </a>
              ))}
            </div>
          </div>

          <div style={{ marginTop: 10, color: "#555", fontSize: 13 }}>
            Showing: <strong>{contactStatus}</strong> ({tournamentContacts.length})
          </div>

          <div
            style={{
              marginTop: 16,
              padding: 16,
              borderRadius: 12,
              border: "1px solid #ddd",
              background: "#fff",
            }}
          >
            <h3 style={{ marginTop: 0, fontSize: 16 }}>Queue site enrichment</h3>
            <form action={queueEnrichmentAction} style={{ display: "grid", gap: 12, marginBottom: 16 }}>
              <input type="hidden" name="redirect_to" value={adminBasePath} />
              <TournamentLookup
                label="Tournament"
                onSelectFieldName="tournament_id"
                fallbackFieldName="tournament_slug"
                description="Select a tournament with a website URL to queue the enrichment crawl."
              />
              <button
                type="submit"
                style={{
                  padding: "10px 12px",
                  borderRadius: 8,
                  border: "1px solid #0f3d2e",
                  background: "#0f3d2e",
                  color: "#fff",
                  fontWeight: 700,
                  width: "fit-content",
                }}
              >
                Queue enrichment
              </button>
              <a
                href="/admin/tournaments/enrichment"
                style={{
                  padding: "10px 12px",
                  borderRadius: 8,
                  border: "1px solid #0f3d2e",
                  background: "#fff",
                  color: "#0f3d2e",
                  fontWeight: 700,
                  textDecoration: "none",
                  width: "fit-content",
                }}
              >
                View results
              </a>
            </form>

            <h3 style={{ marginTop: 0, fontSize: 16 }}>Add tournament contact</h3>
            <form action={createTournamentContactAction} style={{ display: "grid", gap: 12 }}>
              <input type="hidden" name="redirect_to" value={adminBasePath} />
              <TournamentLookup
                label="Tournament"
                onSelectFieldName="tournament_id"
                fallbackFieldName="tournament_slug"
                description="Start typing a slug or name; select a tournament to auto-fill its ID."
              />
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 12 }}>
                <label style={{ fontSize: 12, fontWeight: 700 }}>
                  Contact type
                  <select
                    name="contact_type"
                    defaultValue="assignor"
                    style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px solid #ccc" }}
                  >
                    <option value="assignor">Assignor</option>
                    <option value="director">Director</option>
                    <option value="general">General</option>
                  </select>
                </label>
                <label style={{ fontSize: 12, fontWeight: 700 }}>
                  Status
                  <select
                    name="status"
                    defaultValue="pending"
                    style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px solid #ccc" }}
                  >
                    <option value="pending">Pending</option>
                    <option value="verified">Verified</option>
                    <option value="rejected">Rejected</option>
                  </select>
                </label>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 12 }}>
                <label style={{ fontSize: 12, fontWeight: 700 }}>
                  Name
                  <input
                    type="text"
                    name="name"
                    style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px solid #ccc" }}
                  />
                </label>
                <label style={{ fontSize: 12, fontWeight: 700 }}>
                  Email
                  <input
                    type="email"
                    name="email"
                    style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px solid #ccc" }}
                  />
                </label>
                <label style={{ fontSize: 12, fontWeight: 700 }}>
                  Phone
                  <input
                    type="text"
                    name="phone"
                    style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px solid #ccc" }}
                  />
                </label>
                <label style={{ fontSize: 12, fontWeight: 700 }}>
                  Confidence (0-100)
                  <input
                    type="number"
                    name="confidence"
                    min={0}
                    max={100}
                    style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px solid #ccc" }}
                  />
                </label>
              </div>
              <label style={{ fontSize: 12, fontWeight: 700 }}>
                Source URL
                <input
                  type="url"
                  name="source_url"
                  style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px solid #ccc" }}
                />
              </label>
              <label style={{ fontSize: 12, fontWeight: 700 }}>
                Notes
                <textarea
                  name="notes"
                  rows={3}
                  style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px solid #ccc" }}
                />
              </label>
              <button
                style={{
                  padding: "12px 14px",
                  borderRadius: 10,
                  border: "none",
                  background: "#111",
                  color: "#fff",
                  fontWeight: 900,
                  cursor: "pointer",
                  alignSelf: "flex-start",
                }}
              >
                Add contact
              </button>
            </form>
          </div>

          <div style={{ marginTop: 16 }}>
            {tournamentContacts.length === 0 ? (
              <div style={{ color: "#555" }}>No contacts yet.</div>
            ) : (
              tournamentContacts.map((contact) => (
                <div
                  key={contact.id}
                  style={{
                    border: "1px solid #ddd",
                    borderRadius: 12,
                    padding: 16,
                    marginBottom: 12,
                    background: "#fff",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
                    <div>
                      <div style={{ fontWeight: 900 }}>
                        {contact.name || "Unnamed contact"} ({contact.type})
                      </div>
                      <div style={{ fontSize: 13, color: "#555" }}>
                        {contact.email || "No email"} • {contact.phone || "No phone"}
                      </div>
                      {contact.tournament ? (
                        <div style={{ fontSize: 13, color: "#555" }}>
                          {contact.tournament.name} ({contact.tournament.city ?? "?"},{" "}
                          {contact.tournament.state ?? "?"})
                        </div>
                      ) : (
                        <div style={{ fontSize: 13, color: "#777" }}>No tournament linked</div>
                      )}
                      <div style={{ fontSize: 12, color: "#777", marginTop: 4 }}>
                        Added {new Date(contact.created_at).toLocaleString()}
                      </div>
                      {contact.source_url ? (
                        <div style={{ fontSize: 12, marginTop: 4 }}>
                          <a href={contact.source_url} target="_blank" rel="noreferrer">
                            Source ↗
                          </a>
                        </div>
                      ) : null}
                    </div>
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                      <form action={updateTournamentContactAction} style={{ display: "grid", gap: 8 }}>
                        <input type="hidden" name="contact_id" value={contact.id} />
                        <input type="hidden" name="redirect_to" value={adminBasePath} />
                        <label style={{ fontSize: 12, fontWeight: 700 }}>
                          Status
                          <select
                            name="status"
                            defaultValue={contact.status}
                            style={{ padding: 8, borderRadius: 8, border: "1px solid #bbb" }}
                          >
                            <option value="pending">Pending</option>
                            <option value="verified">Verified</option>
                            <option value="rejected">Rejected</option>
                          </select>
                        </label>
                        <label style={{ fontSize: 12, fontWeight: 700 }}>
                          Confidence
                          <input
                            type="number"
                            name="confidence"
                            min={0}
                            max={100}
                            defaultValue={contact.confidence ?? undefined}
                            style={{ padding: 8, borderRadius: 8, border: "1px solid #bbb" }}
                          />
                        </label>
                        <label style={{ fontSize: 12, fontWeight: 700 }}>
                          Notes
                          <textarea
                            name="notes"
                            rows={3}
                            defaultValue={contact.notes ?? ""}
                            style={{ padding: 8, borderRadius: 8, border: "1px solid #bbb", minWidth: 220 }}
                          />
                        </label>
                        <button
                          style={{
                            padding: "10px 12px",
                            borderRadius: 10,
                            border: "none",
                            background: "#111",
                            color: "#fff",
                            fontWeight: 900,
                          }}
                        >
                          Save
                        </button>
                      </form>
                      <form action={deleteTournamentContactAction}>
                        <input type="hidden" name="contact_id" value={contact.id} />
                        <input type="hidden" name="redirect_to" value={adminBasePath} />
                        <button
                          style={{
                            padding: "10px 12px",
                            borderRadius: 10,
                            border: "1px solid #c62828",
                            background: "#fff",
                            color: "#c62828",
                            fontWeight: 900,
                          }}
                        >
                          Delete
                        </button>
                      </form>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      )}

      {/* REFEREE CONTACTS */}
      {tab === "referee-contacts" && (
        <section style={{ marginBottom: 22 }}>
          <h2 style={{ fontSize: 18, fontWeight: 900, marginTop: 0 }}>Referee / assignor contacts</h2>
          <div
            style={{
              marginTop: 16,
              padding: 16,
              borderRadius: 12,
              border: "1px solid #ddd",
              background: "#fff",
            }}
          >
            <h3 style={{ marginTop: 0, fontSize: 16 }}>Add referee contact</h3>
            <form action={createRefereeContactAction} style={{ display: "grid", gap: 12 }}>
              <input type="hidden" name="redirect_to" value={adminBasePath} />
              <TournamentLookup
                label="Link to tournament (optional)"
                onSelectFieldName="tournament_id"
                fallbackFieldName="tournament_slug"
                description="Start typing a slug or name; select a tournament to auto-link this contact."
              />
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 12 }}>
                {["name", "organization", "role", "email", "phone", "state", "city"].map((field) => (
                  <label key={field} style={{ fontSize: 12, fontWeight: 700 }}>
                    {field.charAt(0).toUpperCase() + field.slice(1)}
                    <input
                      type="text"
                      name={field}
                      style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px solid #ccc" }}
                    />
                  </label>
                ))}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 12 }}>
                <label style={{ fontSize: 12, fontWeight: 700 }}>
                  Contact type
                  <select
                    name="contact_type"
                    defaultValue="assignor"
                    style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px solid #ccc" }}
                  >
                    {CONTACT_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type.replace("_", " ")}
                      </option>
                    ))}
                  </select>
                </label>
                <label style={{ fontSize: 12, fontWeight: 700 }}>
                  Status
                  <select
                    name="status"
                    defaultValue="pending"
                    style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px solid #ccc" }}
                  >
                    {CONTACT_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                </label>
                <label style={{ fontSize: 12, fontWeight: 700 }}>
                  Confidence (0-100)
                  <input
                    type="number"
                    name="confidence"
                    min="0"
                    max="100"
                    step="1"
                    placeholder="e.g. 80"
                    style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px solid #ccc" }}
                  />
                </label>
              </div>
              <label style={{ fontSize: 12, fontWeight: 700 }}>
                Source URL
                <input
                  type="url"
                  name="source_url"
                  style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px solid #ccc" }}
                />
              </label>
              <label style={{ fontSize: 12, fontWeight: 700 }}>
                Notes
                <textarea
                  name="notes"
                  rows={3}
                  style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px solid #ccc" }}
                />
              </label>
              <button
                style={{
                  padding: "12px 14px",
                  borderRadius: 10,
                  border: "none",
                  background: "#111",
                  color: "#fff",
                  fontWeight: 900,
                  cursor: "pointer",
                  alignSelf: "flex-start",
                }}
              >
                Add contact
              </button>
            </form>
          </div>

          <div style={{ marginTop: 16 }}>
            {refereeContacts.length === 0 ? (
              <div style={{ color: "#555" }}>No referee contacts yet.</div>
            ) : (
              refereeContacts.map((contact) => (
                <div
                  key={contact.id}
                  style={{
                    border: "1px solid #ddd",
                    borderRadius: 12,
                    padding: 16,
                    marginBottom: 12,
                    background: "#fff",
                  }}
                >
                  <div style={{ fontWeight: 900 }}>{contact.name ?? "Unnamed contact"}</div>
                  <div style={{ fontSize: 13, color: "#555" }}>
                    {contact.organization ?? "No org"} • {contact.role ?? "No role"}
                  </div>
                  <div style={{ fontSize: 13, color: "#555" }}>
                    {contact.email || "No email"} • {contact.phone || "No phone"}
                  </div>
                  <div style={{ fontSize: 13, color: "#555" }}>
                    {contact.city ?? "City ?"}, {contact.state ?? "State ?"}
                  </div>
                  <div style={{ fontSize: 12, color: "#333", marginTop: 4 }}>
                    Type: {contact.type.replace("_", " ")} | Status: {contact.status}{" "}
                    {typeof contact.confidence === "number" ? `| Confidence: ${contact.confidence}` : ""}
                  </div>
                  <div style={{ marginTop: 8, fontSize: 13 }}>
                    <div style={{ fontWeight: 700 }}>Linked tournaments</div>
                    {contact.tournaments && contact.tournaments.length > 0 ? (
                      <ul style={{ paddingLeft: 18, margin: "6px 0" }}>
                        {contact.tournaments.map((tournament) => (
                          <li key={tournament.link_id} style={{ marginBottom: 4 }}>
                            <div>
                              {tournament.name ?? tournament.slug ?? "Unknown tournament"}
                              {tournament.city ? ` • ${tournament.city}, ${tournament.state ?? ""}` : ""}
                            </div>
                            {tournament.slug ? (
                              <div style={{ fontSize: 12 }}>
                                <a href={`/tournaments/${tournament.slug}`} target="_blank" rel="noreferrer">
                                  View tournament ↗
                                </a>
                              </div>
                            ) : null}
                            <form
                              action={unlinkRefereeContactAction}
                              style={{ marginTop: 4, display: "inline-block" }}
                            >
                              <input type="hidden" name="link_id" value={tournament.link_id} />
                              <input type="hidden" name="redirect_to" value={adminBasePath} />
                              <button
                                style={{
                                  padding: "4px 8px",
                                  borderRadius: 8,
                                  border: "1px solid #c62828",
                                  background: "#fff",
                                  color: "#c62828",
                                  fontSize: 12,
                                  cursor: "pointer",
                                }}
                              >
                                Remove link
                              </button>
                            </form>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div style={{ fontSize: 12, color: "#777" }}>Not linked to any tournaments yet.</div>
                    )}
                  </div>
                  {contact.source_url ? (
                    <div style={{ fontSize: 12, marginTop: 4 }}>
                      <a href={contact.source_url} target="_blank" rel="noreferrer">
                        Source ↗
                      </a>
                    </div>
                  ) : null}

                  <form
                    action={updateRefereeContactAction}
                    style={{ marginTop: 10, display: "grid", gap: 8 }}
                  >
                    <input type="hidden" name="contact_id" value={contact.id} />
                    <input type="hidden" name="redirect_to" value={adminBasePath} />
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 8 }}>
                      {["name", "organization", "role", "email", "phone", "state", "city"].map((field) => (
                        <label key={field} style={{ fontSize: 12, fontWeight: 700 }}>
                          {field.charAt(0).toUpperCase() + field.slice(1)}
                          <input
                            type="text"
                            name={field}
                            defaultValue={(contact as any)[field] ?? ""}
                            style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px solid #bbb" }}
                          />
                        </label>
                      ))}
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 8 }}>
                      <label style={{ fontSize: 12, fontWeight: 700 }}>
                        Contact type
                        <select
                          name="contact_type"
                          defaultValue={contact.type}
                          style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px solid #bbb" }}
                        >
                          {CONTACT_TYPES.map((type) => (
                            <option key={type} value={type}>
                              {type.replace("_", " ")}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label style={{ fontSize: 12, fontWeight: 700 }}>
                        Status
                        <select
                          name="status"
                          defaultValue={contact.status}
                          style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px solid #bbb" }}
                        >
                          {CONTACT_STATUSES.map((status) => (
                            <option key={status} value={status}>
                              {status}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label style={{ fontSize: 12, fontWeight: 700 }}>
                        Confidence (0-100)
                        <input
                          type="number"
                          name="confidence"
                          min="0"
                          max="100"
                          defaultValue={contact.confidence ?? ""}
                          style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px solid #bbb" }}
                        />
                      </label>
                    </div>
                    <label style={{ fontSize: 12, fontWeight: 700 }}>
                      Source URL
                      <input
                        type="text"
                        name="source_url"
                        defaultValue={contact.source_url ?? ""}
                        style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px solid #bbb" }}
                      />
                    </label>
                    <label style={{ fontSize: 12, fontWeight: 700 }}>
                      Notes
                      <textarea
                        name="notes"
                        rows={3}
                        defaultValue={contact.notes ?? ""}
                        style={{ padding: 8, borderRadius: 8, border: "1px solid #bbb" }}
                      />
                    </label>
                    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                      <button
                        style={{
                          padding: "10px 12px",
                          borderRadius: 10,
                          border: "none",
                          background: "#111",
                          color: "#fff",
                          fontWeight: 900,
                        }}
                      >
                        Save
                      </button>
                    </div>
                  </form>
                  <form
                    action={linkRefereeContactAction}
                    style={{ marginTop: 12, display: "grid", gap: 8, background: "#f8f8f8", padding: 12, borderRadius: 10 }}
                  >
                    <input type="hidden" name="contact_id" value={contact.id} />
                    <input type="hidden" name="redirect_to" value={adminBasePath} />
                    <TournamentLookup
                      label="Tournament to link"
                      onSelectFieldName="tournament_id"
                      fallbackFieldName="tournament_slug"
                      description="Select a tournament or paste the slug manually."
                    />
                    <label style={{ fontSize: 12, fontWeight: 700 }}>
                      Link notes (optional)
                      <input
                        type="text"
                        name="link_notes"
                        style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px solid #bbb" }}
                      />
                    </label>
                    <button
                      style={{
                        padding: "8px 10px",
                        borderRadius: 8,
                        border: "none",
                        background: "#124f30",
                        color: "#fff",
                        fontWeight: 700,
                        width: "fit-content",
                      }}
                    >
                      Link to tournament
                    </button>
                  </form>
                  <form action={deleteRefereeContactAction} style={{ marginTop: 8 }}>
                    <input type="hidden" name="contact_id" value={contact.id} />
                    <input type="hidden" name="redirect_to" value={adminBasePath} />
                    <button
                      style={{
                        padding: "10px 12px",
                        borderRadius: 10,
                        border: "1px solid #c62828",
                        background: "#fff",
                        color: "#c62828",
                        fontWeight: 900,
                      }}
                    >
                      Delete contact
                    </button>
                  </form>
                </div>
              ))
            )}
          </div>
        </section>
      )}

      {/* USERS TAB */}
      {tab === "users" && (
        <section style={{ marginBottom: 18 }}>
          <h2 style={{ fontSize: 18, fontWeight: 900, marginBottom: 10 }}>
            User search
          </h2>

          <form action="/admin" method="get" style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            <input type="hidden" name="tab" value="users" />
            <input
              name="q"
              defaultValue={q}
              placeholder="Search by email, handle, or real name…"
              style={{ flex: 1, padding: "10px 12px", borderRadius: 10, border: "1px solid #bbb" }}
            />
            <button
              style={{
                padding: "10px 14px",
                borderRadius: 10,
                border: "none",
                background: "#111",
                color: "#fff",
                fontWeight: 900,
              }}
            >
              Search
            </button>
          </form>

          {q && users.length === 0 && <div style={{ color: "#555" }}>No results.</div>}

          {users.map((u) => {
            const selectedSports = safeSportsArray(u.sports);

            return (
              <div
                key={u.user_id}
                style={{
                  border: "1px solid #ddd",
                  borderRadius: 12,
                  padding: 14,
                  marginBottom: 10,
                  background: "#fff",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <div style={{ minWidth: 320 }}>
                    <div style={{ fontWeight: 900 }}>
                      {u.handle} ({u.role ?? "user"})
                    </div>
                    <div style={{ color: "#555", fontSize: 13 }}>{u.email}</div>
                    <div style={{ color: "#555", fontSize: 13 }}>Real name: {u.real_name ?? "—"}</div>
                    <div style={{ color: "#555", fontSize: 13 }}>
                      Years: {u.years_refereeing ?? "—"} | Sports: {selectedSports.join(", ") || "—"}
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-start" }}>
                    <form action={updateUser}>
                      <input type="hidden" name="user_id" value={u.user_id} />
                      <input type="hidden" name="redirect_to" value={adminBasePath} />

                      <div style={{ display: "grid", gap: 10, minWidth: 360 }}>
                        <input
                          name="role"
                          defaultValue={u.role ?? ""}
                          placeholder="role (admin/user)"
                          style={{ padding: 8, borderRadius: 10, border: "1px solid #bbb" }}
                        />

                        <input
                          name="years_refereeing"
                          defaultValue={u.years_refereeing ?? ""}
                          placeholder="years as referee"
                          style={{ padding: 8, borderRadius: 10, border: "1px solid #bbb" }}
                        />

                        {/* Sports picker (multi-select with icons). Submits hidden CSV named "sports". */}
                        <SportsPickerClient name="sports" defaultSelected={selectedSports} />

                        <button
                          style={{
                            padding: "10px 12px",
                            borderRadius: 10,
                            border: "none",
                            background: "#111",
                            color: "#fff",
                            fontWeight: 900,
                          }}
                        >
                          Save
                        </button>
                      </div>
                    </form>

                    <div style={{ display: "grid", gap: 8 }}>
                      <form action={setDisabled}>
                        <input type="hidden" name="user_id" value={u.user_id} />
                        <input type="hidden" name="disabled" value="true" />
                        <input type="hidden" name="redirect_to" value={adminBasePath} />
                        <button
                          style={{
                            padding: "10px 12px",
                            borderRadius: 10,
                            border: "1px solid #111",
                            background: "#fff",
                            fontWeight: 900,
                          }}
                        >
                          Disable
                        </button>
                      </form>

                      <form action={setDisabled}>
                        <input type="hidden" name="user_id" value={u.user_id} />
                        <input type="hidden" name="disabled" value="false" />
                        <input type="hidden" name="redirect_to" value={adminBasePath} />
                        <button
                          style={{
                            padding: "10px 12px",
                            borderRadius: 10,
                            border: "none",
                            background: "#0a7a2f",
                            color: "#fff",
                            fontWeight: 900,
                          }}
                        >
                          Enable
                        </button>
                      </form>

                      <form action={resendConfirmationAction}>
                        <input type="hidden" name="email" value={u.email} />
                        <input type="hidden" name="redirect_to" value={adminBasePath} />
                        <button
                          style={{
                            padding: "10px 12px",
                            borderRadius: 10,
                            border: "1px solid #555",
                            background: "#fff",
                            fontWeight: 900,
                          }}
                        >
                          Resend confirmation
                        </button>
                      </form>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </section>
      )}

      {/* BADGES TAB */}
      {tab === "badges" && (
        <section style={{ marginBottom: 18 }}>
          <h2 style={{ fontSize: 18, fontWeight: 900, marginBottom: 10 }}>
            Manage badges
          </h2>

          <form action="/admin" method="get" style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            <input type="hidden" name="tab" value="badges" />
            <input
              name="q"
              defaultValue={q}
              placeholder="Search user to manage badges…"
              style={{ flex: 1, padding: "10px 12px", borderRadius: 10, border: "1px solid #bbb" }}
            />
            <button
              style={{
                padding: "10px 14px",
                borderRadius: 10,
                border: "none",
                background: "#111",
                color: "#fff",
                fontWeight: 900,
              }}
            >
              Search
            </button>
          </form>

          {q && users.length === 0 && <div style={{ color: "#555" }}>No results.</div>}

          {users.map(async (u) => {
            const userBadges = await adminGetUserBadges(u.user_id);

            return (
              <div
                key={u.user_id}
                style={{
                  border: "1px solid #ddd",
                  borderRadius: 12,
                  padding: 14,
                  marginBottom: 10,
                  background: "#fff",
                }}
              >
                <div style={{ fontWeight: 900, marginBottom: 6 }}>
                  {u.handle}{" "}
                  <span style={{ color: "#555", fontWeight: 700 }}>({u.email})</span>
                </div>

                <div style={{ fontSize: 13, color: "#555", marginBottom: 10 }}>
                  Current badges: {(userBadges ?? []).length}
                </div>

                {userBadges.length === 0 ? (
                  <div style={{ color: "#777", fontSize: 13 }}>No badges.</div>
                ) : (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                    {userBadges.map((b: any) => (
                      <form key={b.badge_id} action={revokeBadgeAction}>
                        <input type="hidden" name="user_id" value={u.user_id} />
                        <input type="hidden" name="badge_id" value={b.badge_id} />
                        <input type="hidden" name="redirect_to" value={adminBasePath} />
                        <button
                          title="Click to revoke"
                          style={{
                            border: "1px solid #111",
                            background: "#fff",
                            borderRadius: 999,
                            padding: "6px 10px",
                            fontWeight: 900,
                            cursor: "pointer",
                          }}
                        >
                          {b.badges?.label ?? b.badge_id} ✕
                        </button>
                      </form>
                    ))}
                  </div>
                )}

                <form action={awardBadgeAction} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <input type="hidden" name="user_id" value={u.user_id} />
                  <input type="hidden" name="redirect_to" value={adminBasePath} />
                  <select
                    name="badge_id"
                    style={{ padding: 8, borderRadius: 10, border: "1px solid #bbb" }}
                    defaultValue=""
                  >
                    <option value="" disabled>
                      Award a badge…
                    </option>
                    {badges.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.label} ({b.code})
                      </option>
                    ))}
                  </select>

                  <button
                    style={{
                      padding: "10px 12px",
                      borderRadius: 10,
                      border: "none",
                      background: "#111",
                      color: "#fff",
                      fontWeight: 900,
                    }}
                  >
                    Award
                  </button>
                </form>
              </div>
            );
          })}
        </section>
      )}

      {/* REVIEWS TAB */}
      {tab === "reviews" && (
        <section style={{ marginBottom: 22 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 10,
            }}
          >
            <h2 style={{ fontSize: 18, fontWeight: 900, margin: 0 }}>
              Tournament referee reviews
            </h2>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <a
                href={reviewLink("pending")}
                style={{
                  padding: "8px 10px",
                  borderRadius: 999,
                  border: "1px solid #111",
                  background: reviewStatus === "pending" ? "#111" : "#fff",
                  color: reviewStatus === "pending" ? "#fff" : "#111",
                  fontWeight: 900,
                  textDecoration: "none",
                  fontSize: 13,
                }}
              >
                Pending
              </a>
              <a
                href={reviewLink("approved")}
                style={{
                  padding: "8px 10px",
                  borderRadius: 999,
                  border: "1px solid #111",
                  background: reviewStatus === "approved" ? "#111" : "#fff",
                  color: reviewStatus === "approved" ? "#fff" : "#111",
                  fontWeight: 900,
                  textDecoration: "none",
                  fontSize: 13,
                }}
              >
                Approved
              </a>
              <a
                href={reviewLink("rejected")}
                style={{
                  padding: "8px 10px",
                  borderRadius: 999,
                  border: "1px solid #111",
                  background: reviewStatus === "rejected" ? "#111" : "#fff",
                  color: reviewStatus === "rejected" ? "#fff" : "#111",
                  fontWeight: 900,
                  textDecoration: "none",
                  fontSize: 13,
                }}
              >
                Rejected
              </a>
            </div>
          </div>

          <div style={{ marginTop: 10, color: "#555", fontSize: 13 }}>
            Showing: <strong>{reviewStatus}</strong> ({reviewSubmissions.length})
          </div>

          <div style={{ marginTop: 12 }}>
            {reviewSubmissions.length === 0 ? (
              <div style={{ color: "#555" }}>No reviews.</div>
            ) : (
              reviewSubmissions.map((review) => (
                <div
                  key={review.id}
                  style={{
                    border: "1px solid #ddd",
                    borderRadius: 12,
                    padding: 16,
                    marginBottom: 12,
                    background: "#fff",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 12,
                      flexWrap: "wrap",
                    }}
                  >
                    <div style={{ minWidth: 280 }}>
                      <div style={{ fontWeight: 900 }}>
                        {review.tournament?.name ?? "Unknown tournament"}
                      </div>
                      <div style={{ color: "#555", fontSize: 13 }}>
                        {review.tournament?.city ? `${review.tournament.city}, ` : ""}
                        {review.tournament?.state ?? ""}
                      </div>
                      <div style={{ marginTop: 6, color: "#555", fontSize: 13 }}>
                        Reviewer: @{review.reviewer?.handle ?? "unknown"} (
                        {review.reviewer?.email ?? "no email"})
                      </div>
                      <div style={{ color: "#555", fontSize: 13 }}>
                        Submitted: {new Date(review.created_at).toLocaleString()}
                      </div>
                    </div>
                    <div style={{ minWidth: 180, fontSize: 13, color: "#333" }}>
                      <strong>Scores (1-5)</strong>
                      <div>Overall: {review.overall_score} / 5</div>
                      <div>Logistics: {review.logistics_score} / 5</div>
                      <div>Facilities: {review.facilities_score} / 5</div>
                      <div>Pay: {review.pay_score} / 5</div>
                      <div>Support: {review.support_score} / 5</div>
                      <div>Worked games: {review.worked_games ?? "—"}</div>
                    </div>
                  </div>

                  {review.shift_detail ? (
                    <div
                      style={{
                        marginTop: 10,
                        padding: 10,
                        borderRadius: 10,
                        background: "#f9f9f9",
                        fontSize: 13,
                        color: "#444",
                      }}
                    >
                      {review.shift_detail}
                    </div>
                  ) : null}

                  <div
                    style={{
                      marginTop: 12,
                      display: "flex",
                      gap: 16,
                      flexWrap: "wrap",
                    }}
                  >
                    <form action={updateReviewAction} style={{ flex: 1, minWidth: 280 }}>
                      <input type="hidden" name="review_id" value={review.id} />
                      <input type="hidden" name="redirect_to" value={adminBasePath} />
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
                          gap: 10,
                        }}
                      >
                        <label style={{ fontSize: 12, fontWeight: 700 }}>
                          Overall
                          <input
                            type="number"
                            name="overall_score"
                            defaultValue={review.overall_score}
                            min={1}
                            max={5}
                            step={1}
                            style={{
                              width: "100%",
                              padding: 8,
                              borderRadius: 10,
                              border: "1px solid #bbb",
                            }}
                          />
                        </label>
                        <label style={{ fontSize: 12, fontWeight: 700 }}>
                          Logistics
                          <input
                            type="number"
                            name="logistics_score"
                            defaultValue={review.logistics_score}
                            min={1}
                            max={5}
                            step={1}
                            style={{
                              width: "100%",
                              padding: 8,
                              borderRadius: 10,
                              border: "1px solid #bbb",
                            }}
                          />
                        </label>
                        <label style={{ fontSize: 12, fontWeight: 700 }}>
                          Facilities
                          <input
                            type="number"
                            name="facilities_score"
                            defaultValue={review.facilities_score}
                            min={1}
                            max={5}
                            step={1}
                            style={{
                              width: "100%",
                              padding: 8,
                              borderRadius: 10,
                              border: "1px solid #bbb",
                            }}
                          />
                        </label>
                        <label style={{ fontSize: 12, fontWeight: 700 }}>
                          Pay accuracy
                          <input
                            type="number"
                            name="pay_score"
                            defaultValue={review.pay_score}
                            min={1}
                            max={5}
                            step={1}
                            style={{
                              width: "100%",
                              padding: 8,
                              borderRadius: 10,
                              border: "1px solid #bbb",
                            }}
                          />
                        </label>
                        <label style={{ fontSize: 12, fontWeight: 700 }}>
                          Organizer support
                          <input
                            type="number"
                            name="support_score"
                            defaultValue={review.support_score}
                            min={1}
                            max={5}
                            step={1}
                            style={{
                              width: "100%",
                              padding: 8,
                              borderRadius: 10,
                              border: "1px solid #bbb",
                            }}
                          />
                        </label>
                        <label style={{ fontSize: 12, fontWeight: 700 }}>
                          Games worked
                          <input
                            type="number"
                            name="worked_games"
                            defaultValue={review.worked_games ?? ""}
                            min={0}
                            max={30}
                            style={{
                              width: "100%",
                              padding: 8,
                              borderRadius: 10,
                              border: "1px solid #bbb",
                            }}
                          />
                        </label>
                      </div>

                      <label style={{ display: "block", marginTop: 10, fontSize: 12, fontWeight: 700 }}>
                        Shift detail
                        <textarea
                          name="shift_detail"
                          defaultValue={review.shift_detail ?? ""}
                          rows={3}
                          style={{
                            width: "100%",
                            padding: 8,
                            borderRadius: 10,
                            border: "1px solid #bbb",
                            marginTop: 4,
                          }}
                        />
                      </label>

                      <label style={{ display: "block", marginTop: 10, fontSize: 12, fontWeight: 700 }}>
                        Status
                        <select
                          name="status"
                          defaultValue={review.status}
                          style={{
                            width: "100%",
                            padding: 8,
                            borderRadius: 10,
                            border: "1px solid #bbb",
                            marginTop: 4,
                          }}
                        >
                          <option value="pending">Pending</option>
                          <option value="approved">Approved</option>
                          <option value="rejected">Rejected</option>
                        </select>
                      </label>

                      <button
                        style={{
                          marginTop: 12,
                          padding: "10px 12px",
                          borderRadius: 10,
                          border: "none",
                          background: "#111",
                          color: "#fff",
                          fontWeight: 900,
                        }}
                      >
                        Save changes
                      </button>
                    </form>

                    <form action={deleteReviewAction} style={{ alignSelf: "flex-start" }}>
                      <input type="hidden" name="review_id" value={review.id} />
                      <input type="hidden" name="redirect_to" value={adminBasePath} />
                      <button
                        style={{
                          padding: "10px 12px",
                          borderRadius: 10,
                          border: "1px solid #b00020",
                          background: "#fff",
                          color: "#b00020",
                          fontWeight: 900,
                        }}
                        type="submit"
                      >
                        Delete review
                      </button>
                    </form>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      )}

      {/* SCHOOL REVIEWS TAB */}
      {tab === "school-reviews" && (
        <section style={{ marginBottom: 22 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 10,
            }}
          >
            <h2 style={{ fontSize: 18, fontWeight: 900, margin: 0 }}>
              School referee reviews
            </h2>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <a
                href={schoolReviewLink("pending")}
                style={{
                  padding: "8px 10px",
                  borderRadius: 999,
                  border: "1px solid #111",
                  background: reviewStatus === "pending" ? "#111" : "#fff",
                  color: reviewStatus === "pending" ? "#fff" : "#111",
                  fontWeight: 900,
                  textDecoration: "none",
                  fontSize: 13,
                }}
              >
                Pending
              </a>
              <a
                href={schoolReviewLink("approved")}
                style={{
                  padding: "8px 10px",
                  borderRadius: 999,
                  border: "1px solid #111",
                  background: reviewStatus === "approved" ? "#111" : "#fff",
                  color: reviewStatus === "approved" ? "#fff" : "#111",
                  fontWeight: 900,
                  textDecoration: "none",
                  fontSize: 13,
                }}
              >
                Approved
              </a>
              <a
                href={schoolReviewLink("rejected")}
                style={{
                  padding: "8px 10px",
                  borderRadius: 999,
                  border: "1px solid #111",
                  background: reviewStatus === "rejected" ? "#111" : "#fff",
                  color: reviewStatus === "rejected" ? "#fff" : "#111",
                  fontWeight: 900,
                  textDecoration: "none",
                  fontSize: 13,
                }}
              >
                Rejected
              </a>
            </div>
          </div>

          <div style={{ marginTop: 10, color: "#555", fontSize: 13 }}>
            Showing: <strong>{reviewStatus}</strong> ({schoolReviewSubmissions.length})
          </div>

          <div style={{ marginTop: 12 }}>
            {schoolReviewSubmissions.length === 0 ? (
              <div style={{ color: "#555" }}>No reviews.</div>
            ) : (
              schoolReviewSubmissions.map((review) => (
                <div
                  key={review.id}
                  style={{
                    border: "1px solid #ddd",
                    borderRadius: 12,
                    padding: 16,
                    marginBottom: 12,
                    background: "#fff",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 12,
                      flexWrap: "wrap",
                    }}
                  >
                    <div style={{ minWidth: 280 }}>
                      <div style={{ fontWeight: 900 }}>
                        {review.school?.name ?? "Unknown school"}
                      </div>
                      <div style={{ color: "#555", fontSize: 13 }}>
                        {review.school?.city ? `${review.school.city}, ` : ""}
                        {review.school?.state ?? ""}
                        {review.sport ? ` • ${review.sport}` : ""}
                      </div>
                      <div style={{ marginTop: 6, color: "#555", fontSize: 13 }}>
                        Reviewer: @{review.reviewer?.handle ?? "unknown"} (
                        {review.reviewer?.email ?? "no email"})
                      </div>
                      <div style={{ color: "#555", fontSize: 13 }}>
                        Submitted: {new Date(review.created_at).toLocaleString()}
                      </div>
                    </div>
                    <div style={{ minWidth: 180, fontSize: 13, color: "#333" }}>
                      <strong>Scores (1-5)</strong>
                      <div>Overall: {review.overall_score} / 5</div>
                      <div>Logistics: {review.logistics_score} / 5</div>
                      <div>Facilities: {review.facilities_score} / 5</div>
                      <div>Pay: {review.pay_score} / 5</div>
                      <div>Support: {review.support_score} / 5</div>
                      <div>Worked games: {review.worked_games ?? "—"}</div>
                    </div>
                  </div>

                  {review.shift_detail ? (
                    <div
                      style={{
                        marginTop: 10,
                        padding: 10,
                        borderRadius: 10,
                        background: "#f9f9f9",
                        fontSize: 13,
                        color: "#444",
                      }}
                    >
                      {review.shift_detail}
                    </div>
                  ) : null}

                  <div
                    style={{
                      marginTop: 12,
                      display: "flex",
                      gap: 16,
                      flexWrap: "wrap",
                    }}
                  >
                    <form action={updateSchoolReviewAction} style={{ flex: 1, minWidth: 280 }}>
                      <input type="hidden" name="review_id" value={review.id} />
                      <input type="hidden" name="redirect_to" value={adminBasePath} />
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
                          gap: 10,
                        }}
                      >
                        <label style={{ fontSize: 12, fontWeight: 700 }}>
                          Overall
                          <input
                            name="overall_score"
                            defaultValue={review.overall_score}
                            style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px solid #ccc" }}
                          />
                        </label>
                        <label style={{ fontSize: 12, fontWeight: 700 }}>
                          Logistics
                          <input
                            name="logistics_score"
                            defaultValue={review.logistics_score}
                            style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px solid #ccc" }}
                          />
                        </label>
                        <label style={{ fontSize: 12, fontWeight: 700 }}>
                          Facilities
                          <input
                            name="facilities_score"
                            defaultValue={review.facilities_score}
                            style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px solid #ccc" }}
                          />
                        </label>
                        <label style={{ fontSize: 12, fontWeight: 700 }}>
                          Pay
                          <input
                            name="pay_score"
                            defaultValue={review.pay_score}
                            style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px solid #ccc" }}
                          />
                        </label>
                        <label style={{ fontSize: 12, fontWeight: 700 }}>
                          Support
                          <input
                            name="support_score"
                            defaultValue={review.support_score}
                            style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px solid #ccc" }}
                          />
                        </label>
                        <label style={{ fontSize: 12, fontWeight: 700 }}>
                          Worked games
                          <input
                            name="worked_games"
                            defaultValue={review.worked_games ?? ""}
                            style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px solid #ccc" }}
                          />
                        </label>
                      </div>
                      <label style={{ fontSize: 12, fontWeight: 700, display: "block", marginTop: 10 }}>
                        Shift detail
                        <textarea
                          name="shift_detail"
                          defaultValue={review.shift_detail ?? ""}
                          style={{
                            width: "100%",
                            padding: 8,
                            borderRadius: 8,
                            border: "1px solid #ccc",
                            minHeight: 90,
                          }}
                        />
                      </label>

                      <select
                        name="status"
                        defaultValue={review.status}
                        style={{
                          marginTop: 10,
                          padding: 8,
                          borderRadius: 8,
                          border: "1px solid #111",
                          fontWeight: 700,
                        }}
                      >
                        <option value="pending">Pending</option>
                        <option value="approved">Approved</option>
                        <option value="rejected">Rejected</option>
                      </select>

                      <label style={{ fontSize: 12, fontWeight: 700, marginTop: 8 }}>
                        Sport
                        <select
                          name="sport"
                          defaultValue={review.sport ?? "soccer"}
                          style={{
                            width: "100%",
                            padding: 8,
                            borderRadius: 8,
                            border: "1px solid #111",
                            marginTop: 4,
                          }}
                        >
                          {SCHOOL_SPORTS.map((sport) => (
                            <option key={sport} value={sport}>
                              {sport.charAt(0).toUpperCase() + sport.slice(1)}
                            </option>
                          ))}
                        </select>
                      </label>

                      <button
                        style={{
                          marginTop: 10,
                          padding: "10px 12px",
                          borderRadius: 10,
                          border: "none",
                          background: "#0a7a2f",
                          color: "#fff",
                          fontWeight: 900,
                        }}
                      >
                        Save
                      </button>
                    </form>

                    <form action={deleteSchoolReviewAction} style={{ alignSelf: "flex-start" }}>
                      <input type="hidden" name="review_id" value={review.id} />
                      <input type="hidden" name="redirect_to" value={adminBasePath} />
                      <button
                        style={{
                          padding: "10px 12px",
                          borderRadius: 10,
                          border: "1px solid #b00020",
                          background: "#fff",
                          color: "#b00020",
                          fontWeight: 900,
                        }}
                      >
                        Delete
                      </button>
                    </form>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      )}
    </div>
  );
}
