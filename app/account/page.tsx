import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import AccountForm from "@/components/AccountForm";
import { fetchOrCreateProfile, fetchUserBadges, type ProfileRow, type UserBadgeRow } from "@/lib/profile";

const BADGE_IMAGE_MAP: Record<string, { src: string; alt: string }> = {
  founding_referee: { src: "/founding-referee.png", alt: "Founding referee badge" },
  verified_referee: { src: "/verified-referee.png", alt: "Verified referee badge" },
  top_contributor: { src: "/top-contributor.png", alt: "Top contributor badge" },
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

  let badgeImages: { src: string; alt: string }[] = [];
  try {
    const userBadges: UserBadgeRow[] = await fetchUserBadges(user.id);
    const seen = new Set<string>();
    for (const badge of userBadges) {
      const code = badge.badges?.code ?? undefined;
      if (code && BADGE_IMAGE_MAP[code] && !seen.has(code)) {
        seen.add(code);
        badgeImages.push(BADGE_IMAGE_MAP[code]);
      }
    }
  } catch (err) {
    console.error("Failed to load badge images", err);
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
        <AccountForm profile={profile} badgeImages={badgeImages} />
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
