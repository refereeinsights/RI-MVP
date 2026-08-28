export const GENERIC_HOTEL_SEARCH_SOURCES = [
  "book_travel",
  "weekend_planner",
  "referee_travel",
] as const;

export type GenericHotelSearchSource = (typeof GENERIC_HOTEL_SEARCH_SOURCES)[number];

export function isGenericHotelSearchSource(value: string | null): value is GenericHotelSearchSource {
  return GENERIC_HOTEL_SEARCH_SOURCES.includes(value as GenericHotelSearchSource);
}
