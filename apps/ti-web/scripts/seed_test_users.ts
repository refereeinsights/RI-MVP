/**
 * Manual TI test-user invite + entitlement seed script.
 *
 * Required env:
 * - NEXT_PUBLIC_SUPABASE_URL
 * - SUPABASE_SERVICE_ROLE_KEY
 * - TI_ALLOW_SEED=true
 *
 * Optional env:
 * - NEXT_PUBLIC_SITE_URL (default: https://www.tournamentinsights.com)
 * - TI_ALLOW_SEED_PROD=true (required if NODE_ENV/VERCEL_ENV is production)
 *
 * Run from repo root:
 *   TI_ALLOW_SEED=true npx tsx apps/ti-web/scripts/seed_test_users.ts
 */
import { supabaseAdmin } from "../lib/supabaseAdmin";

type SeedUser = {
  email: string;
  plan: "insider" | "weekend_pro";
  subscription_status: "none" | "active";
  current_period_end?: string | null;
};

function isProductionLike() {
  return process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production";
}

function assertGuards() {
  if (process.env.TI_ALLOW_SEED !== "true") {
    throw new Error("Refusing to run. Set TI_ALLOW_SEED=true to run manual seeding.");
  }
  if (isProductionLike() && process.env.TI_ALLOW_SEED_PROD !== "true") {
    throw new Error(
      "Refusing to run in production. Set TI_ALLOW_SEED_PROD=true explicitly if you really intend to run this."
    );
  }
}

async function inviteAndUpsert(seed: SeedUser, redirectTo: string) {
  const invite = await supabaseAdmin.auth.admin.inviteUserByEmail(seed.email, { redirectTo });
  if (invite.error || !invite.data?.user?.id) {
    console.error(`Invite failed for ${seed.email}: ${invite.error?.message ?? "unknown error"}`);
    return { ok: false as const };
  }

  const userId = invite.data.user.id;
  const nowIso = new Date().toISOString();
  const payload = {
    id: userId,
    email: seed.email,
    plan: seed.plan,
    subscription_status: seed.subscription_status,
    current_period_end: seed.current_period_end ?? null,
    first_seen_at: nowIso,
    last_seen_at: nowIso,
    updated_at: nowIso,
  };

  const upsert = await supabaseAdmin.from("ti_users" as any).upsert(payload, { onConflict: "id" }).select("id").maybeSingle();
  if (upsert.error) {
    console.error(`Invite succeeded but ti_users upsert failed for ${seed.email}: ${upsert.error.message}`);
    return { ok: false as const };
  }

  console.log(`Invite sent + ti_users upserted for ${seed.email} (user_id=${userId})`);
  return { ok: true as const };
}

async function main() {
  assertGuards();

  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "https://www.tournamentinsights.com").replace(/\/+$/, "");
  const redirectTo = `${siteUrl}/verify-email`;
  const oneYearMs = 365 * 24 * 60 * 60 * 1000;
  const weekendProEndsAt = new Date(Date.now() + oneYearMs).toISOString();

  const users: SeedUser[] = [
    {
      email: "refereeinsights@gmail.com",
      plan: "insider",
      subscription_status: "none",
      current_period_end: null,
    },
    {
      email: "refereeinsights+weekendpro@gmail.com",
      plan: "weekend_pro",
      subscription_status: "active",
      current_period_end: weekendProEndsAt,
    },
  ];

  console.log(`Starting TI manual seed invite flow for ${users.length} users...`);
  console.log(`Invite redirect URL: ${redirectTo}`);

  let okCount = 0;
  for (const user of users) {
    const result = await inviteAndUpsert(user, redirectTo);
    if (result.ok) okCount += 1;
  }

  console.log(`Done. ${okCount}/${users.length} users processed successfully.`);
  console.log("Note: Each invited user must confirm email and set password from the invite link.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

