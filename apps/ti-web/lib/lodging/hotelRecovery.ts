export function tournamentHotelRecoveryCopy(hasContextualHandoff: boolean) {
  return hasContextualHandoff
    ? {
        heading: "Find available hotels for your tournament",
        body: "Search live availability with our hotel partner.",
        cta: "Find Hotels Near the Venue",
        href: null,
      }
    : {
        heading: "Find hotels for your sports trip",
        body: "Search by city, venue, or event location—even when the event is not listed on TournamentInsights.",
        cta: "Find Hotels",
        href: "/book-travel",
      };
}
