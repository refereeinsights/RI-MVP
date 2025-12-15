import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type TournamentRow = {
  name: string;
  slug: string;
  sport: string;
  level?: string | null;
  state: string;
  city?: string | null;
  venue?: string | null;
  address?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  source_url: string;
  source_domain?: string | null;
  source_title?: string | null;
  source_last_seen_at?: string | null;
  summary?: string | null;
  notes?: string | null;
  status?: string;
  confidence?: number;
};

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key);
}

function isValidTournamentRow(t: TournamentRow): boolean {
  return Boolean(
    t &&
      typeof t.name === "string" &&
      t.name.trim().length > 0 &&
      typeof t.slug === "string" &&
      t.slug.trim().length > 0 &&
      typeof t.sport === "string" &&
      t.sport.trim().length > 0 &&
      typeof t.state === "string" &&
      t.state.trim().length > 0 &&
      typeof t.source_url === "string" &&
      t.source_url.trim().length > 0
  );
}

function isAuthorized(req: Request, bodyToken?: string | null): boolean {
  const url = new URL(req.url);
  const tokenFromQuery = url.searchParams.get("token");
  const token = tokenFromQuery ?? bodyToken ?? null;
  return Boolean(process.env.CRON_SECRET && token === process.env.CRON_SECRET);
}

/**
 * GET = health check
 */
export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    ok: true,
    mode: "push-ingest",
    message: "POST tournament rows to this endpoint to upsert into Supabase.",
    time: new Date().toISOString(),
  });
}

/**
 * POST = accept parsed tournament rows and upsert
 * Body: { dryRun?: boolean, rows: TournamentRow[], token?: string }
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      token?: string;
      dryRun?: boolean;
      rows?: TournamentRow[];
    };

    if (!isAuthorized(req, body.token ?? null)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const dryRun = body.dryRun === true;
    const incoming = Array.isArray(body.rows) ? body.rows : [];

    if (!incoming.length) {
      return NextResponse.json({ dryRun, upserted: 0, message: "No rows provided" });
    }

    const valid = incoming.filter(isValidTournamentRow);
    if (!valid.length) {
      return NextResponse.json({ dryRun, upserted: 0, message: "No valid rows provided" });
    }

    const nowIso = new Date().toISOString();
    const rows: TournamentRow[] = valid.map((t) => ({
      ...t,
      source_last_seen_at: t.source_last_seen_at ?? nowIso,
      status: t.status ?? "published",
    }));

    if (dryRun) {
      return NextResponse.json({
        dryRun: true,
        wouldUpsert: rows.length,
        sample: rows.slice(0, 5),
      });
    }

    const supabase = getSupabase();

    const { data, error } = await supabase
      .from("tournaments")
      .upsert(rows, { onConflict: "slug" })
      .select("id, slug");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      dryRun: false,
      upserted: data?.length ?? 0,
      rows: data ?? [],
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Ingest failed", detail: err?.message ?? String(err) },
      { status: 500 }
    );
  }
}
