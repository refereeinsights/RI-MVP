#!/usr/bin/env tsx

/**
 * smoke-auth-emails.ts
 *
 * Smoke test for Supabase Auth email flows using Supabase JS v2.
 *
 * Steps:
 * 1) Load env vars from process + .env.local files
 * 2) Connect with service role key
 * 3) Delete existing SMOKE_EMAIL user (if any)
 * 4) Create confirmed user with random password
 * 5) Trigger:
 *    - Magic link email
 *    - Reset password email
 *    - Change email confirmation email
 * 6) Print smoke credentials and expected email types
 */

import fs from "node:fs";
import path from "node:path";
import { createClient, type User } from "@supabase/supabase-js";

type EnvMap = Record<string, string>;
type Mode = "all" | "magic" | "reset" | "change";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseCooldownSeconds(errorMessage: string): number | null {
  const match = errorMessage.match(/after\s+(\d+)\s+seconds?/i);
  if (!match) return null;
  const seconds = Number.parseInt(match[1], 10);
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  return seconds;
}

async function withCooldownRetry(
  stepLabel: string,
  fn: () => Promise<{ error: { message: string } | null }>,
): Promise<void> {
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const { error } = await fn();
    if (!error) return;

    const waitSeconds = parseCooldownSeconds(error.message);
    if (!waitSeconds || attempt >= maxAttempts) {
      throw new Error(`Failed to trigger ${stepLabel}: ${error.message}`);
    }

    const waitMs = (waitSeconds + 1) * 1000;
    console.log(
      `${stepLabel} is rate-limited by Supabase. Waiting ${waitMs}ms and retrying (${attempt}/${maxAttempts})...`,
    );
    await sleep(waitMs);
  }
}

function loadEnvFile(filePath: string): EnvMap {
  const env: EnvMap = {};
  if (!fs.existsSync(filePath)) return env;

  const raw = fs.readFileSync(filePath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;

    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    env[key] = value;
  }
  return env;
}

function hydrateProcessEnv(): void {
  const candidates = [
    path.resolve(process.cwd(), ".env.local"),
    path.resolve(process.cwd(), "../../.env.local"),
    path.resolve(process.cwd(), "apps/ti-web/.env.local"),
  ];

  for (const candidate of candidates) {
    const parsed = loadEnvFile(candidate);
    for (const [key, value] of Object.entries(parsed)) {
      if (!process.env[key]) process.env[key] = value;
    }
  }
}

function randomPassword(length = 24): string {
  const chars =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*()-_=+";
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

async function findUsersByEmail(
  listUsers: (params?: { page?: number; perPage?: number }) => Promise<{
    data: { users: User[] } | { users?: User[] } | null;
    error: Error | null;
  }>,
  email: string,
): Promise<User[]> {
  const target = email.toLowerCase();
  const matches: User[] = [];

  let page = 1;
  const perPage = 200;

  while (page <= 20) {
    const { data, error } = await listUsers({ page, perPage });
    if (error) throw error;

    const users = (data?.users ?? []) as User[];
    if (users.length === 0) break;

    for (const user of users) {
      if ((user.email ?? "").toLowerCase() === target) {
        matches.push(user);
      }
    }

    if (users.length < perPage) break;
    page += 1;
  }

  return matches;
}

function parseMode(argv: string[]): Mode {
  const modeArg = argv.find((arg) => arg.startsWith("--mode="));
  const value = modeArg?.split("=")[1]?.trim().toLowerCase();
  if (!value) return "all";
  if (value === "all" || value === "magic" || value === "reset" || value === "change") {
    return value;
  }
  throw new Error(`Invalid --mode value: ${value}. Allowed: all, magic, reset, change`);
}

function hasFlag(argv: string[], flag: string): boolean {
  return argv.includes(flag);
}

function parseDelayMs(argv: string[]): number {
  const delayArg = argv.find((arg) => arg.startsWith("--delay-ms="));
  const raw = delayArg?.split("=")[1]?.trim() ?? process.env.SMOKE_DELAY_MS ?? "45000";
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`Invalid delay value: ${raw}. Use a non-negative integer in milliseconds.`);
  }
  return parsed;
}

function printUsage(): void {
  console.log("Usage:");
  console.log(
    "  npx tsx apps/ti-web/smoke-auth-emails.ts [--mode=all|magic|reset|change] [--fresh] [--delay-ms=45000]",
  );
  console.log("");
  console.log("Options:");
  console.log("  --mode=all      Trigger magic + reset + change (default)");
  console.log("  --mode=magic    Trigger only magic link email");
  console.log("  --mode=reset    Trigger only reset password email");
  console.log("  --mode=change   Trigger only change-email confirmation");
  console.log("  --fresh         Delete and recreate the smoke user before sending");
  console.log("  --delay-ms      Delay between email triggers in mode=all (default: 45000)");
}

