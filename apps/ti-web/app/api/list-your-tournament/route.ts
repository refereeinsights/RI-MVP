import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  getSponsorCategoryFormState,
  buildTournamentSlug,
  type TournamentDuplicateMatch,
  type SanitizedTournamentSubmission,
  type TournamentSubmissionInput,
  validateTournamentSubmission,
} from "@/lib/listTournamentForm";

type TournamentInsertResult = {
  id: string;
  slug: string;
};

type DuplicateLookupRow = {
  id: string;
  slug: string | null;
  name: string | null;
  sport: string | null;
  city: string | null;
  state: string | null;
  start_date: string | null;
  end_date: string | null;
  official_website_url: string | null;
  team_fee: string | null;
  age_group: string | null;
  tournament_director: string | null;
  tournament_director_email: string | null;
  referee_contact: string | null;
  referee_contact_email: string | null;
  referee_pay: string | null;
  ref_cash_tournament: boolean | null;
  ref_mentors: "yes" | "no" | null;
  travel_lodging: "hotel" | "stipend" | null;
  tournament_venues?: Array<{
    venues:
      | {
          id: string;
          name: string | null;
          address1: string | null;
          city: string | null;
          state: string | null;
          zip: string | null;
          venue_url: string | null;
          restrooms: string | null;
          bring_field_chairs: boolean | null;
        }
      | null;
  }> | null;
};

type TournamentPartnerRow = {
  id: string;
  name: string | null;
  address: string | null;
  sponsor_click_url: string | null;
  category: string | null;
  sort_order: number | null;
};

function normalizeLookupText(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function scoreDuplicateMatch(row: DuplicateLookupRow, name: string, city: string, state: string) {
  let score = 0;
  const targetName = normalizeLookupText(name);
  const rowName = normalizeLookupText(row.name ?? "");
  const targetCity = city.trim().toLowerCase();
  const rowCity = (row.city ?? "").trim().toLowerCase();
  const targetState = state.trim().toUpperCase();
  const rowState = (row.state ?? "").trim().toUpperCase();

  if (rowName === targetName) score += 10;
  else if (rowName.includes(targetName) || targetName.includes(rowName)) score += 5;
  if (targetCity && rowCity === targetCity) score += 3;
  if (targetState && rowState === targetState) score += 2;
  return score;
}

function mapDuplicateMatch(row: DuplicateLookupRow, sponsorRows: TournamentPartnerRow[] = []): TournamentDuplicateMatch {
  return {
    id: row.id,
    slug: row.slug ?? null,
    name: row.name ?? "",
    sport: row.sport ?? null,
    city: row.city ?? null,
    state: row.state ?? null,
    startDate: row.start_date ?? null,
    endDate: row.end_date ?? null,
    officialWebsiteUrl: row.official_website_url ?? null,
    teamFee: row.team_fee ?? null,
    ageGroup: row.age_group ?? null,
    tournamentDirector: row.tournament_director ?? null,
    tournamentDirectorEmail: row.tournament_director_email ?? null,
    refereeContact: row.referee_contact ?? null,
    refereeEmail: row.referee_contact_email ?? null,
    refereePay: row.referee_pay ?? null,
    refCashTournament: row.ref_cash_tournament ?? null,
    refMentors: row.ref_mentors ?? null,
    travelLodging: row.travel_lodging ?? null,
    sponsors: sponsorRows.map((sponsor) => {
      const categoryState = getSponsorCategoryFormState(sponsor.category);
      return {
        id: sponsor.id,
        name: sponsor.name ?? "",
        address: sponsor.address ?? "",
        websiteUrl: sponsor.sponsor_click_url ?? null,
        category: sponsor.category ?? null,
        categoryOption: categoryState.categoryOption,
        otherCategory: categoryState.otherCategory,
      };
    }),
    venues: (row.tournament_venues ?? [])
      .map((entry) => entry?.venues ?? null)
      .filter(
        (venue): venue is NonNullable<NonNullable<DuplicateLookupRow["tournament_venues"]>[number]["venues"]> =>
          Boolean(venue?.name)
      )
      .map((venue) => ({
        id: venue.id ?? null,
        name: venue.name ?? "",
        address1: venue.address1 ?? "",
        city: venue.city ?? "",
        state: venue.state ?? "",
        zip: venue.zip ?? "",
        venueUrl: venue.venue_url ?? null,
        restrooms:
          venue.restrooms === "Portable" || venue.restrooms === "Building" || venue.restrooms === "Both"
            ? venue.restrooms
            : "",
        bringFieldChairs:
          venue.bring_field_chairs === true ? "yes" : venue.bring_field_chairs === false ? "no" : "",
      })),
  };
}

async function insertTournament(payload: Record<string, unknown>): Promise<TournamentInsertResult> {
  const baseSlug = String(payload.slug ?? "").trim() || `submission-${Date.now()}`;
  let slug = baseSlug;
  let lastError: { code?: string; message?: string } | null = null;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const { data, error } = await (supabaseAdmin.from("tournaments" as any) as any)
      .insert({ ...payload, slug })
      .select("id,slug")
      .single();

    if (!error && data?.id) {
      return data as TournamentInsertResult;
    }

    if (error?.code === "23505") {
      slug = `${baseSlug}-${Math.floor(Math.random() * 10000)
        .toString()
        .padStart(4, "0")}`;
      lastError = error;
      continue;
    }

    throw error;
  }

  throw lastError ?? new Error("Tournament insert failed.");
}

