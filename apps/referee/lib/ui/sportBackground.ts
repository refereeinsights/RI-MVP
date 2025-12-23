export function getSportCardClass(sport: string | null | undefined): string {
  const key = (sport ?? "").toLowerCase().trim();
  switch (key) {
    case "soccer":
      return "bg-sport-soccer";
    case "basketball":
      return "bg-sport-basketball";
    case "baseball":
      return "bg-sport-baseball";
    case "football":
      return "bg-sport-football";
    default:
      return "bg-sport-default";
  }
}
