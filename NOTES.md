## 2026-03-14

- Added per-row approval on admin tournament sport validation page to remove nested forms and hydration errors; bulk UI removed.
- Added high-confidence name keyword sport validation rules (basketball/baseball/softball/hockey/lacrosse/volleyball/football/futsal).
- Fixed TypeScript typing for requeue action in validation admin to unblock build.

## 2026-03-15

- Validation batch script now shows ruleConfirmed count and accepts CLI limit arg.
- Validation admin page now links tournament names to external URLs (uses official_website_url, then source_url, then slug).
- Added run-time guidance to requeue needs_review items and rerun batch; processed ~949 with 575 rule-confirmed after new URL/keyword rules.
