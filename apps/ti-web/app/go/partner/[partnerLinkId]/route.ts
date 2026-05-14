import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { getTiTierServer } from "@/lib/entitlementsServer";

export const runtime = "nodejs";

function asText(value: unknown) {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t ? t : null;
}

function asTextLimit(value: unknown, maxLen: number) {
  const t = asText(value);
  if (!t) return null;
  return t.length > maxLen ? t.slice(0, maxLen) : t;
}

function isLocalhostHost(host: string) {
  const h = host.trim().toLowerCase();
  if (!h) return false;
  if (h === "localhost" || h.startsWith("localhost:")) return true;
  if (h === "127.0.0.1" || h.startsWith("127.0.0.1:")) return true;
  if (h === "0.0.0.0" || h.startsWith("0.0.0.0:")) return true;
  if (h === "[::1]" || h.startsWith("[::1]:")) return true;
  if (h.endsWith(".local")) return true;
  return false;
}

function isPrivateNetworkHost(host: string) {
  const h = host.trim().toLowerCase();
  if (!h) return false;
  const withoutPort = h.startsWith("[") ? h : h.split(":")[0];
  const ip = withoutPort.replace(/^\[/, "").replace(/\]$/, "");
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) return false;
  const parts = ip.split(".").map((p) => Number(p));
  if (parts.some((n) => !Number.isFinite(n) || n < 0 || n > 255)) return false;
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  return false;
}

function shouldPersist(request: Request) {
  if (process.env.ENABLE_TI_ANALYTICS_TRACKING === "true") return true;
  if (process.env.NODE_ENV === "development") return false;

  const host = asTextLimit(request.headers.get("x-forwarded-host") ?? request.headers.get("host"), 128);
  if (host && isLocalhostHost(host)) return false;
  if (host && isPrivateNetworkHost(host)) return false;

  const origin = asTextLimit(request.headers.get("origin"), 256);
  if (origin && (origin.includes("://localhost") || origin.includes("://127.0.0.1") || origin.includes("://[::1]"))) return false;

  const referer = asTextLimit(request.headers.get("referer"), 512);
  if (referer && (referer.includes("://localhost") || referer.includes("://127.0.0.1") || referer.includes("://[::1]"))) return false;

  return true;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function uuidOrNull(value: string | null) {
  const t = asText(value);
  if (!t) return null;
  return isUuid(t) ? t : null;
}

export async function GET(request: Request, ctx: { params: { partnerLinkId: string } }) {
  const partnerLinkId = String(ctx.params.partnerLinkId ?? "").trim();
  if (!partnerLinkId || !isUuid(partnerLinkId)) {
    return new NextResponse("Invalid partner link.", { status: 400 });
  }

  const { data: link } = await (supabaseAdmin.from("partner_links" as any) as any)
    .select("id,partner_id,label,url,destination_type,page_type,placement,sport,campaign,shared_id,sub_id_1,sub_id_2,sub_id_3,is_active")
    .eq("id", partnerLinkId)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (!link?.id || !link.url) return new NextResponse("Partner link not found.", { status: 404 });

  const { data: partner } = await (supabaseAdmin.from("partners" as any) as any)
    .select("id,key,name,is_active")
    .eq("id", link.partner_id)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (!partner?.id || !partner.key) return new NextResponse("Partner not found.", { status: 404 });

  // Optional context supplied by the referring page/module.
  const reqUrl = new URL(request.url);
  const tournamentId = uuidOrNull(reqUrl.searchParams.get("tournament_id"));
  const venueId = uuidOrNull(reqUrl.searchParams.get("venue_id"));
  const pageType = asTextLimit(reqUrl.searchParams.get("page_type"), 64);
  const placement = asTextLimit(reqUrl.searchParams.get("placement"), 64);
  const campaign = asTextLimit(reqUrl.searchParams.get("campaign"), 64);

  const userTier = await (async () => {
    try {
      const supabase = createSupabaseServerClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return null;
      const tierInfo = await getTiTierServer(user);
      return tierInfo?.tier ?? null;
    } catch {
      return null;
    }
  })();

  if (shouldPersist(request)) {
    try {
      // NOTE: This route writes directly to `public.ti_map_events` (service role). Do not add a client-side
      // `/api/analytics` call for this event name, or it will double-count clicks.
      await (supabaseAdmin.from("ti_map_events" as any) as any).insert({
        event_name: "partner_click_clicked",
        properties: {
          partner_key: partner.key,
          partner_name: partner.name ?? null,
          partner_link_id: link.id,
          partner_link_label: link.label ?? null,
          destination_type: link.destination_type ?? null,
          sport: link.sport ?? null,
          shared_id: link.shared_id ?? null,
          sub_id_1: link.sub_id_1 ?? null,
          sub_id_2: link.sub_id_2 ?? null,
          sub_id_3: link.sub_id_3 ?? null,
          campaign: campaign ?? link.campaign ?? null,
          placement: placement ?? link.placement ?? null,
          page_type: pageType ?? link.page_type ?? null,
          tournament_id: tournamentId,
          venue_id: venueId,
          user_tier: userTier,
          href: `/go/partner/${link.id}`,
        },
        page_type: (pageType ?? link.page_type ?? null) as any,
        sport: (link.sport ?? null) as any,
        state: null,
        href: `/go/partner/${link.id}`,
        filter_name: null,
        old_value: null,
        new_value: null,
        cta: "partner_click",
      });
    } catch {
      // Fail open; do not block redirect on analytics persistence.
    }
  }

  return NextResponse.redirect(link.url, { status: 302 });
}

