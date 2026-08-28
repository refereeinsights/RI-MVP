import type { Metadata } from "next";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { resolveSharedVenueByParam } from "../../../../packages/lib/venue";
import TravelSearchClient from "./TravelSearchClient";
import styles from "./travel.module.css";

export const metadata: Metadata = {
  title: "Hotels for Referee Travel | RefereeInsights",
  description: "Find hotels near a tournament venue or search another destination for your next referee trip.",
  alternates: { canonical: "/travel" },
};

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function TravelPage({ searchParams }: { searchParams?: { venue_id?: string | string[] } }) {
  const rawVenueId = typeof searchParams?.venue_id === "string" ? searchParams.venue_id.trim() : "";
  const resolved = rawVenueId && UUID_RE.test(rawVenueId)
    ? await resolveSharedVenueByParam(supabaseAdmin, rawVenueId)
    : null;
  const venue = resolved?.sourceRow?.id ? {
    id: resolved.sourceRow.id,
    name: resolved.sourceRow.name?.trim() || "Selected venue",
    destinationLabel: resolved.sourceRow.address?.trim() || [
      resolved.sourceRow.city,
      resolved.sourceRow.state,
      resolved.sourceRow.zip,
    ].filter(Boolean).join(", "),
  } : null;

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <p className={styles.eyebrow}>Referee travel</p>
        <h1>Find hotels near your next assignment</h1>
        <p>Stay close to the venue, keep the drive short, and find a room that works for your officiating trip.</p>
      </section>
      <TravelSearchClient venue={venue} />
      <p className={styles.disclosure}>
        RefereeInsights may earn a commission when you book through a hotel link, at no additional cost to you.
      </p>
    </main>
  );
}
