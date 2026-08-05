import { buildSharedVenueFromRow, isUuidLike, parseLegacyVenueAddressSlug } from "./normalize";
import type { SharedVenueDbClient, SharedVenueResolution, SharedVenueServiceOptions, SharedVenueSourceRow } from "./types";

const BASE_SELECT_WITH_COORDINATES =
  "id,seo_slug,name,address,city,state,zip,latitude,longitude,notes,venue_url,sport,restroom_cleanliness_avg,shade_score_avg,vendor_score_avg,parking_convenience_score_avg,review_count,reviews_last_updated_at,tournament_venues(is_inferred,tournaments(id,slug,name,sport,city,state,start_date,end_date))";
const BASE_SELECT_FALLBACK =
  "id,seo_slug,name,address,city,state,zip,notes,venue_url,sport,restroom_cleanliness_avg,shade_score_avg,vendor_score_avg,parking_convenience_score_avg,review_count,reviews_last_updated_at,tournament_venues(is_inferred,tournaments(id,slug,name,sport,city,state,start_date,end_date))";

async function maybeSelectSingle(db: SharedVenueDbClient, predicate: (query: any) => any) {
  const primary = await predicate(db.from("venues").select(BASE_SELECT_WITH_COORDINATES)).maybeSingle();
  const primaryCode = (primary as any)?.error?.code;
  if (!primary.error) return (primary.data as SharedVenueSourceRow | null) ?? null;
  if (primaryCode === "42703" || primaryCode === "PGRST204") {
    const fallback = await predicate(db.from("venues").select(BASE_SELECT_FALLBACK)).maybeSingle();
    return fallback.error ? null : ((fallback.data as SharedVenueSourceRow | null) ?? null);
  }
  return null;
}

async function maybeSelectMany(db: SharedVenueDbClient, predicate: (query: any) => any) {
  const primary = await predicate(db.from("venues").select(BASE_SELECT_WITH_COORDINATES));
  const primaryCode = (primary as any)?.error?.code;
  if (!primary.error) return (primary.data as SharedVenueSourceRow[] | null) ?? [];
  if (primaryCode === "42703" || primaryCode === "PGRST204") {
    const fallback = await predicate(db.from("venues").select(BASE_SELECT_FALLBACK));
    return fallback.error ? [] : ((fallback.data as SharedVenueSourceRow[] | null) ?? []);
  }
  return [];
}

export async function resolveSharedVenueByParam(
  db: SharedVenueDbClient,
  param: string,
  options: SharedVenueServiceOptions = {}
): Promise<SharedVenueResolution> {
  const bySlug = await maybeSelectSingle(db, (query) => query.eq("seo_slug", param));
  if (bySlug?.id) {
    return {
      venue: buildSharedVenueFromRow(bySlug),
      sourceRow: bySlug,
      canonicalParam: null,
    };
  }

  if (isUuidLike(param)) {
    const byId = await maybeSelectSingle(db, (query) => query.eq("id", param));
    if (byId?.id) {
      const venue = buildSharedVenueFromRow(byId);
      return {
        venue,
        sourceRow: byId,
        canonicalParam: venue.seoSlug && venue.seoSlug !== param ? venue.routeKey : null,
      };
    }
  }

  if (options.allowLegacyAddressSlugLookup) {
    const legacy = parseLegacyVenueAddressSlug(param);
    if (legacy) {
      const candidates = await maybeSelectMany(db, (query) => {
        let next = query.eq("state", legacy.state).ilike("address", `%${legacy.number}%`);
        if (legacy.keyword) next = next.ilike("address", `%${legacy.keyword}%`);
        return next.limit(5);
      });
      const chosen = candidates[0] ?? null;
      if (chosen?.id) {
        const venue = buildSharedVenueFromRow(chosen);
        return {
          venue,
          sourceRow: chosen,
          canonicalParam: venue.routeKey,
        };
      }
    }
  }

  return { venue: null, sourceRow: null, canonicalParam: null };
}
