import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { canAccessPremium } from "@/lib/entitlements";

export const dynamic = "force-dynamic";

type TiUserRow = {
  id: string;
  created_at: string;
  plan: string;
  subscription_status: string;
  current_period_end: string | null;
  first_seen_at?: string | null;
};

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export default async function AccountPage() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("ti_users")
    .select("id,created_at,plan,subscription_status,current_period_end,first_seen_at")
    .eq("id", user.id)
    .maybeSingle<TiUserRow>();

  const nowIso = new Date().toISOString();
  if (profile?.id) {
    await supabase
      .from("ti_users")
      .update({
        last_seen_at: nowIso,
        email: user.email ?? null,
        ...(profile.first_seen_at ? {} : { first_seen_at: nowIso }),
      })
      .eq("id", user.id);
  } else {
    // Safety net if signup trigger did not create the row.
    await supabase.from("ti_users").insert({
      id: user.id,
      email: user.email ?? null,
      first_seen_at: nowIso,
      last_seen_at: nowIso,
    });
  }

  const premiumEnabled = canAccessPremium(profile);

  return (
    <main style={{ minHeight: "70vh", display: "grid", placeItems: "center", padding: 24 }}>
      <section style={{ width: "100%", maxWidth: 680, background: "#fff", borderRadius: 14, border: "1px solid #d9e3f6", padding: 24 }}>
        <h1 style={{ marginTop: 0, marginBottom: 8 }}>Your Account</h1>
        <p style={{ marginTop: 0, color: "#4b5563" }}>{user.email}</p>

        <div style={{ display: "grid", gap: 10, marginTop: 16 }}>
          <DetailRow label="Plan" value={profile?.plan ?? "free"} />
          <DetailRow label="Subscription Status" value={profile?.subscription_status ?? "none"} />
          <DetailRow label="Signup Date" value={formatDate(profile?.created_at)} />
          <DetailRow label="Renewal Date" value={formatDate(profile?.current_period_end)} />
          <DetailRow label="Premium Access" value={premiumEnabled ? "Enabled" : "Not enabled"} />
        </div>

        <div style={{ display: "flex", gap: 12, marginTop: 20, flexWrap: "wrap" }}>
          <Link href="/tournaments" style={buttonStyle(false)}>
            Browse tournaments
          </Link>
          <Link href="/logout" style={buttonStyle(true)}>
            Log out
          </Link>
        </div>
      </section>
    </main>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: 12 }}>
      <strong>{label}</strong>
      <span>{value}</span>
    </div>
  );
}

function buttonStyle(danger: boolean) {
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "10px 14px",
    borderRadius: 10,
    textDecoration: "none",
    border: `1px solid ${danger ? "#fca5a5" : "#93c5fd"}`,
    background: danger ? "#fff1f2" : "#eff6ff",
    color: "#111827",
    fontWeight: 600,
  } as const;
}
