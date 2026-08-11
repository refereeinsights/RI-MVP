export const TEAM_HOTEL_REQUEST_DEFAULTS = {
  minRooms: 5,
  defaultAdultsPerRoom: 2,
  defaultChildrenPerRoom: 0,
} as const;

export function parseTeamHotelRoomCount(value: unknown): number {
  const rooms = Number(value);
  if (!Number.isSafeInteger(rooms) || rooms < TEAM_HOTEL_REQUEST_DEFAULTS.minRooms) {
    throw new Error(`Enter at least ${TEAM_HOTEL_REQUEST_DEFAULTS.minRooms} rooms for a team hotel request.`);
  }
  return rooms;
}
