import "server-only";

import type { User } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { NormalizedSignupProfile } from "@/lib/tiProfile";
import { extractProfileFromMetadata } from "@/lib/tiProfile";

type ExistingTiUserRow = {
  id: string;
  first_seen_at: string | null;
};

export type TiProfileSyncResult = {
  ok: boolean;
  warning?: string;
  error?: string;
  usernameConflict?: boolean;
};

function buildTiUserPayload(
  userId: string,
  email: string | null | undefined,
  existing: ExistingTiUserRow | null,
  profile: NormalizedSignupProfile
) {
  const nowIso = new Date().toISOString();
  return {
    id: userId,
    email: email ?? null,
    last_seen_at: nowIso,
    updated_at: nowIso,
    ...(existing?.first_seen_at ? {} : { first_seen_at: nowIso }),
    display_name: profile.displayName,
    zip_code: profile.zipCode,
    sports_interests: profile.sportsInterests,
    username: profile.username,
    reviewer_handle: profile.username,
  };
}

async function loadExistingTiUser(userId: string) {
  const { data: existingRaw, error: existingError } = await (supabaseAdmin
    .from("ti_users" as any) as any)
    .select("id,first_seen_at")
    .eq("id", userId)
    .maybeSingle();

  return {
    existing: (existingRaw ?? null) as ExistingTiUserRow | null,
    error: existingError,
  };
}

function normalizeWriteError(writeError: { message: string; code?: string } | null): TiProfileSyncResult | null {
  if (!writeError) return null;
  const lowered = `${writeError.code ?? ""} ${writeError.message}`.toLowerCase();
  if (lowered.includes("duplicate key") || lowered.includes("unique") || lowered.includes("23505")) {
    return {
      ok: false,
      error: "That username is taken.",
      usernameConflict: true,
    };
  }
  return { ok: false, error: writeError.message };
}

export async function persistNormalizedTiUserProfile(args: {
  userId: string;
  email?: string | null;
  profile: NormalizedSignupProfile;
}): Promise<TiProfileSyncResult> {
  const { existing, error: existingError } = await loadExistingTiUser(args.userId);
  if (existingError) {
    return { ok: false, error: existingError.message };
  }

  try {
    const usernameConflict = await isUsernameTaken(args.profile.username, args.userId);
    if (usernameConflict) {
      return { ok: false, error: "That username is taken.", usernameConflict: true };
    }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not validate username availability.",
    };
  }

  const payload = buildTiUserPayload(args.userId, args.email, existing, args.profile);
  let writeError: { message: string; code?: string } | null = null;

  if (existing?.id) {
    const { error } = await (supabaseAdmin.from("ti_users" as any) as any)
      .update(payload)
      .eq("id", args.userId);
    writeError = error;
  } else {
    const { error } = await (supabaseAdmin.from("ti_users" as any) as any).insert({
      plan: "insider",
      subscription_status: "none",
      ...payload,
    });
    writeError = error;
  }

  return normalizeWriteError(writeError) ?? { ok: true };
}

export async function isUsernameTaken(username: string, excludeUserId?: string) {
  let query = (supabaseAdmin.from("ti_users" as any) as any)
    .select("id", { head: true, count: "exact" })
    .or(`username.eq.${username},reviewer_handle.eq.${username}`);

  if (excludeUserId) {
    query = query.neq("id", excludeUserId);
  }

  const { count, error } = await query;
  if (error) {
    throw error;
  }
  return (count ?? 0) > 0;
}

export async function syncTiUserProfileFromAuthUser(user: User): Promise<TiProfileSyncResult> {
  const metadata = (user.user_metadata ?? {}) as Record<string, unknown>;
  const normalized = extractProfileFromMetadata(metadata);
  const { existing, error: existingError } = await loadExistingTiUser(user.id);

  if (existingError) {
    return { ok: false, error: existingError.message };
  }

  let usernameConflict = false;
  if (normalized.username) {
    try {
      usernameConflict = await isUsernameTaken(normalized.username, user.id);
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : "Could not validate username availability.",
      };
    }
  }

  const username = usernameConflict ? null : normalized.username;
  const payload =
    username && normalized.zipCode && normalized.sportsInterests.length > 0
      ? buildTiUserPayload(user.id, user.email ?? null, existing, {
          displayName: normalized.displayName,
          username,
          zipCode: normalized.zipCode,
          sportsInterests: normalized.sportsInterests,
        })
      : {
          email: user.email ?? null,
          last_seen_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          ...(existing?.first_seen_at ? {} : { first_seen_at: new Date().toISOString() }),
          ...(normalized.displayName ? { display_name: normalized.displayName } : {}),
          ...(normalized.zipCode ? { zip_code: normalized.zipCode } : {}),
          ...(normalized.sportsInterests.length > 0 ? { sports_interests: normalized.sportsInterests } : {}),
          ...(username ? { username, reviewer_handle: username } : {}),
        };

  let writeError: { message: string; code?: string } | null = null;

  if (existing?.id) {
    const { error } = await (supabaseAdmin.from("ti_users" as any) as any)
      .update(payload)
      .eq("id", user.id);
    writeError = error;
  } else {
    const { error } = await (supabaseAdmin.from("ti_users" as any) as any).insert({
      id: user.id,
      plan: "insider",
      subscription_status: "none",
      ...payload,
    });
    writeError = error;
  }

  const normalizedError = normalizeWriteError(writeError);
  if (normalizedError) return normalizedError;

  if (usernameConflict) {
    return {
      ok: true,
      warning:
        "That username is taken. Your account was created, but your username was not saved.",
      usernameConflict: true,
    };
  }

  return { ok: true };
}
