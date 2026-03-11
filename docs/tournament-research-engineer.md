# Tournament Research Engineer — Working Guide (2026-03-11)

Use this file to guide GPT when sourcing, validating, and normalizing tournament data.

## Mission
Find reliable, recent tournament data; normalize it into our model; avoid duplicates; and flag uncertainties.

## Data Model Targets
- Tournament: `name`, `slug`, `sport`, `start_date`, `end_date`, `city`, `state`, `venue_name`, `venue_address`, `official_website_url`, `source_url`, `host_org`, `age_group/level`, `status` (draft/published), `notes`.
- Venue: `name`, `address1`, `city`, `state`, `zip`, `latitude`, `longitude`, `venue_url`.
- Links: tournament → venues via `tournament_venues`; include `venue_sport_profile` if available.

## Source Priority (best → fallback)
1) Official event page (organizer/governing body).
2) Official PDF or posted doc from the organizer.
3) Well-maintained directories (e.g., US Club Soccer, USSSA, state associations).
4) News/press releases with explicit date/location.
5) Aggregators/forums only if nothing better; mark confidence low.

## Freshness & Season
- Prefer upcoming/current-year events. If year is missing, infer cautiously and flag `date_precision: month|year` and `confidence: low`.
- Avoid past-year pages unless explicitly labeled for the current year.

## Data Quality Rules
- Dates must be explicit; ranges allowed. If only month/year is known, set `date_precision: month`.
- Location: require at least `city` + `state`; if missing, keep but set `location_confidence: low`.
- URLs: capture both `source_url` (scrape page) and `official_website_url` (tournament site) when different.
- Host org: capture when stated; else null.

## Deduplication Heuristics
- Key: `name | city | state | start_date` (normalize case/whitespace; strip “tournament/cup/classic/showcase” suffixes).
- Same source URL + similar name → likely duplicate.
- If unsure, keep and set `possible_duplicate_of: <slug/id>`.

## Geocoding
- Use given venue address; if only city/state, leave lat/lng null. Do not invent coordinates.

## Validation Checklist
- Dates ISO `YYYY-MM-DD`.
- State is 2-letter uppercase code.
- URLs are https and reachable (200/3xx).
- Slugify: lower, dash-separated, strip punctuation.
- No obvious last-year data unless the date shows current year.

## What NOT to do
- Don’t scrape gated/paywalled content.
- Don’t assume dates/locations from team names.
- Don’t copy emails/phones unless explicitly public.
- Don’t rely on social posts without an official page; if used, mark `confidence: low`.

## Output Format (per tournament)
```json
{
  "name": "...",
  "sport": "soccer|baseball|softball|lacrosse|basketball|hockey|volleyball|futsal",
  "start_date": "2026-05-12",
  "end_date": "2026-05-14",
  "city": "...",
  "state": "WA",
  "venue_name": "...",
  "venue_address": "...",
  "official_website_url": "...",
  "source_url": "...",
  "host_org": "...",
  "notes": "...",
  "confidence": "high|medium|low",
  "date_precision": "day|month|year",
  "possible_duplicate_of": null
}
```
- If multiple venues, include `venues:[...]` or separate records with a shared tournament slug/id.

## Search Patterns (examples)
- `"<event name>" tournament 2026 <state>`
- `"<club/host>" showcase 2026`
- `site:usclubsoccer.org sanctioned tournaments 2026`
- `"<sport> tournament" "<city> <state>" 2026`
- `filetype:pdf "<tournament name>" schedule`

## Handling Uncertainty
- Leave fields blank rather than guessing; explain in `notes`.
- Set `confidence: low` when year/location is inferred or source quality is weak.

## Quick Actions for GPT
- Return deduped records using the key above.
- Prefer official/organizer sources; downgrade aggregators.
- Flag missing city/state/date instead of fabricating.

