import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { getTier } from "@/lib/entitlements";
import PremiumInterestForm from "@/components/PremiumInterestForm";

type TiUserRow = {
  id: string;
  created_at: string;
  plan: string | null;
  subscription_status: string | null;
  current_period_end: string | null;
  first_seen_at: string | null;
};

function normalizePlan(plan: string | null | undefined) {
  const value = (plan ?? "").trim().toLowerCase();
  if (!value || value === "free") return "insider";
  return value;
}

function prettyPlan(plan: string | null | undefined) {
  return normalizePlan(plan) === "weekend_pro" ? "Weekend Pro" : "Insider";
}

function prettySubscription(status: string | null | undefined) {
  const value = (status ?? "").trim().toLowerCase();
  if (!value || value === "none") return "None";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function prettyDate(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString();
}

export default async function AccountPage() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!user.email_confirmed_at) redirect("/verify-email");

  const { data: profile } = await supabase
    .from("ti_users" as any)
    .select("id,created_at,plan,subscription_status,current_period_end,first_seen_at")
    .eq("id", user.id)
    .maybeSingle<TiUserRow>();

  const nowIso = new Date().toISOString();
  if (profile?.id) {
    await (supabase
      .from("ti_users" as any) as any)
      .update({
        last_seen_at: nowIso,
        email: user.email ?? null,
        ...(profile.first_seen_at ? {} : { first_seen_at: nowIso }),
      })
      .eq("id", user.id);
  } else {
    await (supabase.from("ti_users" as any) as any).insert({
      id: user.id,
      email: user.email ?? null,
      first_seen_at: nowIso,
      last_seen_at: nowIso,
      plan: "insider",
      subscription_status: "none",
    });
  }

  const tier = getTier(user, profile ?? null);
  const effectivePlan = profile ? prettyPlan(profile.plan) : "Insider";

  return (
    <main style={{ maxWidth: 760, margin: "2rem auto", padding: "0 1rem", display: "grid", gap: 16 }}>
      <h1 style={{ margin: 0 }}>Account</h1>
      <div style={{ border: "1px solid #e2e8f0", borderRadius: 12, padding: 16, display: "grid", gap: 10 }}>
        <div><strong>Email:</strong> {user.email ?? "—"}</div>
        <div><strong>Tier:</strong> {tier === "weekend_pro" ? "Weekend Pro" : "Insider"}</div>
        <div><strong>Plan:</strong> {effectivePlan}</div>
        <div><strong>Subscription status:</strong> {prettySubscription(profile?.subscription_status)}</div>
        <div><strong>Signup date:</strong> {prettyDate(profile?.created_at ?? user.created_at)}</div>
        <div><strong>Renewal date:</strong> {prettyDate(profile?.current_period_end)}</div>
      </div>

      <div style={{ border: "1px solid #e2e8f0", borderRadius: 12, padding: 16, display: "grid", gap: 10 }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>Weekend Pro coming soon</h2>
        <p style={{ margin: 0, color: "#475569" }}>
          Join the notification list and we will email you when Weekend Pro is available.
        </p>
        <PremiumInterestForm initialEmail={user.email ?? ""} />
      </div>

      <div style={{ fontSize: 13 }}>
        <Link href="/logout">Log out</Link>
      </div>
    </main>
  );
}
