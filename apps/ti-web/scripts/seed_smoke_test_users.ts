/**
 * Deterministic TI smoke-test user provisioning.
 *
 * Required env:
 * - NEXT_PUBLIC_SUPABASE_URL
 * - SUPABASE_SERVICE_ROLE_KEY
 * - NEXT_PUBLIC_TI_SITE_URL (recommended in TI deployments)
 * - TI_SMOKE_SEED_ALLOW=true
 * - TI_SMOKE_EXPLORER_PASSWORD
 * - TI_SMOKE_INSIDER_PASSWORD
 * - TI_SMOKE_WEEKENDPRO_PASSWORD
 */
import { supabaseAdmin } from "../lib/supabaseAdmin";

type Tier = "explorer" | "insider" | "weekend_pro";
type SeedUser = {
  email: string;
  password: string;
  plan: Tier;
  subscription_status: "none" | "active";
  current_period_end: string | null;
};

function requireEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

async function findUserByEmail(email: string) {
  const normalized = email.trim().toLowerCase();
  let page = 1;
  const perPage = 200;

  while (true) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;

    const users = data.users ?? [];
    const found = users.find((u) => (u.email ?? "").trim().toLowerCase() === normalized);
    if (found) return found;
    if (users.length < perPage) return null;
    page += 1;
  }
}

async function ensureUser(seed: SeedUser) {
  const existing = await findUserByEmail(seed.email);

  if (existing) {
    const { error } = await supabaseAdmin.auth.admin.updateUserById(existing.id, {
      email: seed.email,
      password: seed.password,
      email_confirm: true,
      user_metadata: {
        display_name: seed.email.split("@")[0],
      },
    });
    if (error) throw error;

    await upsertTiUser(existing.id, seed);
    console.log(`updated ${seed.email} (${seed.plan})`);
    return;
  }

  const created = await supabaseAdmin.auth.admin.createUser({
    email: seed.email,
    password: seed.password,
    email_confirm: true,
    user_metadata: {
      display_name: seed.email.split("@")[0],
    },
  });
  if (created.error || !created.data.user?.id) {
    throw created.error ?? new Error(`Failed creating ${seed.email}`);
  }

  await upsertTiUser(created.data.user.id, seed);
  console.log(`created ${seed.email} (${seed.plan})`);
}

async function upsertTiUser(userId: string, seed: SeedUser) {
  const now = new Date().toISOString();
  const payload = {
    id: userId,
    email: seed.email,
    plan: seed.plan,
    subscription_status: seed.subscription_status,
    current_period_end: seed.current_period_end,
    first_seen_at: now,
    last_seen_at: now,
    updated_at: now,
  };

  const { error } = await supabaseAdmin
    .from("ti_users" as any)
    .upsert(payload, { onConflict: "id" });

  if (error) throw error;
}

async function main() {
  if (process.env.TI_SMOKE_SEED_ALLOW !== "true") {
    throw new Error("Refusing to run. Set TI_SMOKE_SEED_ALLOW=true.");
  }

  const oneYearFromNow = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();

  const users: SeedUser[] = [
    {
      email: process.env.TI_SMOKE_EXPLORER_EMAIL || "explorer_test@example.com",
      password: requireEnv("TI_SMOKE_EXPLORER_PASSWORD"),
      plan: "explorer",
      subscription_status: "none",
      current_period_end: null,
    },
    {
      email: process.env.TI_SMOKE_INSIDER_EMAIL || "insider_test@example.com",
      password: requireEnv("TI_SMOKE_INSIDER_PASSWORD"),
      plan: "insider",
      subscription_status: "none",
      current_period_end: null,
    },
    {
      email: process.env.TI_SMOKE_WEEKENDPRO_EMAIL || "weekendpro_test@example.com",
      password: requireEnv("TI_SMOKE_WEEKENDPRO_PASSWORD"),
      plan: "weekend_pro",
      subscription_status: "active",
      current_period_end: oneYearFromNow,
    },
  ];

  for (const user of users) {
    await ensureUser(user);
  }

  console.log("Smoke users ready.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
