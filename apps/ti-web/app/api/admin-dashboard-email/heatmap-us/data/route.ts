import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const scope = (url.searchParams.get("scope") ?? "public_directory").trim();
  if (scope !== "public_directory") {
    return new Response(JSON.stringify({ error: "invalid_scope" }), {
      status: 400,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  }

  const { data, error } = await (supabaseAdmin.rpc("get_public_directory_tournament_counts_by_state" as any, {}) as any);
  if (error) {
    return new Response(JSON.stringify({ error: error.message || "rpc_error" }), {
      status: 500,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  }

  const rows = (Array.isArray(data) ? data : []) as Array<{ state?: unknown; count?: unknown }>;
  const counts: Record<string, number> = {};
  for (const row of rows) {
    const state = String(row.state ?? "").trim().toUpperCase();
    const count = Number(row.count ?? 0) || 0;
    if (!state || state.length !== 2) continue;
    counts[state] = count;
  }
  const max = Math.max(1, ...Object.values(counts));

  return new Response(
    JSON.stringify({
      scope,
      generated_at: new Date().toISOString(),
      max,
      counts,
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "public, max-age=600, s-maxage=600, stale-while-revalidate=86400",
      },
    },
  );
}

