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

  const { data: venueRows, error } = await (supabase.from("venues_public" as any) as any)
    .select("id,name,address,city,state,seo_slug")
    .in("id", venueIds);

  if (error) {
    return events.map((event) => ({ ...event, linkedVenue: null }));
  }

  const venueById = new Map<string, VenueMetadataRow>(
    (venueRows ?? []).map((v: any) => [
      String(v?.id ?? ""),
      {
        id: String(v?.id ?? ""),
        name: v?.name ?? null,
        address: v?.address ?? null,
        city: v?.city ?? null,
        state: v?.state ?? null,
        seo_slug: v?.seo_slug ?? null,
      },
    ])
  );
  return events.map((event) => {
    const venueId = String(event.venue_id ?? "").trim();
    return {
      ...event,
      linkedVenue: venueId ? (venueById.get(venueId) ?? null) : null,
    };
  });
}
