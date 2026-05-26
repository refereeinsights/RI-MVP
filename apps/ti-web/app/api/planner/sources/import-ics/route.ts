import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { importIcsToPlanner } from "@/lib/planner/ics-import";

export const runtime = "nodejs";

type Body = {
  sourceUrl?: unknown;
  sourceName?: unknown;
  teamName?: unknown;
};

function asTrimmedString(value: unknown) {
  if (typeof value !== "string") return null;
  const v = value.trim();
  return v || null;
}

export async function POST(req: Request) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body) return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });

  const sourceUrl = asTrimmedString(body.sourceUrl) ?? "";
  const sourceName = asTrimmedString(body.sourceName);
  const teamName = asTrimmedString(body.teamName);

  const res = await importIcsToPlanner({
    supabase,
    input: { userId: user.id, sourceUrl, sourceName, teamName, mode: "import" },
  });

  if (!res.ok) return NextResponse.json({ ok: false, error: res.error }, { status: res.status });
  return NextResponse.json({
    ok: true,
    sourceId: res.sourceId,
    sourceName: res.sourceName,
    imported: res.imported,
    updated: res.updated,
    skipped: res.skipped,
    errors: res.errors,
  });
}
