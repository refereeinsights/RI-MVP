import Link from "next/link";

import AdminNav from "@/components/admin/AdminNav";
import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import RunDiscovery from "@/app/admin/tournaments/sources/discover/RunDiscovery";

export const runtime = "nodejs";

type PageProps = {
  searchParams?: {
    q?: string;
    venue_id?: string;
  };
};

function buildVenueQueries(args: {
  name: string;
  city: string | null;
  state: string | null;
  sport: string | null;
}) {
  const clean = (v: string | null | undefined) => String(v ?? "").trim();
  const name = clean(args.name);
  const city = clean(args.city);
  const state = clean(args.state);
  const sport = clean(args.sport).toLowerCase();

  const quotedName = `"${name.replace(/"/g, "").trim()}"`;
  const place = [city, state].filter(Boolean).join(", ");
  const sportWord = sport && sport !== "other" ? sport : "";

  const base = [
    `${quotedName} tournament`,
    place ? `${quotedName} tournament ${place}` : null,
    sportWord ? `${quotedName} ${sportWord} tournament` : null,
    sportWord && place ? `${quotedName} ${sportWord} tournament ${place}` : null,
  ].filter(Boolean) as string[];

  const siteQueries = [
    `site:usssa.com ${quotedName}`,
    `site:perfectgame.org ${quotedName}`,
    `site:gotsport.com ${quotedName}`,
    `site:gotsoccer.com ${quotedName}`,
    `site:tourneymachine.com ${quotedName}`,
    `site:exposureevents.com ${quotedName}`,
    `site:leagueapps.com ${quotedName}`,
    `site:sportsengine.com ${quotedName}`,
  ];

  // Keep queries reasonably short (Brave limit is 400 chars); avoid appending huge negative filters here.
  const queries = [...base, ...siteQueries].map((q) => q.trim()).filter(Boolean);
  return Array.from(new Set(queries));
}

export default async function AdminVenueSweepPage({ searchParams }: PageProps) {
  await requireAdmin();

  const q = String(searchParams?.q ?? "").trim();
  const venueId = String(searchParams?.venue_id ?? "").trim();

  const selectedVenue = venueId
    ? await supabaseAdmin
        .from("venues" as any)
        .select("id,name,city,state,sport,venue_url")
        .eq("id", venueId)
        .maybeSingle()
    : null;

  const venue = selectedVenue?.data
    ? (selectedVenue.data as {
        id: string;
        name: string | null;
        city: string | null;
        state: string | null;
        sport: string | null;
        venue_url: string | null;
      })
    : null;

  const results =
    !venue && q
      ? await supabaseAdmin
          .from("venues" as any)
          .select("id,name,city,state,sport,venue_url")
          .ilike("name", `%${q}%`)
          .order("created_at", { ascending: false })
          .limit(30)
      : null;

  const queries = venue
    ? buildVenueQueries({
        name: venue.name || venue.id,
        city: venue.city,
        state: venue.state,
        sport: venue.sport,
      })
    : [];

  return (
    <div style={{ padding: 24 }}>
      <AdminNav />
      <h1 style={{ margin: 0 }}>Venue sweep (discover tournaments)</h1>
      <p style={{ margin: "6px 0 14px", color: "#4b5563" }}>
        Search from a venue outward using Atlas, then save discovered URLs into <code>tournament_sources</code> for the existing review pipeline.
      </p>

      <form action="/admin/venues/sweep" method="get" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <input
          name="q"
          defaultValue={q}
          placeholder="Search venue name..."
          style={{ padding: "10px 12px", border: "1px solid #e5e7eb", borderRadius: 10, minWidth: 280 }}
        />
        <button type="submit" style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #e5e7eb" }}>
          Search
        </button>
        {venue ? (
          <Link href="/admin/venues/sweep" style={{ color: "#6b7280", textDecoration: "none", marginLeft: 6 }}>
            Clear
          </Link>
        ) : null}
      </form>

      {venue ? (
        <div style={{ marginTop: 14, border: "1px solid #e5e7eb", borderRadius: 12, padding: 12 }}>
          <div style={{ fontWeight: 900 }}>{venue.name ?? "Venue"}</div>
          <div style={{ color: "#6b7280", fontSize: 13 }}>
            {venue.city ?? "—"}, {venue.state ?? "—"} {venue.sport ? `• ${venue.sport}` : ""}
          </div>
          <div style={{ marginTop: 10 }}>
            <RunDiscovery
              queries={queries}
              sportOptions={["__ANY__", "soccer", "futsal", "basketball", "baseball", "softball", "lacrosse", "volleyball", "football", "wrestling", "hockey", "other"]}
              sourceTypeOptions={["__ANY__", "venue_calendar", "platform_listing", "directory", "club", "league", "governing_body", "other"]}
              defaultTarget="tournament"
              venueId={venue.id}
              defaultState={venue.state}
              defaultSport={venue.sport && venue.sport !== "other" ? venue.sport : "__ANY__"}
              defaultSourceType="venue_calendar"
            />
          </div>
        </div>
      ) : null}

      {!venue && results?.data?.length ? (
        <div style={{ marginTop: 14, border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden" }}>
          <div style={{ padding: 10, background: "#f9fafb", fontWeight: 800 }}>Select a venue</div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f3f4f6" }}>
                {["Venue", "City/State", "Sport", ""].map((h) => (
                  <th key={h} style={{ textAlign: "left", padding: 8, fontSize: 12, color: "#374151", borderBottom: "1px solid #e5e7eb" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {results.data.map((r: any) => (
                <tr key={r.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                  <td style={{ padding: 8, fontWeight: 800 }}>{r.name ?? r.id}</td>
                  <td style={{ padding: 8, fontSize: 13 }}>
                    {(r.city ?? "").trim() || "—"}, {(r.state ?? "").trim() || "—"}
                  </td>
                  <td style={{ padding: 8, fontFamily: "monospace", fontSize: 12 }}>{r.sport ?? "—"}</td>
                  <td style={{ padding: 8 }}>
                    <Link
                      href={`/admin/venues/sweep?venue_id=${encodeURIComponent(r.id)}`}
                      style={{ padding: "6px 10px", borderRadius: 10, border: "1px solid #e5e7eb", textDecoration: "none" }}
                    >
                      Select
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

