# Parser Checklist (Tournament Sources)

Use this checklist every time you add a new dedicated parser.

## Required

1. **Add parser logic**
   - Implement parsing in `apps/referee/src/server/admin/pasteUrl.ts`.
   - Map fields conservatively (no invented values).
2. **Wire routing**
   - Add URL match in the sweep router in `apps/referee/src/server/admin/pasteUrl.ts`.
3. **Mark as custom**
   - Add host to `CUSTOM_CRAWLER_HOSTS` in `apps/referee/src/server/admin/sources.ts`.
   - Ensure `upsertRegistry(...)` sets `is_custom_source: true`.
4. **Seed into registry**
   - Add the URL to `supabase/migrations/*_seed_custom_parser_sources.sql` so it appears in the registry even before a sweep runs.

## Recommended

5. **Add diagnostics**
   - Include `extracted_count` in `extracted_json` and return value.
6. **Test locally**
   - Run a local sweep and verify `extracted_count` > 0.
   - Confirm the registry row is green (custom) in `/admin/tournaments/sources`.
