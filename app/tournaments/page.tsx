import Link from "next/link";
import { supabase } from "../../lib/supabaseClient";
import "./tournaments.css";

type Tournament = {
  id: string;
  name: string;
  slug: string;
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
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function monthOptions(count = 9) {
  const out: { value: string; label: string }[] = [];
  const now = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
    out.push({ value, label });
  }
  return out;
}

export default async function TournamentsPage({
  searchParams,
}: {
  searchParams?: { q?: string; state?: string; month?: string };
}) {
  const q = (searchParams?.q ?? "").trim();
  const state = (searchParams?.state ?? "").trim().toUpperCase();
  const month = (searchParams?.month ?? "").trim(); // YYYY-MM

  let query = supabase
    .from("tournaments")
    .select("id,name,slug,level,state,city,start_date,end_date,source_url,status,is_canonical")
    .eq("status", "published")
    .eq("is_canonical", true)
    .order("start_date", { ascending: true });

  if (state === "WA" || state === "OR" || state === "CA") {
    query = query.eq("state", state);
  }

  if (q) {
    // simple name/city search (Supabase OR syntax)
    // Note: this uses ilike for partial matches
    query = query.or(`name.ilike.%${q}%,city.ilike.%${q}%`);
  }

  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const [y, m] = month.split("-").map(Number);
    const start = new Date(y, m - 1, 1);
    const end = new Date(y, m, 1);
    const startISO = start.toISOString().slice(0, 10);
    const endISO = end.toISOString().slice(0, 10);
    query = query.gte("start_date", startISO).lt("start_date", endISO);
  }

  const { data, error } = await query;

  if (error) {
    return (
      <main className="pitchWrap">
        <section className="field">
          <div className="headerBlock">
            <h1 className="title">Upcoming Tournaments</h1>
            <p className="subtitle">
              Error loading tournaments: <code>{error.message}</code>
            </p>
          </div>
        </section>
      </main>
    );
  }

  const tournaments = (data ?? []) as Tournament[];
  const months = monthOptions(9);

  return (
    <main className="pitchWrap">
      <section className="field">
        <div className="headerBlock">
          <h1 className="title">Upcoming Tournaments</h1>
          <p className="subtitle">
            West Coast soccer tournaments from public listings. Dates and details may change—always confirm on the official site.
          </p>
        </div>

        {/* Filters */}
        <form className="filters" method="GET" action="/tournaments">
          <div>
            <label className="label" htmlFor="q">Search</label>
            <input
              id="q"
              name="q"
              className="input"
              placeholder="Tournament name or city"
              defaultValue={q}
            />
          </div>

          <div>
            <label className="label" htmlFor="state">State</label>
            <select id="state" name="state" className="select" defaultValue={state}>
              <option value="">All</option>
              <option value="WA">WA</option>
              <option value="OR">OR</option>
              <option value="CA">CA</option>
            </select>
          </div>

          <div>
            <label className="label" htmlFor="month">Month</label>
            <select id="month" name="month" className="select" defaultValue={month}>
              <option value="">Any</option>
              {months.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>

          <div className="actionsRow">
            <button className="smallBtn" type="submit">Apply</button>
            <a className="smallBtn" href="/tournaments">Reset</a>
          </div>
        </form>

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
                {t.end_date && t.end_date !== t.start_date ? ` – ${formatDate(t.end_date)}` : ""}
              </p>

              <div className="actions">
                <Link className="btn" href={`/tournaments/${t.slug}`}>View details</Link>
                <a className="btn" href={t.source_url} target="_blank" rel="noreferrer">Official site</a>
              </div>
            </article>
          ))}
        </div>

        {tournaments.length === 0 && (
          <p className="empty">No tournaments match those filters yet.</p>
        )}
      </section>
    </main>
  );
}
