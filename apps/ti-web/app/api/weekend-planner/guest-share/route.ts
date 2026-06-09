import { NextResponse } from "next/server";

import { getTiTierServer } from "@/lib/entitlementsServer";
import {
  buildPlannerGuestShareUrl,
  getPlannerGuestSharePanelStateForOwner,
  revealOwnerPlannerGuestShare,
  revokeOwnerPlannerGuestShare,
  upsertOwnerPlannerGuestShare,
} from "@/lib/planner/guestShares";
import { createSupabaseServerClient } from "@/lib/supabaseServer";

export const runtime = "nodejs";

type GuestShareAction = "create" | "reveal" | "regenerate" | "revoke";

function appOrigin(request: Request) {
  const envOrigin = String(process.env.NEXT_PUBLIC_SITE_URL ?? "").trim();
  if (envOrigin) return envOrigin.replace(/\/+$/, "");
  return new URL(request.url).origin;
}

function unauthorized() {
  return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
}

export async function GET() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.id) return unauthorized();
  const tierInfo = await getTiTierServer(user);
  const state = await getPlannerGuestSharePanelStateForOwner({
    supabase,
    userId: user.id,
    tier: tierInfo.tier,
    unverified: tierInfo.unverified,
  });

  return NextResponse.json({ ok: true, state });
}

export async function POST(request: Request) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.id) return unauthorized();
  const tierInfo = await getTiTierServer(user);
  const body = (await request.json().catch(() => null)) as { action?: GuestShareAction } | null;
  const action = String(body?.action ?? "").trim() as GuestShareAction;
  if (!action) return NextResponse.json({ ok: false, error: "missing_action" }, { status: 400 });

  try {
    if (action === "revoke") {
      await revokeOwnerPlannerGuestShare({
        supabase,
        ownerUserId: user.id,
      });
      const state = await getPlannerGuestSharePanelStateForOwner({
        supabase,
        userId: user.id,
        tier: tierInfo.tier,
        unverified: tierInfo.unverified,
      });
      return NextResponse.json({ ok: true, state });
    }

    if (tierInfo.tier !== "weekend_pro" || tierInfo.unverified) {
      return NextResponse.json({ ok: false, error: "weekend_pro_required" }, { status: 403 });
    }

    if (action === "create" || action === "regenerate") {
      const { row, rawToken } = await upsertOwnerPlannerGuestShare({
        supabase,
        ownerUserId: user.id,
        action,
      });
      const state = await getPlannerGuestSharePanelStateForOwner({
        supabase,
        userId: user.id,
        tier: tierInfo.tier,
        unverified: tierInfo.unverified,
      });
      return NextResponse.json({
        ok: true,
        state,
        share_url: buildPlannerGuestShareUrl(appOrigin(request), rawToken),
        updated_at: row.updated_at,
      });
    }

    if (action === "reveal") {
      const revealed = await revealOwnerPlannerGuestShare({
        supabase,
        ownerUserId: user.id,
      });
      if (!revealed) return NextResponse.json({ ok: false, error: "share_not_found" }, { status: 404 });
      const state = await getPlannerGuestSharePanelStateForOwner({
        supabase,
        userId: user.id,
        tier: tierInfo.tier,
        unverified: tierInfo.unverified,
      });
      return NextResponse.json({
        ok: true,
        state,
        share_url: buildPlannerGuestShareUrl(appOrigin(request), revealed.rawToken),
      });
    }

    return NextResponse.json({ ok: false, error: "invalid_action" }, { status: 400 });
  } catch {
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
