import { createClient } from "@supabase/supabase-js";

import { parseProvisionalPlaceIdentity } from "../../apps/corralio/lib/provisionalVenues";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) throw new Error("Required Supabase environment is missing");

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function allRows(table: string, columns: string) {
  const rows: unknown[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(table).select(columns).range(from, from + 999);
    if (error || !Array.isArray(data)) throw new Error("Coverage report query failed");
    rows.push(...data);
    if (data.length < 1000) return rows as Array<Record<string, unknown>>;
  }
}

async function main() {
  const [events, matches, provisional] = await Promise.all([
    allRows("corralio_events", "id,origin_type,source_location_text,display_location_text,location_lat,location_lng,location_geocoded_at"),
    allRows("corralio_event_venue_matches", "event_id,match_status,provisional_venue_id"),
    allRows("corralio_provisional_venues", "id,normalized_place_name,city,state,lifecycle_status"),
  ]);

  const matchByEvent = new Map(matches.flatMap((row) =>
    typeof row.event_id === "string" ? [[row.event_id, row] as const] : [],
  ));
  let successfullyGeocodedIcs = 0;
  let privateOrNonVenueExcluded = 0;
  let eligible = 0;
  let canonical = 0;
  let provisionalAssociated = 0;
  let unresolved = 0;

  for (const event of events) {
    if (
      event.origin_type !== "ics"
      || typeof event.id !== "string"
      || typeof event.location_lat !== "number"
      || typeof event.location_lng !== "number"
      || typeof event.location_geocoded_at !== "string"
    ) continue;
    successfullyGeocodedIcs += 1;
    const match = matchByEvent.get(event.id);
    const status = typeof match?.match_status === "string" ? match.match_status : null;
    const location = typeof event.source_location_text === "string"
      ? event.source_location_text
      : typeof event.display_location_text === "string" ? event.display_location_text : null;
    const identity = status === "private_skipped" || status === "insufficient_location"
      ? null
      : parseProvisionalPlaceIdentity(location);
    if (!identity) {
      privateOrNonVenueExcluded += 1;
      continue;
    }
    eligible += 1;
    if (status === "matched") canonical += 1;
    else if (status === "provisional") provisionalAssociated += 1;
    else unresolved += 1;
  }

  const active = provisional.filter((row) => row.lifecycle_status === "active");
  const groups = new Map<string, number>();
  for (const row of active) {
    if (typeof row.normalized_place_name !== "string" || typeof row.city !== "string" || typeof row.state !== "string") continue;
    const key = `${row.normalized_place_name}\0${row.city}\0${row.state}`;
    groups.set(key, (groups.get(key) ?? 0) + 1);
  }
  const potentialDuplicateRows = [...groups.values()].reduce((total, count) => total + (count > 1 ? count : 0), 0);
  const associatedProvisionalIds = new Set(matches.flatMap((row) =>
    typeof row.provisional_venue_id === "string" ? [row.provisional_venue_id] : [],
  ));
  const zeroAssociationProvisional = active.filter((row) => typeof row.id === "string" && !associatedProvisionalIds.has(row.id)).length;
  const percent = (value: number, denominator: number) => denominator ? Number((value * 100 / denominator).toFixed(2)) : 0;

  console.log(JSON.stringify({
    successfullyGeocodedIcs,
    privateOrNonVenueExcluded,
    eligibleNamedLocations: eligible,
    canonicalAssociations: canonical,
    provisionalAssociations: provisionalAssociated,
    unresolvedEligible: unresolved,
    canonicalMatchRatePercent: percent(canonical, eligible),
    provisionalCreationReuseRatePercent: percent(provisionalAssociated, eligible),
    venueIdentityCoveragePercent: percent(canonical + provisionalAssociated, eligible),
    unresolvedRatePercent: percent(unresolved, eligible),
    activeProvisionalVenues: active.length,
    potentialDuplicateRows,
    potentialDuplicateRatePercent: percent(potentialDuplicateRows, active.length),
    zeroAssociationProvisional,
  }, null, 2));
}

main().catch(() => {
  console.error("Corralio 4.4B coverage report failed");
  process.exitCode = 1;
});