async function updateTournament(tournamentId: string, payload: Record<string, unknown>): Promise<TournamentInsertResult> {
  const { data, error } = await (supabaseAdmin.from("tournaments" as any) as any)
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq("id", tournamentId)
    .select("id,slug")
    .single();

  if (error || !data?.id) {
    throw error ?? new Error("Tournament update failed.");
  }

  return data as TournamentInsertResult;
}

async function syncTournamentSponsors(tournamentId: string, sponsors: SanitizedTournamentSubmission["sponsors"]) {
  const { data: existingRows, error: existingError } = await (supabaseAdmin
    .from("tournament_partner_nearby" as any) as any)
    .select("id")
    .eq("tournament_id", tournamentId)
    .is("venue_id", null);

  if (existingError) throw existingError;

  const existingIds = ((existingRows ?? []) as Array<{ id: string | null }>)
    .map((row) => row.id)
    .filter((id): id is string => Boolean(id));
  const retainedIds = new Set<string>();

  for (const [index, sponsor] of sponsors.entries()) {
    const sponsorId = sponsor.id?.trim() || null;
    const payload = {
      tournament_id: tournamentId,
      venue_id: null,
      category: sponsor.category,
      name: sponsor.name,
      address: sponsor.address,
      sponsor_click_url: sponsor.websiteUrl,
      sort_order: index,
      is_active: true,
      updated_at: new Date().toISOString(),
    };

    if (sponsorId && existingIds.includes(sponsorId)) {
      const { error } = await (supabaseAdmin.from("tournament_partner_nearby" as any) as any)
        .update(payload)
        .eq("id", sponsorId)
        .eq("tournament_id", tournamentId)
        .is("venue_id", null);
      if (error) throw error;
      retainedIds.add(sponsorId);
    } else {
      const { data, error } = await (supabaseAdmin.from("tournament_partner_nearby" as any) as any)
        .insert(payload)
        .select("id")
        .single();
      if (error || !data?.id) {
        throw error ?? new Error("Tournament sponsor save failed.");
      }
      retainedIds.add(String(data.id));
    }
  }

  const staleIds = existingIds.filter((id) => !retainedIds.has(id));
  if (staleIds.length > 0) {
    const { error } = await (supabaseAdmin.from("tournament_partner_nearby" as any) as any)
      .delete()
      .eq("tournament_id", tournamentId)
      .is("venue_id", null)
      .in("id", staleIds);
    if (error) throw error;
  }
}

async function cleanupSubmission(tournamentId: string | null, venueIds: string[]) {
  if (tournamentId) {
    await (supabaseAdmin.from("tournament_venues" as any) as any).delete().eq("tournament_id", tournamentId);
  }
  if (venueIds.length > 0) {
    await (supabaseAdmin.from("venues" as any) as any).delete().in("id", venueIds);
  }
  if (tournamentId) {
    await (supabaseAdmin.from("tournaments" as any) as any).delete().eq("id", tournamentId);
  }
}

