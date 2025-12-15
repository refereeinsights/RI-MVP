import { supabase } from "../../../lib/supabaseClient";

export default async function TournamentDetailPage({ params }: { params: { slug: string } }) {
  const { data, error } = await supabase
    .from("tournaments")
    .select("name,city,state,start_date,end_date,summary,source_url")
    .eq("slug", params.slug)
    .single();

  if (error || !data) {
    return (
      <main style={{ padding: "2rem" }}>
        <h1>Tournament not found</h1>
        <p style={{ color: "#333" }}>This tournament may have been removed or the link is incorrect.</p>
      </main>
    );
  }

  return (
    <main style={{ padding: "2rem", display: "flex", justifyContent: "center" }}>
      <section style={{ maxWidth: 860, width: "100%" }}>
        <h1 style={{ margin: 0 }}>{data.name}</h1>
        <p style={{ marginTop: "0.5rem", color: "#333" }}>
          {data.city ? `${data.city}, ` : ""}{data.state}
        </p>

        <p style={{ marginTop: "1rem", color: "#333", lineHeight: 1.6 }}>
          {data.summary || "Tournament details sourced from public listings. More referee insights coming soon."}
        </p>

        <a
          href={data.source_url}
          target="_blank"
          rel="noreferrer"
          style={{
            display: "inline-block",
            marginTop: "1.25rem",
            padding: "0.75rem 1rem",
            border: "2px solid #000",
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            fontSize: "0.85rem",
          }}
        >
          Visit official site
        </a>
      </section>
    </main>
  );
}
// force-change Sun Dec 14 16:40:21 PST 2025 trying
