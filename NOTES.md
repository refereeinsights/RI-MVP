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
- Quick Venue Check: persist funnel events to `venue_quick_check_events` and added `/admin/ti` dashboard tiles/top tournaments via `get_venue_quick_check_metrics`.
