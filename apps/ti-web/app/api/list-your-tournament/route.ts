import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  buildTournamentSlug,
  type SanitizedTournamentSubmission,
  type TournamentSubmissionInput,
  validateTournamentSubmission,
} from "@/lib/listTournamentForm";
import {
  findTournamentDuplicateMatchByName,
  getTournamentDuplicateMatchById,
} from "@/lib/tournamentDuplicateMatch";
import { sendEmail } from "@/lib/email";
import { parseRecipients } from "@/lib/adminDashboardEmail";

function esc(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

type TournamentInsertResult = {
  id: string;
  slug: string;
};

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

    const { tournament: t, venues } = validation.value;
    const firstVenueCity = venues[0]?.city ?? "";
    const firstVenueState = venues[0]?.state ?? "";
    const adminUrl = `https://www.refereeinsights.com/admin?tab=tournament-listings&q=${encodeURIComponent(t.name)}#tournament-listings`;

    // Notify admin — best-effort, never blocks the response.
    try {
      const adminRecipients = parseRecipients(process.env.TI_ADMIN_DASHBOARD_EMAILS);
      if (adminRecipients.length > 0) {
        const action = shouldUpdateExisting ? "verified / updated" : "submitted for listing";
        await sendEmail({
          to: adminRecipients,
          subject: `Tournament ${action}: ${t.name}`,
          html: `<p>A tournament was ${action} via the public form.</p>
<ul>
  <li><strong>Name:</strong> ${esc(t.name)}</li>
  <li><strong>Sport:</strong> ${esc(t.sport)}</li>
  <li><strong>Dates:</strong> ${esc(t.startDate)} – ${esc(t.endDate)}</li>
  <li><strong>Location:</strong> ${esc(firstVenueCity)}, ${esc(firstVenueState)}</li>
  <li><strong>Director:</strong> ${esc(t.tournamentDirector)} (${esc(t.tournamentDirectorEmail)})</li>
</ul>
<p><a href="${adminUrl}">Review in admin →</a></p>`,
        });
      }
    } catch {
      // best-effort
    }

    // Confirm receipt to the submitter — new submissions only, best-effort.
    if (!shouldUpdateExisting && t.tournamentDirectorEmail) {
      try {
        await sendEmail({
          to: t.tournamentDirectorEmail,
          subject: `We received your tournament submission — ${t.name}`,
          html: `<p>Hi ${esc(t.tournamentDirector)},</p>
<p>Thanks for submitting <strong>${esc(t.name)}</strong> to TournamentInsights. We received your submission and will review it shortly.</p>
<p>Once published, it will appear in search results and on venue map pages so families and teams can find dates, locations, and key details in one place.</p>
<p>If you have questions, reply to this email.</p>
<p>— The TournamentInsights Team</p>`,
          replyTo: "hello@tournamentinsights.com",
        });
      } catch {
        // best-effort
      }
    }

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
    "id,slug,name,sport,city,state,start_date,end_date,official_website_url,team_fee,age_group,tournament_director,tournament_director_email,referee_contact,referee_contact_email,referee_pay,ref_cash_tournament,ref_mentors,travel_lodging,tournament_venues(is_inferred,venues(id,name,address1,city,state,zip,venue_url,restrooms,bring_field_chairs))";

  if (tournamentId) {
    try {
      return NextResponse.json({
        ok: true,
        match: await getTournamentDuplicateMatchById(tournamentId),
      });
    } catch (error) {
      return NextResponse.json(
        { ok: false, error: error instanceof Error ? error.message : "Unable to load tournament match." },
        { status: 500 }
      );
    }
  }

  if (name.length < 3) {
    return NextResponse.json({ ok: true, match: null });
  }

  try {
    return NextResponse.json({
      ok: true,
      match: await findTournamentDuplicateMatchByName({ name, city, state }),
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to lookup tournament match." },
      { status: 500 }
    );
  }
}