function buildTournamentRecord(input: SanitizedTournamentSubmission) {
  const firstVenue = input.venues[0];
  const officialUrl = input.tournament.officialWebsiteUrl;
  const sourceDomain = (() => {
    try {
      return new URL(officialUrl).hostname;
    } catch {
      return null;
    }
  })();

  return {
    name: input.tournament.name,
    slug: buildTournamentSlug({
      name: input.tournament.name,
      city: firstVenue.city,
      state: firstVenue.state,
    }),
    sport: input.tournament.sport,
    state: firstVenue.state,
    city: firstVenue.city,
    zip: firstVenue.zip,
    venue: firstVenue.name,
    address: firstVenue.address1,
    start_date: input.tournament.startDate,
    end_date: input.tournament.endDate,
    source_url: officialUrl,
    source_domain: sourceDomain,
    official_website_url: officialUrl,
    team_fee: input.tournament.teamFee,
    age_group: input.tournament.ageGroup,
    tournament_director: input.tournament.tournamentDirector,
    tournament_director_email: input.tournament.tournamentDirectorEmail,
    referee_contact: input.tournament.refereeContact,
    referee_contact_email: input.tournament.refereeEmail,
    referee_pay: input.tournament.refereePay,
    ref_cash_tournament: input.tournament.refCashTournament,
    ref_mentors: input.tournament.refMentors,
    travel_lodging: input.tournament.travelLodging,
    sub_type: "website",
    source: "public_submission",
    status: "draft",
    is_canonical: true,
  };
}

