import "dotenv/config";
import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "../lib/supabaseAdmin";

type ScoreSeed = {
  aiScore: number;
  reviewCount: number;
  summary: string;
  status?: "clear" | "needs_moderation";
};

type ReviewSeed = {
  overall: number;
  logistics: number;
  facilities: number;
  pay: number;
  support: number;
  workedGames: number;
  shiftDetail: string;
};

type DuplicateSeed = {
  year: number;
  scoreboard?: ScoreSeed;
  review?: ReviewSeed;
};

type SeriesSeed = {
  baseSlug: string;
  canonicalScoreboard?: ScoreSeed;
  canonicalReview?: ReviewSeed;
  duplicates: DuplicateSeed[];
};

type TournamentRow = {
  id: string;
  slug: string;
  name: string;
  sport: string | null;
  level: string | null;
  state: string | null;
  city: string | null;
  venue: string | null;
  address: string | null;
  start_date: string | null;
  end_date: string | null;
  source_url: string | null;
  source_domain: string | null;
  source_title: string | null;
  source_last_seen_at: string | null;
  summary: string | null;
  notes: string | null;
  status: string | null;
  confidence: number | null;
  is_canonical: boolean | null;
  canonical_tournament_id: string | null;
};

const REVIEW_USER_ID = process.env.SEED_REVIEW_USER_ID ?? "5c9ceea2-39c2-4831-accb-1d14bc89ae70";

const SERIES: SeriesSeed[] = [
  {
    baseSlug: "jr-hardwood-invite-auburn-wa",
    canonicalScoreboard: {
      aiScore: 86,
      reviewCount: 1,
      summary: "Strong winter basketball feel with on-site support.",
    },
    canonicalReview: {
      overall: 85,
      logistics: 80,
      facilities: 90,
      pay: 78,
      support: 82,
      workedGames: 5,
      shiftDetail: "Plenty of table staff on courts 5-8 and good hospitality.",
    },
    duplicates: [
      {
        year: 2024,
        scoreboard: {
          aiScore: 72,
          reviewCount: 1,
          summary: "Earlier edition had lighter staffing on Saturday mornings.",
        },
        review: {
          overall: 70,
          logistics: 65,
          facilities: 75,
          pay: 70,
          support: 72,
          workedGames: 4,
          shiftDetail: "Smaller crew but solid host communication the prior year.",
        },
      },
    ],
  },
  {
    baseSlug: "winter-cup-ca",
    canonicalScoreboard: {
      aiScore: 48,
      reviewCount: 1,
      summary: "Latest feedback flagged tight turnarounds between fields.",
    },
    duplicates: [
      {
        year: 2024,
        scoreboard: {
          aiScore: 67,
          reviewCount: 1,
          summary: "Earlier edition offered more support staff despite cold weather.",
        },
        review: {
          overall: 65,
          logistics: 70,
          facilities: 60,
          pay: 70,
          support: 60,
          workedGames: 3,
          shiftDetail: "Cold drizzle but TD checked in every block and kept breaks.",
        },
      },
    ],
  },
];

function renameWithYear(name: string, year: number) {
  const match = name.match(/\b(19|20)\d{2}\b/);
  if (match) {
    return name.replace(match[0], String(year));
  }
  return `${name} ${year}`;
}

function redate(date: string | null, year: number) {
  if (!date) return null;
  const [, month, day] = date.split("-");
  if (!month || !day) return date;
  return `${year}-${month}-${day}`;
}

async function ensureDuplicate(baseSlug: string, dup: DuplicateSeed): Promise<string> {
  const { data: base, error } = await supabaseAdmin
    .from("tournaments")
    .select("*")
    .eq("slug", baseSlug)
    .single<TournamentRow>();

  if (error || !base) {
    throw new Error(`Base tournament ${baseSlug} not found: ${error?.message}`);
  }

  const newSlug = `${base.slug}-${dup.year}`;
  const { data: existing } = await supabaseAdmin
    .from("tournaments")
    .select("id")
    .eq("slug", newSlug)
    .maybeSingle<{ id: string }>();

  if (existing?.id) {
    console.log(`Duplicate ${newSlug} already exists`);
    return existing.id;
  }

  const insertPayload = {
    name: renameWithYear(base.name, dup.year),
    slug: newSlug,
    sport: base.sport,
    level: base.level,
    state: base.state,
    city: base.city,
    venue: base.venue,
    address: base.address,
    start_date: redate(base.start_date, dup.year),
    end_date: redate(base.end_date, dup.year),
    source_url: base.source_url,
    source_domain: base.source_domain,
    source_title: base.source_title,
    source_last_seen_at: base.source_last_seen_at,
    summary: base.summary,
    notes: base.notes,
    status: base.status,
    confidence: base.confidence,
    canonical_tournament_id: base.id,
    is_canonical: false,
  };

  const { data: inserted, error: insertError } = await supabaseAdmin
    .from("tournaments")
    .insert(insertPayload)
    .select("id")
    .single<{ id: string }>();

  if (insertError || !inserted) {
    throw new Error(`Failed to insert duplicate for ${baseSlug}: ${insertError?.message}`);
  }

  console.log(`Created duplicate ${newSlug}`);
  return inserted.id;
}

async function ensureScore(tournamentId: string, seed?: ScoreSeed) {
  if (!seed) return;
  await supabaseAdmin.from("tournament_referee_scores").upsert(
    {
      tournament_id: tournamentId,
      ai_score: seed.aiScore,
      review_count: seed.reviewCount,
      summary: seed.summary,
      status: seed.status ?? "clear",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "tournament_id" }
  );
  console.log(`Upserted whistle score for ${tournamentId}`);
}

async function ensureReview(tournamentId: string, seed?: ReviewSeed) {
  if (!seed) return;

  const { data: existing } = await supabaseAdmin
    .from("tournament_referee_reviews")
    .select("id")
    .eq("tournament_id", tournamentId)
    .eq("shift_detail", seed.shiftDetail)
    .maybeSingle();

  if (existing?.id) {
    console.log(`Review already exists for ${tournamentId} (${seed.shiftDetail})`);
    return;
  }

  const payload = {
    tournament_id: tournamentId,
    user_id: REVIEW_USER_ID,
    overall_score: seed.overall,
    logistics_score: seed.logistics,
    facilities_score: seed.facilities,
    pay_score: seed.pay,
    support_score: seed.support,
    worked_games: seed.workedGames,
    shift_detail: seed.shiftDetail,
    status: "approved",
    moderator_notes: null,
    id: randomUUID(),
  };

  const { error } = await supabaseAdmin.from("tournament_referee_reviews").insert(payload);
  if (error) {
    throw new Error(`Failed to insert review for ${tournamentId}: ${error.message}`);
  }
  console.log(`Inserted review for ${tournamentId}`);
}

async function main() {
  for (const series of SERIES) {
    const { data: base } = await supabaseAdmin
      .from("tournaments")
      .select("id")
      .eq("slug", series.baseSlug)
      .maybeSingle<{ id: string }>();

    if (!base?.id) {
      console.warn(`Skipping ${series.baseSlug} (not found)`);
      continue;
    }

    await ensureScore(base.id, series.canonicalScoreboard);
    await ensureReview(base.id, series.canonicalReview);

    for (const dup of series.duplicates) {
      const duplicateId = await ensureDuplicate(series.baseSlug, dup);
      await ensureScore(duplicateId, dup.scoreboard);
      await ensureReview(duplicateId, dup.review);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
