import { requireAdmin } from "@/lib/admin";
import { getSearchProviderName } from "@/server/atlas/search";
import { US_STATES, discoverCandidates, fetchUpcomingCountsByStateForSport, queueDiscoveredUrls } from "@/server/admin/discoverToQueue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DiscoverBody =
  | { action: "state_counts"; sport: string }
  | { action: "discover"; sport: string; state: string; perQueryLimit?: number; years?: number[] }
  | { action: "queue"; sport: string; urls: string[]; overrideSkip?: boolean };

function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function clampInt(value: unknown, min: number, max: number, fallback: number) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

function clampYears(input: unknown) {
  const years = Array.isArray(input) ? input : [];
  const list = years
    .map((y) => Number(y))
    .filter((y) => Number.isFinite(y) && y >= 2024 && y <= 2030)
    .slice(0, 5);
  return list.length ? list : [new Date().getFullYear(), new Date().getFullYear() + 1];
}

export async function POST(req: Request) {
  await requireAdmin();

  let body: DiscoverBody;
  try {
    body = (await req.json()) as DiscoverBody;
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  if (body.action === "state_counts") {
    const sport = String((body as any).sport ?? "").trim().toLowerCase();
    const counts = await fetchUpcomingCountsByStateForSport(sport);
    const obj: Record<string, number> = {};
    for (const st of US_STATES) obj[st] = counts.get(st) ?? 0;
    return json({ sport, provider: getSearchProviderName(), counts: obj });
  }

  if (body.action === "discover") {
    const sport = String((body as any).sport ?? "").trim().toLowerCase();
    const stateRaw = String((body as any).state ?? "").trim().toUpperCase();
    const state = (US_STATES as readonly string[]).includes(stateRaw as any) ? stateRaw : "";
    if (!sport || !state) return json({ error: "missing_sport_or_state" }, 400);

    const perQueryLimit = clampInt((body as any).perQueryLimit, 3, 12, 8);
    const years = clampYears((body as any).years);

    try {
      const res = await discoverCandidates({ sport, state, perQueryLimit, years });
      return json({
        sport,
        state,
        perQueryLimit,
        years,
        provider: getSearchProviderName(),
        ...res,
      });
    } catch (err: any) {
      return json({ error: "discover_failed", message: String(err?.message ?? "unknown error") }, 500);
    }
  }

  if (body.action === "queue") {
    const sport = String((body as any).sport ?? "").trim().toLowerCase();
    const urls = Array.isArray((body as any).urls) ? (body as any).urls : [];
    const overrideSkip = Boolean((body as any).overrideSkip);
    if (!sport || !urls.length) return json({ error: "missing_sport_or_urls" }, 400);
    const res = await queueDiscoveredUrls({ sport, urls: urls.map(String), overrideSkip });
    return json({ sport, ...res });
  }

  return json({ error: "unknown_action" }, 400);
}