async function main(): Promise<void> {
  hydrateProcessEnv();
  const argv = process.argv.slice(2);
  if (hasFlag(argv, "--help") || hasFlag(argv, "-h")) {
    printUsage();
    return;
  }
  const mode = parseMode(argv);
  const fresh = hasFlag(argv, "--fresh");
  const delayMs = parseDelayMs(argv);

  const supabaseUrl =
    process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const smokeEmail =
    process.env.SMOKE_EMAIL ?? "tournamentinsights+smoke@gmail.com";
  const smokeChangeEmail =
    process.env.SMOKE_CHANGE_EMAIL ??
    "tournamentinsights+smoke-change@gmail.com";
  const redirectTo =
    process.env.SMOKE_REDIRECT_TO ?? "https://www.tournamentinsights.com/auth/confirm";

  if (!supabaseUrl) throw new Error("Missing required env var: SUPABASE_URL");
  if (!serviceRoleKey) {
    throw new Error("Missing required env var: SUPABASE_SERVICE_ROLE_KEY");
  }

  console.log("Starting Supabase Auth smoke test...");
  console.log(`Supabase URL: ${supabaseUrl}`);
  console.log(`Mode: ${mode}`);
  console.log(`Fresh user setup: ${fresh ? "yes" : "no"}`);
  console.log(`Inter-step delay: ${delayMs}ms`);
  console.log(`SMOKE_EMAIL: ${smokeEmail}`);
  console.log(`SMOKE_CHANGE_EMAIL: ${smokeChangeEmail}`);

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const authClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log("Step 1: Resolving smoke user...");
  const existing = await findUsersByEmail(
    (params) => admin.auth.admin.listUsers(params),
    smokeEmail,
  );

  if (fresh && existing.length > 0) {
    console.log(`Fresh mode enabled. Deleting ${existing.length} existing user(s)...`);
    for (const user of existing) {
      console.log(`Deleting existing user: ${user.id} (${user.email})`);
      const { error } = await admin.auth.admin.deleteUser(user.id);
      if (error) throw new Error(`Failed to delete user ${user.id}: ${error.message}`);
    }
  }

  const generatedPassword = randomPassword(24);
  let targetUser: User | null = null;
  if (!fresh && existing.length > 0) {
    targetUser = existing[0];
    if (existing.length > 1) {
      for (const extra of existing.slice(1)) {
        console.log(`Deleting duplicate user: ${extra.id} (${extra.email})`);
        const { error } = await admin.auth.admin.deleteUser(extra.id);
        if (error) throw new Error(`Failed to delete duplicate user ${extra.id}: ${error.message}`);
      }
    }
    console.log(`Using existing user: ${targetUser.id}`);
    const { error: updateError } = await admin.auth.admin.updateUserById(targetUser.id, {
      password: generatedPassword,
      email_confirm: true,
    });
    if (updateError) {
      throw new Error(`Failed to update smoke user password: ${updateError.message}`);
    }
  } else {
    console.log("Creating confirmed smoke user...");
    const { data: createdData, error: createError } = await admin.auth.admin.createUser({
      email: smokeEmail,
      password: generatedPassword,
      email_confirm: true,
    });
    if (createError) throw new Error(`Failed to create smoke user: ${createError.message}`);
    if (!createdData.user) throw new Error("Smoke user creation returned no user.");
    targetUser = createdData.user;
    console.log(`Created user: ${targetUser.id}`);
  }

  if (mode === "all" || mode === "magic") {
    console.log("Step 2: Triggering magic link email...");
    await withCooldownRetry("magic link email", () =>
      authClient.auth.signInWithOtp({
        email: smokeEmail,
        options: {
          shouldCreateUser: false,
          emailRedirectTo: redirectTo,
        },
      }),
    );
    console.log("Magic link email trigger succeeded.");
  }

  if (mode === "all" && delayMs > 0) {
    console.log(`Waiting ${delayMs}ms before next email trigger...`);
    await sleep(delayMs);
  }

  if (mode === "all" || mode === "reset") {
    console.log("Step 3: Triggering reset password email...");
    await withCooldownRetry("reset password email", () =>
      authClient.auth.resetPasswordForEmail(smokeEmail, {
        redirectTo,
      }),
    );
    console.log("Reset password email trigger succeeded.");
  }

  if (mode === "all" && delayMs > 0) {
    console.log(`Waiting ${delayMs}ms before next email trigger...`);
    await sleep(delayMs);
  }

  if (mode === "all" || mode === "change") {
    console.log("Step 4: Signing in smoke user for email change flow...");
    const { data: signInData, error: signInError } = await authClient.auth.signInWithPassword({
      email: smokeEmail,
      password: generatedPassword,
    });
    if (signInError) throw new Error(`Failed to sign in smoke user: ${signInError.message}`);
    if (!signInData.session) throw new Error("Sign-in succeeded but no session was returned.");

    console.log("Triggering change email confirmation...");
    const { error: changeEmailError } = await authClient.auth.updateUser(
      { email: smokeChangeEmail },
      { emailRedirectTo: redirectTo },
    );
    if (changeEmailError) {
      throw new Error(
        `Failed to trigger change-email confirmation: ${changeEmailError.message}`,
      );
    }
    console.log("Change email confirmation trigger succeeded.");
    await authClient.auth.signOut();
  }

  console.log("");
  console.log("Smoke Auth Email Test Complete");
  console.log("--------------------------------");
  console.log(`SMOKE_EMAIL: ${smokeEmail}`);
  console.log(`Generated password: ${generatedPassword}`);
  console.log(`SMOKE_CHANGE_EMAIL: ${smokeChangeEmail}`);
  console.log("Expected email types triggered for this run:");
  if (mode === "all" || mode === "magic") console.log("- Magic link email");
  if (mode === "all" || mode === "reset") console.log("- Reset password email");
  if (mode === "all" || mode === "change") console.log("- Change email confirmation email");
}

main().catch((error) => {
  console.error("Smoke auth email test failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
