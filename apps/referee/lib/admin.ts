"use server";

import { redirect } from "next/navigation";
import { supabaseAdmin } from "./supabaseAdmin";
import { createSupabaseServerClient } from "./supabaseServer";
import type {
  TournamentContactInsert,
  TournamentContactUpdate,
  RefereeContactInsert,
  RefereeContactUpdate,
} from "@/lib/types/supabase";
import type {
  TournamentStatus,
  TournamentSubmissionType,
} from "@/lib/types/tournament";

type VerificationStatus = "pending" | "approved" | "rejected";
export type ReviewStatus = "pending" | "approved" | "rejected";
export type ContactStatus = "pending" | "verified" | "rejected";
export type AdminUserRow = {
  user_id: string;
  email: string | null;
  handle: string | null;
  real_name: string | null;
  years_refereeing: number | null;
  sports: string[] | null;
  role: string | null;
  created_at: string | null;
};
export type AdminBadgeRow = {
  id: number;
  code: string | null;
  label: string | null;
  description: string | null;
  is_public: boolean | null;
};

/**
 * If not logged in -> redirect to /admin/login
 * If logged in but not admin -> redirect to /admin/login?error=not_authorized
 */
export async function requireAdmin() {
  const supa = createSupabaseServerClient();

  const { data: userData, error: userErr } = await supa.auth.getUser();

  if (userErr || !userData.user) {
    redirect("/admin/login");
  }

  const { data: profile, error: profErr } = await supabaseAdmin
    .from("profiles")
    .select("user_id, role")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (profErr) {
    // If DB is down/misconfigured, fail “softly” back to login rather than crashing.
    redirect("/admin/login?error=server_error");
  }

  if (!profile || profile.role !== "admin") {
    redirect("/admin/login?error=not_authorized");
  }

  return userData.user;
}

/** USERS **/
export async function adminSearchUsers(q: string): Promise<AdminUserRow[]> {
  await requireAdmin();
  const query = q.trim();

  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("user_id, email, handle, real_name, years_refereeing, sports, role, created_at")
    .or(`email.ilike.%${query}%,handle.ilike.%${query}%,real_name.ilike.%${query}%`)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) throw error;
  return (data ?? []) as AdminUserRow[];
}

export async function adminUpdateUserProfile(input: {
  user_id: string;
  handle?: string;
  real_name?: string;
  years_refereeing?: number | null;
  sports?: string[] | null;
  role?: string | null;
}) {
  await requireAdmin();
  const { user_id, ...updates } = input;

  const { error } = await supabaseAdmin.from("profiles").update(updates).eq("user_id", user_id);
  if (error) throw error;
}

export async function adminSetUserDisabled(user_id: string, disabled: boolean) {
  await requireAdmin();

  const { error } = await supabaseAdmin.auth.admin.updateUserById(user_id, {
    ban_duration: disabled ? "87600h" : "none",
  });

  if (error) throw error;
}

export async function adminResendConfirmationEmail(params: { email: string }) {
  await requireAdmin();

  const { error } = await supabaseAdmin.auth.resend({
    type: "signup",
    email: params.email,
  });

  if (error) throw error;
}

/** BADGES **/
export async function adminListBadges(): Promise<AdminBadgeRow[]> {
  await requireAdmin();

  const { data, error } = await supabaseAdmin
    .from("badges")
    .select("id, code, label, description, is_public")
    .order("id", { ascending: true });

  if (error) throw error;
  return (data ?? []) as AdminBadgeRow[];
}