export async function POST(request: Request) {
  let payload: TournamentSubmissionInput;

  try {
    payload = (await request.json()) as TournamentSubmissionInput;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }

  const validation = validateTournamentSubmission(payload);
  if (!validation.ok) {
    return NextResponse.json(
      { ok: false, error: "Please review the highlighted fields.", fieldErrors: validation.errors },
      { status: 400 }
    );
  }

  let tournamentId: string | null = null;
  const createdVenueIds: string[] = [];

  try {
    const verifyTargetTournamentId = payload.verifyTargetTournamentId?.trim() || null;
    const tournamentPayload = buildTournamentRecord(validation.value);
    const shouldUpdateExisting = Boolean(verifyTargetTournamentId);
    const tournament = shouldUpdateExisting
      ? await updateTournament(verifyTargetTournamentId as string, tournamentPayload)
      : await insertTournament(tournamentPayload);
    tournamentId = tournament.id;

    const desiredVenueIds: string[] = [];

    for (let index = 0; index < validation.value.venues.length; index += 1) {
      const venue = validation.value.venues[index];
      const venuePayload = {
        name: venue.name,
        address: venue.address1,
        address1: venue.address1,
        city: venue.city,
        state: venue.state,
        zip: venue.zip,
        venue_url: venue.venueUrl,
        sport: validation.value.tournament.sport,
        restrooms: venue.restrooms,
        bring_field_chairs: venue.bringFieldChairs,
        updated_at: new Date().toISOString(),
      };
      const existingVenueId = shouldUpdateExisting ? payload.venues[index]?.id?.trim() || null : null;
      const venueQuery = existingVenueId
        ? (supabaseAdmin.from("venues" as any) as any).update(venuePayload).eq("id", existingVenueId)
        : (supabaseAdmin.from("venues" as any) as any).insert(venuePayload);
      const { data, error } = await venueQuery.select("id").single();

      if (error || !data?.id) {
        if (!shouldUpdateExisting) {
          await cleanupSubmission(tournamentId, createdVenueIds);
        }
        return NextResponse.json(
          {
            ok: false,
            error: `Venue #${index + 1} could not be saved. Please review that venue and try again.`,
          },
          { status: 500 }
        );
      }

      const resolvedVenueId = String(data.id);
      desiredVenueIds.push(resolvedVenueId);
      if (!existingVenueId) {
        createdVenueIds.push(resolvedVenueId);
      }
    }

    const links = desiredVenueIds.map((venueId) => ({
      tournament_id: tournamentId,
      venue_id: venueId,
    }));

    const { error: linkError } = await (supabaseAdmin.from("tournament_venues" as any) as any).upsert(links, {
      onConflict: "tournament_id,venue_id",
    });
    if (linkError) {
      if (!shouldUpdateExisting) {
        await cleanupSubmission(tournamentId, createdVenueIds);
      }
      return NextResponse.json(
        {
          ok: false,
          error: "The tournament was saved, but venue linking failed. Please retry your submission.",
        },
        { status: 500 }
      );
    }

    const { data: existingLinksData, error: existingLinksError } = await (supabaseAdmin
      .from("tournament_venues" as any) as any)
      .select("venue_id")
      .eq("tournament_id", tournamentId);

    if (existingLinksError) {
      if (!shouldUpdateExisting) {
        await cleanupSubmission(tournamentId, createdVenueIds);
      }
      return NextResponse.json(
        {
          ok: false,
          error: "The tournament was saved, but linked venues could not be refreshed. Please retry.",
        },
        { status: 500 }
      );
    }

    const staleVenueIds = ((existingLinksData ?? []) as Array<{ venue_id: string | null }>)
      .map((row) => row.venue_id)
      .filter((venueId): venueId is string => Boolean(venueId) && !desiredVenueIds.includes(String(venueId)));

    if (staleVenueIds.length > 0) {
      const { error: unlinkError } = await (supabaseAdmin.from("tournament_venues" as any) as any)
        .delete()
        .eq("tournament_id", tournamentId)
        .in("venue_id", staleVenueIds);

      if (unlinkError) {
        return NextResponse.json(
          {
            ok: false,
            error: "The tournament was saved, but stale venue links could not be removed. Please retry.",
          },
          { status: 500 }
        );
      }
    }

    await syncTournamentSponsors(tournamentId, validation.value.sponsors);

    return NextResponse.json({ ok: true, tournamentId, venueCount: desiredVenueIds.length, slug: tournament.slug });
  } catch (error) {
    if (tournamentId || createdVenueIds.length > 0) {
      const verifyTargetTournamentId = payload.verifyTargetTournamentId?.trim() || null;
      if (!verifyTargetTournamentId) {
        await cleanupSubmission(tournamentId, createdVenueIds);
      }
    }
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unable to submit tournament right now.",
      },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const tournamentId = (searchParams.get("tournamentId") ?? "").trim();
  const name = (searchParams.get("name") ?? "").trim();
  const city = (searchParams.get("city") ?? "").trim();
  const state = (searchParams.get("state") ?? "").trim().toUpperCase();

  const baseSelect =
    "id,slug,name,sport,city,state,start_date,end_date,official_website_url,team_fee,age_group,tournament_director,tournament_director_email,referee_contact,referee_contact_email,referee_pay,ref_cash_tournament,ref_mentors,travel_lodging,tournament_venues(venues(id,name,address1,city,state,zip,venue_url,restrooms,bring_field_chairs))";

  if (tournamentId) {
    const { data, error } = await ((supabaseAdmin.from("tournaments" as any) as any)
      .select(baseSelect)
      .eq("id", tournamentId)
      .maybeSingle());

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    const row = data as DuplicateLookupRow | null;
    let sponsorRows: TournamentPartnerRow[] = [];
    if (row?.id) {
      const { data: sponsorData } = await (supabaseAdmin.from("tournament_partner_nearby" as any) as any)
        .select("id,name,address,sponsor_click_url,category,sort_order")
        .eq("tournament_id", row.id)
        .is("venue_id", null)
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: false })
        .limit(4);
      sponsorRows = ((sponsorData ?? []) as TournamentPartnerRow[]).filter((sponsor) => Boolean(sponsor.name));
    }

    return NextResponse.json({
      ok: true,
      match: row ? mapDuplicateMatch(row, sponsorRows) : null,
    });
  }

  if (name.length < 3) {
    return NextResponse.json({ ok: true, match: null });
  }

  let query = (supabaseAdmin.from("tournaments" as any) as any)
    .select(baseSelect)
    .ilike("name", `%${name}%`)
    .limit(8);

  if (city) query = query.ilike("city", `%${city}%`);
  if (state) query = query.eq("state", state);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const rows = ((data ?? []) as DuplicateLookupRow[])
    .filter((row) => row.id && row.name)
    .sort((a, b) => scoreDuplicateMatch(b, name, city, state) - scoreDuplicateMatch(a, name, city, state));

  const best = rows[0];
  let sponsorRows: TournamentPartnerRow[] = [];
  if (best?.id) {
    const { data: sponsorData } = await (supabaseAdmin.from("tournament_partner_nearby" as any) as any)
      .select("id,name,address,sponsor_click_url,category,sort_order")
      .eq("tournament_id", best.id)
      .is("venue_id", null)
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false })
      .limit(4);
    sponsorRows = ((sponsorData ?? []) as TournamentPartnerRow[]).filter((row) => Boolean(row.name));
  }
  return NextResponse.json({
    ok: true,
    match: best ? mapDuplicateMatch(best, sponsorRows) : null,
  });
}
