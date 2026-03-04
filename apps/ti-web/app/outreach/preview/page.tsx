import { notFound } from "next/navigation";
import { pickVariant } from "@/lib/outreach/ab";
import {
  buildOutreachUnsubscribeUrl,
  buildSportVerifyEmail,
  buildVerifyUrl,
  normalizeOutreachSport,
} from "@/lib/outreach";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type SearchParams = {
  sport?: string;
  tournamentId?: string;
  campaign_id?: string;
};

type TournamentRow = {
  id: string;
  name: string | null;
  sport: string | null;
  tournament_director: string | null;
  tournament_director_email: string | null;
};

function inferFirstName(value: string | null) {
  return (value || "").trim().split(/\s+/).filter(Boolean)[0] || undefined;
}

function isPreviewEnabled() {
  if (process.env.OUTREACH_PREVIEW_ENABLED === "true") return true;
  return process.env.NODE_ENV !== "production";
}

export const dynamic = "force-dynamic";

export default async function OutreachPreviewPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  if (!isPreviewEnabled()) notFound();

  const tournamentId = (searchParams?.tournamentId || "").trim();
  if (!tournamentId) {
    return (
      <main className="page">
        <div className="shell" style={{ maxWidth: 960 }}>
          <section className="bodyCard" style={{ display: "grid", gap: 10 }}>
            <h1 style={{ margin: 0 }}>Outreach preview</h1>
            <p className="muted" style={{ margin: 0 }}>
              Provide <code>tournamentId</code> and optional <code>sport</code> in the query string.
            </p>
          </section>
        </div>
      </main>
    );
  }

  const { data: tournament, error } = await (supabaseAdmin.from("tournaments" as any) as any)
    .select("id,name,sport,tournament_director,tournament_director_email")
    .eq("id", tournamentId)
    .maybeSingle();

  if (error || !tournament) {
    notFound();
  }

  const row = tournament as TournamentRow;
  const sport = normalizeOutreachSport(searchParams?.sport || row.sport || "soccer");
  const campaignId = (searchParams?.campaign_id || "").trim() || `${sport}_preview_${new Date().toISOString().slice(0, 10)}`;
  const variant = pickVariant(row.id);
  const directorEmail = (row.tournament_director_email || "").trim().toLowerCase() || "support@tournamentinsights.com";
  const verifyUrl = buildVerifyUrl({
    sport,
    tournamentId: row.id,
    campaignId,
    variant,
  });
  const unsubscribeUrl = buildOutreachUnsubscribeUrl({
    sport,
    tournamentId: row.id,
    directorEmail,
  });
  const email = buildSportVerifyEmail({
    sport,
    firstName: inferFirstName(row.tournament_director),
    verifyUrl,
    unsubscribeUrl,
    tournamentName: row.name || "your tournament",
    variant,
  });

  return (
    <main className="page">
      <div className="shell" style={{ maxWidth: 1080 }}>
        <section className="bodyCard" style={{ display: "grid", gap: 14 }}>
          <h1 style={{ margin: 0 }}>Outreach preview</h1>
          <p className="muted" style={{ margin: 0 }}>
            Sport: <strong>{sport}</strong> | Tournament: <strong>{row.name || row.id}</strong> | Variant:{" "}
            <strong>{variant}</strong>
          </p>
          <p style={{ margin: 0 }}>
            <strong>Subject:</strong> {email.subject}
          </p>
        </section>

        <section style={{ display: "grid", gridTemplateColumns: "minmax(0,1.2fr) minmax(0,0.8fr)", gap: 16 }}>
          <div className="bodyCard" style={{ display: "grid", gap: 8 }}>
            <h2 style={{ margin: 0 }}>HTML preview</h2>
            <iframe
              title="Outreach preview HTML"
              sandbox=""
              srcDoc={email.html}
              style={{ width: "100%", minHeight: 560, border: "1px solid #dbe4ec", borderRadius: 12, background: "#fff" }}
            />
          </div>

          <div className="bodyCard" style={{ display: "grid", gap: 8 }}>
            <h2 style={{ margin: 0 }}>Plain text</h2>
            <pre
              style={{
                margin: 0,
                whiteSpace: "pre-wrap",
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                fontSize: 13,
                lineHeight: 1.6,
                background: "#f8fafc",
                borderRadius: 10,
                border: "1px solid #dbe4ec",
                padding: 12,
              }}
            >
              {email.text}
            </pre>
          </div>
        </section>
      </div>
    </main>
  );
}
