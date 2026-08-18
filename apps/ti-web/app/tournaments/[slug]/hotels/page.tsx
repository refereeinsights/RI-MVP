import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getTournamentHotelProgram } from "@/lib/lodging/tournamentHotelProgram";
import { issueTournamentHotelContext } from "@/lib/lodging/tournamentHotelContext";
import {
  formatTournamentDateRange,
  initialTournamentHotelDates,
  searchableTournamentHotelVenues,
  selectInitialTournamentHotelVenue,
  tournamentHotelsSeoEligible,
  type TournamentHotelsVenue,
} from "@/lib/lodging/tournamentHotels";
import TournamentHotelsClient from "./TournamentHotelsClient";
import styles from "./TournamentHotels.module.css";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type TournamentRow = {
  id: string;
  slug: string | null;
  name: string;
  sport: string | null;
  start_date: string | null;
  end_date: string | null;
  city: string | null;
  state: string | null;
  updated_at?: string | null;
};

type VenueLinkRow = {
  is_primary?: boolean | null;
  created_at?: string | null;
  venues?: {
    id: string;
    name: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
    latitude: number | null;
    longitude: number | null;
    timezone: string | null;
  } | null;
};

async function loadTournamentHotelsPage(slug: string) {
  const { data: tournament } = await supabaseAdmin
    .from("tournaments_public" as any)
    .select("id,slug,name,sport,start_date,end_date,city,state,updated_at")
    .eq("slug", slug)
    .maybeSingle<TournamentRow>();

  if (!tournament?.id) return null;

  const { data: venueLinks, error: venueError } = await supabaseAdmin
    .from("tournament_venues" as any)
    .select("is_primary,created_at,venues(id,name,address,city,state,zip,latitude,longitude,timezone)")
    .eq("tournament_id", tournament.id)
    .eq("is_inferred", false)
    .order("is_primary", { ascending: false })
    .order("created_at", { ascending: true });

  if (venueError) throw new Error(`Unable to load confirmed tournament venues: ${venueError.message}`);

  const venues: TournamentHotelsVenue[] = ((venueLinks as VenueLinkRow[] | null) ?? [])
    .map((row, order) => {
      const venue = row.venues;
      if (!venue?.id) return null;
      return {
        id: venue.id,
        name: venue.name,
        address: venue.address,
        city: venue.city,
        state: venue.state,
        zip: venue.zip,
        latitude: venue.latitude,
        longitude: venue.longitude,
        timezone: venue.timezone,
        isPrimary: Boolean(row.is_primary),
        order,
      } satisfies TournamentHotelsVenue;
    })
    .filter((venue): venue is TournamentHotelsVenue => Boolean(venue));

  return { tournament, venues };
}

function metadataDescription(name: string) {
  return `Find hotels near the tournament venues for ${name}. Compare lodging near where games are played and plan your tournament weekend.`;
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const data = await loadTournamentHotelsPage(params.slug);
  if (!data) {
    return { title: "Tournament Hotels Not Found", robots: { index: false, follow: false } };
  }

  const qualified = tournamentHotelsSeoEligible({
    status: "published",
    name: data.tournament.name,
    city: data.tournament.city,
    state: data.tournament.state,
    startDate: data.tournament.start_date,
    venues: data.venues,
  });
  const canonical = `/tournaments/${data.tournament.slug ?? params.slug}/hotels`;
  const title = `Hotels near ${data.tournament.name} | TournamentInsights`;
  const description = metadataDescription(data.tournament.name);

  return {
    title: { absolute: title },
    description,
    alternates: { canonical },
    robots: qualified ? { index: true, follow: true } : { index: false, follow: true },
    openGraph: { title, description, type: "website", url: canonical, siteName: "TournamentInsights" },
  };
}

export default async function TournamentHotelsPage({ params }: { params: { slug: string } }) {
  const data = await loadTournamentHotelsPage(params.slug);
  if (!data) notFound();

  const { tournament, venues } = data;
  const searchableVenues = searchableTournamentHotelVenues(venues);
  const initialVenue = selectInitialTournamentHotelVenue(venues);
  const initialDates = initialTournamentHotelDates({ startDate: tournament.start_date, endDate: tournament.end_date });
  const tournamentContext = issueTournamentHotelContext(tournament.id);
  const todayUtc = new Date().toISOString().slice(0, 10);
  const tournamentCompleted = Boolean(tournament.end_date && tournament.end_date < todayUtc);
  const program = await getTournamentHotelProgram(
    tournament.id,
    initialVenue?.id ?? null,
    !initialVenue && Boolean(tournamentContext),
    tournamentCompleted
  );
  const location = [tournament.city, tournament.state].filter(Boolean).join(", ");
  const canonicalSlug = tournament.slug ?? params.slug;

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <nav className={styles.breadcrumbs} aria-label="Tournament navigation">
          <Link href={`/tournaments/${encodeURIComponent(canonicalSlug)}`}>Tournament</Link>
          <span aria-hidden="true">/</span>
          <Link href={`/tournaments/${encodeURIComponent(canonicalSlug)}/map`}>Map</Link>
          <span aria-current="page">Hotels</span>
        </nav>

        <header className={styles.header}>
          <p className={styles.eyebrow}>Tournament lodging</p>
          <h1>Hotels for {tournament.name}</h1>
          <p className={styles.context}>
            {formatTournamentDateRange(tournament.start_date, tournament.end_date)}
            {location ? ` · ${location}` : ""}
          </p>
          <p>Compare live lodging options near the fields where your team will play.</p>
        </header>

        <TournamentHotelsClient
          tournament={{
            id: tournament.id,
            slug: canonicalSlug,
            name: tournament.name,
            sport: tournament.sport,
            city: tournament.city,
            state: tournament.state,
            startDate: tournament.start_date,
            endDate: tournament.end_date,
          }}
          venues={venues}
          searchableVenues={searchableVenues}
          initialVenueId={initialVenue?.id ?? null}
          initialDates={initialDates}
          showTournamentSupportDisclosure={program.showTournamentSupportDisclosure}
          tournamentContext={tournamentContext}
        />
      </div>
    </main>
  );
}
