import type { PlannerEventRow } from "@/lib/planner/types";

type PlannerEventVenueRef = Pick<PlannerEventRow, "venue_id">;

type VenueMetadataRow = {
  id: string;
  name: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  seo_slug: string | null;
};

export async function enrichPlannerEventsWithLinkedVenue<
  TEvent extends PlannerEventVenueRef,
>(supabase: any, events: readonly TEvent[]): Promise<Array<TEvent & { linkedVenue: VenueMetadataRow | null }>> {
  if (!events.length) {
    return events.map((event) => ({ ...event, linkedVenue: null }));
  }

  const venueIds = Array.from(
    new Set(
      events
        .map((event) => String(event.venue_id ?? "").trim())
        .filter(Boolean)
    )
  ).slice(0, 500);

  if (!venueIds.length) {
    return events.map((event) => ({ ...event, linkedVenue: null }));
  }

  const { data: publicVenueRows, error } = await (supabase.from("venues_public" as any) as any)
    .select("id,name,address,city,state")
    .in("id", venueIds);

  if (error) {
    return events.map((event) => ({ ...event, linkedVenue: null }));
  }

  const venueById = new Map<string, VenueMetadataRow>(
    (publicVenueRows ?? []).map((v: any) => [
      String(v?.id ?? ""),
      {
        id: String(v?.id ?? ""),
        name: v?.name ?? null,
        address: v?.address ?? null,
        city: v?.city ?? null,
        state: v?.state ?? null,
        seo_slug: null,
      },
    ])
  );

  const unresolvedVenueIds = venueIds.filter((venueId) => !venueById.has(venueId));
  if (unresolvedVenueIds.length) {
    const { data: privateVenueRows, error: privateVenueError } = await (supabase.from("venues" as any) as any)
      .select("id,name,address,city,state,seo_slug")
      .in("id", unresolvedVenueIds);

    if (!privateVenueError) {
      for (const venueRow of privateVenueRows ?? []) {
        const venueId = String(venueRow?.id ?? "").trim();
        if (!venueId || venueById.has(venueId)) continue;
        venueById.set(venueId, {
          id: venueId,
          name: venueRow?.name ?? null,
          address: venueRow?.address ?? null,
          city: venueRow?.city ?? null,
          state: venueRow?.state ?? null,
          seo_slug: venueRow?.seo_slug ?? null,
        });
      }
    }
  }

  return events.map((event) => {
    const venueId = String(event.venue_id ?? "").trim();
    return {
      ...event,
      linkedVenue: venueId ? (venueById.get(venueId) ?? null) : null,
    };
  });
}
