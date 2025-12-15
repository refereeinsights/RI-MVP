import Link from "next/link";
import { supabase } from "../../lib/supabaseClient";
import "./tournaments.css";

type Tournament = {
  id: string;
  name: string;
  slug: string;
  sport: string;
  level: string | null;
  state: string;
  city: string | null;
  start_date: string | null;
  end_date: string | null;
  source_url: string;
};

function formatDate(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default async function TournamentsPage() {
  const { data, error } = await supabase
    .from("tournaments")
    .select(
      "id,name,slug,sport,level,state,city,start_date,end_date,source_url,status,is_canonical"
    )
    .eq("status", "published")
    .eq("is_canonical", true)
    .order("start_date", { ascending: true });

  if (error) {
    return (
      <main className="pitchWrap">
        <section className="field">
          <h1 className="title">Upcoming Tournaments</h1>
          <p className="subtitle">
            Error loading tournaments: <code>{error.message}</code>
          </p>
        </section>
      </main>
    );
  }

  const tournaments = (data ?? []) as Tournament[];

  return (
    <main className="pitchWrap">
      <section className="field">
        <header>
          <h1 className="title">Upcoming Tournaments</h1>
          <p className="subtitle">
            West Coast soccer tournaments sourced from public listings. Dates and
            details may change—always confirm on the official site.
          </p>
        </header>

        <div className="grid">
          {tournaments.map((t) => (
            <article key={t.id} className="card">
              <h2>{t.name}</h2>

              <p className="meta">
                <strong>{t.state}</strong>
                {t.city ? ` • ${t.city}` : ""}
                {t.level ? ` • ${t.level}` : ""}
              </p>

              <p className="dates">
                {formatDate(t.start_date)}
                {t.end_date && t.end_date !== t.start_date
                  ? ` – ${formatDate(t.end_date)}`
                  : ""}
              </p>

              <div className="actions">
                <Link className="btn" href={`/tournaments/${t.slug}`}>
                  View details
                </Link>

                <a
                  className="btn"
                  href={t.source_url}
                  target="_blank"
                  rel="noreferrer"
                >
                  Official site
                </a>
              </div>
            </article>
          ))}
        </div>

        {tournaments.length === 0 && (
          <p className="empty">No published tournaments found yet.</p>
        )}
      </section>
    </main>
  );
}
