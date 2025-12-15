import Link from "next/link";
import { supabase } from "../../lib/supabaseClient";

type Tournament = {
  id: string;
  name: string;
  slug: string;
  state: string;
  city: string | null;
  level: string | null;
  start_date: string | null;
  end_date: string | null;
  source_url: string;
};

function formatDate(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export default async function TournamentsPage() {
  const { data, error } = await supabase
    .from("tournaments")
    .select("id,name,slug,state,city,level,start_date,end_date,source_url,status,is_canonical")
    .eq("status", "published")
    .eq("is_canonical", true)
    .order("start_date", { ascending: true });

  if (error) {
    return (
      <main style={{ padding: "2rem" }}>
        <h1>Upcoming Tournaments</h1>
        <p style={{ color: "#333" }}>
          Error loading tournaments: <code>{error.message}</code>
        </p>
      </main>
    );
  }

  const tournaments = (data ?? []) as Tournament[];

  return (
    <main style={{ padding: "2rem", display: "flex", justifyContent: "center" }}>
      <section style={{ maxWidth: 980, width: "100%" }}>
        <header style={{ marginBottom: "1.5rem" }}>
          <h1 style={{ margin: 0, fontSize: "2rem" }}>Upcoming Tournaments</h1>
          <p style={{ marginTop: "0.5rem", color: "#333" }}>
            West Coast soccer tournaments sourced from public listings. Dates/details may change.
          </p>
        </header>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1rem" }}>
          {tournaments.map((t) => (
            <article key={t.id} style={{ border: "2px solid #000", borderRadius: 10, padding: "1rem" }}>
              <h2 style={{ margin: 0, fontSize: "1.25rem" }}>{t.name}</h2>

              <p style={{ marginTop: "0.5rem", color: "#333" }}>
                <strong>{t.state}</strong>
                {t.city ? ` • ${t.city}` : ""}
                {t.level ? ` • ${t.level}` : ""}
              </p>

              <p style={{ marginTop: "0.5rem", color: "#333" }}>
                {formatDate(t.start_date)}
                {t.end_date && t.end_date !== t.start_date ? ` – ${formatDate(t.end_date)}` : ""}
              </p>

              <div style={{ marginTop: "0.9rem", display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
                <Link
                  href={`/tournaments/${t.slug}`}
                  style={{
                    display: "inline-block",
                    padding: "0.5rem 0.75rem",
                    border: "2px solid #000",
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    fontSize: "0.8rem",
                  }}
                >
                  View details
                </Link>

                <a
                  href={t.source_url}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    display: "inline-block",
                    padding: "0.5rem 0.75rem",
                    border: "2px solid #000",
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    fontSize: "0.8rem",
                  }}
                >
                  Official site
                </a>
              </div>
            </article>
          ))}
        </div>

        {tournaments.length === 0 && <p style={{ marginTop: "1rem", color: "#333" }}>No published tournaments yet.</p>}
      </section>
    </main>
  );
}