export async function adminGetUserBadges(user_id: string) {
  await requireAdmin();

  const { data, error } = await supabaseAdmin
    .from("user_badges")
    .select("badge_id, status, awarded_at, awarded_by, badges (id, code, label)")
    .eq("user_id", user_id)
    .order("awarded_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function adminAwardBadge(params: { user_id: string; badge_id: number }) {
  const admin = await requireAdmin();

  const { error } = await supabaseAdmin
    .from("user_badges")
    .upsert(
      {
        user_id: params.user_id,
        badge_id: params.badge_id,
        status: "earned",
        awarded_at: new Date().toISOString(),
        awarded_by: admin.id,
      },
      { onConflict: "user_id,badge_id" }
    );

  if (error) throw error;
}

export async function adminRevokeBadge(params: { user_id: string; badge_id: number }) {
  await requireAdmin();

  const { error } = await supabaseAdmin
    .from("user_badges")
    .delete()
    .eq("user_id", params.user_id)
    .eq("badge_id", params.badge_id);

  if (error) throw error;
}

/** VERIFICATION REQUESTS **/
export async function adminListVerificationRequests(status: VerificationStatus = "pending") {
  await requireAdmin();

  const { data, error } = await supabaseAdmin
    .from("referee_verification_requests")
    .select(
      `
      id,
      user_id,
      association,
      level,
      notes,
      evidence_url,
      status,
      submitted_at,
      reviewed_at,
      reviewed_by,
      admin_notes,
      user_profile:profiles!referee_verification_requests_user_id_fkey (
        email,
        handle,
        real_name
      ),
      reviewer_profile:profiles!referee_verification_requests_reviewed_by_fkey (
        email,
        handle
      )
    `
    )
    .eq("status", status)
    .order("submitted_at", { ascending: false })
    .limit(200);

  if (error) throw error;
  return data ?? [];
}

export async function adminSetVerificationStatus(params: {
  request_id: number;
  status: "approved" | "rejected";
  admin_notes?: string | null;
}) {
  const admin = await requireAdmin();

  const { error } = await supabaseAdmin
    .from("referee_verification_requests")
    .update({
      status: params.status,
      admin_notes: params.admin_notes ?? null,
      reviewed_by: admin.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", params.request_id);

  if (error) throw error;
}

/** TOURNAMENT REVIEWS **/
export type AdminTournamentReview = {
  id: string;
  tournament_id: string;
  user_id: string;
  created_at: string;
  status: ReviewStatus;
  sport: string | null;
  overall_score: number;
  logistics_score: number;
  facilities_score: number;
  pay_score: number;
  support_score: number;
  sideline_score: number;
  worked_games: number | null;
  shift_detail: string | null;
  reviewer?: {
    handle: string | null;
    email: string | null;
  } | null;
  tournament?: {
    name: string | null;
    city: string | null;
    state: string | null;
    sport: string | null;
  } | null;
};

export type AdminSchoolReview = {
  id: string;
  school_id: string;
  user_id: string;
  created_at: string;
  status: ReviewStatus;
  sport: string | null;
  overall_score: number;
  logistics_score: number;
  facilities_score: number;
  pay_score: number;
  support_score: number;
  sideline_score: number;
  worked_games: number | null;
  shift_detail: string | null;
  reviewer?: {
    handle: string | null;
    email: string | null;
  } | null;
  school?: {
    name: string | null;
    city: string | null;
    state: string | null;
  } | null;
};

export type AdminTournamentContact = {
  id: string;
  tournament_id: string | null;
  type: "assignor" | "director" | "general";
  name: string | null;
  email: string | null;
  phone: string | null;
  source_url: string | null;
  confidence: number | null;
  status: ContactStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
  tournament?: {
    name: string | null;
    slug: string | null;
    city: string | null;
    state: string | null;
  } | null;
};

export type AdminRefereeContact = {
  id: string;
  name: string | null;
  organization: string | null;
  role: string | null;
  email: string | null;
  phone: string | null;
  state: string | null;
  city: string | null;
  notes: string | null;
  source_url: string | null;
  type: "assignor" | "director" | "general" | "referee_coordinator";
  status: ContactStatus;
  confidence: number | null;
  created_at: string;
  updated_at: string;
  tournaments?: {
    link_id: string;
    id: string;
    name: string | null;
    slug: string | null;
    city: string | null;
    state: string | null;
  }[];
};

export async function adminListTournamentReviews(status: ReviewStatus = "pending") {
  await requireAdmin();

  const { data, error } = await supabaseAdmin
    .from("tournament_referee_reviews")
    .select(
      "id,tournament_id,user_id,created_at,status,overall_score,logistics_score,facilities_score,pay_score,support_score,worked_games,shift_detail"
    )
    .eq("status", status)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) throw error;

  const reviews = data ?? [];
  if (reviews.length === 0) return [];

  const userIds = Array.from(new Set(reviews.map((row) => row.user_id).filter(Boolean)));
  const tournamentIds = Array.from(
    new Set(reviews.map((row) => row.tournament_id).filter(Boolean))
  );

  const [{ data: profileRows }, { data: tournamentRows }] = await Promise.all([
    userIds.length
      ? supabaseAdmin
          .from("profiles")
          .select("user_id,handle,email")
          .in("user_id", userIds)
      : Promise.resolve({ data: [] }),
    tournamentIds.length
      ? supabaseAdmin
          .from("tournaments")
          .select("id,name,city,state,sport")
          .in("id", tournamentIds)
      : Promise.resolve({ data: [] }),
  ]);

  const profileMap = new Map(
    (profileRows ?? []).map((p: any) => [p.user_id, { handle: p.handle ?? null, email: p.email ?? null }])
  );

  const tournamentMap = new Map(
    (tournamentRows ?? []).map((t: any) => [
      t.id,
      { name: t.name ?? null, city: t.city ?? null, state: t.state ?? null, sport: t.sport ?? null },
    ])
  );

  return reviews.map(
    (row) =>
      ({
        id: row.id,
        tournament_id: row.tournament_id,
        user_id: row.user_id,
        created_at: row.created_at,
        status: row.status,
        sport: tournamentMap.get(row.tournament_id)?.sport ?? null,
        overall_score: row.overall_score,
        logistics_score: row.logistics_score,
        facilities_score: row.facilities_score,
        pay_score: row.pay_score,
        support_score: row.support_score,
        worked_games: row.worked_games,
        shift_detail: row.shift_detail,
        reviewer: profileMap.get(row.user_id) ?? null,
        tournament: tournamentMap.get(row.tournament_id) ?? null,
      }) as AdminTournamentReview
  );
}

export async function adminUpdateTournamentReview(params: {
  review_id: string;
  updates: {
    status?: ReviewStatus;
    overall_score?: number;
    logistics_score?: number;
    facilities_score?: number;
    pay_score?: number;
    support_score?: number;
    worked_games?: number | null;
    shift_detail?: string | null;
  };
}) {
  await requireAdmin();
  const updatePayload: Record<string, any> = {};

  for (const [key, value] of Object.entries(params.updates)) {
    if (typeof value !== "undefined") {
      updatePayload[key] = value;
    }
  }

  if (Object.keys(updatePayload).length === 0) return;

  const { error } = await supabaseAdmin
    .from("tournament_referee_reviews")
    .update(updatePayload)
    .eq("id", params.review_id);

  if (error) throw error;
}

export async function adminDeleteTournamentReview(review_id: string) {
  await requireAdmin();
  const { data: reviewRow, error: reviewError } = await supabaseAdmin
    .from("tournament_referee_reviews")
    .select("tournament_id")
    .eq("id", review_id)
    .maybeSingle<{ tournament_id: string | null }>();
  if (reviewError) throw reviewError;

  const { error } = await supabaseAdmin
    .from("tournament_referee_reviews")
    .delete()
    .eq("id", review_id);

  if (error) throw error;

  const tournamentId = reviewRow?.tournament_id ?? null;
  if (!tournamentId) return;

  const { count } = await supabaseAdmin
    .from("tournament_referee_reviews")
    .select("id", { count: "exact", head: true })
    .eq("tournament_id", tournamentId)
    .eq("status", "approved");

  if (!count || count === 0) {
    await supabaseAdmin.from("tournament_referee_scores").delete().eq("tournament_id", tournamentId);
  }
}

export async function adminListSchoolReviews(status: ReviewStatus = "pending") {
  await requireAdmin();

  const { data, error } = await supabaseAdmin
    .from("school_referee_reviews")
    .select(
      "id,school_id,user_id,created_at,status,sport,overall_score,logistics_score,facilities_score,pay_score,support_score,sideline_score,worked_games,shift_detail"
    )
    .eq("status", status)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) throw error;

  const reviews = data ?? [];
  if (!reviews.length) return [];

  const userIds = Array.from(new Set(reviews.map((row) => row.user_id).filter(Boolean)));
  const schoolIds = Array.from(new Set(reviews.map((row) => row.school_id).filter(Boolean)));

  const [{ data: profileRows }, { data: schoolRows }] = await Promise.all([
    userIds.length
      ? supabaseAdmin.from("profiles").select("user_id,handle,email").in("user_id", userIds)
      : Promise.resolve({ data: [] }),
    schoolIds.length
      ? supabaseAdmin.from("schools").select("id,name,city,state").in("id", schoolIds)
      : Promise.resolve({ data: [] }),
  ]);

  const profileMap = new Map(
    (profileRows ?? []).map((p: any) => [p.user_id, { handle: p.handle ?? null, email: p.email ?? null }])
  );
  const schoolMap = new Map(
    (schoolRows ?? []).map((s: any) => [
      s.id,
      { name: s.name ?? null, city: s.city ?? null, state: s.state ?? null },
    ])
  );

  return reviews.map(
    (row) =>
      ({
        id: row.id,
        school_id: row.school_id,
        user_id: row.user_id,
        created_at: row.created_at,
        status: row.status,
        overall_score: row.overall_score,
        logistics_score: row.logistics_score,
        facilities_score: row.facilities_score,
        pay_score: row.pay_score,
        support_score: row.support_score,
        sideline_score: row.sideline_score,
        worked_games: row.worked_games,
        shift_detail: row.shift_detail,
        reviewer: profileMap.get(row.user_id) ?? null,
        school: schoolMap.get(row.school_id) ?? null,
      }) as AdminSchoolReview
  );
}

export async function adminUpdateSchoolReview(params: {
  review_id: string;
  updates: {
    status?: ReviewStatus;
    overall_score?: number;
    logistics_score?: number;
    facilities_score?: number;
    pay_score?: number;
    support_score?: number;
    sideline_score?: number;
    worked_games?: number | null;
    shift_detail?: string | null;
  };
}) {
  await requireAdmin();
  const updatePayload: Record<string, any> = {};

  for (const [key, value] of Object.entries(params.updates)) {
    if (typeof value !== "undefined") {
      updatePayload[key] = value;
    }
  }
  if (Object.keys(updatePayload).length === 0) return;

  const { error } = await supabaseAdmin
    .from("school_referee_reviews")
    .update(updatePayload)
    .eq("id", params.review_id);
  if (error) throw error;
}

export async function adminDeleteSchoolReview(review_id: string) {
  await requireAdmin();
  const { data: reviewRow, error: reviewError } = await supabaseAdmin
    .from("school_referee_reviews")
    .select("school_id")
    .eq("id", review_id)
    .maybeSingle<{ school_id: string | null }>();
  if (reviewError) throw reviewError;

  const { error } = await supabaseAdmin
    .from("school_referee_reviews")
    .delete()
    .eq("id", review_id);
  if (error) throw error;

  const schoolId = reviewRow?.school_id ?? null;
  if (!schoolId) return;

  const { count } = await supabaseAdmin
    .from("school_referee_reviews")
    .select("id", { count: "exact", head: true })
    .eq("school_id", schoolId)
    .eq("status", "approved");

  if (!count || count === 0) {
    await supabaseAdmin.from("school_referee_scores").delete().eq("school_id", schoolId);
    await supabaseAdmin.from("school_referee_scores_by_sport").delete().eq("school_id", schoolId);
  }
}

export async function adminFindTournamentIdBySlug(slug: string): Promise<string | null> {
  await requireAdmin();
  const { data, error } = await supabaseAdmin
    .from("tournaments")
    .select("id")
    .eq("slug", slug)
    .maybeSingle<{ id: string }>();
  if (error && error.code !== "PGRST116") throw error;
  return data?.id ?? null;
}

export async function adminFindTournamentIdBySlugOrName(
  query: string
): Promise<string | null> {
  await requireAdmin();
  const trimmed = query.trim();
  if (!trimmed) return null;

  const { data: slugMatch, error: slugError } = await supabaseAdmin
    .from("tournaments")
    .select("id")
    .eq("slug", trimmed)
    .maybeSingle<{ id: string }>();
  if (slugError && slugError.code !== "PGRST116") throw slugError;
  if (slugMatch?.id) return slugMatch.id;

  const { data: nameMatches, error: nameError } = await supabaseAdmin
    .from("tournaments")
    .select("id")
    .ilike("name", `%${trimmed}%`)
    .limit(1);
  if (nameError) throw nameError;
  return (nameMatches?.[0]?.id as string | undefined) ?? null;
}

/** CONTACTS **/
export async function adminListTournamentContacts(
  status?: ContactStatus
): Promise<AdminTournamentContact[]> {
  await requireAdmin();
  let query = supabaseAdmin
    .from("tournament_contacts")
    .select(
      "id,tournament_id,type,name,email,phone,source_url,confidence,status,notes,created_at,updated_at"
    )
    .order("created_at", { ascending: false })
    .limit(200);
  if (status) {
    query = query.eq("status", status);
  }
  const { data, error } = await query;
  if (error) throw error;
  const rows = data ?? [];
  const tournamentIds = Array.from(
    new Set(rows.map((row) => row.tournament_id).filter(Boolean))
  ) as string[];
  let tournamentMap = new Map<string, { name: string | null; slug: string | null; city: string | null; state: string | null }>();
  if (tournamentIds.length) {
    type TournamentRow = {
      id: string;
      name: string | null;
      slug: string | null;
      city: string | null;
      state: string | null;
    };
    const { data: tournamentRows } = await supabaseAdmin
      .from("tournaments")
      .select("id,name,slug,city,state")
      .in("id", tournamentIds);
    tournamentMap = new Map<string, { name: string | null; slug: string | null; city: string | null; state: string | null }>(
      ((tournamentRows ?? []) as TournamentRow[]).map((row) => [
        row.id,
        {
          name: row.name ?? null,
          slug: row.slug ?? null,
          city: row.city ?? null,
          state: row.state ?? null,
        },
      ])
    );
  }
  return rows.map((row) => ({
    ...row,
    tournament: row.tournament_id ? tournamentMap.get(row.tournament_id) ?? null : null,
  }));
}

export async function adminCreateTournamentContact(
  payload: TournamentContactInsert
) {
  await requireAdmin();
  const { error } = await supabaseAdmin.from("tournament_contacts").insert(payload);
  if (error) throw error;
}

export async function adminUpdateTournamentContact(
  id: string,
  updates: TournamentContactUpdate
) {
  await requireAdmin();
  const { error } = await supabaseAdmin
    .from("tournament_contacts")
    .update(updates)
    .eq("id", id);
  if (error) throw error;
}

export async function adminDeleteTournamentContact(id: string) {
  await requireAdmin();
  const { error } = await supabaseAdmin.from("tournament_contacts").delete().eq("id", id);
  if (error) throw error;
}

export async function adminListRefereeContacts(): Promise<AdminRefereeContact[]> {
  await requireAdmin();
  const { data, error } = await supabaseAdmin
    .from("referee_contacts")
    .select(
      `
      id,
      name,
      organization,
      role,
      email,
      phone,
      state,
      city,
      notes,
      source_url,
      type,
      status,
      confidence,
      created_at,
      updated_at,
      tournament_links:tournament_referee_contacts (
        id,
        tournament_id,
        notes,
        tournaments (
          id,
          name,
          slug,
          city,
          state
        )
      )
    `
    )
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    id: row.id,
    name: row.name,
    organization: row.organization,
    role: row.role,
    email: row.email,
    phone: row.phone,
    state: row.state,
    city: row.city,
    notes: row.notes,
    source_url: row.source_url,
    type: (row.type ?? "general") as AdminRefereeContact["type"],
    status: (row.status ?? "pending") as ContactStatus,
    confidence: row.confidence ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    tournaments: (row.tournament_links ?? []).map((link: any) => ({
      link_id: link.id,
      id: link.tournaments?.id ?? link.tournament_id,
      name: link.tournaments?.name ?? null,
      slug: link.tournaments?.slug ?? null,
      city: link.tournaments?.city ?? null,
      state: link.tournaments?.state ?? null,
    })),
  }));
}

