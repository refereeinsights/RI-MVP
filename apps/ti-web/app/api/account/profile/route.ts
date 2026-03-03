import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/lib/types/supabase";
import { validateSignupProfile } from "@/lib/tiProfile";
import {
  persistNormalizedTiUserProfile,
  syncTiUserProfileFromAuthUser,
} from "@/lib/tiUserProfileServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

function buildAccountPath(kind: "notice" | "error", message: string) {
  const params = new URLSearchParams();
  params.set(kind, message);
  return `/account?${params.toString()}`;
}

function redirectToAccount(req: NextRequest, kind: "notice" | "error", message: string) {
  return NextResponse.redirect(new URL(buildAccountPath(kind, message), req.url));
}

export async function POST(req: NextRequest) {
  const response = NextResponse.json({ ok: true });
  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) {
    const formData = await req.formData();
    const validation = validateSignupProfile({
      name: String(formData.get("name") ?? ""),
      username: String(formData.get("username") ?? ""),
      zip: String(formData.get("zip") ?? ""),
      sportsInterests: formData.getAll("sports_interests").map((value) => String(value)),
    });

    if (!validation.ok) {
      return redirectToAccount(req, "error", validation.message);
    }

    const nextMetadata = {
      ...((user.user_metadata ?? {}) as Record<string, unknown>),
      display_name: validation.value.displayName,
      username: validation.value.username,
      handle: validation.value.username,
      zip_code: validation.value.zipCode,
      sports_interests: validation.value.sportsInterests,
    };

    const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
      user_metadata: nextMetadata,
    });
    if (authError) {
      return redirectToAccount(req, "error", `Profile update failed: ${authError.message}`);
    }

    const persistResult = await persistNormalizedTiUserProfile({
      userId: user.id,
      email: user.email ?? null,
      profile: validation.value,
    });
    if (!persistResult.ok) {
      return redirectToAccount(req, "error", persistResult.error ?? "Profile update failed.");
    }

    return redirectToAccount(req, "notice", "Profile updated.");
  }

  const result = await syncTiUserProfileFromAuthUser(user);
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error ?? "Unable to save profile.", usernameConflict: result.usernameConflict ?? false },
      { status: result.usernameConflict ? 409 : 500 }
    );
  }

  return NextResponse.json({ ok: true, warning: result.warning ?? null });
}
