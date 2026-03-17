import { NextRequest, NextResponse } from "next/server";
import { pickVariant } from "@/lib/outreach/ab";
import { getTiOutreachAdminUser } from "@/lib/outreachAdmin";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  buildOutreachUnsubscribeUrl,
  buildSportVerifyReplyEmail,
  buildVerifyUrl,
  getOutreachGuardSecret,
  isValidEmail,
  normalizeOutreachSport,
} from "@/lib/outreach";

type GenerateVerifyReplyBody = {
  email?: string;
  sport?: string;
  campaign_id?: string;
  limit?: number;
};

type TournamentRow = {
  id: string;
  name: string | null;
  sport: string | null;
  tournament_director: string | null;
  tournament_director_email: string | null;
  start_date?: string | null;
  city?: string | null;
  state?: string | null;
};

function inferFirstName(value: string | null) {
  const first = (value || "").trim().split(/\s+/).filter(Boolean)[0] || "";
  return first || null;
}

async function authorize(request: NextRequest) {
  const headerKey = request.headers.get("X-OUTREACH-KEY") || "";
  const expected = getOutreachGuardSecret();
  if (expected && headerKey === expected) return { authorized: true };

  const user = await getTiOutreachAdminUser();
  return { authorized: !!user };
}

export async function POST(request: NextRequest) {
  const auth = await authorize(request);
  if (!auth.authorized) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let body: GenerateVerifyReplyBody;
  try {
    body = (await request.json()) as GenerateVerifyReplyBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const directorEmail = String(body.email || "").trim().toLowerCase();
  if (!directorEmail || !isValidEmail(directorEmail)) {
    return NextResponse.json({ error: "email is required and must be a valid email." }, { status: 400 });
  }

  const sport = normalizeOutreachSport(body.sport);
  const campaignId = (body.campaign_id || "").trim() || "manual-verify-reply";
  const limitRaw = Number(body.limit);
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(Math.floor(limitRaw), 20)) : 10;

  const { data, error } = await (supabaseAdmin.from("tournaments" as any) as any)
    .select("id,name,sport,tournament_director,tournament_director_email,start_date,city,state")
    .eq("sport", sport)
    .not("tournament_director_email", "is", null)
    .neq("tournament_director_email", "")
    // Supabase doesn't support case-insensitive equality well without ilike; normalize by lower() via ilike.
    .ilike("tournament_director_email", directorEmail)
    .order("start_date", { ascending: true, nullsFirst: false })
    .limit(limit);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as TournamentRow[];
  const tournaments = rows
    .filter((row) => row && row.id && row.name)
    .map((row) => ({
      tournamentId: row.id,
      tournamentName: String(row.name || "").trim(),
      verifyUrl: buildVerifyUrl({
        sport,
        tournamentId: row.id,
        campaignId,
        variant: pickVariant(directorEmail),
      }),
      startDate: row.start_date ?? null,
      city: row.city ?? null,
      state: row.state ?? null,
    }));

  if (tournaments.length === 0) {
    return NextResponse.json(
      { error: `No tournaments found for ${directorEmail} in sport=${sport}.` },
      { status: 404 }
    );
  }

  const tournamentIds = tournaments.map((t) => t.tournamentId);
  const unsubscribeUrl = buildOutreachUnsubscribeUrl({
    sport,
    tournamentId: tournamentIds[0]!,
    tournamentIds,
    directorEmail,
  });

  const variant = pickVariant(directorEmail);
  const firstName = inferFirstName(rows[0]?.tournament_director ?? null);
  const rendered = buildSportVerifyReplyEmail({
    sport,
    directorEmail,
    firstName,
    tournaments,
    unsubscribeUrl,
    variant,
  });

  return NextResponse.json(
    {
      sport,
      directorEmail,
      tournamentIds,
      tournamentCount: tournaments.length,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
    },
    { status: 200 }
  );
}

