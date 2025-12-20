import Link from "next/link";
import type { CSSProperties } from "react";
import EmailPreferencesForm from "./EmailPreferencesForm";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { fetchOrCreateProfile, type ProfileRow } from "@/lib/profile";

export const metadata = {
  title: "Email Preferences | Referee Insights",
  description: "Tell Referee Insights which updates and marketing emails you want to receive.",
};

export default async function EmailPreferencesPage() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return (
      <main style={styles.main}>
        <div style={styles.card}>
          <h1 style={styles.heading}>Email Preferences</h1>
          <p style={styles.subheading}>
            Sign in to manage which Referee Insights communications you want to receive.
          </p>
          <Link href="/account/login" style={styles.button}>
            Go to login
          </Link>
        </div>
      </main>
    );
  }

  let profile: ProfileRow | null = null;
  let profileError: string | null = null;

  try {
    profile = await fetchOrCreateProfile(
      user.id,
      user.email ?? undefined,
      (user.user_metadata as Record<string, any>) ?? {}
    );
  } catch (err: any) {
    profileError = err?.message ?? "Unable to load your preferences right now.";
  }

  if (!profile) {
    return (
      <main style={styles.main}>
        <div style={styles.card}>
          <h1 style={styles.heading}>Email Preferences</h1>
          <p style={styles.subheading}>
            {profileError ??
              "Unable to load your profile preferences at the moment. Please try again later."}
          </p>
        </div>
      </main>
    );
  }

  const initialTournaments = profile.email_opt_in_tournaments ?? true;
  const initialMarketing = profile.email_opt_in_marketing ?? false;

  return (
    <main style={styles.main}>
      <div style={styles.card}>
        <h1 style={styles.heading}>Email Preferences</h1>
        <p style={styles.subheading}>
          Choose which communications you want to receive from Referee Insights. You can come
          back here any time to adjust your preferences.
        </p>
        <EmailPreferencesForm
          userId={profile.user_id}
          initialTournamentOptIn={initialTournaments}
          initialMarketingOptIn={initialMarketing}
        />
      </div>
    </main>
  );
}

const styles: Record<string, CSSProperties> = {
  main: {
    padding: "40px 16px",
    display: "flex",
    justifyContent: "center",
  },
  card: {
    width: "100%",
    maxWidth: 560,
    borderRadius: 18,
    border: "1px solid rgba(0,0,0,0.08)",
    background: "#fff",
    padding: 32,
    boxShadow: "0 18px 42px rgba(0,0,0,0.08)",
    lineHeight: 1.5,
  },
  heading: { margin: 0, fontSize: 30, fontWeight: 900 },
  subheading: { marginTop: 12, color: "#555" },
  button: {
    marginTop: 16,
    display: "inline-flex",
    justifyContent: "center",
    padding: "10px 14px",
    borderRadius: 12,
    background: "#111",
    color: "#fff",
    fontWeight: 800,
    textDecoration: "none",
  },
};