export async function adminCreateRefereeContact(
  payload: RefereeContactInsert
): Promise<string | null> {
  await requireAdmin();
  const { data, error } = await supabaseAdmin
    .from("referee_contacts")
    .insert(payload)
    .select("id")
    .single<{ id: string }>();
  if (error) throw error;
  return data?.id ?? null;
}

export async function adminUpdateRefereeContact(
  id: string,
  updates: RefereeContactUpdate
) {
  await requireAdmin();
  const { error } = await supabaseAdmin
    .from("referee_contacts")
    .update(updates)
    .eq("id", id);
  if (error) throw error;
}

export async function adminDeleteRefereeContact(id: string) {
  await requireAdmin();
  const { error } = await supabaseAdmin.from("referee_contacts").delete().eq("id", id);
  if (error) throw error;
}

export async function adminLinkRefereeContactToTournament(params: {
  contact_id: string;
  tournament_id: string;
  notes?: string | null;
}) {
  await requireAdmin();
  const { error } = await supabaseAdmin.from("tournament_referee_contacts").upsert(
    {
      tournament_id: params.tournament_id,
      referee_contact_id: params.contact_id,
      notes: params.notes ?? null,
    },
    { onConflict: "tournament_id,referee_contact_id" }
  );
  if (error) throw error;
}

