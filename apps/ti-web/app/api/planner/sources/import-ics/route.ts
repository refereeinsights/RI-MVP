import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { importIcsToPlanner } from "@/lib/planner/ics-import";
import { getTiTierServer } from "@/lib/entitlementsServer";

export const runtime = "nodejs";

type Body = {
  sourceUrl?: unknown;
  // Back-compat: older clients may have used `url` or `source_url`.
  url?: unknown;
  source_url?: unknown;
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

  const tierInfo = await getTiTierServer(user);
  if (tierInfo.tier === "explorer") {
    if (tierInfo.unverified) {
      return NextResponse.json({ ok: false, error: "email_verification_required" }, { status: 403 });
    }
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 403 });
  }

  if (tierInfo.tier === "insider") {
    const { count } = await (supabase.from("planner_event_sources" as any) as any)
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("source_type", "ics");
    if (typeof count === "number" && count >= 1) {
      return NextResponse.json({ ok: false, error: "calendar_feed_limit_reached" }, { status: 403 });
    }
  }

  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body) return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });

  const sourceUrl =
    asTrimmedString(body.sourceUrl) ??
    asTrimmedString(body.url) ??
    asTrimmedString(body.source_url) ??
    "";
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
