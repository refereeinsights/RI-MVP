import Link from "next/link";
import { redirect } from "next/navigation";

import AdminNav from "@/components/admin/AdminNav";
import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

type LinkRow = {
  tournament_id: string | null;
  venue_id: string | null;
};

type TournamentRow = {
  id: string;
  name: string | null;
  city: string | null;
  state: string | null;
  start_date: string | null;
  end_date: string | null;
  slug: string | null;
};

type VenueRow = {
  id: string;
  name: string | null;
  city: string | null;
  state: string | null;
  venue_url: string | null;
};

type SuspiciousRow = {
  tournamentId: string;
  venueId: string;
  tournamentName: string | null;
  tournamentCity: string | null;
  tournamentState: string | null;
  tournamentSlug: string | null;
  venueName: string | null;
  venueCity: string | null;
  venueState: string | null;
  venueUrl: string | null;
  stateMismatch: boolean;
  distinctTournamentStates: number;
};

function normalizeState(value: string | null | undefined) {
  const v = String(value ?? "").trim().toUpperCase();
  return v || null;
}

function buildPath(q: string, notice?: string) {
  const params = new URLSearchParams();
  if (q.trim()) params.set("q", q.trim());
  if (notice) params.set("notice", notice);
  const qs = params.toString();
  return `/admin/venues/link-quality${qs ? `?${qs}` : ""}`;
}

async function unlinkVenueTournamentLinkAction(formData: FormData) {
  "use server";
  await requireAdmin();
  const tournamentId = String(formData.get("tournament_id") ?? "").trim();
  const venueId = String(formData.get("venue_id") ?? "").trim();
  const q = String(formData.get("q") ?? "").trim();
  if (!tournamentId || !venueId) {
    redirect(buildPath(q, "Missing tournament_id or venue_id."));
  }
  const { error } = await (supabaseAdmin.from("tournament_venues" as any) as any)
    .delete()
    .eq("tournament_id", tournamentId)
    .eq("venue_id", venueId);
  if (error) {
    redirect(buildPath(q, `Unlink failed: ${error.message}`));
  }
  redirect(buildPath(q, "Link removed."));
}

