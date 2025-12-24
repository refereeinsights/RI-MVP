import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabaseServer";

type AlertPreference = {
  home_zip: string;
  radius_miles: number;
  enabled: boolean;
  frequency: string;
};

const RADIUS_OPTIONS = [25, 50, 100];

async function saveAlerts(formData: FormData) {
  "use server";
  const supabase = createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) {
    redirect("/account/login");
  }

  const [{ data: profile }, { data: sub }] = await Promise.all([
    supabase
      .from("profiles" as any)
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("subscriptions" as any)
      .select("product,plan,status")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  const profileRole = profile && typeof profile === "object" && "role" in profile ? (profile as any).role : null;
  const subObj =
    sub && typeof sub === "object" && "product" in sub ? (sub as any) : null;

  const isAdmin = profileRole === "admin";
  const isPlus =
    subObj &&
    subObj.product === "ri" &&
    subObj.plan === "referee_plus" &&
    ["active", "trialing"].includes(subObj.status ?? "");
  const canEdit = isAdmin || isPlus;
  if (!canEdit) {
    throw new Error("Referee Plus is required to edit alerts.");
  }

  const home_zip = (formData.get("home_zip") as string | null)?.trim() ?? "";
  const radius_miles = Number(formData.get("radius_miles") ?? 50);
  const enabled = formData.get("enabled") === "on";

  if (!/^[0-9]{5}$/.test(home_zip)) {
    throw new Error("Please enter a 5-digit ZIP code.");
  }

  const { error } = await supabase
    .from("alert_preferences" as any)
    .upsert({
      user_id: user.id,
      home_zip,
      radius_miles,
      enabled,
      frequency: "weekly",
      updated_at: new Date().toISOString(),
    });

  if (error) throw error;
}

export default async function AlertsPage() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/account/login");
  }

  const [{ data: profile }, { data: prefs }, { data: subs }] = await Promise.all([
    supabase
      .from("profiles" as any)
      .select("role,email_opt_in_tournaments")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("alert_preferences" as any)
      .select("home_zip,radius_miles,enabled,frequency")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("subscriptions" as any)
      .select("product,plan,status")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  const profileRole = profile && typeof profile === "object" && "role" in profile ? (profile as any).role : null;
  const subsObj =
    subs && typeof subs === "object" && "product" in subs ? (subs as any) : null;

  const isAdmin = profileRole === "admin";
  const isPlus =
    subsObj &&
    subsObj.product === "ri" &&
    subsObj.plan === "referee_plus" &&
    ["active", "trialing"].includes(subsObj.status ?? "");

  const canEdit = isAdmin || isPlus;

  const pref: AlertPreference = {
    home_zip: prefs?.home_zip ?? "",
    radius_miles: prefs?.radius_miles ?? 50,
    enabled: prefs?.enabled ?? false,
    frequency: prefs?.frequency ?? "weekly",
  };

  return (
    <main
      style={{
        minHeight: "70vh",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        padding: "1.5rem 1rem",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 640,
          background: "#fff",
          borderRadius: 18,
          padding: "1.5rem",
          boxShadow: "0 20px 40px rgba(0,0,0,0.12)",
          border: "1px solid #eee",
        }}
      >
        <div
          style={{
            padding: "12px 14px",
            borderRadius: 12,
            background: "#eef2ff",
            color: "#4338ca",
            fontWeight: 600,
            marginBottom: "16px",
            textAlign: "center",
          }}
        >
          Alerts not live yet (preview only). Emails will not be sent.
        </div>

        <h1 style={{ margin: "0 0 4px", textAlign: "center" }}>Nearby tournament alerts</h1>
        <p style={{ margin: 0, color: "#555", textAlign: "center" }}>
          Save your ZIP and radius; we’ll use these when Referee Plus alerts launch.
        </p>

        {!canEdit && (
          <div
            style={{
              marginTop: "16px",
              padding: "12px 14px",
              borderRadius: 12,
              border: "1px solid #ddd",
              background: "#fafafa",
            }}
          >
            <strong>Referee Plus required.</strong> Alerts are a Referee Plus feature.{" "}
            <Link href="/account">Upgrade</Link> to enable.
          </div>
        )}

        <form
          action={saveAlerts}
          style={{ marginTop: "18px", display: "grid", gap: "14px" }}
        >
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontWeight: 600 }}>Home ZIP</span>
            <input
              name="home_zip"
              defaultValue={pref.home_zip}
              maxLength={5}
              pattern="[0-9]{5}"
              required
              disabled={!canEdit}
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid #ccc",
                fontSize: 15,
              }}
            />
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontWeight: 600 }}>Radius (miles)</span>
            <select
              name="radius_miles"
              defaultValue={pref.radius_miles}
              disabled={!canEdit}
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid #ccc",
                fontSize: 15,
              }}
            >
              {RADIUS_OPTIONS.map((r) => (
                <option key={r} value={r}>
                  {r} miles
                </option>
              ))}
            </select>
          </label>

          <label style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <input
              type="checkbox"
              name="enabled"
              defaultChecked={pref.enabled}
              disabled={!canEdit}
            />
            <span style={{ fontWeight: 600 }}>Enable alerts</span>
          </label>

          <div style={{ textAlign: "center", marginTop: "6px" }}>
            <button
              type="submit"
              disabled={!canEdit}
              style={{
                padding: "12px 16px",
                borderRadius: 12,
                border: "none",
                background: canEdit ? "#111" : "#ccc",
                color: "#fff",
                fontWeight: 800,
                cursor: canEdit ? "pointer" : "not-allowed",
              }}
            >
              Save alert settings
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
