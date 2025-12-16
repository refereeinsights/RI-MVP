import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import AccountForm from "@/components/AccountForm";

type ProfileRow = {
  user_id: string;
  email: string;
  handle: string;
  real_name: string | null;
  years_refereeing: number | null;
};

export default async function AccountPage() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return (
      <main
        style={{
          minHeight: "70vh",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          padding: "2rem",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: 520,
            background: "#fff",
            borderRadius: 18,
            padding: "2rem",
            boxShadow: "0 20px 40px rgba(0,0,0,0.12)",
            border: "1px solid #eee",
            textAlign: "center",
          }}
        >
          <h1 style={{ margin: 0 }}>My account</h1>
          <p style={{ marginTop: "1rem", color: "#555" }}>
            Please sign in to view your account.
          </p>
          <div style={{ marginTop: "1.5rem" }}>
            <Link
              href="/account/login"
              style={{
                padding: "12px 16px",
                borderRadius: 14,
                border: "none",
                background: "#111",
                color: "#fff",
                fontWeight: 900,
                textDecoration: "none",
              }}
            >
              Go to login
            </Link>
          </div>
        </div>
      </main>
    );
  }

  let profile: ProfileRow | null = null;
  let profileErrorMessage: string | null = null;

  try {
    profile = await fetchOrCreateProfile(user.id, user.email ?? undefined, (user.user_metadata as any) ?? {});
  } catch (err: any) {
    profileErrorMessage = err?.message ?? "Unable to load profile.";
  }

  if (!profile) {
    return (
      <main
        style={{
          minHeight: "70vh",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          padding: "2rem",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: 520,
            background: "#fff",
            borderRadius: 18,
            padding: "2rem",
            boxShadow: "0 20px 40px rgba(0,0,0,0.12)",
            border: "1px solid #eee",
            textAlign: "center",
          }}
        >
          <h1 style={{ margin: 0 }}>My account</h1>
          <p style={{ marginTop: "1rem", color: "#b00020" }}>
            {profileErrorMessage ?? "Unable to load your profile. Please try again later."}
          </p>
        </div>
      </main>
    );
  }

  return (
    <main
      style={{
        minHeight: "70vh",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        padding: "2rem",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 640,
          background: "#fff",
          borderRadius: 18,
          padding: "2rem",
          boxShadow: "0 20px 40px rgba(0,0,0,0.12)",
          border: "1px solid #eee",
        }}
      >
        <h1 style={{ margin: 0, textAlign: "center" }}>My account</h1>
        <AccountForm profile={profile} />
        <form
          action="/api/logout"
          method="post"
          style={{ marginTop: "1.5rem", textAlign: "center" }}
        >
          <button
            style={{
              padding: "10px 14px",
              borderRadius: 12,
              border: "1px solid #bbb",
              background: "#fff",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Log out
          </button>
        </form>
      </div>
    </main>
  );
}

async function fetchOrCreateProfile(
  user_id: string,
  email?: string,
  metadata?: Record<string, any>
) {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("user_id,email,handle,real_name,years_refereeing")
    .eq("user_id", user_id)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (data) return data;

  if (!email) {
    throw new Error("Profile missing and email unavailable.");
  }

  const baseHandle =
    (metadata?.handle as string | undefined)?.replace(/[^\w]+/g, "") ||
    email.split("@")[0].replace(/[^\w]+/g, "") ||
    `ref-${user_id.slice(0, 6)}`;

  let attemptHandle = baseHandle.slice(0, 20) || `ref-${user_id.slice(0, 6)}`;

  for (let i = 0; i < 5; i++) {
    const { data: inserted, error: insertError } = await supabaseAdmin
      .from("profiles")
      .insert([
        {
          user_id,
          email,
          handle: attemptHandle,
          real_name: (metadata?.real_name as string | undefined) ?? null,
          years_refereeing:
            (metadata?.years_refereeing as number | undefined) ?? null,
        },
      ])
      .select("user_id,email,handle,real_name,years_refereeing")
      .single();

    if (!insertError) {
      return inserted;
    }

    if (
      insertError.message &&
      insertError.message.includes("profiles_handle_key")
    ) {
      attemptHandle = `${baseHandle}${Math.floor(Math.random() * 900 + 100)}`
        .replace(/[^\w]+/g, "")
        .slice(0, 20);
      continue;
    }

    throw new Error(insertError.message);
  }

  throw new Error("Could not create profile. Please contact support.");
}