export async function adminUnlinkRefereeContactFromTournament(link_id: string) {
  await requireAdmin();
  const { error } = await supabaseAdmin
    .from("tournament_referee_contacts")
    .delete()
    .eq("id", link_id);
  if (error) throw error;
}

export async function adminListPendingTournaments() {
  await requireAdmin();
  const { data, error } = await supabaseAdmin
    .from("tournaments")
    .select(
      "id,name,slug,sport,level,state,city,venue,address,start_date,end_date,source_url,source_domain,summary,referee_pay,referee_contact,sub_type,updated_at,cash_tournament"
    )
    .eq("status", "draft")
    .order("updated_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data ?? []) as AdminPendingTournament[];
}

export type AdminPendingTournament = {
  id: string;
  name: string;
  slug: string;
  sport: string;
  level?: string | null;
  sub_type?: TournamentSubmissionType | null;
  cash_tournament?: boolean | null;
  state?: string | null;
  city?: string | null;
  venue?: string | null;
  address?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  source_url?: string | null;
  source_domain?: string | null;
  summary?: string | null;
  referee_pay?: string | null;
  referee_contact?: string | null;
  updated_at?: string | null;
};

export type AdminListedTournament = {
  id: string;
  name: string;
  slug: string;
  sport: string;
  level?: string | null;
  sub_type?: TournamentSubmissionType | null;
  cash_tournament?: boolean | null;
  state?: string | null;
  city?: string | null;
  venue?: string | null;
  address?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  summary?: string | null;
  referee_pay?: string | null;
  referee_contact?: string | null;
  source_url?: string | null;
  source_domain?: string | null;
};

export async function adminSearchPublishedTournaments(
  query?: string
): Promise<AdminListedTournament[]> {
  await requireAdmin();
  let request = supabaseAdmin
    .from("tournaments")
    .select(
      "id,name,slug,sport,level,sub_type,cash_tournament,state,city,venue,address,start_date,end_date,summary,referee_pay,referee_contact,source_url,source_domain"
    )
    .eq("status", "published")
    .eq("is_canonical", true)
    .order("updated_at", { ascending: false })
    .limit(100);

  const trimmed = query?.trim();
  if (trimmed) {
    const safe = trimmed.replace(/[%,]/g, " ").replace(/\s+/g, " ").trim();
    const spacedPattern = safe.includes(" ") ? safe.split(" ").join("%") : safe;
    const patterns = [safe, spacedPattern].filter(Boolean);
    const clauses: string[] = [];
    const fields = [
      "name",
      "slug",
      "city",
      "state",
      "venue",
      "address",
      "summary",
      "source_url",
      "source_domain",
      "referee_contact",
      "referee_pay",
    ];
    patterns.forEach((pattern) => {
      fields.forEach((field) => {
        clauses.push(`${field}.ilike.%${pattern}%`);
      });
    });
    request = request.or(clauses.join(","));
  }

  const { data, error } = await request;
  if (error) throw error;
  return (data ?? []) as AdminListedTournament[];
}

export async function adminUpdateTournamentDetails(params: {
  tournament_id: string;
  updates: Partial<{
    name: string | null;
    sport: string | null;
    level: string | null;
    sub_type: TournamentSubmissionType | null;
    cash_tournament: boolean;
    state: string | null;
    city: string | null;
    venue: string | null;
    address: string | null;
    start_date: string | null;
    end_date: string | null;
    summary: string | null;
    referee_pay: string | null;
    referee_contact: string | null;
    source_url: string | null;
    source_domain: string | null;
  }>;
}) {
  await requireAdmin();
  const updatePayload: Record<string, any> = {};
  for (const [key, value] of Object.entries(params.updates)) {
    if (typeof value === "undefined") continue;
    if (key === "cash_tournament") {
      updatePayload[key] = Boolean(value);
    } else {
      updatePayload[key] = value;
    }
  }
  if (!Object.keys(updatePayload).length) return;
  updatePayload.updated_at = new Date().toISOString();

  const { error } = await supabaseAdmin
    .from("tournaments")
    .update(updatePayload)
    .eq("id", params.tournament_id);
  if (error) throw error;
}

export async function adminUpdateTournamentStatus(params: {
  tournament_id: string;
  status: TournamentStatus;
}) {
  await requireAdmin();
  const { error } = await supabaseAdmin
    .from("tournaments")
    .update({
      status: params.status,
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.tournament_id);
  if (error) throw error;
}

export async function adminDeleteTournament(tournament_id: string) {
  await requireAdmin();
  await supabaseAdmin.from("tournament_referee_scores").delete().eq("tournament_id", tournament_id);
  const { error } = await supabaseAdmin.from("tournaments").delete().eq("id", tournament_id);
  if (error) throw error;
}
