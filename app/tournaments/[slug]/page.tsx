import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import "../tournaments.css";

function formatDate(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export default async function TournamentDetailPage({
  params,
}: {
  params: { slug: string };
}) {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("tournaments")
    .select("name,city,state,start_date,end_date,summary,source_url,level,venue,address")
    .eq("slug", params.slug)
    .single();

  if (error || !data) {
    return (
      <main className="pitchWrap">
        <section className="field">
          <div className="headerBlock">
            <h1 className="title">Tournament not found</h1>
            <p className="subtitle">This tournament may have been removed or the link is incorrect.</p>
            <div style={{ marginTop: "1rem" }}>
              <Link className="btn" href="/tournaments">Back to tournaments</Link>
            </div>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="pitchWrap">
      <section className="field">
        <div className="breadcrumbs">
          <Link href="/tournaments">Tournaments</Link>
          <span>›</span>
          <span>{data.name}</span>
        </div>

        <div className="detailPanel">
          <h1 className="detailTitle">{data.name}</h1>

          <p className="detailMeta">
            <strong>{data.state}</strong>
            {data.city ? ` • ${data.city}` : ""}
            {data.level ? ` • ${data.level}` : ""}
          </p>

          <p className="detailMeta">
            {formatDate(data.start_date)}
            {data.end_date && data.end_date !== data.start_date ? ` – ${formatDate(data.end_date)}` : ""}
          </p>

          {(data.venue || data.address) && (
            <p className="detailMeta">
              {data.venue ? `${data.venue}` : ""}
              {data.venue && data.address ? " • " : ""}
              {data.address ? `${data.address}` : ""}
            </p>
          )}

          <p className="detailBody">
            {data.summary ||
              "Tournament details sourced from public listings. More referee insights coming soon."}
          </p>

          <div className="actions">
            <a className="btn" href={data.source_url} target="_blank" rel="noreferrer">
              Visit official site
            </a>
            <Link className="btn" href="/tournaments">
              Back to tournaments
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
