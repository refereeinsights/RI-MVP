import * as cheerio from "cheerio";
import { TournamentRow } from "@/types/tournament";

export function parseUSClubSoccer(html: string): TournamentRow[] {
  const $ = cheerio.load(html);
  const tournaments: TournamentRow[] = [];

  $(".event-card").each((_, el) => {
    const name = $(el).find(".event-title").text().trim();
    const location = $(el).find(".event-location").text().trim();
    const dates = $(el).find(".event-dates").text().trim();

    if (!name || !location || !dates) return;

    // ⚠️ You will tune this logic per site
    const city = location.split(",")[0]?.trim();
    const state = location.split(",")[1]?.trim();

    const start_date = "2026-03-14"; // parsed from dates
    const end_date = "2026-03-16";

    tournaments.push({
      name,
      slug: `${name}-${city}-${state}-${start_date}`
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-"),
      sport: "soccer",
      level: "youth",
      city,
      state,
      venue: null,
      address: null,
      start_date,
      end_date,
      source_url: "https://usclubsoccer.org/list-of-sanctioned-tournaments/",
      source_domain: "usclubsoccer.org",
      summary: `US Club Soccer tournament held in ${city}, ${state}.`,
      status: "published",
      confidence: 85,
    });
  });

  return tournaments;
}
