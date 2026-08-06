export type TeamHotelTournamentCalloutConfig = {
  headline: string;
  label: string;
  target: "_blank";
  rel: "noopener noreferrer";
  title: string;
};

export function buildTeamHotelTournamentCalloutConfig(): TeamHotelTournamentCalloutConfig {
  return {
    headline: "Booking 5+ rooms for the team?",
    label: "Request team hotel options →",
    target: "_blank",
    rel: "noopener noreferrer",
    title: "Request team hotel options",
  };
}
