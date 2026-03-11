# Venue Multi-Sport Support (GPT Reference) — 2026-03-11

Purpose: capture the current work to support per-sport venue variants (indoor/outdoor, sport-specific amenities) while keeping today’s flows backward compatible.

## Schema changes
- New table `public.venue_sport_profiles`
  - Columns: `id`, `venue_id` (FK → venues, cascade delete), `sport`, `environment` (text), optional `name`, `address1/2`, `city`, `state`, `zip`, `latitude`, `longitude`, `venue_url`, `map_url`, `restrooms` (`Portable|Building|Both`), `restroom_cleanliness`, `shade_score` (1–5), `bring_field_chairs` (bool), `player_parking_fee`, `parking_notes`, `notes`, timestamps.
  - Constraints: sport list matches venues (`soccer|baseball|softball|lacrosse|basketball|hockey|volleyball|futsal`); restrooms enum; shade_score 1–5.
  - Indexes: unique (venue_id, sport); indexes on venue_id.
- `public.tournament_venues`
  - Added nullable FK `venue_sport_profile_id` (on delete set null) so a tournament can point to a sport-specific profile.

## Behavior / compatibility
- Existing venue links continue to work without a profile; profile is optional.
- When set, a profile can override address/coords/amenities for that venue+sport, enabling indoor/outdoor differences without breaking legacy data.
- Future-ready: can hang field-level tables off `venue_sport_profiles` later (e.g., surfaces/fields).

## UI tweaks shipped alongside
- Venues admin filter now includes **Softball** in the sport dropdown.
- Owl’s Eye ready list cards include an **Edit** link to open the venue admin page quickly (helps merging/cleanup before assigning profiles).

## Next implementation steps (not yet done)
- Add admin UI to create/edit `venue_sport_profiles` on a venue detail page.
- Let tournament-venue links choose a profile; when present, use profile coords/amenities for Owl’s Eye runs and displays.
- Add entitlement-aware gating if any profile data should be Pro-only.

## Files to know
- Migration: `supabase/migrations/20260311_venue_sport_profiles.sql`
- Admin tweaks: `apps/referee/app/admin/venues/page.tsx` (softball filter), `apps/referee/app/admin/owls-eye/OwlsEyePanel.tsx` (edit link).
