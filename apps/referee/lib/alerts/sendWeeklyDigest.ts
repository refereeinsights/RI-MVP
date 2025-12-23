import { queryNearbyTournaments, type NearbyTournament } from "./queryNearbyTournaments";
import { getEligibleUsers } from "./getEligibleUsers";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const ALERTS_ENABLED = process.env.ALERTS_ENABLED === "true";
const ALERTS_DRY_RUN = process.env.ALERTS_DRY_RUN !== "false"; // default to dry-run unless explicitly false
const CRON_SECRET = process.env.CRON_SECRET;

type DigestLog = {
  user_id: string;
  email: string;
  zip: string;
  radius: number;
  tournamentCount: number;
  last_sent_at: string | null;
};

function formatDateRange(start: string | null, end: string | null) {
  if (!start) return "Date TBA";
  if (!end || end === start) return start;
  return `${start} – ${end}`;
}

async function sendEmailViaResend(params: {
  to: string;
  zip: string;
  radius: number;
  tournaments: NearbyTournament[];
}) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[alerts] RESEND_API_KEY missing; skipping send");
    return;
  }

  const items = params.tournaments
    .map(
      (t) =>
        `- ${t.name ?? "Tournament"} (${t.city ?? "TBA"}, ${t.state ?? ""}) ${formatDateRange(
          t.start_date,
          t.end_date
        )} → https://www.refereeinsights.com/tournaments/${t.slug ?? ""}`
    )
    .join("\n");

  const text = [
    `Upcoming tournaments near ${params.zip} (within ${params.radius} miles):`,
    "",
    items || "No tournaments found.",
    "",
    "Manage alerts: https://www.refereeinsights.com/account/alerts",
  ].join("\n");

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "alerts@refereeinsights.com",
      to: params.to,
      subject: `Nearby tournaments within ${params.radius} miles`,
      text,
    }),
  });
}

export async function runWeeklyAlertJob(options?: {
  dryRunOverride?: boolean;
  cronSecretHeader?: string;
}) {
  if (!ALERTS_ENABLED) {
    console.log("[alerts] ALERTS_ENABLED is not true; exiting.");
    return { sent: 0, dryRun: true, eligible: 0 };
  }

  if (CRON_SECRET && options?.cronSecretHeader && options.cronSecretHeader !== CRON_SECRET) {
    throw new Error("Unauthorized: invalid cron secret");
  }

  const dryRun = options?.dryRunOverride ?? ALERTS_DRY_RUN;

  const { eligible, skippedMissingZip, skippedNoOptIn, skippedNoSub } = await getEligibleUsers();
  console.log(
    `[alerts] Eligible=${eligible.length}, skippedMissingZip=${skippedMissingZip}, skippedNoOptIn=${skippedNoOptIn}, skippedNoSub=${skippedNoSub}`
  );

  const logs: DigestLog[] = [];
  let sent = 0;
  const processedUserIds: string[] = [];

  for (const user of eligible) {
    const tournaments = await queryNearbyTournaments({
      latitude: user.latitude,
      longitude: user.longitude,
      radius_miles: user.radius_miles,
      last_sent_at: user.last_sent_at,
    });

    logs.push({
      user_id: user.user_id,
      email: user.email,
      zip: user.home_zip,
      radius: user.radius_miles,
      tournamentCount: tournaments.length,
      last_sent_at: user.last_sent_at,
    });

    if (dryRun) continue;
    if (!tournaments.length) continue;

    await sendEmailViaResend({
      to: user.email,
      zip: user.home_zip,
      radius: user.radius_miles,
      tournaments,
    });
    sent += 1;
    processedUserIds.push(user.user_id);
  }

  if (!dryRun && processedUserIds.length) {
    const nowIso = new Date().toISOString();
    const { error: updateErr } = await supabaseAdmin
      .from("alert_preferences" as any)
      .update({ last_sent_at: nowIso, updated_at: nowIso })
      .in("user_id", processedUserIds);
    if (updateErr) {
      console.error("[alerts] failed to update last_sent_at", updateErr);
    }
  }

  console.log(
    `[alerts] dryRun=${dryRun} processed=${eligible.length} sent=${sent} logs=${JSON.stringify(
      logs
    )}`
  );

  return { sent, dryRun, eligible: eligible.length, logs };
}
