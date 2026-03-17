import Link from "next/link";
import { normalizeOutreachSport, verifyOutreachUnsubscribeToken } from "@/lib/outreach";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type SearchParams = {
  sport?: string;
  tournamentId?: string;
  tournamentIds?: string;
  email?: string;
  token?: string;
};

export const dynamic = "force-dynamic";

export default async function UnsubscribeOutreachPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const sport = normalizeOutreachSport(searchParams?.sport);
  const tournamentId = (searchParams?.tournamentId || "").trim();
  const tournamentIds = (searchParams?.tournamentIds || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const directorEmail = (searchParams?.email || "").trim().toLowerCase();
  const token = (searchParams?.token || "").trim();

  const isValid =
    (!!tournamentId || tournamentIds.length > 0) &&
    !!directorEmail &&
    !!token &&
    verifyOutreachUnsubscribeToken({
      sport,
      tournamentId: tournamentId || tournamentIds[0] || "",
      tournamentIds: tournamentIds.length > 0 ? tournamentIds : undefined,
      directorEmail,
      token,
    });

  let tournamentName = "this tournament";
  let tournamentCount = tournamentIds.length || (tournamentId ? 1 : 0);
  let completed = false;
  let errorMessage = "";

  if (!isValid) {
    errorMessage = "This unsubscribe link is invalid or has expired.";
  } else {
    const idsToRemove = tournamentIds.length > 0 ? tournamentIds : [tournamentId].filter(Boolean);
    tournamentCount = idsToRemove.length;
    const { data: tournamentsRaw, error: tournamentError } = await (supabaseAdmin.from("tournaments" as any) as any)
      .select("id,name")
      .in("id", idsToRemove);

    const tournaments = (tournamentsRaw ?? []) as Array<{ id: string; name: string | null }>;
    if (tournamentError || tournaments.length === 0) {
      errorMessage = "We could not find that tournament.";
    } else {
      tournamentName = tournaments[0]?.name || tournamentName;
      const suppressions = idsToRemove.map((id) => ({
        tournament_id: id,
        sport,
        director_email: directorEmail,
        reason: "unsubscribe_link",
        status: "removed",
        created_by_email: "unsubscribe-link",
      }));

      const { error: suppressionError } = await (supabaseAdmin.from("email_outreach_suppressions" as any) as any).upsert(
        suppressions,
        { onConflict: "tournament_id" }
      );

      if (suppressionError) {
        errorMessage = suppressionError.message;
      } else {
        await (supabaseAdmin.from("email_outreach_previews" as any) as any)
          .delete()
          .in("tournament_id", idsToRemove)
          .eq("director_email", directorEmail);
        completed = true;
      }
    }
  }

  return (
    <main className="page">
      <div className="shell" style={{ maxWidth: 760 }}>
        <section className="bodyCard" style={{ display: "grid", gap: 16, textAlign: "center" }}>
          <div style={{ display: "grid", gap: 8 }}>
            <h1 style={{ margin: 0 }}>
              {completed ? "You’re unsubscribed from future outreach" : "Unable to complete unsubscribe"}
            </h1>
            <p className="muted" style={{ margin: 0 }}>
              {completed
                ? tournamentCount > 1
                  ? `We removed ${tournamentCount} tournaments (including ${tournamentName}) from future TournamentInsights outreach campaigns.`
                  : `We removed ${tournamentName} from future TournamentInsights outreach campaigns.`
                : errorMessage}
            </p>
          </div>

          <div style={{ display: "flex", justifyContent: "center", gap: 12, flexWrap: "wrap" }}>
            <Link href="/" className="cta ti-home-cta ti-home-cta-primary">
              Back to TournamentInsights
            </Link>
            {completed ? (
              tournamentCount === 1 && tournamentId ? (
                <Link
                  href={`/verify-your-tournament?sport=${sport}&tournamentId=${tournamentId}`}
                  className="cta ti-home-cta ti-home-cta-secondary"
                >
                  Verify this tournament
                </Link>
              ) : null
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}
