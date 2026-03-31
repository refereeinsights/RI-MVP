import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { getTiTierServer } from "@/lib/entitlementsServer";
import { ALERT_START_OFFSET_DAYS } from "@/lib/tournamentAlerts";
import AlertsClient, { type AlertClientRow } from "./AlertsClient";
import styles from "../AccountPage.module.css";

type TiUserRow = {
  zip_code: string | null;
};

export default async function AccountAlertsPage() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!user.email_confirmed_at) redirect("/verify-email");

  const tierInfo = await getTiTierServer(user);

  const { data: profile } = await supabase
    .from("ti_users" as any)
    .select("zip_code")
    .eq("id", user.id)
    .maybeSingle<TiUserRow>();

  const { data: alertsRaw } = await (supabase.from("user_tournament_alerts" as any) as any)
    .select("id,name,zip_code,radius_miles,days_ahead,sport,cadence,is_active,last_sent_at,created_at,updated_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  const alerts = ((alertsRaw ?? []) as AlertClientRow[]).map((row) => ({
    ...row,
    sport: row.sport ?? null,
  }));

  return (
    <main className={styles.accountPage}>
      <header className={styles.sectionCard}>
        <div className={styles.headerTop}>
          <h1 className={styles.pageTitle}>Scheduled Alerts</h1>
          <Link href="/account" className={styles.secondaryAction}>
            Back to account
          </Link>
        </div>
        <p className={styles.fieldHelp} style={{ margin: 0 }}>
          Get a quick email with tournaments near you. Alerts look for tournaments starting{" "}
          <strong>{ALERT_START_OFFSET_DAYS}+</strong> days from today (planning window).
        </p>
      </header>

      <AlertsClient
        initialAlerts={alerts}
        tier={tierInfo.tier}
        defaultZip={profile?.zip_code ?? ""}
        recipientEmail={user.email ?? ""}
      />
    </main>
  );
}
