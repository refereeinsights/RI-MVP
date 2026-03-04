import Link from "next/link";
import { normalizeOutreachSport, verifyOutreachUnsubscribeToken } from "@/lib/outreach";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type SearchParams = {
  sport?: string;
  tournamentId?: string;
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
  const directorEmail = (searchParams?.email || "").trim().toLowerCase();
  const token = (searchParams?.token || "").trim();

  const isValid =
    !!tournamentId &&
    !!directorEmail &&
    !!token &&
    verifyOutreachUnsubscribeToken({
      sport,
      tournamentId,
      directorEmail,
      token,
    });

  let tournamentName = "this tournament";
  let completed = false;
  let errorMessage = "";

  if (!isValid) {
    errorMessage = "This unsubscribe link is invalid or has expired.";
  } else {
    const { data: tournament, error: tournamentError } = await (supabaseAdmin.from("tournaments" as any) as any)
      .select("id,name")
      .eq("id", tournamentId)
      .maybeSingle();

    if (tournamentError || !tournament) {
      errorMessage = "We could not find that tournament.";
    } else {
      tournamentName = tournament.name || tournamentName;
      const { error: suppressionError } = await (supabaseAdmin.from("email_outreach_suppressions" as any) as any).upsert(
        {
          tournament_id: tournamentId,
          sport,
          director_email: directorEmail,
          reason: "unsubscribe_link",
          status: "removed",
          created_by_email: "unsubscribe-link",
        },
        { onConflict: "tournament_id" }
      );

      if (suppressionError) {
        errorMessage = suppressionError.message;
      } else {
        await (supabaseAdmin.from("email_outreach_previews" as any) as any)
          .delete()
          .eq("tournament_id", tournamentId)
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
                ? `We removed ${tournamentName} from future TournamentInsights verification campaigns.`
                : errorMessage}
            </p>
          </div>

          <div style={{ display: "flex", justifyContent: "center", gap: 12, flexWrap: "wrap" }}>
            <Link href="/" className="cta ti-home-cta ti-home-cta-primary">
              Back to TournamentInsights
            </Link>
            {completed ? (
              <Link href={`/verify-your-tournament?sport=${sport}&tournamentId=${tournamentId}`} className="cta ti-home-cta ti-home-cta-secondary">
                Verify this tournament
              </Link>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}