export default async function VenueLinkQualityPage({
  searchParams,
}: {
  searchParams?: { q?: string; notice?: string };
}) {
  await requireAdmin();
  const q = String(searchParams?.q ?? "").trim().toLowerCase();
  const notice = String(searchParams?.notice ?? "").trim();

	  const { data: linksRaw, error: linksErr } = await (supabaseAdmin
	    .from("tournament_venues" as any)
	    .select("tournament_id,venue_id")
	    .eq("is_inferred", false)
	    .limit(15000) as any);
  if (linksErr) {
    return (
      <main style={{ padding: 24 }}>
        <AdminNav />
        <h1 style={{ marginTop: 0 }}>Venue Link Quality</h1>
        <p style={{ color: "#b91c1c" }}>Failed to load tournament_venues: {linksErr.message}</p>
      </main>
    );
  }

  const links = ((linksRaw ?? []) as LinkRow[]).filter((row) => row.tournament_id && row.venue_id) as Array<{
    tournament_id: string;
    venue_id: string;
  }>;

  const tournamentIds = Array.from(new Set(links.map((l) => l.tournament_id)));
  const venueIds = Array.from(new Set(links.map((l) => l.venue_id)));

  const [tournamentsRes, venuesRes] = await Promise.all([
    (supabaseAdmin
      .from("tournaments" as any)
      .select("id,name,city,state,start_date,end_date,slug")
      .in("id", tournamentIds)
      .limit(15000) as any),
    (supabaseAdmin
      .from("venues" as any)
      .select("id,name,city,state,venue_url")
      .in("id", venueIds)
      .limit(15000) as any),
  ]);

  const tournaments = (tournamentsRes.data ?? []) as TournamentRow[];
  const venues = (venuesRes.data ?? []) as VenueRow[];
  const tournamentById = new Map(tournaments.map((t) => [t.id, t]));
  const venueById = new Map(venues.map((v) => [v.id, v]));

  const statesByVenue = new Map<string, Set<string>>();
  for (const link of links) {
    const t = tournamentById.get(link.tournament_id);
    if (!t) continue;
    const state = normalizeState(t.state);
    if (!state) continue;
    const set = statesByVenue.get(link.venue_id) ?? new Set<string>();
    set.add(state);
    statesByVenue.set(link.venue_id, set);
  }

  const rows = links
    .map((link) => {
      const tournament = tournamentById.get(link.tournament_id);
      const venue = venueById.get(link.venue_id);
      if (!tournament || !venue) return null;
      const tState = normalizeState(tournament.state);
      const vState = normalizeState(venue.state);
      const mismatch = Boolean(tState && vState && tState !== vState);
      const distinctTournamentStates = statesByVenue.get(venue.id)?.size ?? 0;
      const highFanout = distinctTournamentStates >= 3;
      if (!mismatch && !highFanout) return null;
      const searchable = [
        tournament.name,
        tournament.city,
        tournament.state,
        venue.name,
        venue.city,
        venue.state,
        link.tournament_id,
        link.venue_id,
      ]
        .map((s) => String(s ?? "").toLowerCase())
        .join(" ");
      if (q && !searchable.includes(q)) return null;
      return {
        tournamentId: link.tournament_id,
        venueId: link.venue_id,
        tournamentName: tournament.name,
        tournamentCity: tournament.city,
        tournamentState: tournament.state,
        tournamentSlug: tournament.slug,
        venueName: venue.name,
        venueCity: venue.city,
        venueState: venue.state,
        venueUrl: venue.venue_url,
        stateMismatch: mismatch,
        distinctTournamentStates,
      };
    })
    .filter((row): row is SuspiciousRow => Boolean(row))
    .sort((a, b) => {
      if (a.stateMismatch !== b.stateMismatch) return a.stateMismatch ? -1 : 1;
      return b.distinctTournamentStates - a.distinctTournamentStates;
    })
    .slice(0, 500);

  const mismatchCount = rows.filter((r) => r.stateMismatch).length;
  const fanoutCount = rows.filter((r) => !r.stateMismatch && r.distinctTournamentStates >= 3).length;

  return (
    <main style={{ padding: 24 }}>
      <AdminNav />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, gap: 10, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0 }}>Venue Link Quality</h1>
          <p style={{ margin: "4px 0 0", color: "#475569" }}>
            Review suspicious tournament↔venue links (state mismatch + high multi-state fanout).
          </p>
        </div>
        <Link href="/admin/venues" style={{ textDecoration: "none", fontWeight: 700 }}>
          Back to Venues
        </Link>
      </div>

      {notice ? (
        <p style={{ margin: "0 0 10px", padding: "8px 10px", borderRadius: 8, background: "#eff6ff", border: "1px solid #bfdbfe" }}>
          {notice}
        </p>
      ) : null}

      <form style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <input
          name="q"
          defaultValue={q}
          placeholder="Search venue/tournament/id"
          style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #dbe4ef", minWidth: 280 }}
        />
        <button type="submit">Search</button>
        <Link href="/admin/venues/link-quality">Clear</Link>
      </form>

      <p style={{ margin: "0 0 10px", fontSize: 13, color: "#334155" }}>
        Showing {rows.length} suspicious links • state mismatch: <strong>{mismatchCount}</strong> • high fanout:{" "}
        <strong>{fanoutCount}</strong>
      </p>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1100 }}>
          <thead>
            <tr>
              {[
                "Reason",
                "Tournament",
                "Tournament State",
                "Venue",
                "Venue State",
                "Venue fanout states",
                "Venue URL",
                "Actions",
              ].map((head) => (
                <th key={head} style={{ textAlign: "left", borderBottom: "1px solid #e5e7eb", padding: "8px 6px", fontSize: 12 }}>
                  {head}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.tournamentId}:${row.venueId}`}>
                <td style={{ borderBottom: "1px solid #f1f5f9", padding: "8px 6px", fontSize: 12 }}>
                  {row.stateMismatch ? "state_mismatch" : "high_fanout_multi_state"}
                </td>
                <td style={{ borderBottom: "1px solid #f1f5f9", padding: "8px 6px", fontSize: 12 }}>
                  <div style={{ fontWeight: 700 }}>{row.tournamentName ?? row.tournamentId}</div>
                  <div style={{ fontFamily: "monospace", color: "#64748b" }}>{row.tournamentId}</div>
                  {row.tournamentSlug ? (
                    <div>
                      <a href={`/tournaments/${row.tournamentSlug}`} target="_blank" rel="noreferrer">
                        Open tournament
                      </a>
                    </div>
                  ) : null}
                </td>
                <td style={{ borderBottom: "1px solid #f1f5f9", padding: "8px 6px", fontSize: 12 }}>
                  {[row.tournamentCity, row.tournamentState].filter(Boolean).join(", ") || "—"}
                </td>
                <td style={{ borderBottom: "1px solid #f1f5f9", padding: "8px 6px", fontSize: 12 }}>
                  <div style={{ fontWeight: 700 }}>{row.venueName ?? row.venueId}</div>
                  <div style={{ fontFamily: "monospace", color: "#64748b" }}>{row.venueId}</div>
                  <div>
                    <a href={`/admin/venues/${row.venueId}`} target="_blank" rel="noreferrer">
                      Open venue admin
                    </a>
                  </div>
                </td>
                <td style={{ borderBottom: "1px solid #f1f5f9", padding: "8px 6px", fontSize: 12 }}>
                  {[row.venueCity, row.venueState].filter(Boolean).join(", ") || "—"}
                </td>
                <td style={{ borderBottom: "1px solid #f1f5f9", padding: "8px 6px", fontSize: 12 }}>{row.distinctTournamentStates}</td>
                <td style={{ borderBottom: "1px solid #f1f5f9", padding: "8px 6px", fontSize: 12 }}>
                  {row.venueUrl ? (
                    <a href={row.venueUrl} target="_blank" rel="noreferrer">
                      Venue URL
                    </a>
                  ) : (
                    "—"
                  )}
                </td>
                <td style={{ borderBottom: "1px solid #f1f5f9", padding: "8px 6px" }}>
                  <form action={unlinkVenueTournamentLinkAction}>
                    <input type="hidden" name="tournament_id" value={row.tournamentId} />
                    <input type="hidden" name="venue_id" value={row.venueId} />
                    <input type="hidden" name="q" value={q} />
                    <button type="submit" style={{ fontSize: 12 }}>
                      Unlink
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
