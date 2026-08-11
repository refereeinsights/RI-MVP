export type TeamHotelTournamentCalloutConfig = {
  headline: string;
  label: string;
  target: "_blank";
  rel: "noopener noreferrer";
  title: string;
};

export function buildTeamHotelTournamentCalloutConfig(): TeamHotelTournamentCalloutConfig {
  return {
    headline: "Booking rooms for the whole team?",
    label: "Request a team hotel block →",
    target: "_blank",
    rel: "noopener noreferrer",
    title: "Request a team hotel block",
  };
}
