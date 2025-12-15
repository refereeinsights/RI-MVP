export async function fetchUSClubSoccerTournaments() {
  const url = "https://usclubsoccer.org/list-of-sanctioned-tournaments/"; // example

  const res = await fetch(url, {
    headers: {
      "User-Agent": "RefereeInsightsBot/1.0",
    },
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error("Failed to fetch US Club Soccer tournaments");
  }

  const html = await res.text();
  return html;
}
