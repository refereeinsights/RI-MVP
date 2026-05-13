-- Security hardening: lock down internal/admin workflow tables behind RLS
-- Minimal-risk approach:
-- - Do NOT change public-facing tables/views used by TI site rendering.
-- - Enable RLS + revoke anon/authenticated access on internal tables.
-- - Preserve service_role access for server routes/admin tooling.

do $$
declare
  tbl text;
  seq text;
begin
  foreach tbl in array[
    -- Field map / venue url workflow (admin-only)
    'venue_url_review_queue',
    'venue_url_audit_log',
    'venue_field_maps',
    'venue_field_maps_audit_log',

    -- Admin/internal workflow tables (service-role / admin-only)
    'tournament_source_discoveries',
    'venue_import_runs',
    'venue_import_run_rows',
    'tournament_source_logs',
    'tournament_url_candidates',
    'tournament_url_suggestions',
    'tournament_email_discovery_runs',
    'tournament_email_discovery_results',
    'tournament_outreach',
    'outreach_email_templates',
    'email_outreach_previews',
    'email_outreach_suppressions',
    'api_usage_alarms',
    'ti_affiliate_daily_metrics',
    'ti_map_events',
    'ti_outbound_clicks',
    'owls_eye_venue_duplicate_suspects',
    'venue_duplicate_overrides',
    'tournament_claim_events',
    'tournament_duplicate_dismissals',
    'tournament_staff_verify_tokens',
    'tournament_staff_verification_submissions',
    'sport_validation_rules',
    'tournament_sport_validation',
    'ti_premium_interest',
    'venue_quick_check_events'
  ]
  loop
    if to_regclass('public.' || tbl) is null then
      continue;
    end if;

    execute format('alter table public.%I enable row level security', tbl);

    -- Internal tables should not be exposed via the Data API to anon/authenticated by default.
    execute format('revoke all on table public.%I from anon', tbl);
    execute format('revoke all on table public.%I from authenticated', tbl);

    -- Keep server/admin routes working (service role bypasses RLS, but still needs privileges).
    execute format('grant select, insert, update, delete on table public.%I to service_role', tbl);

    -- If the table uses a serial/bigserial `id`, ensure service_role can use the sequence via PostgREST.
    seq := pg_get_serial_sequence('public.' || tbl, 'id');
    if seq is not null then
      execute format('grant usage, select on sequence %s to service_role', seq);
    end if;
  end loop;
end $$;

