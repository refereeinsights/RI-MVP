export function getVenueHref(venue: { seo_slug?: string | null; id: string }) {
  return `/venues/${venue.seo_slug || venue.id}`;
}

