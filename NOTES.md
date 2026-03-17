## 2026-03-14

- Added per-row approval on admin tournament sport validation page to remove nested forms and hydration errors; bulk UI removed.
- Added high-confidence name keyword sport validation rules (basketball/baseball/softball/hockey/lacrosse/volleyball/football/futsal).
- Fixed TypeScript typing for requeue action in validation admin to unblock build.

## 2026-03-15

- Validation batch script now shows ruleConfirmed count and accepts CLI limit arg.
- Validation admin page now links tournament names to external URLs (uses official_website_url, then source_url, then slug).
- Added run-time guidance to requeue needs_review items and rerun batch; processed ~949 with 575 rule-confirmed after new URL/keyword rules.
- Added per-row “Clear URL (bad link)” action in validation admin to null official_website_url and requeue validation.
- Venue Insights and tournament badges now use the same responsive layout; added mobile wrapping (2-up) for TI and RI summaries.
- TI venues list paginates Supabase fetch (no 1000 cap).
- Sport/state hub routes added for TI with state-slug mapping; hubs include null-date tournaments when filtering future events.
- /admin now shows summary tiles (published/draft/missing venues/URLs/dates, validation counts) and keeps link to the tournaments dashboard.
- /admin/tournaments/dashboard now pages through all tournaments (no 1000 cap).
- Added anonymous “Quick Venue Check” widget (TI) with chip inputs, analytics, rate-limit per venue/browser, honeypot, and Supabase insert to new venue_quick_checks table; aggregates now union quick checks into venue averages.
- Quick Venue Check embedded on TI venue detail and tournament detail (first linked venue).
- Quick Venue Check restyled to match venue badges (dark translucent card, green accents), added close/reopen control, and guarded analytics open event to fire once per page.

## 2026-03-16

- Quick Venue Check: added “Have you played here before?” gate (Yes shows form; No shows acknowledgement) and expanded analytics to include Started/Dismissed.
- Quick Venue Check: allow partial submissions (>= 1 field) and aligned API validation accordingly.
- Quick Venue Check: multi-venue tournaments now pass venueOptions and require a venue pick before submit.
- Quick Venue Check: improved chip labels (shade: None/Poor/Fair/Good/Great; cleanliness: Poor/Fair/Good/Great/Spotless) and moved restroom type above cleanliness.
- Quick Venue Check: all chip selections are now toggleable (click again to de-select).
- Quick Venue Check: persist funnel events to `venue_quick_check_events` (and include `fieldsAnswered` on submit) + added `/admin/ti` dashboard tiles/top tournaments via `get_venue_quick_check_metrics` (migration `20260316_quick_check_analytics.sql`).
- Quick Venue Check: extended `get_venue_quick_check_metrics` to include top venues by submissions (migration `20260316_quick_check_top_venues.sql`) and surfaced the table on `/admin/ti`.
- RI: fixed `/admin` runtime error by importing `getSportValidationCounts` on `apps/referee/app/admin/page.tsx`.
- Added backfill script to copy `source_url` into `official_website_url` for high-confidence matches based on tournament name: `scripts/ingest/backfill_official_urls_from_source.ts` (dry-run by default, `--apply` to write).
- Added CSV apply script for official tournament URLs (only fills when blank): `scripts/ingest/apply_official_urls_from_csv.ts` (used to apply 443 official URLs from `tournaments_with_urls.csv`).
- Added `/admin/tournaments/missing-venues` queue with per-row deep scan (uses fees/venue enrichment in missing-venues mode) and quick links to venue search + current candidate confidence.
- Made the Admin Dashboard “Missing venues” tile link to `/admin/tournaments/missing-venues`.
- Added a “Deep scan 50” bulk button on `/admin/tournaments/missing-venues` to run the missing-venues enrichment for up to 50 tournaments at once.
- Fees/Venue enrichment: improved deep scan to extract venue map cards (image + venue/city headings) and store the map image URL on venue candidates; added same-state guard + a small denylist for known sticky footer addresses.
- Fees/Venue enrichment: per-tournament deep scans (when `tournament_id` is specified) now bypass linked/pending/cooldown skips so a user can always force a refresh on one tournament.
- Missing venues admin: show a clickable `(map)` link for venue candidates when the scraper captured a map image URL.
- Admin UX: Edit links from enrichment now deep-link into the Tournament listings section of `/admin?tab=tournament-listings` (anchor jump).
- Missing venues counters: now treat `tournament_venues` links as the source of truth (exclude linked tournaments from the “missing venues” tile and list); implemented chunked queries to avoid Supabase/PostgREST URL/header limits.
- Fees/Venue enrichment: added facility extraction for pages listing venues as `Venue Name – City, ST` (e.g. “Age Groups & Facilities” blocks) so deep scan captures facilities even without street addresses.
- TI SEO hubs: centered tournament card title/meta/date text on hub pages to match the directory badge/card layout on mobile.
- RI email: password reset endpoint now returns success when the email is not found (prevents account enumeration and removes noisy 500s).
- RI email: Resend sender fallback now defaults to `noreply@refereeinsights.com` instead of a gmail address (prevents 403 “domain not verified” failures).

## 2026-03-17

- Admin build stamp: RI admin nav and TI admin pages now display a build identifier (commit short + env + deployment short) to help diagnose dashboard inconsistencies across deployments.
- /admin/ti: added an expandable “quick view” row under Top tournaments by “Yes” (Started) to show one-line venue quick check rollups (submissions, venues touched, avg cleanliness/shade labels, top parking/restroom type, bring-chairs %).
- TI tournament claim v1: added “Claim this tournament” CTA on tournament pages, magic-link verification against `tournaments.tournament_director_email`, and a director-only inline edit form (no director-email changes in v1); added `tournament_claim_events` table for funnel/ops tracking + basic rate limiting.
- RI admin: added `/admin/tournaments/claims` to review claim mismatches/review requests and manually approve (sets director email) or dismiss; surfaced a Claims button in the admin nav with a badge when open claim items exist (and an alert icon when mismatches are present).
- TI outreach: added an “Intro (reply only)” email mode for outreach previews/sends that includes the signed opt-out link but removes the verification link/button from the email body (verify-link mode remains available).
- TI outreach: preview generation now batches up to 5 tournaments per director email for the intro reply-only outreach (one email can cover multiple tournaments); unsubscribe link suppresses all tournaments included in that email.
