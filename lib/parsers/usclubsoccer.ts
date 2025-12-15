import * as cheerio from "cheerio";
import { TournamentRow } from "@/lib/types/tournament";
import { buildTournamentSlug } from "@/lib/tournaments/slug";

const SOURCE_URL =
  "https://usclubsoccer.org/list-of-sanctioned-tournaments/";
const SOURCE_DOMAIN = "usclubsoccer.org";

export function parseUSClubSoccer(html: string): TournamentRow[] {
  const $ = cheerio.load(html);
  const tournaments: TournamentRow[] = [];

  $(".event-card").each((index, el) => {
    const name = $(el).find(".event-title").text().trim();
    const location = $(el).find(".event-location").text().trim();
    const dates = $(el).find(".event-dates").text().trim();

    if (!name || !location || !dates) return;

    const [cityRaw, stateRaw] = location.split(",");
    const city = cityRaw?.trim() || null;
    const state = stateRaw?.trim() || null;

    /**
     * Phase-1 MVP assumption:
     * - Dates are parsed upstream or fixed per card
     * - Replace this with real parsing when stable
     */
    const start_date = "2026-03-14";
    const end_date = "2026-03-16";

    /**
     * Stable per-source identity:
     * US Club does not expose IDs → hashable fallback
     * This MUST stay stable across runs.
     */
    const source_event_id = `${name}|${city}|${state}|${dates}`
      .toLowerCase()
      .replace(/\s+/g, "-");

    tournaments.push({
      name,
      slug: buildTournamentSlug({
        name,
        city,
        state,
        start_date,
      }),
      sport: "soccer",
      level: "youth",

      city,
      state,
      venue: null,
      address: null,

      start_date,
      end_date,

      summary: `US Club Soccer sanctioned tournament held in ${city}, ${state}.`,
      status: "published",
      confidence: 85,

      // --- Source ---
      source: "us_club_soccer",
      source_event_id,
      source_url: SOURCE_URL,
      source_domain: SOURCE_DOMAIN,

      raw: {
        location,
        dates,
      },
    });
  });

  return tournaments;
}
