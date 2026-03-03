import ListYourTournamentForm from "./ListYourTournamentForm";

export const metadata = {
  title: "List Your Tournament",
  description: "Submit your event so families and teams can find dates, locations, and official information in one place.",
  alternates: { canonical: "/list-your-tournament" },
};

export default function ListYourTournamentPage() {
  return <ListYourTournamentForm />;
}
